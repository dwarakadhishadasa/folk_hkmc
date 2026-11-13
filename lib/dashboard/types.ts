/**
 * Client-safe DTOs and display labels for `/dashboard`.
 *
 * Nothing here imports a server module, and nothing here defines a number:
 * every count is parsed from `dashboard_overview` / `dashboard_candidates` by
 * the server loaders. Components format and lay these values out.
 */

import type { DashboardPeriod } from "@/lib/dashboard/period"

export type DashboardMode = "admin" | "preacher"
export type DashboardRole = "Admin" | "Preacher" | "Assistant"

export type FocusSegmentKey =
  | "confirmed_not_attended"
  | "ready_to_invite"
  | "committed_not_invited"
  | "new_untouched"
  | "fading"

export interface DashboardPeriodPayload {
  start: string | null
  end: string
  today: string
  previousStart: string | null
  previousEnd: string | null
}

export interface DashboardScopeCounts {
  contacts: number
  locations: number
  sessions: number
}

/** One stacked-bar segment: a location and its count for one preacher. */
export interface DashboardSeriesSegment {
  key: string
  label: string
  value: number
}

export interface DashboardPreacherBarRow {
  preacherId: string
  preacherName: string
  total: number
  segments: DashboardSeriesSegment[]
}

export interface DashboardPreacherBars {
  rows: DashboardPreacherBarRow[]
}

export interface DashboardAttendeeSeries {
  preacherId: string
  preacherName: string
  values: number[]
}

/** One preacher's selected-period totals, for the three-bar scorecard. */
export interface DashboardPreacherTotalsRow {
  preacherId: string
  preacherName: string
  contacts: number
  sessions: number
  attendees: number
  /** Period attendees with two or more attendance records. */
  repeatAttendees: number
  /** The attendee total split by the first location each person attended. */
  attendeeSegments: DashboardSeriesSegment[]
}

/** The people-first series the dashboard charts read. */
export interface DashboardPeopleSeries {
  sessionsByPreacher: DashboardPreacherBars
  contactsByPreacher: DashboardPreacherBars
  totals: {
    rows: DashboardPreacherTotalsRow[]
  }
  attendeesByPreacher: {
    months: string[]
    series: DashboardAttendeeSeries[]
  }
}

export interface DashboardKpis {
  contactsCollected: number
  contactsCollectedPrev: number
  /** Signed count difference vs the previous window; null when there is none. */
  contactsCollectedDelta: number | null
  contactsCollectedDeltaPct: number | null
  callsMade: number
  contactsCalled: number
  contactsReached: number
  contactsConfirmed: number
  reachRate: number
  confirmationRate: number
  sessionsHeld: number
  uniqueAttendees: number
  attendanceRecords: number
  newAttendees: number
  returningAttendees: number
  repeatAttendees: number
  repeatRate: number
  averageAttendance: number
  invitedAttendees: number
  organicAttendees: number
}

export type PipelineStageKey = "collected" | "assigned" | "called" | "reached" | "confirmed"

export interface PipelineStage {
  key: PipelineStageKey
  count: number
}

export interface DashboardPipeline {
  cohort: number
  stages: PipelineStage[]
  attended: {
    invited: number
    attended: number
    confirmed: number
    unconfirmed: number
  }
  unlinkedCampaigns: number
}

export interface DashboardOutcome {
  statusGroup: string
  count: number
}

export interface AttendanceTrendPoint {
  month: string
  sessions: number
  attendees: number
  checkIns: number
}

export interface DashboardCoverage {
  contacts: number
  withLocation: number
  withAssignedPreacher: number
  withInitialContact: number
  withCollector: number
}

export interface TeamRow {
  key: string
  name: string
  contactsCollected: number
  callsMade: number
  reached: number
  confirmed: number
  sessions: number
  attendees: number
  lastActivity: string | null
}

export interface DashboardTeam {
  groupBy: "preacher" | "location"
  rows: TeamRow[]
}

export interface DashboardCampaign {
  id: string
  name: string
  status: string
  campaignDate: string
  sessionCount: number
  sessionId: string | null
  sessionName: string | null
  sessionDate: string | null
  assigned: number
  attempted: number
  reached: number
  confirmed: number
  neverAttempted: number
  /** Null when no linked session is visible: never a false zero conversion. */
  attended: number | null
}

export interface RecentSession {
  id: string
  name: string
  sessionDate: string | null
  preacherName: string | null
  locationName: string | null
  attendees: number
}

export interface FocusRow {
  contactId: string
  name: string
  phone: string
  preacherName: string | null
  locationName: string | null
  lastActivity: string | null
  reason: string
  sessionId?: string | null
  sessionName?: string | null
  sessionDate?: string | null
  lastCalledAt?: string | null
  disposition?: string | null
  campaignName?: string | null
  lifetimeAttendance?: number | null
  lastAttendedAt?: string | null
  initialContact?: string | null
  daysWaiting?: number | null
  collectorName?: string | null
  daysSince?: number | null
}

export interface FocusSegment {
  key: FocusSegmentKey
  count: number
  rows: FocusRow[]
}

export interface DashboardOverview {
  programId: string
  programScope: boolean
  scopePreacherId: string | null
  period: DashboardPeriodPayload
  scope: DashboardScopeCounts
  kpis: DashboardKpis
  pipeline: DashboardPipeline
  outcomes: DashboardOutcome[]
  attendanceTrend: AttendanceTrendPoint[]
  coverage: DashboardCoverage
  team: DashboardTeam
  campaigns: DashboardCampaign[]
  recentSessions: RecentSession[]
  focus: FocusSegment[]
  generatedAt: string
}

export interface CandidatePage {
  segment: FocusSegmentKey
  total: number
  limit: number
  offset: number
  rows: FocusRow[]
}

/**
 * The server-resolved reader. `programScope` is the RPC's flag and never comes
 * from the URL for a Preacher or an Assistant.
 */
export interface DashboardScope {
  programId: string
  role: DashboardRole
  userId: string
  mode: DashboardMode
  programScope: boolean
  scopePreacherId: string | null
  displayName: string
  /** The preacher an Assistant reads, when resolved. */
  assistantPreacherName: string | null
  /** An Assistant with no active assigned Preacher: header + notice, no RPC. */
  assistantUnassigned: boolean
  hasDialer: boolean
}

export interface DashboardPageContext {
  period: DashboardPeriod
  scope: DashboardScope
}

export const FOCUS_SEGMENTS: ReadonlyArray<{
  key: FocusSegmentKey
  label: string
  rule: string
  requiresDialer: boolean
  empty: string
}> = [
  {
    key: "confirmed_not_attended",
    label: "Confirmed, not attended",
    rule: "Confirmed for a linked session that has already run, with no check-in.",
    requiresDialer: true,
    empty: "No one confirmed for a session that has already run is missing a check-in.",
  },
  {
    key: "ready_to_invite",
    label: "Ready to invite",
    rule: "Said they may come, asked for a callback, or will come later; no attendance in 30 days; not held by an active campaign with an upcoming session.",
    requiresDialer: true,
    empty: "No one is waiting on an invitation right now.",
  },
  {
    key: "committed_not_invited",
    label: "Committed, not invited",
    rule: "Attended three or more times, or twice in the last 60 days, and is not in an active campaign.",
    requiresDialer: true,
    empty: "Every committed regular is already in an active campaign.",
  },
  {
    key: "new_untouched",
    label: "New and untouched",
    rule: "Collected 7–90 days ago and never called or attended.",
    requiresDialer: false,
    empty: "No newly collected contact has been left untouched for a week.",
  },
  {
    key: "fading",
    label: "Fading",
    rule: "Attended twice or more, but not in the last 60 days.",
    requiresDialer: false,
    empty: "No regular has gone quiet for 60 days.",
  },
]

export function focusSegment(key: string): (typeof FOCUS_SEGMENTS)[number] | null {
  return FOCUS_SEGMENTS.find((segment) => segment.key === key) ?? null
}

export function isFocusSegmentKey(value: string): value is FocusSegmentKey {
  return FOCUS_SEGMENTS.some((segment) => segment.key === value)
}

/** Fixed order for the outcomes card; a zero group is omitted from the chart. */
export const OUTCOME_GROUP_ORDER = [
  "CONFIRMED",
  "MAY_COME",
  "DEFERRED",
  "NOT_REACHABLE",
  "WRONG_NUMBER",
  "NOT_INTERESTED",
] as const

export const OUTCOME_GROUP_LABELS: Record<string, string> = {
  CONFIRMED: "Confirmed",
  MAY_COME: "May come",
  DEFERRED: "Deferred",
  NOT_REACHABLE: "No answer",
  WRONG_NUMBER: "Wrong number",
  NOT_INTERESTED: "Not interested",
}

export const PIPELINE_STAGE_LABELS: Record<PipelineStageKey, string> = {
  collected: "Collected",
  assigned: "Assigned",
  called: "Called",
  reached: "Reached (invited)",
  confirmed: "Confirmed",
}
