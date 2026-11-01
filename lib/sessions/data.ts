import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type { SessionRecord } from "@/lib/supabase/data"
import type { Database } from "@/lib/supabase/types"
import type { SessionsScope } from "@/lib/sessions/scope"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type SessionStatus = "Upcoming" | "Live now" | "Completed"

export interface SessionOverviewRow {
  id: string
  name: string
  sessionDate: string | null
  locationId: string | null
  locationName: string | null
  attendanceCount: number
  status: SessionStatus
  attendanceUrl: string | null
  opensAt: string | null
  closesAt: string | null
}

export interface SessionsOverviewStats {
  sessionsCount: number
  attendeesTotal: number
  avgAttendanceCurrent: number
  avgAttendancePrevious: number
  repeatAttendees: number
  upcomingCount: number
}

export interface SessionReportRow {
  id: string
  name: string
  sessionDate: string | null
  attendanceCount: number
}

export interface SessionReportWeek {
  weekStart: string | null
  attendanceCount: number
}

export interface SessionsReport {
  sessionsRun: number
  totalAttendance: number
  avgPerSession: number
  repeatRate: number
  bySession: SessionReportRow[]
  weekly: SessionReportWeek[]
  top: SessionReportRow[]
}

export interface SessionAttendee {
  contactId: string
  name: string
  phone: string
  locationNames: string | null
  sessionsAttended: number
  firstSession: string | null
}

export interface ContactAttendanceSummary {
  name: string
  phone: string
  notes: string | null
  locationNames: string | null
  preacherName: string | null
  firstContact: string | null
  lastContacted: string | null
  collectedByName: string | null
  favorite: boolean
  sessionsAttended: number
  past60DayAttendance: number
  lastAttended: string | null
  history: Array<{ sessionName: string; sessionDate: string | null }>
}

const EMPTY_STATS: SessionsOverviewStats = {
  sessionsCount: 0,
  attendeesTotal: 0,
  avgAttendanceCurrent: 0,
  avgAttendancePrevious: 0,
  repeatAttendees: 0,
  upcomingCount: 0,
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null
}

function readNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function isSessionStatus(value: unknown): value is SessionStatus {
  return value === "Upcoming" || value === "Live now" || value === "Completed"
}

function rpcArgs(scope: SessionsScope) {
  return {
    p_program_id: scope.programId,
    p_user_id: scope.userId,
    p_role: scope.role,
    p_assigned_preacher_id: scope.assignedPreacherId,
  }
}

function readFailure(operation: string, error: { message: string; code?: string }): Error {
  console.error(`[sessions] ${operation} failed`, error)
  return new Error(`Unable to read sessions (${operation}).`)
}

function mapOverviewRow(row: {
  id: string
  name: string
  session_date: string | null
  location_id: string | null
  location_name: string | null
  attendance_count: number
  status: string
  attendance_url: string | null
  opens_at: string | null
  closes_at: string | null
}): SessionOverviewRow {
  return {
    id: row.id,
    name: row.name,
    sessionDate: readString(row.session_date),
    locationId: row.location_id,
    locationName: readString(row.location_name),
    attendanceCount: readNumber(row.attendance_count),
    status: isSessionStatus(row.status) ? row.status : "Completed",
    attendanceUrl: readString(row.attendance_url),
    opensAt: readString(row.opens_at),
    closesAt: readString(row.closes_at),
  }
}

function mapReportRow(value: unknown): SessionReportRow | null {
  if (!value || typeof value !== "object") {
    return null
  }

  const row = value as Record<string, unknown>
  const id = readString(row.id)
  const name = readString(row.name)

  if (!id || !name) {
    return null
  }

  return {
    id,
    name,
    sessionDate: readString(row.session_date),
    attendanceCount: readNumber(row.attendance_count),
  }
}

export function isSessionId(value: string): boolean {
  return UUID_PATTERN.test(value)
}

export async function listSessionsOverview(scope: SessionsScope): Promise<SessionOverviewRow[]> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin.rpc("sessions_overview", rpcArgs(scope))

  if (error) {
    throw readFailure("overview", error)
  }

  return (data ?? []).map(mapOverviewRow)
}

export async function getSessionsOverviewStats(scope: SessionsScope): Promise<SessionsOverviewStats> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin.rpc("sessions_overview_stats", rpcArgs(scope))

  if (error) {
    throw readFailure("overview stats", error)
  }

  const row = data?.[0]
  if (!row) {
    return EMPTY_STATS
  }

  return {
    sessionsCount: readNumber(row.sessions_count),
    attendeesTotal: readNumber(row.attendees_total),
    avgAttendanceCurrent: readNumber(row.avg_attendance_current),
    avgAttendancePrevious: readNumber(row.avg_attendance_previous),
    repeatAttendees: readNumber(row.repeat_attendees),
    upcomingCount: readNumber(row.upcoming_count),
  }
}

export async function getSessionsReport(
  scope: SessionsScope,
  from: string,
  to: string,
): Promise<SessionsReport> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin.rpc("sessions_report", {
    ...rpcArgs(scope),
    p_from: from,
    p_to: to,
  })

  if (error) {
    throw readFailure("report", error)
  }

  const payload = (data ?? {}) as unknown as Record<string, unknown>
  const bySession = readArray(payload.by_session).map(mapReportRow).filter((row): row is SessionReportRow => row !== null)
  const top = readArray(payload.top).map(mapReportRow).filter((row): row is SessionReportRow => row !== null)
  const weekly = readArray(payload.weekly).flatMap((value): SessionReportWeek[] => {
    if (!value || typeof value !== "object") {
      return []
    }

    const row = value as Record<string, unknown>
    return [{ weekStart: readString(row.week_start), attendanceCount: readNumber(row.attendance_count) }]
  })

  return {
    sessionsRun: readNumber(payload.sessions_run),
    totalAttendance: readNumber(payload.total_attendance),
    avgPerSession: readNumber(payload.avg_per_session),
    repeatRate: readNumber(payload.repeat_rate),
    bySession,
    weekly,
    top,
  }
}

/** The one predicate the live dashboard's attendance poll shares with the list. */
export async function isSessionVisible(scope: SessionsScope, sessionId: string): Promise<boolean> {
  if (!isSessionId(sessionId)) {
    return false
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin.rpc("session_visible", {
    ...rpcArgs(scope),
    p_session_id: sessionId,
  })

  if (error) {
    throw readFailure("session visibility", error)
  }

  return data === true
}

export async function getSessionAttendees(
  scope: SessionsScope,
  sessionId: string,
): Promise<SessionAttendee[]> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin.rpc("session_attendees", {
    ...rpcArgs(scope),
    p_session_id: sessionId,
  })

  if (error) {
    throw readFailure("attendees", error)
  }

  return ((data ?? []) as Array<{
    contact_id: string
    name: string
    phone: string
    location_names: string | null
    sessions_attended: number
    first_session: string | null
  }>).map((row) => ({
    contactId: row.contact_id,
    name: row.name,
    phone: row.phone,
    locationNames: readString(row.location_names),
    sessionsAttended: readNumber(row.sessions_attended),
    firstSession: readString(row.first_session),
  }))
}

export async function getContactAttendanceSummary(
  scope: SessionsScope,
  contactId: string,
): Promise<ContactAttendanceSummary | null> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin.rpc("contact_attendance_summary", {
    ...rpcArgs(scope),
    p_contact_id: contactId,
  })

  if (error) {
    throw readFailure("contact attendance", error)
  }

  if (!data || typeof data !== "object") {
    return null
  }

  const payload = data as unknown as Record<string, unknown>
  const history = readArray(payload.history).flatMap(
    (value): Array<{ sessionName: string; sessionDate: string | null }> => {
      if (!value || typeof value !== "object") {
        return []
      }

      const row = value as Record<string, unknown>
      const sessionName = readString(row.session_name)
      if (!sessionName) {
        return []
      }

      return [{ sessionName, sessionDate: readString(row.session_date) }]
    },
  )

  return {
    name: readString(payload.name) ?? "Unknown contact",
    phone: readString(payload.phone) ?? "—",
    notes: readString(payload.notes),
    locationNames: readString(payload.location_names),
    preacherName: readString(payload.preacher_name),
    firstContact: readString(payload.first_contact),
    lastContacted: readString(payload.last_contacted),
    collectedByName: readString(payload.collected_by_name),
    favorite: payload.favorite === true,
    sessionsAttended: readNumber(payload.sessions_attended),
    past60DayAttendance: readNumber(payload.past_60_day_attendance),
    lastAttended: readString(payload.last_attended),
    history,
  }
}

/**
 * The bare `SessionRecord` shape `/api/sessions` has always returned, now read
 * through the scoped function rather than a creator-only filter. `/dashboard`
 * and `/gita-life` keep the unscoped `listSessions()` they had.
 */
export async function listVisibleSessions(scope: SessionsScope): Promise<SessionRecord[]> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin.rpc("sessions_visible", rpcArgs(scope))

  if (error) {
    throw readFailure("visible sessions", error)
  }

  const rows = (data ?? []) as Database["public"]["Tables"]["sessions"]["Row"][]

  return rows.map((row) => ({
    id: row.id,
    name: row.name?.trim() || "Untitled session",
    sessionDate: readString(row.session_date) ?? undefined,
    preacherIds: row.preacher_id ? [row.preacher_id] : [],
    locationIds: row.location_id ? [row.location_id] : [],
    analyticsIds: [],
    attendanceRecordIds: [],
    publicAttendanceEnabled: row.public_attendance_enabled === true,
    attendanceOpensAt: readString(row.attendance_opens_at) ?? undefined,
    attendanceClosesAt: readString(row.attendance_closes_at) ?? undefined,
    durationMinutes: typeof row.duration_minutes === "number" ? row.duration_minutes : undefined,
    attendanceUrl: readString(row.attendance_url) ?? undefined,
    createdBy: row.created_by ? [row.created_by] : [],
  }))
}
