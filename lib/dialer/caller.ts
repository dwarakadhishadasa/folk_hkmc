import "server-only"

import { AuthzError, type StaffContext } from "@/lib/authz"
import type { CampaignStatus } from "@/lib/dialer/campaigns"
import {
  isDispositionStatus,
  isReachedGroup,
} from "@/lib/dialer/disposition"
import {
  CallerAssignmentNotFoundError,
  assertCallerAssignmentInScope,
  requireDialerCaller,
  type DialerCaller,
} from "@/lib/dialer/scope"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { collectPagedRows, type PagingFailures } from "@/lib/supabase/paging"
import type { Database } from "@/lib/supabase/types"
import type { SurveyQuestionType } from "@/lib/dialer/surveys"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const READ_CHUNK_SIZE = 200
const HISTORY_LIMIT = 3
const NOTES_MAX_LENGTH = 4000
const RESPONSE_LIMIT = 100

const ASSIGNMENT_COLUMNS =
  "id,program_id,campaign_id,contact_id,caller_id,status,sort_order,assigned_at"
const CAMPAIGN_COLUMNS = "id,name,campaign_date,campaign_time,status,gap_duration,max_attempts"
const CONTACT_COLUMNS = "id,name,phone"
const PROFILE_COLUMNS = "contact_id,centre,level,gender,language"
const CALL_LOG_COLUMNS =
  "id,assignment_id,caller_id,attempt,disposition_status,status_group,follow_up_notes,called_at"
const QUESTION_COLUMNS =
  "id,campaign_id,question_title,question_type,sort_order,is_required,retired_at"
const OPTION_COLUMNS = "id,question_id,label,value,sort_order"

type AssignmentRow = Pick<
  Database["public"]["Tables"]["dialer_assignments"]["Row"],
  | "id"
  | "program_id"
  | "campaign_id"
  | "contact_id"
  | "caller_id"
  | "status"
  | "sort_order"
  | "assigned_at"
>

type CampaignRow = Pick<
  Database["public"]["Tables"]["dialer_campaigns"]["Row"],
  | "id"
  | "name"
  | "campaign_date"
  | "campaign_time"
  | "status"
  | "gap_duration"
  | "max_attempts"
>

type ContactRow = Pick<Database["public"]["Tables"]["contacts"]["Row"], "id" | "name" | "phone">

type ProfileRow = Pick<
  Database["public"]["Tables"]["dialer_contact_profiles"]["Row"],
  "contact_id" | "centre" | "level" | "gender" | "language"
>

type CallLogRow = Pick<
  Database["public"]["Tables"]["dialer_call_logs"]["Row"],
  | "id"
  | "assignment_id"
  | "caller_id"
  | "attempt"
  | "disposition_status"
  | "status_group"
  | "follow_up_notes"
  | "called_at"
>

type QuestionRow = Pick<
  Database["public"]["Tables"]["dialer_survey_questions"]["Row"],
  | "id"
  | "campaign_id"
  | "question_title"
  | "question_type"
  | "sort_order"
  | "is_required"
  | "retired_at"
>

type OptionRow = Pick<
  Database["public"]["Tables"]["dialer_survey_options"]["Row"],
  "id" | "question_id" | "label" | "value" | "sort_order"
>

/** One prior call on the current contact, across every campaign in the program. */
export interface CallerContactHistoryEntry {
  callLogId: string
  calledAt: string
  dispositionStatus: string
  statusGroup: string
  followUpNotes: string | null
  attempt: number
}

/** One option of a campaign survey question, as the disposition screen needs it. */
export interface CallerSurveyOption {
  label: string
  value: string
}

/** One live campaign survey question; retired questions never reach a caller. */
export interface CallerSurveyQuestion {
  id: string
  questionTitle: string
  questionType: SurveyQuestionType
  isRequired: boolean
  sortOrder: number
  options: CallerSurveyOption[]
}

/** The optional calling profile fields; all null when the contact has no row. */
export interface CallerContactProfile {
  centre: string | null
  level: string | null
  gender: string | null
  language: string | null
}

/** One card in the caller's own queue. */
export interface CallerQueueEntry {
  assignmentId: string
  campaignId: string
  campaignName: string
  campaignDate: string
  campaignStatus: CampaignStatus
  campaignGapDuration: number
  contactId: string
  contactName: string
  phone: string
  sortOrder: number
  attempt: number
  maxAttempts: number
  history: CallerContactHistoryEntry[]
  profile: CallerContactProfile
  campaignProgress: { called: number; total: number }
}

/**
 * One row of the caller's session list.
 *
 * The session list is the stable set of assignments the caller holds on the
 * active campaigns: a completed or skipped contact stays on it so the queue
 * reads as a call list rather than a shrinking to-do list. `actionable` marks
 * the rows that are still in `entries` and can be jumped to.
 */
export interface CallerQueueRosterItem {
  assignmentId: string
  campaignId: string
  campaignName: string
  campaignDate: string
  contactId: string
  contactName: string
  sortOrder: number
  status: "PENDING" | "COMPLETED" | "SKIPPED"
  latestDispositionStatus: string | null
  latestStatusGroup: string | null
  actionable: boolean
}

/** The four tiles frame 2360 draws, plus the caller's own queue size. */
export interface CallerQueueCounts {
  called: number
  reached: number
  noAnswer: number
  pending: number
}

export interface CallerQueueCampaign {
  id: string
  name: string
  campaignDate: string
  gapDuration: number
  maxAttempts: number
  total: number
  called: number
}

/** The whole caller queue payload: entries, tiles, campaign progress and the surveys they lead to. */
export interface CallerQueuePayload {
  caller: { id: string; displayName: string }
  entries: CallerQueueEntry[]
  roster: CallerQueueRosterItem[]
  counts: CallerQueueCounts
  campaigns: CallerQueueCampaign[]
  surveysByCampaign: Record<string, CallerSurveyQuestion[]>
}

/** One assignment plus the survey the disposition screen renders. */
export interface CallerAssignmentCard {
  assignment: CallerQueueEntry
  survey: CallerSurveyQuestion[]
}

/** The caller-grain counts on the session-complete screen. */
export interface CallerSessionCounts {
  total: number
  called: number
  reached: number
  noAnswer: number
  wrongNumber: number
  skipped: number
  pending: number
  closedAfterCap: number
  recallable: number
}

export interface CallerSessionSummary {
  campaign: {
    id: string
    name: string
    campaignDate: string
    status: CampaignStatus
    maxAttempts: number
  }
  counts: CallerSessionCounts
}

export interface RecallResult {
  requeued: number
}

/** One validated survey answer, shaped exactly as `record_call_disposition` expects it. */
export interface DispositionResponseInput {
  questionId: string
  answer: string | null
  answerValues: string[] | null
}

export interface RecordDispositionInput {
  assignmentId: string
  attempt: number
  dispositionStatus: string
  followUpNotes?: string | null
  responses?: DispositionResponseInput[]
}

/** The stored row the RPC returns; the client uses it for the receipt, never for a re-count. */
export interface DispositionReceipt {
  callLogId: string
  assignmentId: string
  attempt: number
  calledAt: string
  dispositionStatus: string
  statusGroup: string
  followUpNotes: string | null
  replay: boolean
}

const ASSIGNMENT_READ_FAILURES: PagingFailures = {
  read: () => new AuthzError(500, "caller_queue_read_failed", "Unable to read the caller queue."),
  truncated: () => new AuthzError(500, "caller_queue_truncated", "The caller queue read was truncated."),
}

const CAMPAIGN_READ_FAILURES: PagingFailures = {
  read: () => new AuthzError(500, "caller_queue_read_failed", "Unable to read the caller campaign."),
  truncated: () => new AuthzError(500, "caller_queue_truncated", "The caller campaign read was truncated."),
}

const CONTACT_READ_FAILURES: PagingFailures = {
  read: () => new AuthzError(500, "caller_queue_read_failed", "Unable to read the caller contacts."),
  truncated: () => new AuthzError(500, "caller_queue_truncated", "The caller contact read was truncated."),
}

const PROFILE_READ_FAILURES: PagingFailures = {
  read: () => new AuthzError(500, "caller_queue_read_failed", "Unable to read the contact profiles."),
  truncated: () => new AuthzError(500, "caller_queue_truncated", "The contact profile read was truncated."),
}

const LOG_READ_FAILURES: PagingFailures = {
  read: () => new AuthzError(500, "caller_history_read_failed", "Unable to read the contact history."),
  truncated: () => new AuthzError(500, "caller_history_truncated", "The contact history read was truncated."),
}

const SURVEY_READ_FAILURES: PagingFailures = {
  read: () => new AuthzError(500, "caller_survey_read_failed", "Unable to read the campaign survey."),
  truncated: () => new AuthzError(500, "caller_survey_truncated", "The campaign survey read was truncated."),
}

function assertCampaignIdShape(campaignId: string): void {
  if (!UUID_PATTERN.test(campaignId)) {
    throw new CallerAssignmentNotFoundError()
  }
}

function assertAssignmentIdShape(assignmentId: string): void {
  if (!UUID_PATTERN.test(assignmentId)) {
    throw new CallerAssignmentNotFoundError()
  }
}

function chunksOf<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let offset = 0; offset < values.length; offset += size) {
    chunks.push(values.slice(offset, offset + size))
  }
  return chunks
}

async function readCampaigns(
  programId: StaffContext["programId"],
  campaignIds: string[],
): Promise<Map<string, CampaignRow>> {
  const campaigns = new Map<string, CampaignRow>()
  const uniqueIds = [...new Set(campaignIds.filter(Boolean))]
  const supabaseAdmin = createSupabaseAdminClient()

  for (const chunk of chunksOf(uniqueIds, READ_CHUNK_SIZE)) {
    const rows = await collectPagedRows<CampaignRow>(async (from, to) => {
      const response = await supabaseAdmin
        .from("dialer_campaigns")
        .select(CAMPAIGN_COLUMNS)
        .eq("program_id", programId)
        .in("id", chunk)
        .order("id", { ascending: true })
        .range(from, to)

      return { data: response.data, error: response.error }
    }, CAMPAIGN_READ_FAILURES)

    for (const row of rows) {
      campaigns.set(row.id, row)
    }
  }

  return campaigns
}

async function readContacts(
  programId: StaffContext["programId"],
  contactIds: string[],
): Promise<Map<string, ContactRow>> {
  const contacts = new Map<string, ContactRow>()
  const uniqueIds = [...new Set(contactIds.filter(Boolean))]
  const supabaseAdmin = createSupabaseAdminClient()

  for (const chunk of chunksOf(uniqueIds, READ_CHUNK_SIZE)) {
    const rows = await collectPagedRows<ContactRow>(async (from, to) => {
      const response = await supabaseAdmin
        .from("contacts")
        .select(CONTACT_COLUMNS)
        .eq("program_id", programId)
        .in("id", chunk)
        .order("id", { ascending: true })
        .range(from, to)

      return { data: response.data, error: response.error }
    }, CONTACT_READ_FAILURES)

    for (const row of rows) {
      contacts.set(row.id, row)
    }
  }

  return contacts
}

async function readProfiles(
  programId: StaffContext["programId"],
  contactIds: string[],
): Promise<Map<string, ProfileRow>> {
  const profiles = new Map<string, ProfileRow>()
  const uniqueIds = [...new Set(contactIds.filter(Boolean))]
  const supabaseAdmin = createSupabaseAdminClient()

  for (const chunk of chunksOf(uniqueIds, READ_CHUNK_SIZE)) {
    const rows = await collectPagedRows<ProfileRow>(async (from, to) => {
      const response = await supabaseAdmin
        .from("dialer_contact_profiles")
        .select(PROFILE_COLUMNS)
        .eq("program_id", programId)
        .in("contact_id", chunk)
        .order("contact_id", { ascending: true })
        .range(from, to)

      return { data: response.data, error: response.error }
    }, PROFILE_READ_FAILURES)

    for (const row of rows) {
      profiles.set(row.contact_id, row)
    }
  }

  return profiles
}

async function readAssignments(
  programId: StaffContext["programId"],
  callerId: string,
  campaignId?: string,
): Promise<AssignmentRow[]> {
  const supabaseAdmin = createSupabaseAdminClient()

  return collectPagedRows<AssignmentRow>(async (from, to) => {
    let query = supabaseAdmin
      .from("dialer_assignments")
      .select(ASSIGNMENT_COLUMNS)
      .eq("program_id", programId)
      .eq("caller_id", callerId)

    if (campaignId) {
      query = query.eq("campaign_id", campaignId)
    }

    const response = await query.order("id", { ascending: true }).range(from, to)
    return { data: response.data, error: response.error }
  }, ASSIGNMENT_READ_FAILURES)
}

async function readAssignmentsForContacts(
  programId: StaffContext["programId"],
  contactIds: string[],
): Promise<AssignmentRow[]> {
  const uniqueIds = [...new Set(contactIds.filter(Boolean))]
  const supabaseAdmin = createSupabaseAdminClient()
  const rows: AssignmentRow[] = []

  for (const chunk of chunksOf(uniqueIds, READ_CHUNK_SIZE)) {
    const chunkRows = await collectPagedRows<AssignmentRow>(async (from, to) => {
      const response = await supabaseAdmin
        .from("dialer_assignments")
        .select(ASSIGNMENT_COLUMNS)
        .eq("program_id", programId)
        .in("contact_id", chunk)
        .order("id", { ascending: true })
        .range(from, to)

      return { data: response.data, error: response.error }
    }, ASSIGNMENT_READ_FAILURES)

    rows.push(...chunkRows)
  }

  return rows
}

async function readCallLogs(
  programId: StaffContext["programId"],
  assignmentIds: string[],
): Promise<CallLogRow[]> {
  const uniqueIds = [...new Set(assignmentIds.filter(Boolean))]
  const supabaseAdmin = createSupabaseAdminClient()
  const rows: CallLogRow[] = []

  for (const chunk of chunksOf(uniqueIds, READ_CHUNK_SIZE)) {
    const chunkRows = await collectPagedRows<CallLogRow>(async (from, to) => {
      const response = await supabaseAdmin
        .from("dialer_call_logs")
        .select(CALL_LOG_COLUMNS)
        .eq("program_id", programId)
        .in("assignment_id", chunk)
        .order("called_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to)

      return { data: response.data, error: response.error }
    }, LOG_READ_FAILURES)

    rows.push(...chunkRows)
  }

  return rows
}

async function readSurveys(
  programId: StaffContext["programId"],
  campaignIds: string[],
): Promise<Record<string, CallerSurveyQuestion[]>> {
  const uniqueIds = [...new Set(campaignIds.filter(Boolean))]
  const result: Record<string, CallerSurveyQuestion[]> = {}

  if (uniqueIds.length === 0) {
    return result
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const questions: QuestionRow[] = []

  for (const chunk of chunksOf(uniqueIds, READ_CHUNK_SIZE)) {
    const rows = await collectPagedRows<QuestionRow>(async (from, to) => {
      const response = await supabaseAdmin
        .from("dialer_survey_questions")
        .select(QUESTION_COLUMNS)
        .eq("program_id", programId)
        .in("campaign_id", chunk)
        .is("retired_at", null)
        .order("campaign_id", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)

      return { data: response.data, error: response.error }
    }, SURVEY_READ_FAILURES)

    questions.push(...rows)
  }

  if (questions.length === 0) {
    for (const campaignId of uniqueIds) {
      result[campaignId] = []
    }
    return result
  }

  const questionIds = questions.map((question) => question.id)
  const options: OptionRow[] = []

  for (const chunk of chunksOf(questionIds, READ_CHUNK_SIZE)) {
    const rows = await collectPagedRows<OptionRow>(async (from, to) => {
      const response = await supabaseAdmin
        .from("dialer_survey_options")
        .select(OPTION_COLUMNS)
        .eq("program_id", programId)
        .in("question_id", chunk)
        .order("question_id", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)

      return { data: response.data, error: response.error }
    }, SURVEY_READ_FAILURES)

    options.push(...rows)
  }

  const optionsByQuestion = new Map<string, CallerSurveyOption[]>()
  for (const option of options) {
    const list = optionsByQuestion.get(option.question_id) ?? []
    list.push({ label: option.label, value: option.value })
    optionsByQuestion.set(option.question_id, list)
  }

  for (const question of questions) {
    const campaignQuestions = result[question.campaign_id] ?? []
    campaignQuestions.push({
      id: question.id,
      questionTitle: question.question_title,
      questionType: question.question_type as SurveyQuestionType,
      isRequired: question.is_required,
      sortOrder: question.sort_order,
      options: optionsByQuestion.get(question.id) ?? [],
    })
    result[question.campaign_id] = campaignQuestions
  }

  for (const campaignId of uniqueIds) {
    result[campaignId] ??= []
  }

  return result
}

function normalizeProfile(row: ProfileRow | undefined): CallerContactProfile {
  const clean = (value: string | null | undefined): string | null => {
    if (typeof value !== "string") {
      return null
    }
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  return {
    centre: clean(row?.centre),
    level: clean(row?.level),
    gender: clean(row?.gender),
    language: clean(row?.language),
  }
}

function compareLogsDescending(left: CallLogRow, right: CallLogRow): number {
  return (
    right.called_at.localeCompare(left.called_at) ||
    right.attempt - left.attempt ||
    left.id.localeCompare(right.id)
  )
}

function latestLog(logs: CallLogRow[]): CallLogRow | null {
  if (logs.length === 0) {
    return null
  }

  return [...logs].sort(compareLogsDescending)[0]
}

function historyForContact(
  contactLogs: CallLogRow[],
  assignmentById: Map<string, AssignmentRow>,
  contactId: string,
): CallerContactHistoryEntry[] {
  return contactLogs
    .filter((log) => assignmentById.get(log.assignment_id)?.contact_id === contactId)
    .sort(compareLogsDescending)
    .slice(0, HISTORY_LIMIT)
    .map((log) => ({
      callLogId: log.id,
      calledAt: log.called_at,
      dispositionStatus: log.disposition_status,
      statusGroup: log.status_group,
      followUpNotes: log.follow_up_notes,
      attempt: log.attempt,
    }))
}

interface EntryContext {
  campaign: CampaignRow
  contact: ContactRow
  profile: ProfileRow | undefined
  callerAssignments: AssignmentRow[]
  logsByAssignment: Map<string, CallLogRow[]>
  contactLogs: CallLogRow[]
  contactAssignmentById: Map<string, AssignmentRow>
}

function buildEntry(assignment: AssignmentRow, context: EntryContext): CallerQueueEntry {
  const callerLogs = context.logsByAssignment.get(assignment.id) ?? []
  const attempts = callerLogs.length

  return {
    assignmentId: assignment.id,
    campaignId: context.campaign.id,
    campaignName: context.campaign.name,
    campaignDate: context.campaign.campaign_date,
    campaignStatus: context.campaign.status as CampaignStatus,
    campaignGapDuration: context.campaign.gap_duration,
    contactId: context.contact.id,
    contactName: context.contact.name,
    phone: context.contact.phone,
    sortOrder: assignment.sort_order,
    attempt: attempts + 1,
    maxAttempts: context.campaign.max_attempts,
    history: historyForContact(context.contactLogs, context.contactAssignmentById, context.contact.id),
    profile: normalizeProfile(context.profile),
    campaignProgress: campaignProgressFor(context.callerAssignments, context.logsByAssignment, context.campaign.id),
  }
}

function campaignProgressFor(
  callerAssignments: AssignmentRow[],
  logsByAssignment: Map<string, CallLogRow[]>,
  campaignId: string,
): { called: number; total: number } {
  const assignments = callerAssignments.filter((assignment) => assignment.campaign_id === campaignId)
  return {
    called: assignments.filter((assignment) => (logsByAssignment.get(assignment.id)?.length ?? 0) > 0).length,
    total: assignments.length,
  }
}

function compareQueueOrder(
  left: { campaignDate: string; campaignName: string; sortOrder: number; assignmentId: string },
  right: { campaignDate: string; campaignName: string; sortOrder: number; assignmentId: string },
): number {
  return (
    left.campaignDate.localeCompare(right.campaignDate) ||
    left.campaignName.localeCompare(right.campaignName) ||
    left.sortOrder - right.sortOrder ||
    left.assignmentId.localeCompare(right.assignmentId)
  )
}

function compareQueueEntries(left: CallerQueueEntry, right: CallerQueueEntry): number {
  return compareQueueOrder(left, right)
}

/**
 * The caller's own queue and session roster.
 *
 * Every read is keyed by `caller.id` from `requireDialerCaller` and
 * `staff.programId`; the payload carries no other caller's assignment. A
 * PENDING assignment at the attempt cap stops being offered in `entries`,
 * because a recall that would exceed the cap is closed instead, but it stays
 * on `roster` so the queue remains a stable call list.
 */
export async function listCallerQueue(staff: StaffContext): Promise<CallerQueuePayload> {
  const caller = await requireDialerCaller(staff)
  const assignments = await readAssignments(staff.programId, caller.id)
  const campaignsById = await readCampaigns(
    staff.programId,
    assignments.map((assignment) => assignment.campaign_id),
  )

  const contactIds = [...new Set(assignments.map((assignment) => assignment.contact_id))]
  const [contactsById, profilesById, contactAssignments] = await Promise.all([
    readContacts(staff.programId, contactIds),
    readProfiles(staff.programId, contactIds),
    readAssignmentsForContacts(staff.programId, contactIds),
  ])

  const contactAssignmentById = new Map(
    contactAssignments.map((assignment) => [assignment.id, assignment] as const),
  )
  const contactLogs = await readCallLogs(
    staff.programId,
    contactAssignments.map((assignment) => assignment.id),
  )
  const logsByAssignment = new Map<string, CallLogRow[]>()

  for (const log of contactLogs) {
    const list = logsByAssignment.get(log.assignment_id) ?? []
    list.push(log)
    logsByAssignment.set(log.assignment_id, list)
  }

  const entries: CallerQueueEntry[] = []

  for (const assignment of assignments) {
    const campaign = campaignsById.get(assignment.campaign_id)
    const contact = contactsById.get(assignment.contact_id)

    if (!campaign || !contact || campaign.status !== "ACTIVE" || assignment.status !== "PENDING") {
      continue
    }

    const attempts = logsByAssignment.get(assignment.id)?.length ?? 0
    if (attempts >= campaign.max_attempts) {
      continue
    }

    entries.push(
      buildEntry(assignment, {
        campaign,
        contact,
        profile: profilesById.get(assignment.contact_id),
        callerAssignments: assignments,
        logsByAssignment,
        contactLogs,
        contactAssignmentById,
      }),
    )
  }

  entries.sort(compareQueueEntries)

  const activeAssignments = assignments.filter(
    (assignment) => campaignsById.get(assignment.campaign_id)?.status === "ACTIVE",
  )

  const actionableIds = new Set(entries.map((entry) => entry.assignmentId))
  const roster: CallerQueueRosterItem[] = []

  for (const assignment of activeAssignments) {
    const campaign = campaignsById.get(assignment.campaign_id)
    const contact = contactsById.get(assignment.contact_id)

    if (!campaign || !contact) {
      continue
    }

    const latest = latestLog(logsByAssignment.get(assignment.id) ?? [])

    roster.push({
      assignmentId: assignment.id,
      campaignId: campaign.id,
      campaignName: campaign.name,
      campaignDate: campaign.campaign_date,
      contactId: contact.id,
      contactName: contact.name,
      sortOrder: assignment.sort_order,
      status: assignment.status as CallerQueueRosterItem["status"],
      latestDispositionStatus: latest?.disposition_status ?? null,
      latestStatusGroup: latest?.status_group ?? null,
      actionable: actionableIds.has(assignment.id),
    })
  }

  roster.sort(compareQueueOrder)

  let called = 0
  let reached = 0
  let noAnswer = 0

  for (const assignment of activeAssignments) {
    const logs = logsByAssignment.get(assignment.id) ?? []
    if (logs.length === 0) {
      continue
    }

    called += 1
    if (logs.some((log) => isReachedGroup(log.status_group))) {
      reached += 1
    }

    if (latestLog(logs)?.status_group === "NOT_REACHABLE") {
      noAnswer += 1
    }
  }

  const campaignIds = [...new Set(entries.map((entry) => entry.campaignId))]
  const campaigns: CallerQueueCampaign[] = campaignIds
    .map((campaignId) => {
      const campaign = campaignsById.get(campaignId)
      if (!campaign) {
        return null
      }

      const progress = campaignProgressFor(assignments, logsByAssignment, campaignId)

      return {
        id: campaign.id,
        name: campaign.name,
        campaignDate: campaign.campaign_date,
        gapDuration: campaign.gap_duration,
        maxAttempts: campaign.max_attempts,
        total: progress.total,
        called: progress.called,
      }
    })
    .filter((campaign): campaign is CallerQueueCampaign => campaign !== null)
    .sort(
      (left, right) =>
        left.campaignDate.localeCompare(right.campaignDate) || left.name.localeCompare(right.name),
    )

  const surveysByCampaign = await readSurveys(
    staff.programId,
    entries.map((entry) => entry.campaignId),
  )

  return {
    caller: { id: caller.id, displayName: caller.displayName },
    entries,
    roster,
    counts: { called, reached, noAnswer, pending: entries.length },
    campaigns,
    surveysByCampaign,
  }
}

/**
 * The number of calls still actionable in the caller's queue.
 *
 * This is the same predicate `listCallerQueue` applies to build `entries`, with
 * none of the contact, profile, history or survey reads the badge does not
 * need. It exists for the phone menu's Assignments badge, which is fetched on
 * campaign pages that never load the queue itself.
 */
export async function countCallerPendingCalls(staff: StaffContext): Promise<number> {
  const caller = await requireDialerCaller(staff)
  const assignments = await readAssignments(staff.programId, caller.id)
  const campaignsById = await readCampaigns(
    staff.programId,
    assignments.map((assignment) => assignment.campaign_id),
  )
  const logs = await readCallLogs(
    staff.programId,
    assignments.map((assignment) => assignment.id),
  )
  const attemptsByAssignment = new Map<string, number>()

  for (const log of logs) {
    attemptsByAssignment.set(log.assignment_id, (attemptsByAssignment.get(log.assignment_id) ?? 0) + 1)
  }

  let pending = 0

  for (const assignment of assignments) {
    const campaign = campaignsById.get(assignment.campaign_id)

    if (!campaign || campaign.status !== "ACTIVE" || assignment.status !== "PENDING") {
      continue
    }

    if ((attemptsByAssignment.get(assignment.id) ?? 0) >= campaign.max_attempts) {
      continue
    }

    pending += 1
  }

  return pending
}

/**
 * One card by assignment id, for a direct load or a reload after tab loss.
 * The assignment's own owner check is `assertCallerAssignmentInScope`; the
 * campaign, contact and history reads are all keyed by that result.
 */
export async function getCallerAssignment(
  staff: StaffContext,
  assignmentId: string,
): Promise<CallerAssignmentCard> {
  assertAssignmentIdShape(assignmentId)
  const { assignment, caller } = await assertCallerAssignmentInScope(staff, assignmentId)
  const campaignsById = await readCampaigns(staff.programId, [assignment.campaign_id])
  const campaign = campaignsById.get(assignment.campaign_id)

  if (!campaign) {
    throw new CallerAssignmentNotFoundError()
  }

  if (campaign.status !== "ACTIVE") {
    throw new AuthzError(
      409,
      "campaign_not_active",
      `This campaign is ${campaign.status} and no longer accepts calls.`,
    )
  }

  const [contactsById, profilesById, callerAssignments, contactAssignments] = await Promise.all([
    readContacts(staff.programId, [assignment.contact_id]),
    readProfiles(staff.programId, [assignment.contact_id]),
    readAssignments(staff.programId, caller.id, campaign.id),
    readAssignmentsForContacts(staff.programId, [assignment.contact_id]),
  ])

  const contact = contactsById.get(assignment.contact_id)
  if (!contact) {
    throw new CallerAssignmentNotFoundError()
  }

  const contactAssignmentById = new Map(
    contactAssignments.map((row) => [row.id, row] as const),
  )
  const contactLogs = await readCallLogs(
    staff.programId,
    contactAssignments.map((row) => row.id),
  )
  const logsByAssignment = new Map<string, CallLogRow[]>()

  for (const log of contactLogs) {
    const list = logsByAssignment.get(log.assignment_id) ?? []
    list.push(log)
    logsByAssignment.set(log.assignment_id, list)
  }

  const attempts = logsByAssignment.get(assignment.id)?.length ?? 0
  if (attempts >= campaign.max_attempts) {
    throw new AuthzError(
      409,
      "assignment_attempt_cap",
      `This contact has reached the campaign's ${campaign.max_attempts}-attempt cap.`,
    )
  }

  const surveys = await readSurveys(staff.programId, [campaign.id])

  return {
    assignment: buildEntry(assignment, {
      campaign,
      contact,
      profile: profilesById.get(assignment.contact_id),
      callerAssignments,
      logsByAssignment,
      contactLogs,
      contactAssignmentById,
    }),
    survey: surveys[campaign.id] ?? [],
  }
}

/**
 * Skip writes a real state. A non-PENDING assignment, or a campaign that is no
 * longer ACTIVE, is a terminal 409; the caller is never dropped silently.
 */
export async function skipCallerAssignment(
  staff: StaffContext,
  assignmentId: string,
): Promise<{ assignmentId: string; status: "SKIPPED" }> {
  assertAssignmentIdShape(assignmentId)
  const { assignment } = await assertCallerAssignmentInScope(staff, assignmentId)
  const campaignsById = await readCampaigns(staff.programId, [assignment.campaign_id])
  const campaign = campaignsById.get(assignment.campaign_id)

  if (!campaign) {
    throw new CallerAssignmentNotFoundError()
  }

  if (campaign.status !== "ACTIVE") {
    throw new AuthzError(
      409,
      "campaign_not_active",
      `This campaign is ${campaign.status} and no longer accepts calls.`,
    )
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("dialer_assignments")
    .update({ status: "SKIPPED" })
    .eq("id", assignmentId)
    .eq("program_id", staff.programId)
    .eq("caller_id", assignment.caller_id)
    .eq("status", "PENDING")
    .select("id,status")
    .maybeSingle()

  if (error) {
    throw new AuthzError(500, "assignment_skip_failed", "Unable to skip this assignment.")
  }

  if (!data) {
    throw new AuthzError(
      409,
      "assignment_not_pending",
      "This assignment is no longer pending; the queue has moved on.",
    )
  }

  return { assignmentId: data.id, status: "SKIPPED" }
}

function normalizeNotes(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value !== "string") {
    throw new AuthzError(400, "invalid_notes", "Notes must be text or null.")
  }

  const notes = value.trim()
  if (notes.length > NOTES_MAX_LENGTH) {
    throw new AuthzError(400, "invalid_notes", `Notes must be at most ${NOTES_MAX_LENGTH} characters.`)
  }

  return notes.length > 0 ? notes : null
}

function normalizeResponses(value: unknown): DispositionResponseInput[] {
  if (value === undefined || value === null) {
    return []
  }

  if (!Array.isArray(value) || value.length > RESPONSE_LIMIT) {
    throw new AuthzError(400, "invalid_responses", "Survey responses must be a bounded list.")
  }

  const seen = new Set<string>()
  const responses: DispositionResponseInput[] = []

  for (const entry of value) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new AuthzError(400, "invalid_responses", "Each survey response must be an object.")
    }

    const record = entry as { [key: string]: unknown }
    const questionId = record.questionId
    const answer = record.answer
    const answerValues = record.answerValues

    if (typeof questionId !== "string" || !UUID_PATTERN.test(questionId)) {
      throw new AuthzError(400, "invalid_responses", "Each survey response needs a question id.")
    }

    if (seen.has(questionId)) {
      throw new AuthzError(400, "duplicate_question", "A survey question was answered twice.")
    }
    seen.add(questionId)

    if (answer !== null && answer !== undefined && typeof answer !== "string") {
      throw new AuthzError(400, "invalid_responses", "A survey answer must be text or null.")
    }

    if (
      answerValues !== null &&
      answerValues !== undefined &&
      (!Array.isArray(answerValues) || answerValues.some((item) => typeof item !== "string"))
    ) {
      throw new AuthzError(400, "invalid_responses", "Multi-select answers must be a list of strings.")
    }

    responses.push({
      questionId,
      answer: typeof answer === "string" ? answer : null,
      answerValues: Array.isArray(answerValues) ? (answerValues as string[]) : null,
    })
  }

  return responses
}

function readRpcError(error: { message?: string; details?: string; code?: string } | null): string {
  return [error?.message, error?.details, error?.code].filter(Boolean).join(" ")
}

function rpcError(error: { message?: string; details?: string; code?: string } | null): AuthzError {
  const text = readRpcError(error)

  if (/assignment_not_found|assignment.*P0002/.test(text)) {
    return new CallerAssignmentNotFoundError()
  }

  if (/caller_not_found/.test(text)) {
    return new AuthzError(403, "caller_not_found", "No dialer caller profile is linked to this staff user.")
  }

  if (/caller_inactive/.test(text)) {
    return new AuthzError(409, "caller_deactivated", "This caller profile is deactivated.")
  }

  if (/assignment_reassigned/.test(text)) {
    return new AuthzError(409, "assignment_reassigned", "This assignment was reassigned to another caller.")
  }

  if (/campaign_not_active/.test(text)) {
    return new AuthzError(409, "campaign_not_active", "This campaign is no longer active.")
  }

  if (/campaign_not_found/.test(text)) {
    return new CallerAssignmentNotFoundError()
  }

  if (/assignment_not_pending/.test(text)) {
    return new AuthzError(409, "assignment_not_pending", "This assignment is no longer pending.")
  }

  if (/attempt_conflict/.test(text)) {
    return new AuthzError(409, "attempt_conflict", "This attempt conflicts with a stored call.")
  }

  if (/disposition_conflict/.test(text)) {
    return new AuthzError(
      409,
      "disposition_conflict",
      "A different outcome was already stored for this attempt.",
    )
  }

  if (/phone_missing/.test(text)) {
    return new AuthzError(400, "phone_missing", "This contact has no phone number to call.")
  }

  if (
    /survey_answer_required|survey_option_required|survey_question_invalid|survey_answer_invalid|survey_not_applicable|invalid_disposition_status|invalid_attempt|invalid_responses|invalid_question_id|duplicate_question/.test(
      text,
    )
  ) {
    return new AuthzError(400, "disposition_validation_failed", `The disposition was rejected: ${text}.`)
  }

  return new AuthzError(
    500,
    "disposition_write_failed",
    "The disposition could not be stored; nothing was written.",
  )
}

/**
 * The one-transaction save. The caller id, program and attempt are resolved or
 * validated here; `record_call_disposition` re-reads the assignment, caller,
 * campaign and contact inside the transaction and writes all three rows or none.
 */
export async function recordCallDisposition(
  staff: StaffContext,
  input: RecordDispositionInput,
): Promise<DispositionReceipt> {
  assertAssignmentIdShape(input.assignmentId)

  if (!isDispositionStatus(input.dispositionStatus)) {
    throw new AuthzError(400, "invalid_disposition_status", "Choose one of the thirteen statuses.")
  }

  if (!Number.isInteger(input.attempt) || input.attempt < 1) {
    throw new AuthzError(400, "invalid_attempt", "Attempt must be a whole number of 1 or more.")
  }

  const caller = await requireDialerCaller(staff)
  const followUpNotes = normalizeNotes(input.followUpNotes)
  const responses = normalizeResponses(input.responses)

  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin.rpc("record_call_disposition", {
    p_assignment_id: input.assignmentId,
    p_program_id: staff.programId,
    p_caller_id: caller.id,
    p_attempt: input.attempt,
    p_disposition_status: input.dispositionStatus,
    p_follow_up_notes: followUpNotes,
    p_responses: responses,
  })

  if (error) {
    throw rpcError(error)
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new AuthzError(
      500,
      "disposition_write_unverified",
      "The disposition write returned an unreadable result; the call may have been written.",
    )
  }

  const receipt = data as { [key: string]: unknown }

  return {
    callLogId: String(receipt.callLogId ?? ""),
    assignmentId: String(receipt.assignmentId ?? ""),
    attempt: Number(receipt.attempt ?? 0),
    calledAt: String(receipt.calledAt ?? ""),
    dispositionStatus: String(receipt.dispositionStatus ?? ""),
    statusGroup: String(receipt.statusGroup ?? ""),
    followUpNotes: typeof receipt.followUpNotes === "string" ? receipt.followUpNotes : null,
    replay: receipt.replay === true,
  }
}

function summarize(
  assignments: AssignmentRow[],
  logsByAssignment: Map<string, CallLogRow[]>,
  maxAttempts: number,
): CallerSessionCounts {
  let called = 0
  let reached = 0
  let noAnswer = 0
  let wrongNumber = 0
  let skipped = 0
  let pending = 0
  let closedAfterCap = 0
  let recallable = 0

  for (const assignment of assignments) {
    const logs = logsByAssignment.get(assignment.id) ?? []
    const latest = latestLog(logs)
    const attempts = logs.length

    if (logs.length > 0) {
      called += 1
    }

    if (logs.some((log) => isReachedGroup(log.status_group))) {
      reached += 1
    }

    if (latest?.status_group === "NOT_REACHABLE") {
      noAnswer += 1
    }

    if (latest?.status_group === "WRONG_NUMBER") {
      wrongNumber += 1
    }

    if (assignment.status === "SKIPPED") {
      skipped += 1
    }

    if (assignment.status === "PENDING") {
      pending += 1
    }

    if (assignment.status === "COMPLETED" && attempts >= maxAttempts) {
      closedAfterCap += 1
    }

    if (
      assignment.status === "COMPLETED" &&
      latest?.status_group === "NOT_REACHABLE" &&
      attempts < maxAttempts
    ) {
      recallable += 1
    }
  }

  return {
    total: assignments.length,
    called,
    reached,
    noAnswer,
    wrongNumber,
    skipped,
    pending,
    closedAfterCap,
    recallable,
  }
}

async function readCallerCampaign(
  staff: StaffContext,
  caller: DialerCaller,
  campaignId: string,
): Promise<CampaignRow> {
  const campaignsById = await readCampaigns(staff.programId, [campaignId])
  const campaign = campaignsById.get(campaignId)

  if (!campaign) {
    throw new CallerAssignmentNotFoundError()
  }

  // The campaign is in this caller's payload only when the caller holds at
  // least one assignment in it. A campaign the caller has never been assigned
  // in is indistinguishable from a missing one.
  const assignments = await readAssignments(staff.programId, caller.id, campaignId)
  if (assignments.length === 0) {
    throw new CallerAssignmentNotFoundError()
  }

  return campaign
}

/** The caller's own counts for one campaign; campaign-grain numbers never enter this read. */
export async function getCallerSessionSummary(
  staff: StaffContext,
  campaignId: string,
): Promise<CallerSessionSummary> {
  assertCampaignIdShape(campaignId)
  const caller = await requireDialerCaller(staff)
  const campaign = await readCallerCampaign(staff, caller, campaignId)
  const assignments = await readAssignments(staff.programId, caller.id, campaignId)
  const logs = await readCallLogs(
    staff.programId,
    assignments.map((assignment) => assignment.id),
  )
  const logsByAssignment = new Map<string, CallLogRow[]>()

  for (const log of logs) {
    const list = logsByAssignment.get(log.assignment_id) ?? []
    list.push(log)
    logsByAssignment.set(log.assignment_id, list)
  }

  return {
    campaign: {
      id: campaign.id,
      name: campaign.name,
      campaignDate: campaign.campaign_date,
      status: campaign.status as CampaignStatus,
      maxAttempts: campaign.max_attempts,
    },
    counts: summarize(assignments, logsByAssignment, campaign.max_attempts),
  }
}

/**
 * Recall is bounded: only the caller's own NOT_REACHABLE COMPLETED rows under
 * the attempt cap return to PENDING. `attempt` is not touched — the next call
 * log is the next attempt. A reached contact and a wrong number never return.
 */
export async function recallCallerNotReachable(
  staff: StaffContext,
  campaignId: string,
): Promise<RecallResult> {
  assertCampaignIdShape(campaignId)
  const caller = await requireDialerCaller(staff)
  const campaign = await readCallerCampaign(staff, caller, campaignId)

  if (campaign.status !== "ACTIVE") {
    throw new AuthzError(
      409,
      "campaign_not_active",
      `This campaign is ${campaign.status} and cannot re-queue contacts.`,
    )
  }

  const assignments = await readAssignments(staff.programId, caller.id, campaignId)
  const logs = await readCallLogs(
    staff.programId,
    assignments.map((assignment) => assignment.id),
  )
  const logsByAssignment = new Map<string, CallLogRow[]>()

  for (const log of logs) {
    const list = logsByAssignment.get(log.assignment_id) ?? []
    list.push(log)
    logsByAssignment.set(log.assignment_id, list)
  }

  const eligible = assignments
    .filter((assignment) => assignment.status === "COMPLETED")
    .filter((assignment) => {
      const assignmentLogs = logsByAssignment.get(assignment.id) ?? []
      const latest = latestLog(assignmentLogs)
      return latest?.status_group === "NOT_REACHABLE" && assignmentLogs.length < campaign.max_attempts
    })
    .map((assignment) => assignment.id)

  if (eligible.length === 0) {
    return { requeued: 0 }
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("dialer_assignments")
    .update({ status: "PENDING" })
    .eq("program_id", staff.programId)
    .eq("caller_id", caller.id)
    .eq("campaign_id", campaignId)
    .eq("status", "COMPLETED")
    .in("id", eligible)
    .select("id")

  if (error) {
    throw new AuthzError(500, "recall_write_failed", "The re-queue could not be stored.")
  }

  return { requeued: Array.isArray(data) ? data.length : 0 }
}
