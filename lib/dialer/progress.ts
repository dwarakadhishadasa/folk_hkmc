import "server-only"

import { AuthzError, type StaffContext } from "@/lib/authz"
import { getCampaign, listCampaigns, type CampaignRow } from "@/lib/dialer/campaigns"
import { campaignScope, requireCampaignAdmin, type CampaignScope } from "@/lib/dialer/scope"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * One RPC per campaign, four in flight: the seeded programme holds few
 * campaigns, so this bounds the pool without serialising the list.
 */
const PROGRESS_CAMPAIGN_CONCURRENCY = 4

/** The five-bucket funnel plus the assignment status counts, all assignment-grain. */
export interface CampaignProgressSummary {
  assigned: number
  attempted: number
  reached: number
  confirmed: number
  neverAttempted: number
  completed: number
  skipped: number
  pending: number
}

/** One `status_group`'s share of the campaign's call logs, with its latest call time. */
export interface CampaignProgressOutcome {
  statusGroup: string
  count: number
  lastCalledAt: string | null
}

/** One caller's rollup within a campaign. Funnel columns are assignment-grain; `callsMade` is log-grain. */
export interface CampaignProgressCaller {
  callerId: string
  callerName: string
  assigned: number
  attempted: number
  reached: number
  confirmed: number
  neverAttempted: number
  callsMade: number
}

/** One row of the campaign's recent-activity list, newest first, capped at 20 by the function. */
export interface CampaignProgressRecentCall {
  id: string
  calledAt: string
  statusGroup: string
  contactName: string
  callerName: string
}

/** Everything `campaign_progress` returns for one campaign, in camelCase. */
export interface CampaignProgress {
  campaignId: string
  programId: string
  programScope: boolean
  summary: CampaignProgressSummary
  outcomes: CampaignProgressOutcome[]
  callers: CampaignProgressCaller[]
  recent: CampaignProgressRecentCall[]
}

/**
 * A campaign and its scoped summary. A campaign stays listed when the caller's
 * scope holds none of its contacts: the row is program-level, and the summary
 * is then a true zero rather than an omission.
 */
export interface CampaignOverviewEntry {
  campaign: CampaignRow
  summary: CampaignProgressSummary
}

export interface CampaignOverview {
  campaigns: CampaignOverviewEntry[]
}

/** A caller's performance across every visible campaign, summed from each campaign's rollup. */
export interface RosterCallerProgress {
  assigned: number
  attempted: number
  reached: number
  confirmed: number
  neverAttempted: number
  callsMade: number
}

/**
 * Keyed by `dialer_callers.id` — the id `CallerRosterEntry.callerId` carries.
 * A roster entry with no caller profile has no key here, and that is a true
 * zero: without a caller id it cannot hold an assignment, so no count is hidden.
 */
export type RosterProgress = Map<string, RosterCallerProgress>

function campaignNotFound(): AuthzError {
  return new AuthzError(404, "campaign_not_found", "Campaign not found in this program.")
}

function assertCampaignIdShape(campaignId: string): void {
  if (!UUID_PATTERN.test(campaignId)) {
    throw campaignNotFound()
  }
}

function progressReadFailed(): AuthzError {
  return new AuthzError(500, "campaign_progress_read_failed", "Unable to read the campaign progress.")
}

function campaignProgressError(error: { message?: string; code?: string } | null): AuthzError {
  const message = typeof error?.message === "string" ? error.message : ""
  const code = typeof error?.code === "string" ? error.code : ""

  if (code === "P0002" || message.startsWith("campaign_not_found")) {
    return campaignNotFound()
  }

  if (message.startsWith("scope_preacher_required")) {
    return new AuthzError(403, "campaign_scope_missing", "This staff account has no Campaign scope.")
  }

  return progressReadFailed()
}

function readProgressRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw progressReadFailed()
  }

  return value as Record<string, unknown>
}

function readProgressRows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw progressReadFailed()
  }

  return value.map(readProgressRecord)
}

function readProgressCount(record: Record<string, unknown>, key: string): number {
  const value = record[key]

  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw progressReadFailed()
  }

  return value
}

function readProgressBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key]

  if (typeof value !== "boolean") {
    throw progressReadFailed()
  }

  return value
}

function readProgressText(record: Record<string, unknown>, key: string): string {
  const value = record[key]

  if (typeof value !== "string") {
    throw progressReadFailed()
  }

  return value
}

function readProgressNullableText(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]

  if (value === null) {
    return null
  }

  if (typeof value !== "string") {
    throw progressReadFailed()
  }

  return value
}

function toSummary(record: Record<string, unknown>): CampaignProgressSummary {
  return {
    assigned: readProgressCount(record, "assigned"),
    attempted: readProgressCount(record, "attempted"),
    reached: readProgressCount(record, "reached"),
    confirmed: readProgressCount(record, "confirmed"),
    neverAttempted: readProgressCount(record, "never_attempted"),
    completed: readProgressCount(record, "completed"),
    skipped: readProgressCount(record, "skipped"),
    pending: readProgressCount(record, "pending"),
  }
}

/**
 * The function's payload is parsed, never cast: a missing count becomes a read
 * failure rather than a `0` the Overview would render as measured.
 */
function toCampaignProgress(value: unknown): CampaignProgress {
  const record = readProgressRecord(value)

  return {
    campaignId: readProgressText(record, "campaignId"),
    programId: readProgressText(record, "programId"),
    programScope: readProgressBoolean(record, "programScope"),
    summary: toSummary(readProgressRecord(record.summary)),
    outcomes: readProgressRows(record.outcomes).map((row) => ({
      statusGroup: readProgressText(row, "status_group"),
      count: readProgressCount(row, "count"),
      lastCalledAt: readProgressNullableText(row, "last_called_at"),
    })),
    callers: readProgressRows(record.callers).map((row) => ({
      callerId: readProgressText(row, "caller_id"),
      callerName: readProgressText(row, "caller_name"),
      assigned: readProgressCount(row, "assigned"),
      attempted: readProgressCount(row, "attempted"),
      reached: readProgressCount(row, "reached"),
      confirmed: readProgressCount(row, "confirmed"),
      neverAttempted: readProgressCount(row, "never_attempted"),
      callsMade: readProgressCount(row, "calls_made"),
    })),
    recent: readProgressRows(record.recent).map((row) => ({
      id: readProgressText(row, "id"),
      calledAt: readProgressText(row, "called_at"),
      statusGroup: readProgressText(row, "status_group"),
      contactName: readProgressText(row, "contact_name"),
      callerName: readProgressText(row, "caller_name"),
    })),
  }
}

async function readCampaignProgress(
  scope: CampaignScope,
  campaignId: string,
): Promise<CampaignProgress> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin.rpc("campaign_progress", {
    p_campaign_id: campaignId,
    p_scope_preacher_id: scope.kind === "preacher" ? scope.userId : null,
    p_program_scope: scope.kind === "program",
  })

  if (error) {
    throw campaignProgressError(error)
  }

  return toCampaignProgress(data)
}

async function readCampaignProgressBatch(
  scope: CampaignScope,
  campaignIds: string[],
): Promise<CampaignProgress[]> {
  const progress: CampaignProgress[] = []

  for (let offset = 0; offset < campaignIds.length; offset += PROGRESS_CAMPAIGN_CONCURRENCY) {
    const chunk = campaignIds.slice(offset, offset + PROGRESS_CAMPAIGN_CONCURRENCY)
    const chunkProgress = await Promise.all(
      chunk.map((campaignId) => readCampaignProgress(scope, campaignId)),
    )
    progress.push(...chunkProgress)
  }

  return progress
}

/**
 * One campaign's funnel, outcome mix, caller rollup, summary and recent
 * activity. The scope is resolved before the RPC, so an Assistant with no
 * active preacher is refused without a single program count being read.
 */
export async function getCampaignProgress(
  staff: StaffContext,
  campaignId: string,
): Promise<CampaignProgress> {
  requireCampaignAdmin(staff)
  assertCampaignIdShape(campaignId)

  const scope = await campaignScope(staff)

  // The function derives its program from the campaign row, not from the
  // caller, so a foreign campaign id must be refused before it is called.
  await getCampaign(staff, campaignId)

  return readCampaignProgress(scope, campaignId)
}

/** The Overview list: every visible campaign with its scoped summary, computed once per campaign. */
export async function listCampaignsWithProgress(staff: StaffContext): Promise<CampaignOverview> {
  requireCampaignAdmin(staff)

  const scope = await campaignScope(staff)
  const campaigns = await listCampaigns(staff)
  const progress = await readCampaignProgressBatch(
    scope,
    campaigns.map((campaign) => campaign.id),
  )
  const byCampaignId = new Map(
    progress.map((entry): [string, CampaignProgress] => [entry.campaignId, entry]),
  )

  return {
    campaigns: campaigns.map((campaign) => {
      const entry = byCampaignId.get(campaign.id)

      if (!entry) {
        throw progressReadFailed()
      }

      return { campaign, summary: entry.summary }
    }),
  }
}

/**
 * The roster's performance columns, aggregated across every campaign
 * `listCampaigns` returns — terminal campaigns included, because a caller's
 * completed work does not stop being true when the campaign ends. One RPC
 * result per campaign is reused for every caller in it.
 */
export async function getRosterProgress(staff: StaffContext): Promise<RosterProgress> {
  requireCampaignAdmin(staff)

  const scope = await campaignScope(staff)
  const campaigns = await listCampaigns(staff)
  const progress = await readCampaignProgressBatch(
    scope,
    campaigns.map((campaign) => campaign.id),
  )
  const totals: RosterProgress = new Map()

  for (const campaignProgress of progress) {
    for (const caller of campaignProgress.callers) {
      const total = totals.get(caller.callerId) ?? {
        assigned: 0,
        attempted: 0,
        reached: 0,
        confirmed: 0,
        neverAttempted: 0,
        callsMade: 0,
      }

      total.assigned += caller.assigned
      total.attempted += caller.attempted
      total.reached += caller.reached
      total.confirmed += caller.confirmed
      total.neverAttempted += caller.neverAttempted
      total.callsMade += caller.callsMade
      totals.set(caller.callerId, total)
    }
  }

  return totals
}
