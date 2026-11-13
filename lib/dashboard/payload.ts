/**
 * Strict parsers for the two dashboard RPC payloads.
 *
 * The RPC is the one definition of every number; a missing count that became
 * `0` here would render as a measured zero and be indistinguishable from a
 * real one. So a missing or wrongly typed field throws, and the page's error
 * boundary turns it into a 500. This mirrors `lib/dialer/progress.ts`.
 */

import type {
  AttendanceTrendPoint,
  CandidatePage,
  DashboardCampaign,
  DashboardCoverage,
  DashboardKpis,
  DashboardOutcome,
  DashboardOverview,
  DashboardPipeline,
  DashboardScopeCounts,
  DashboardTeam,
  FocusRow,
  FocusSegment,
  FocusSegmentKey,
  PipelineStage,
  PipelineStageKey,
  RecentSession,
  TeamRow,
} from "@/lib/dashboard/types"
import { FOCUS_SEGMENTS, PIPELINE_STAGE_LABELS } from "@/lib/dashboard/types"

export class DashboardPayloadError extends Error {
  constructor(path: string, detail?: string) {
    super(`Invalid dashboard payload at ${path}${detail ? `: ${detail}` : ""}`)
    this.name = "DashboardPayloadError"
  }
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new DashboardPayloadError(path, "expected an object")
  }

  return value as Record<string, unknown>
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new DashboardPayloadError(path, "expected an array")
  }

  return value
}

function requireInteger(record: Record<string, unknown>, key: string, path: string): number {
  const value = record[key]

  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new DashboardPayloadError(`${path}.${key}`, "expected an integer")
  }

  return value
}

function requireNumber(record: Record<string, unknown>, key: string, path: string): number {
  const value = record[key]

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new DashboardPayloadError(`${path}.${key}`, "expected a number")
  }

  return value
}

function requireNullableInteger(
  record: Record<string, unknown>,
  key: string,
  path: string,
): number | null {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    throw new DashboardPayloadError(`${path}.${key}`, "missing")
  }

  const value = record[key]

  if (value === null) {
    return null
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new DashboardPayloadError(`${path}.${key}`, "expected an integer or null")
  }

  return value
}

function requireText(record: Record<string, unknown>, key: string, path: string): string {
  const value = record[key]

  if (typeof value !== "string") {
    throw new DashboardPayloadError(`${path}.${key}`, "expected text")
  }

  return value
}

function requireNullableText(record: Record<string, unknown>, key: string, path: string): string | null {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    throw new DashboardPayloadError(`${path}.${key}`, "missing")
  }

  const value = record[key]

  if (value === null) {
    return null
  }

  if (typeof value !== "string") {
    throw new DashboardPayloadError(`${path}.${key}`, "expected text or null")
  }

  return value
}

function requireBoolean(record: Record<string, unknown>, key: string, path: string): boolean {
  const value = record[key]

  if (typeof value !== "boolean") {
    throw new DashboardPayloadError(`${path}.${key}`, "expected a boolean")
  }

  return value
}

function parseFocusRow(value: unknown, path: string): FocusRow {
  const row = requireRecord(value, path)

  return {
    contactId: requireText(row, "contactId", path),
    name: requireText(row, "name", path),
    phone: requireText(row, "phone", path),
    preacherName: requireNullableText(row, "preacherName", path),
    locationName: requireNullableText(row, "locationName", path),
    lastActivity: requireNullableText(row, "lastActivity", path),
    reason: requireText(row, "reason", path),
    sessionId: requireNullableText(row, "sessionId", path),
    sessionName: requireNullableText(row, "sessionName", path),
    sessionDate: requireNullableText(row, "sessionDate", path),
    lastCalledAt: requireNullableText(row, "lastCalledAt", path),
    disposition: requireNullableText(row, "disposition", path),
    campaignName: requireNullableText(row, "campaignName", path),
    lifetimeAttendance: requireNullableInteger(row, "lifetimeAttendance", path),
    lastAttendedAt: requireNullableText(row, "lastAttendedAt", path),
    initialContact: requireNullableText(row, "initialContact", path),
    daysWaiting: requireNullableInteger(row, "daysWaiting", path),
    collectorName: requireNullableText(row, "collectorName", path),
    daysSince: requireNullableInteger(row, "daysSince", path),
  }
}

function parsePipeline(record: Record<string, unknown>, path: string): DashboardPipeline {
  const stagesValue = requireArray(record.stages, `${path}.stages`)
  const byKey = new Map<PipelineStageKey, number>()

  for (const [index, value] of stagesValue.entries()) {
    const stage = requireRecord(value, `${path}.stages[${index}]`)
    const key = requireText(stage, "key", `${path}.stages[${index}]`)

    if (!(key in PIPELINE_STAGE_LABELS)) {
      throw new DashboardPayloadError(`${path}.stages[${index}].key`, `unknown stage ${key}`)
    }

    byKey.set(key as PipelineStageKey, requireInteger(stage, "count", `${path}.stages[${index}]`))
  }

  if (byKey.size !== 5) {
    throw new DashboardPayloadError(`${path}.stages`, "expected all five stages")
  }

  const stages: PipelineStage[] = (Object.keys(PIPELINE_STAGE_LABELS) as PipelineStageKey[]).map((key) => ({
    key,
    count: byKey.get(key)!,
  }))

  const attended = requireRecord(record.attended, `${path}.attended`)

  return {
    cohort: requireInteger(record, "cohort", path),
    stages,
    attended: {
      invited: requireInteger(attended, "invited", `${path}.attended`),
      attended: requireInteger(attended, "attended", `${path}.attended`),
      confirmed: requireInteger(attended, "confirmed", `${path}.attended`),
      unconfirmed: requireInteger(attended, "unconfirmed", `${path}.attended`),
    },
    unlinkedCampaigns: requireInteger(record, "unlinkedCampaigns", path),
  }
}

function parseKpis(record: Record<string, unknown>, path: string): DashboardKpis {
  return {
    contactsCollected: requireInteger(record, "contactsCollected", path),
    contactsCollectedPrev: requireInteger(record, "contactsCollectedPrev", path),
    contactsCollectedDelta: requireNullableInteger(record, "contactsCollectedDelta", path),
    contactsCollectedDeltaPct: requireNullableInteger(record, "contactsCollectedDeltaPct", path),
    callsMade: requireInteger(record, "callsMade", path),
    contactsCalled: requireInteger(record, "contactsCalled", path),
    contactsReached: requireInteger(record, "contactsReached", path),
    contactsConfirmed: requireInteger(record, "contactsConfirmed", path),
    reachRate: requireInteger(record, "reachRate", path),
    confirmationRate: requireInteger(record, "confirmationRate", path),
    sessionsHeld: requireInteger(record, "sessionsHeld", path),
    uniqueAttendees: requireInteger(record, "uniqueAttendees", path),
    attendanceRecords: requireInteger(record, "attendanceRecords", path),
    newAttendees: requireInteger(record, "newAttendees", path),
    returningAttendees: requireInteger(record, "returningAttendees", path),
    repeatAttendees: requireInteger(record, "repeatAttendees", path),
    repeatRate: requireInteger(record, "repeatRate", path),
    averageAttendance: requireNumber(record, "averageAttendance", path),
    invitedAttendees: requireInteger(record, "invitedAttendees", path),
    organicAttendees: requireInteger(record, "organicAttendees", path),
  }
}

function parseOutcome(value: unknown, path: string): DashboardOutcome {
  const record = requireRecord(value, path)

  return {
    statusGroup: requireText(record, "statusGroup", path),
    count: requireInteger(record, "count", path),
  }
}

function parseTrendPoint(value: unknown, path: string): AttendanceTrendPoint {
  const record = requireRecord(value, path)

  return {
    month: requireText(record, "month", path),
    sessions: requireInteger(record, "sessions", path),
    attendees: requireInteger(record, "attendees", path),
    checkIns: requireInteger(record, "checkIns", path),
  }
}

function parseCoverage(record: Record<string, unknown>, path: string): DashboardCoverage {
  return {
    contacts: requireInteger(record, "contacts", path),
    withLocation: requireInteger(record, "withLocation", path),
    withAssignedPreacher: requireInteger(record, "withAssignedPreacher", path),
    withInitialContact: requireInteger(record, "withInitialContact", path),
    withCollector: requireInteger(record, "withCollector", path),
  }
}

function parseTeamRow(value: unknown, path: string): TeamRow {
  const record = requireRecord(value, path)

  return {
    key: requireText(record, "key", path),
    name: requireText(record, "name", path),
    contactsCollected: requireInteger(record, "contactsCollected", path),
    callsMade: requireInteger(record, "callsMade", path),
    reached: requireInteger(record, "reached", path),
    confirmed: requireInteger(record, "confirmed", path),
    sessions: requireInteger(record, "sessions", path),
    attendees: requireInteger(record, "attendees", path),
    lastActivity: requireNullableText(record, "lastActivity", path),
  }
}

function parseTeam(record: Record<string, unknown>, path: string): DashboardTeam {
  const groupBy = requireText(record, "groupBy", path)

  if (groupBy !== "preacher" && groupBy !== "location") {
    throw new DashboardPayloadError(`${path}.groupBy`, `unknown grouping ${groupBy}`)
  }

  return {
    groupBy,
    rows: requireArray(record.rows, `${path}.rows`).map((row, index) =>
      parseTeamRow(row, `${path}.rows[${index}]`),
    ),
  }
}

function parseCampaign(value: unknown, path: string): DashboardCampaign {
  const record = requireRecord(value, path)

  return {
    id: requireText(record, "id", path),
    name: requireText(record, "name", path),
    status: requireText(record, "status", path),
    campaignDate: requireText(record, "campaignDate", path),
    sessionCount: requireInteger(record, "sessionCount", path),
    sessionId: requireNullableText(record, "sessionId", path),
    sessionName: requireNullableText(record, "sessionName", path),
    sessionDate: requireNullableText(record, "sessionDate", path),
    assigned: requireInteger(record, "assigned", path),
    attempted: requireInteger(record, "attempted", path),
    reached: requireInteger(record, "reached", path),
    confirmed: requireInteger(record, "confirmed", path),
    neverAttempted: requireInteger(record, "neverAttempted", path),
    attended: requireNullableInteger(record, "attended", path),
  }
}

function parseRecentSession(value: unknown, path: string): RecentSession {
  const record = requireRecord(value, path)

  return {
    id: requireText(record, "id", path),
    name: requireText(record, "name", path),
    sessionDate: requireNullableText(record, "sessionDate", path),
    preacherName: requireNullableText(record, "preacherName", path),
    locationName: requireNullableText(record, "locationName", path),
    attendees: requireInteger(record, "attendees", path),
  }
}

function parseFocusSegment(value: unknown, path: string): FocusSegment {
  const record = requireRecord(value, path)
  const key = requireText(record, "key", path)

  if (!FOCUS_SEGMENTS.some((segment) => segment.key === key)) {
    throw new DashboardPayloadError(`${path}.key`, `unknown segment ${key}`)
  }

  return {
    key: key as FocusSegmentKey,
    count: requireInteger(record, "count", path),
    rows: requireArray(record.rows, `${path}.rows`).map((row, index) =>
      parseFocusRow(row, `${path}.rows[${index}]`),
    ),
  }
}

export function parseDashboardOverview(value: unknown): DashboardOverview {
  const record = requireRecord(value, "overview")
  const period = requireRecord(record.period, "overview.period")
  const scope = requireRecord(record.scope, "overview.scope")

  const scopeCounts: DashboardScopeCounts = {
    contacts: requireInteger(scope, "contacts", "overview.scope"),
    locations: requireInteger(scope, "locations", "overview.scope"),
    sessions: requireInteger(scope, "sessions", "overview.scope"),
  }

  const focusValue = requireArray(record.focus, "overview.focus")
  const focusByKey = new Map<FocusSegmentKey, FocusSegment>()

  for (const [index, entry] of focusValue.entries()) {
    const segment = parseFocusSegment(entry, `overview.focus[${index}]`)

    if (focusByKey.has(segment.key)) {
      throw new DashboardPayloadError(`overview.focus[${index}].key`, `duplicate segment ${segment.key}`)
    }

    focusByKey.set(segment.key, segment)
  }

  if (focusByKey.size !== FOCUS_SEGMENTS.length) {
    throw new DashboardPayloadError("overview.focus", "expected all five focus segments")
  }

  return {
    programId: requireText(record, "programId", "overview"),
    programScope: requireBoolean(record, "programScope", "overview"),
    scopePreacherId: requireNullableText(record, "scopePreacherId", "overview"),
    period: {
      start: requireNullableText(period, "start", "overview.period"),
      end: requireText(period, "end", "overview.period"),
      today: requireText(period, "today", "overview.period"),
      previousStart: requireNullableText(period, "previousStart", "overview.period"),
      previousEnd: requireNullableText(period, "previousEnd", "overview.period"),
    },
    scope: scopeCounts,
    kpis: parseKpis(requireRecord(record.kpis, "overview.kpis"), "overview.kpis"),
    pipeline: parsePipeline(requireRecord(record.pipeline, "overview.pipeline"), "overview.pipeline"),
    outcomes: requireArray(record.outcomes, "overview.outcomes").map((entry, index) =>
      parseOutcome(entry, `overview.outcomes[${index}]`),
    ),
    attendanceTrend: requireArray(record.attendanceTrend, "overview.attendanceTrend").map((entry, index) =>
      parseTrendPoint(entry, `overview.attendanceTrend[${index}]`),
    ),
    coverage: parseCoverage(requireRecord(record.coverage, "overview.coverage"), "overview.coverage"),
    team: parseTeam(requireRecord(record.team, "overview.team"), "overview.team"),
    campaigns: requireArray(record.campaigns, "overview.campaigns").map((entry, index) =>
      parseCampaign(entry, `overview.campaigns[${index}]`),
    ),
    recentSessions: requireArray(record.recentSessions, "overview.recentSessions").map((entry, index) =>
      parseRecentSession(entry, `overview.recentSessions[${index}]`),
    ),
    focus: FOCUS_SEGMENTS.map((segment) => focusByKey.get(segment.key)!),
    generatedAt: requireText(record, "generatedAt", "overview"),
  }
}

export function parseCandidatePage(value: unknown, expectedSegment: FocusSegmentKey): CandidatePage {
  const record = requireRecord(value, "candidates")
  const segment = requireText(record, "segment", "candidates")

  if (segment !== expectedSegment) {
    throw new DashboardPayloadError("candidates.segment", `expected ${expectedSegment}, got ${segment}`)
  }

  return {
    segment: expectedSegment,
    total: requireInteger(record, "total", "candidates"),
    limit: requireInteger(record, "limit", "candidates"),
    offset: requireInteger(record, "offset", "candidates"),
    rows: requireArray(record.rows, "candidates.rows").map((row, index) =>
      parseFocusRow(row, `candidates.rows[${index}]`),
    ),
  }
}
