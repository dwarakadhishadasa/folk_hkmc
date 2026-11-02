import "server-only"

import { AuthzError, type StaffContext } from "@/lib/authz"
import { completeExpiredCampaigns } from "@/lib/dialer/expiry"
import { requireCampaignAdmin } from "@/lib/dialer/scope"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { collectPagedRows, type PagingFailures } from "@/lib/supabase/paging"
import type { Database } from "@/lib/supabase/types"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CAMPAIGN_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const CAMPAIGN_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

const CAMPAIGN_NAME_MAX_LENGTH = 120
const GAP_DURATION_MIN = 5
const GAP_DURATION_MAX = 300
const GAP_DURATION_DEFAULT = 20
const MAX_ATTEMPTS_MIN = 1
const MAX_ATTEMPTS_MAX = 10
const MAX_ATTEMPTS_DEFAULT = 3

const CAMPAIGN_COLUMNS =
  "id,program_id,name,description,campaign_date,campaign_time,status,max_attempts,gap_duration,created_by,created_at,updated_at"

export type CampaignRow = Database["public"]["Tables"]["dialer_campaigns"]["Row"]

export type CampaignStatus = "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED"

export type CampaignTransitionAction = "start" | "complete" | "cancel"

export interface CreateCampaignInput {
  name: string
  description?: string | null
  campaignDate: string
  campaignTime?: string | null
  gapDuration?: number
  maxAttempts?: number
}

const CAMPAIGN_TRANSITIONS = {
  start: { from: ["DRAFT"], to: "ACTIVE" },
  complete: { from: ["ACTIVE"], to: "COMPLETED" },
  cancel: { from: ["DRAFT", "ACTIVE"], to: "CANCELLED" },
} as const satisfies Record<
  CampaignTransitionAction,
  { from: readonly CampaignStatus[]; to: CampaignStatus }
>

const TRANSITION_VERBS: Record<CampaignTransitionAction, string> = {
  start: "started",
  complete: "completed",
  cancel: "cancelled",
}

/**
 * A runtime string is not a `CampaignTransitionAction` just because it reached a
 * typed parameter: a JSON body carrying `"constructor"` would index
 * `Object.prototype` and then throw on `.from.length`, turning a bad request
 * into a 500. The own-key test is the boundary.
 */
function isCampaignTransitionAction(value: string): value is CampaignTransitionAction {
  return Object.prototype.hasOwnProperty.call(CAMPAIGN_TRANSITIONS, value)
}

const CAMPAIGN_LIST_PAGING_FAILURES: PagingFailures = {
  read: () => new AuthzError(500, "campaign_read_failed", "Unable to read campaigns."),
  truncated: () => new AuthzError(500, "campaign_list_truncated", "The campaign list read was truncated."),
}

function campaignNotFound(): AuthzError {
  return new AuthzError(404, "campaign_not_found", "Campaign not found in this program.")
}

function assertCampaignIdShape(campaignId: string): void {
  if (!UUID_PATTERN.test(campaignId)) {
    throw campaignNotFound()
  }
}

async function readCampaignRow(staff: StaffContext, campaignId: string): Promise<CampaignRow> {
  const supabaseAdmin = createSupabaseAdminClient()
  let query = supabaseAdmin
    .from("dialer_campaigns")
    .select(CAMPAIGN_COLUMNS)
    .eq("id", campaignId)
    .eq("program_id", staff.programId)

  if (staff.role === "Admin") {
    query = query.eq("created_by", staff.userId)
  }

  const { data, error } = await query.maybeSingle()

  if (error) {
    throw new AuthzError(500, "campaign_read_failed", "Unable to read the campaign.")
  }

  if (!data) {
    throw campaignNotFound()
  }

  return data as CampaignRow
}

function requireCampaignName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : ""

  if (name.length < 1 || name.length > CAMPAIGN_NAME_MAX_LENGTH) {
    throw new AuthzError(400, "invalid_name", "Name must be between 1 and 120 characters.")
  }

  return name
}

function optionalCampaignDescription(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value !== "string") {
    throw new AuthzError(400, "invalid_description", "Description must be text or null.")
  }

  const description = value.trim()
  return description.length > 0 ? description : null
}

function requireCampaignDate(value: unknown): string {
  if (typeof value !== "string" || !CAMPAIGN_DATE_PATTERN.test(value)) {
    throw new AuthzError(400, "invalid_campaign_date", "Campaign date must be a real date in YYYY-MM-DD format.")
  }

  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new AuthzError(400, "invalid_campaign_date", "Campaign date must be a real date in YYYY-MM-DD format.")
  }

  return value
}

function optionalCampaignTime(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value !== "string") {
    throw new AuthzError(400, "invalid_campaign_time", "Campaign time must be a 24-hour HH:MM time or null.")
  }

  const campaignTime = value.trim()
  if (campaignTime.length === 0) {
    return null
  }

  if (!CAMPAIGN_TIME_PATTERN.test(campaignTime)) {
    throw new AuthzError(400, "invalid_campaign_time", "Campaign time must be a 24-hour HH:MM time or null.")
  }

  return campaignTime
}

function requireGapDuration(value: unknown): number {
  if (value === undefined) {
    return GAP_DURATION_DEFAULT
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < GAP_DURATION_MIN ||
    value > GAP_DURATION_MAX
  ) {
    throw new AuthzError(400, "invalid_gap_duration", "Gap duration must be a whole number between 5 and 300 seconds.")
  }

  return value
}

function requireMaxAttempts(value: unknown): number {
  if (value === undefined) {
    return MAX_ATTEMPTS_DEFAULT
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < MAX_ATTEMPTS_MIN ||
    value > MAX_ATTEMPTS_MAX
  ) {
    throw new AuthzError(400, "invalid_max_attempts", "Max attempts must be a whole number between 1 and 10.")
  }

  return value
}

/**
 * Campaign rows are program-level for a Preacher and an Assistant in AD-3, so
 * they read the campaigns an Admin assigned them work in. An Admin's own
 * `/campaigns` surface is creator-only: the Admin works the campaigns they
 * started, and another staff member's campaign is not theirs to manage.
 */
export async function listCampaigns(staff: StaffContext): Promise<CampaignRow[]> {
  requireCampaignAdmin(staff)

  const supabaseAdmin = createSupabaseAdminClient()

  // Closes campaigns whose end date has arrived before the list is read, so a
  // project without pg_cron still shows the status the date implies.
  await completeExpiredCampaigns(supabaseAdmin)

  return collectPagedRows<CampaignRow>(async (from, to) => {
    let query = supabaseAdmin
      .from("dialer_campaigns")
      .select(CAMPAIGN_COLUMNS)
      .eq("program_id", staff.programId)

    if (staff.role === "Admin") {
      query = query.eq("created_by", staff.userId)
    }

    const response = await query
      .order("campaign_date", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to)

    return { data: response.data, error: response.error }
  }, CAMPAIGN_LIST_PAGING_FAILURES)
}

export async function getCampaign(staff: StaffContext, campaignId: string): Promise<CampaignRow> {
  requireCampaignAdmin(staff)
  assertCampaignIdShape(campaignId)
  return readCampaignRow(staff, campaignId)
}

export async function createCampaign(staff: StaffContext, input: CreateCampaignInput): Promise<CampaignRow> {
  requireCampaignAdmin(staff)

  const name = requireCampaignName(input.name)
  const description = optionalCampaignDescription(input.description)
  const campaignDate = requireCampaignDate(input.campaignDate)
  const campaignTime = optionalCampaignTime(input.campaignTime)
  const gapDuration = requireGapDuration(input.gapDuration)
  const maxAttempts = requireMaxAttempts(input.maxAttempts)

  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("dialer_campaigns")
    .insert({
      program_id: staff.programId,
      name,
      description,
      campaign_date: campaignDate,
      campaign_time: campaignTime,
      status: "DRAFT",
      gap_duration: gapDuration,
      max_attempts: maxAttempts,
      created_by: staff.userId,
    })
    .select(CAMPAIGN_COLUMNS)
    .single()

  if (error) {
    throw new AuthzError(500, "campaign_write_failed", "Unable to create the campaign.")
  }

  return data as CampaignRow
}

export interface UpdateCampaignInput {
  name?: unknown
  description?: unknown
  campaignDate?: unknown
}

/**
 * The editable half of a campaign: its name, description and end date.
 *
 * Status is deliberately not here. A transition is a lifecycle action with its
 * own matrix and its own race guard (`transitionCampaign`); letting a metadata
 * save write `status` as a side effect would give the campaign two ways to
 * become active and only one of them would be checked.
 */
export async function updateCampaign(
  staff: StaffContext,
  campaignId: string,
  input: UpdateCampaignInput,
): Promise<CampaignRow> {
  requireCampaignAdmin(staff)
  assertCampaignIdShape(campaignId)

  const name = requireCampaignName(input.name)
  const description = optionalCampaignDescription(input.description)
  const campaignDate = requireCampaignDate(input.campaignDate)

  const supabaseAdmin = createSupabaseAdminClient()
  let update = supabaseAdmin
    .from("dialer_campaigns")
    .update({ name, description, campaign_date: campaignDate })
    .eq("id", campaignId)
    .eq("program_id", staff.programId)

  if (staff.role === "Admin") {
    update = update.eq("created_by", staff.userId)
  }

  const { data, error } = await update.select(CAMPAIGN_COLUMNS).maybeSingle()

  if (error) {
    throw new AuthzError(500, "campaign_write_failed", "Unable to save the campaign.")
  }

  if (!data) {
    throw campaignNotFound()
  }

  return data as CampaignRow
}

export async function transitionCampaign(
  staff: StaffContext,
  campaignId: string,
  action: CampaignTransitionAction,
): Promise<CampaignRow> {
  requireCampaignAdmin(staff)
  assertCampaignIdShape(campaignId)

  if (!isCampaignTransitionAction(action)) {
    throw new AuthzError(400, "invalid_campaign_action", "Unknown campaign action.")
  }

  const transition = CAMPAIGN_TRANSITIONS[action]

  const supabaseAdmin = createSupabaseAdminClient()
  let update = supabaseAdmin
    .from("dialer_campaigns")
    .update({ status: transition.to })
    .eq("id", campaignId)
    .eq("program_id", staff.programId)

  if (staff.role === "Admin") {
    update = update.eq("created_by", staff.userId)
  }

  // The status predicate is the race guard: a row that moved since the caller
  // read it matches nothing, so a lost race never applies a second transition.
  const { data, error } =
    transition.from.length === 1
      ? await update.eq("status", transition.from[0]).select(CAMPAIGN_COLUMNS).maybeSingle()
      : await update.in("status", [...transition.from]).select(CAMPAIGN_COLUMNS).maybeSingle()

  if (error) {
    throw new AuthzError(500, "campaign_write_failed", "Unable to update the campaign.")
  }

  if (data) {
    return data as CampaignRow
  }

  const current = await readCampaignRow(staff, campaignId)

  throw new AuthzError(
    409,
    "campaign_status_conflict",
    `The campaign is ${current.status} and cannot be ${TRANSITION_VERBS[action]}.`,
  )
}
