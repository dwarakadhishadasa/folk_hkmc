import "server-only"

import { randomUUID } from "node:crypto"
import type { PostgrestError } from "@supabase/supabase-js"
import type {
  ManageAttendee,
  ManageAttendanceRecord,
  ManageContact,
  ManageContactPatch,
  ManageContactPatchKey,
  ManageContactWriteResult,
  ManageDashboardCharts,
  ManageLocation,
  ManageMode,
  ManageMonthlySeries,
  ManagePortalPayload,
  ManageQuarterPoint,
  ManageScope,
  ManageSession,
  ManageStackedBarPoint,
  ManageStackedBarSeries,
  ManageStatusQuoPoint,
} from "@/components/manage/manage-types"
import { AuthzError, writeAuditEvent, type StaffContext } from "@/lib/authz"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * Data layer for the `/manage` portal.
 *
 * Reads go through `createSupabaseServerClient()` so the scoped RLS policies in
 * `20261006010000_scoped_rls_policies.sql` — not an app-side filter — decide
 * which rows a Preacher may see. The Admin admin/preacher toggle is layered on
 * top of that scope as an app-layer narrowing only.
 *
 * Writes go through the service role after an explicit scope check, because
 * `rls-policy-matrix.md` grants no authenticated INSERT/UPDATE policies.
 */

const MANAGE_PAGE_SIZE = 1000
/** Backstop against a runaway loop; 50 pages is 50k rows, far above any program. */
const MANAGE_MAX_PAGES = 50
const MANAGE_ROLLUP_CHUNK_SIZE = 200
const MANAGE_STAFF_CHUNK_SIZE = 200
const MANAGE_TIME_ZONE = "Asia/Kolkata"
const MANAGE_PAST_60_DAYS = 60
const MANAGE_DAY_MS = 24 * 60 * 60 * 1000
const CONTACT_PHOTOS_BUCKET = "contact-photos"
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CONTACT_PHOTO_SIGNED_URL_TTL_SECONDS = 300
const AUDIT_SOURCE = "manage-portal"
const UNGROUPED_LABEL = "Unassigned"
/**
 * `contacts` RLS can deny a contact that an `attendance` row the caller may read
 * points at, so an attendee with no contact in scope is rendered without any
 * identity rather than from the denormalized `attendance` columns.
 */
const SCOPED_OUT_ATTENDEE_LABEL = "Not in scope"

const CONTACT_COLUMNS = [
  "id",
  "name",
  "phone",
  "college",
  "company",
  "rounds",
  "books_read",
  "notes",
  "initial_contact",
  "last_contacted_on",
  "date_of_birth",
  "photo_path",
  "is_favorite",
  "location_ids",
  "assigned_preacher_id",
  "collected_by_id",
].join(",")
const SESSION_COLUMNS = "id,name,session_date,location_id,preacher_id,created_by"
const ATTENDANCE_COLUMNS = "id,contact_id,session_id,created_at"
const LOCATION_COLUMNS = "id,name,status"
const STAFF_COLUMNS = "id,name"
const ROLLUP_COLUMNS = "contact_id,total_attendance_count,past_60_day_attendance_count"
const CONTACT_SCOPE_COLUMNS = "id,program_id,assigned_preacher_id,photo_path"

const CONTACT_COLUMN_BY_PATCH_KEY: Record<ManageContactPatchKey, string> = {
  name: "name",
  phone: "phone",
  college: "college",
  company: "company",
  rounds: "rounds",
  booksRead: "books_read",
  notes: "notes",
  initialContact: "initial_contact",
  dateOfBirth: "date_of_birth",
  isFavorite: "is_favorite",
  locationIds: "location_ids",
}

type ContactRow = {
  id: string
  name: string | null
  phone: string | null
  college: string | null
  company: string | null
  rounds: string | null
  books_read: string[] | null
  notes: string | null
  initial_contact: string | null
  last_contacted_on: string | null
  date_of_birth: string | null
  photo_path: string | null
  is_favorite: boolean | null
  location_ids: string[] | null
  assigned_preacher_id: string | null
  collected_by_id: string | null
}

type SessionRow = {
  id: string
  name: string | null
  session_date: string | null
  location_id: string | null
  preacher_id: string | null
  created_by: string | null
}

type AttendanceRow = {
  id: string
  contact_id: string
  session_id: string
  created_at: string | null
}

type LocationRow = {
  id: string
  name: string
  status: string | null
}

type StaffRow = {
  id: string
  name: string | null
}

type RollupRow = {
  contact_id: string | null
  total_attendance_count: number | null
  past_60_day_attendance_count: number | null
}

type ContactScopeRow = {
  id: string
  program_id: string | null
  assigned_preacher_id: string | null
  photo_path: string | null
}

interface RollupCounts {
  total: number
  past60: number
}

interface CalendarParts {
  year: number
  month: number
  day: number
}

interface MonthlyEntry {
  period: string
  groupKey: string
  groupLabel: string
  locationName: string
}

function text(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function textArray(value: string[] | null | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item)) : []
}

function countOf(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

/**
 * Every PostgREST read on the hosted project is capped at 1000 rows and the
 * folk program holds ~1030 contacts, so each read concatenates pages until a
 * short page proves the result set is exhausted. Running out of allowed pages
 * while the last one is still full means the result is truncated, and a
 * silently short list would understate every total derived from it.
 */
async function collectPagedRows<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: unknown; error: PostgrestError | null }>,
): Promise<T[]> {
  const rows: T[] = []

  for (let page = 0; page < MANAGE_MAX_PAGES; page += 1) {
    const from = page * MANAGE_PAGE_SIZE
    const { data, error } = await fetchPage(from, from + MANAGE_PAGE_SIZE - 1)

    if (error) {
      throw error
    }

    const pageRows = Array.isArray(data) ? (data as T[]) : []
    rows.push(...pageRows)

    if (pageRows.length < MANAGE_PAGE_SIZE) {
      return rows
    }
  }

  throw new Error("manage_paging_truncated")
}

/** Asia/Kolkata calendar day for an ISO date/datetime string, or `null`. */
function calendarParts(value: string | null | undefined): CalendarParts | null {
  if (!value) {
    return null
  }

  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) {
    return null
  }

  const parts = new Intl.DateTimeFormat("en", {
    timeZone: MANAGE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp))

  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const raw = parts.find((part) => part.type === type)?.value
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : 0
  }

  return { year: read("year"), month: read("month"), day: read("day") }
}

function periodKey(parts: CalendarParts): string {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}`
}

function quarterKey(parts: CalendarParts): string {
  return `${parts.year}-Q${Math.floor((parts.month - 1) / 3) + 1}`
}

/** The "all" pseudo-period the dashboard Reset restores. */
const ALL_PERIODS_KEY = "all"

function buildMonthlySeries(entries: MonthlyEntry[]): ManageMonthlySeries {
  const seriesKeys = [...new Set(entries.map((entry) => entry.locationName))].sort((left, right) =>
    left.localeCompare(right),
  )
  const periods = [...new Set(entries.map((entry) => entry.period))].sort()
  const years = [...new Set(periods.map((period) => Number(period.slice(0, 4))))].sort((left, right) => left - right)

  const buildPoints = (periodsToInclude: string[]): ManageStackedBarPoint[] => {
    const include = new Set(periodsToInclude)
    const byGroup = new Map<string, ManageStackedBarPoint>()

    for (const entry of entries) {
      if (!include.has(entry.period)) {
        continue
      }

      let point = byGroup.get(entry.groupKey)
      if (!point) {
        point = { key: entry.groupKey, label: entry.groupLabel, values: {}, total: 0 }
        for (const seriesKey of seriesKeys) {
          point.values[seriesKey] = 0
        }
        byGroup.set(entry.groupKey, point)
      }

      const bucket = point.values[entry.locationName] ?? 0
      point.values[entry.locationName] = bucket + 1
      point.total += 1
    }

    return [...byGroup.values()].sort((left, right) => right.total - left.total || left.label.localeCompare(right.label))
  }

  const byPeriod: Record<string, ManageStackedBarSeries> = {
    [ALL_PERIODS_KEY]: { seriesKeys, points: buildPoints(periods) },
  }

  for (const period of periods) {
    byPeriod[period] = { seriesKeys, points: buildPoints([period]) }
  }

  return { years, months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], byPeriod }
}

function buildContactsPerQuarter(contacts: ContactRow[]): ManageQuarterPoint[] {
  const counts = new Map<string, number>()

  for (const contact of contacts) {
    const parts = calendarParts(text(contact.initial_contact))
    if (!parts) {
      continue
    }

    const quarter = quarterKey(parts)
    counts.set(quarter, (counts.get(quarter) ?? 0) + 1)
  }

  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([quarter, contacts]) => ({ quarter, contacts }))
}

/**
 * "Status Quo" has no equivalent column in the schema, so it is derived: for
 * each session inside the rolling 60-day window, divide the attendee count by
 * the number of contacts assigned to that session's preacher and bucket the
 * ratio. Bucket edges are this story's decision, not a recovered definition.
 */
const STATUS_QUO_BUCKETS = ["0%", "1–10%", "10–25%", "25–50%", "50–100%", "100%"] as const

function statusQuoBucket(ratio: number): string {
  if (ratio <= 0) {
    return STATUS_QUO_BUCKETS[0]
  }
  if (ratio <= 0.1) {
    return STATUS_QUO_BUCKETS[1]
  }
  if (ratio <= 0.25) {
    return STATUS_QUO_BUCKETS[2]
  }
  if (ratio <= 0.5) {
    return STATUS_QUO_BUCKETS[3]
  }
  if (ratio < 1) {
    return STATUS_QUO_BUCKETS[4]
  }

  return STATUS_QUO_BUCKETS[5]
}

function buildStatusQuo(params: {
  sessions: SessionRow[]
  attendeeCountBySession: Map<string, number>
  latestAttendanceBySession: Map<string, string>
  contactsByPreacher: Map<string, number>
}): ManageStatusQuoPoint[] {
  const cutoff = Date.now() - MANAGE_PAST_60_DAYS * MANAGE_DAY_MS
  const counts = new Map<string, number>(STATUS_QUO_BUCKETS.map((bucket) => [bucket, 0]))

  for (const session of params.sessions) {
    const latestRaw = params.latestAttendanceBySession.get(session.id) ?? session.session_date
    const latest = latestRaw ? Date.parse(latestRaw) : Number.NaN
    if (!Number.isFinite(latest) || latest < cutoff) {
      continue
    }

    const preacherId = session.preacher_id ?? session.created_by
    if (!preacherId) {
      continue
    }

    const denominator = params.contactsByPreacher.get(preacherId) ?? 0
    if (denominator <= 0) {
      continue
    }

    const bucket = statusQuoBucket((params.attendeeCountBySession.get(session.id) ?? 0) / denominator)
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1)
  }

  return STATUS_QUO_BUCKETS.map((bucket) => ({ bucket, sessions: counts.get(bucket) ?? 0 }))
}

/**
 * `contact_attendance_counts` is a plain view without `security_invoker`, so
 * Postgres evaluates it with the view owner's rights and a bare `select *`
 * would answer for contacts the caller may not read. The rollups are therefore
 * requested only for contact ids that are already RLS-scoped, in chunks.
 */
async function loadRollupCounts(contactIds: string[]): Promise<Map<string, RollupCounts>> {
  const rollups = new Map<string, RollupCounts>()

  if (contactIds.length === 0) {
    return rollups
  }

  const supabase = await createSupabaseServerClient()

  for (let offset = 0; offset < contactIds.length; offset += MANAGE_ROLLUP_CHUNK_SIZE) {
    const chunk = contactIds.slice(offset, offset + MANAGE_ROLLUP_CHUNK_SIZE)
    const { data, error } = await supabase
      .from("contact_attendance_counts")
      .select(ROLLUP_COLUMNS)
      .in("contact_id", chunk)

    if (error) {
      throw error
    }

    for (const row of (data ?? []) as RollupRow[]) {
      if (!row.contact_id) {
        continue
      }

      rollups.set(row.contact_id, {
        total: countOf(row.total_attendance_count),
        past60: countOf(row.past_60_day_attendance_count),
      })
    }
  }

  return rollups
}

/**
 * Display names for the staff ids the already-scoped rows actually reference.
 *
 * `public.users` RLS grants a non-Admin only their own row, so reading the whole
 * program through the service role would hand a Preacher every other role's
 * name in the program. The id set is narrowed first, and an absent name falls
 * back to the id rather than to `users.email`, which the browser never needs.
 */
async function loadStaffDisplayNames(
  programId: string,
  userIds: string[],
): Promise<Record<string, string>> {
  const names: Record<string, string> = {}
  const uniqueIds = [...new Set(userIds.filter(Boolean))]

  if (uniqueIds.length === 0) {
    return names
  }

  const supabaseAdmin = createSupabaseAdminClient()

  for (let offset = 0; offset < uniqueIds.length; offset += MANAGE_STAFF_CHUNK_SIZE) {
    const chunk = uniqueIds.slice(offset, offset + MANAGE_STAFF_CHUNK_SIZE)
    const rows = await collectPagedRows<StaffRow>(async (from, to) => {
      const response = await supabaseAdmin
        .from("users")
        .select(STAFF_COLUMNS)
        .eq("program_id", programId)
        .in("id", chunk)
        .order("id", { ascending: true })
        .range(from, to)

      return { data: response.data, error: response.error }
    })

    for (const row of rows) {
      names[row.id] = text(row.name) ?? row.id
    }
  }

  return names
}

export async function loadManagePortalData(params: {
  staff: StaffContext
  mode: ManageMode
}): Promise<ManagePortalPayload> {
  const { staff, mode } = params
  const programId = staff.programId
  const supabase = await createSupabaseServerClient()

  const [contactRows, sessionRows, attendanceRows, locationRows] = await Promise.all([
    collectPagedRows<ContactRow>(async (from, to) => {
      const response = await supabase
        .from("contacts")
        .select(CONTACT_COLUMNS)
        .eq("program_id", programId)
        .order("id", { ascending: true })
        .range(from, to)

      return { data: response.data, error: response.error }
    }),
    collectPagedRows<SessionRow>(async (from, to) => {
      const response = await supabase
        .from("sessions")
        .select(SESSION_COLUMNS)
        .eq("program_id", programId)
        .order("id", { ascending: true })
        .range(from, to)

      return { data: response.data, error: response.error }
    }),
    collectPagedRows<AttendanceRow>(async (from, to) => {
      const response = await supabase
        .from("attendance")
        .select(ATTENDANCE_COLUMNS)
        .eq("program_id", programId)
        .order("id", { ascending: true })
        .range(from, to)

      return { data: response.data, error: response.error }
    }),
    collectPagedRows<LocationRow>(async (from, to) => {
      const response = await supabase
        .from("locations")
        .select(LOCATION_COLUMNS)
        .eq("program_id", programId)
        .order("id", { ascending: true })
        .range(from, to)

      return { data: response.data, error: response.error }
    }),
  ])

  // App-layer narrowing on top of the RLS scope. It can only shrink the set.
  const narrowToPreacher = mode === "preacher"
  const scopedContactRows = narrowToPreacher
    ? contactRows.filter((row) => row.assigned_preacher_id === staff.userId)
    : contactRows
  const scopedSessionRows = narrowToPreacher
    ? sessionRows.filter(
        (row) => row.preacher_id === staff.userId || row.created_by === staff.userId,
      )
    : sessionRows
  const scopedLocationRows = narrowToPreacher
    ? locationRows.filter((row) => staff.locationIds.includes(row.id))
    : locationRows

  const locationNameById = new Map(scopedLocationRows.map((row) => [row.id, row.name]))
  const scopedSessionIds = new Set(scopedSessionRows.map((row) => row.id))
  const scopedAttendanceRows = narrowToPreacher
    ? attendanceRows.filter((row) => scopedSessionIds.has(row.session_id))
    : attendanceRows

  const referencedUserIds = [
    ...scopedContactRows.flatMap((row) => [row.assigned_preacher_id, row.collected_by_id]),
    ...scopedSessionRows.flatMap((row) => [row.preacher_id, row.created_by]),
  ].filter((userId): userId is string => Boolean(userId))

  const staffNames = await loadStaffDisplayNames(programId, referencedUserIds)
  const displayName = (userId: string | null): string | null =>
    userId ? (staffNames[userId] ?? null) : null

  const rollups = await loadRollupCounts(scopedContactRows.map((row) => row.id))

  const contactsById = new Map<string, ContactRow>(
    scopedContactRows.map((row) => [row.id, row]),
  )

  const contacts: ManageContact[] = scopedContactRows.map((row) => {
    const rollup = rollups.get(row.id)

    return {
      id: row.id,
      name: text(row.name) ?? "Unknown",
      phone: text(row.phone) ?? "",
      college: text(row.college),
      company: text(row.company),
      rounds: text(row.rounds),
      booksRead: textArray(row.books_read),
      notes: text(row.notes),
      initialContact: text(row.initial_contact),
      lastContactedOn: text(row.last_contacted_on),
      dateOfBirth: text(row.date_of_birth),
      photoPath: text(row.photo_path),
      isFavorite: row.is_favorite === true,
      locationIds: textArray(row.location_ids),
      assignedPreacherId: row.assigned_preacher_id,
      collectedById: row.collected_by_id,
      totalAttendanceCount: rollup?.total ?? 0,
      past60DayAttendanceCount: rollup?.past60 ?? 0,
    }
  })

  const sessionById = new Map(scopedSessionRows.map((row) => [row.id, row]))
  const attendeesBySession = new Map<string, ManageAttendee[]>()
  const latestAttendanceBySession = new Map<string, string>()
  const attendanceRecords: ManageAttendanceRecord[] = []

  for (const row of scopedAttendanceRows) {
    // `attendance` RLS scopes by the parent session's preacher while `sessions`
    // RLS scopes by creator, so a readable attendance row can point at a
    // session the caller may not read. The row is still counted and listed, just
    // without a session name or date — resolving either would need a
    // service-role session read that bypasses the caller's scope.
    const session = sessionById.get(row.session_id) ?? null

    // Attendee identity comes only from the scoped contact. The denormalized
    // `attendance` columns are deliberately not selected: they would re-expose
    // a contact that `contacts` RLS denies.
    const contact = contactsById.get(row.contact_id)
    const attendee: ManageAttendee = contact
      ? {
          contactId: row.contact_id,
          name: text(contact.name) ?? "Unknown",
          phone: text(contact.phone) ?? "",
        }
      : { contactId: row.contact_id, name: SCOPED_OUT_ATTENDEE_LABEL, phone: "" }

    const bucket = attendeesBySession.get(row.session_id)
    if (bucket) {
      bucket.push(attendee)
    } else {
      attendeesBySession.set(row.session_id, [attendee])
    }

    const previousLatest = latestAttendanceBySession.get(row.session_id)
    if (row.created_at && (!previousLatest || Date.parse(row.created_at) > Date.parse(previousLatest))) {
      latestAttendanceBySession.set(row.session_id, row.created_at)
    }

    attendanceRecords.push({
      id: row.id,
      contactId: row.contact_id,
      sessionId: row.session_id,
      sessionName: session ? text(session.name) : null,
      sessionDate: session ? text(session.session_date) : null,
      locationId: session?.location_id ?? null,
      recordedAt: text(row.created_at),
    })
  }

  const sessions: ManageSession[] = scopedSessionRows
    .map((row) => ({
      id: row.id,
      name: text(row.name) ?? "Untitled session",
      sessionDate: text(row.session_date),
      locationId: row.location_id,
      locationName: row.location_id ? (locationNameById.get(row.location_id) ?? null) : null,
      preacherId: row.preacher_id,
      preacherName: displayName(row.preacher_id ?? row.created_by),
      createdById: row.created_by,
      attendees: attendeesBySession.get(row.id) ?? [],
    }))
    .sort((left, right) => {
      const leftTime = left.sessionDate ? Date.parse(left.sessionDate) : Number.NaN
      const rightTime = right.sessionDate ? Date.parse(right.sessionDate) : Number.NaN
      const leftValue = Number.isFinite(leftTime) ? leftTime : 0
      const rightValue = Number.isFinite(rightTime) ? rightTime : 0
      return rightValue - leftValue || left.name.localeCompare(right.name)
    })

  const contactsByPreacher = new Map<string, number>()
  for (const contact of scopedContactRows) {
    if (!contact.assigned_preacher_id) {
      continue
    }
    contactsByPreacher.set(
      contact.assigned_preacher_id,
      (contactsByPreacher.get(contact.assigned_preacher_id) ?? 0) + 1,
    )
  }

  const sessionEntries: MonthlyEntry[] = []
  const attendanceEntries: MonthlyEntry[] = []
  const labelFor = (userId: string | null): string => displayName(userId) ?? UNGROUPED_LABEL

  for (const session of sessions) {
    const parts = calendarParts(session.sessionDate)
    if (!parts) {
      continue
    }

    const groupKey = session.preacherId ?? session.createdById ?? UNGROUPED_LABEL
    sessionEntries.push({
      period: periodKey(parts),
      groupKey,
      groupLabel: labelFor(groupKey === UNGROUPED_LABEL ? null : groupKey),
      locationName: session.locationName ?? UNGROUPED_LABEL,
    })
  }

  for (const record of attendanceRecords) {
    const parts = calendarParts(record.sessionDate ?? record.recordedAt)
    if (!parts) {
      continue
    }

    const session = sessionById.get(record.sessionId)
    const groupKey = session?.preacher_id ?? session?.created_by ?? UNGROUPED_LABEL
    attendanceEntries.push({
      period: periodKey(parts),
      groupKey,
      groupLabel: labelFor(groupKey === UNGROUPED_LABEL ? null : groupKey),
      locationName: (session?.location_id ? locationNameById.get(session.location_id) : null) ?? UNGROUPED_LABEL,
    })
  }

  const charts: ManageDashboardCharts = {
    contactsPerQuarter: buildContactsPerQuarter(scopedContactRows),
    statusQuo: buildStatusQuo({
      sessions: scopedSessionRows,
      attendeeCountBySession: new Map(
        [...attendeesBySession.entries()].map(([sessionId, attendeeList]) => [sessionId, attendeeList.length]),
      ),
      latestAttendanceBySession,
      contactsByPreacher,
    }),
    sessionsByPreacherLocation: buildMonthlySeries(sessionEntries),
    attendanceByPreacherLocation: buildMonthlySeries(attendanceEntries),
  }

  const locations: ManageLocation[] = scopedLocationRows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
  }))

  const booksReadOptions = [...new Set(contacts.flatMap((contact) => contact.booksRead))].sort((left, right) =>
    left.localeCompare(right),
  )

  const scope: ManageScope = {
    mode,
    role: staff.role === "Admin" ? "Admin" : "Preacher",
    staffUserId: staff.userId,
    staffName: staff.name,
    programId,
    locationIds: [...staff.locationIds],
  }

  return {
    scope,
    generatedAt: new Date().toISOString(),
    locations,
    staffNames,
    contacts,
    sessions,
    attendance: attendanceRecords,
    charts,
    booksReadOptions,
  }
}

/**
 * Confirms the target contact is inside the caller's scope before any write.
 *
 * The primary check is the RLS-scoped read, so a Preacher cannot widen scope by
 * guessing an id. Only when that read comes back empty is a minimal
 * service-role existence probe used, purely to tell `403` (in program, out of
 * scope) from `404` (not in this program at all).
 */
async function assertManageContactInScope(
  staff: StaffContext,
  contactId: string,
): Promise<ContactScopeRow> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("contacts")
    .select(CONTACT_SCOPE_COLUMNS)
    .eq("id", contactId)
    .eq("program_id", staff.programId)
    .maybeSingle()

  if (error) {
    throw new AuthzError(500, "manage_contact_read_failed", "Unable to read the contact.")
  }

  if (data) {
    return data as ContactScopeRow
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const probe = await supabaseAdmin
    .from("contacts")
    .select("id")
    .eq("id", contactId)
    .eq("program_id", staff.programId)
    .maybeSingle()

  if (probe.error) {
    throw new AuthzError(500, "manage_contact_read_failed", "Unable to read the contact.")
  }

  if (probe.data) {
    throw new AuthzError(403, "forbidden", "This contact is outside your assigned scope.")
  }

  throw new AuthzError(404, "contact_not_found", "Contact not found in this program.")
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AuthzError(400, "invalid_patch", `${field} must be a non-empty string.`)
  }

  return value.trim()
}

function optionalString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value !== "string") {
    throw new AuthzError(400, "invalid_patch", `${field} must be a string or null.`)
  }

  return value.trim() ? value.trim() : null
}

function optionalBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new AuthzError(400, "invalid_patch", `${field} must be a boolean.`)
  }

  return value
}

function optionalStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new AuthzError(400, "invalid_patch", `${field} must be an array of strings.`)
  }

  const values = value.map((item) => String(item).trim()).filter(Boolean)
  const maxItems = field === "booksRead" ? 20 : 50
  if (values.length > maxItems) {
    throw new AuthzError(400, "invalid_patch", `${field} must have ${maxItems} entries or fewer.`)
  }

  const maxLength = field === "booksRead" ? 60 : 80
  if (values.some((item) => item.length > maxLength)) {
    throw new AuthzError(400, "invalid_patch", `${field} entries must be ${maxLength} characters or fewer.`)
  }

  return values
}

async function assertProgramLocations(programId: string, locationIds: string[]): Promise<void> {
  if (locationIds.length === 0) {
    return
  }

  // `contacts.location_ids` is TEXT[] while `locations.id` is a UUID, so a
  // legacy free-text location would make PostgREST fail on the `.in()` filter
  // and surface as an opaque 500. Reject it as a bad patch instead.
  const uuidIds = locationIds.filter((locationId) => UUID_PATTERN.test(locationId))
  if (uuidIds.length !== locationIds.length) {
    throw new AuthzError(400, "invalid_patch", "One or more locations are not valid location ids.")
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("id")
    .eq("program_id", programId)
    .in("id", uuidIds)

  if (error) {
    throw new AuthzError(500, "manage_location_read_failed", "Unable to read the locations.")
  }

  const found = new Set(((data ?? []) as Array<{ id: string }>).map((row) => row.id))
  if (found.size !== new Set(uuidIds).size) {
    throw new AuthzError(400, "invalid_patch", "One or more locations do not exist in this program.")
  }
}

export async function updateManageContact(params: {
  staff: StaffContext
  contactId: string
  patch: ManageContactPatch
}): Promise<ManageContactWriteResult> {
  const { staff, contactId, patch } = params
  await assertManageContactInScope(staff, contactId)

  const updatePayload: Record<string, unknown> = {}
  const writtenKeys: string[] = []

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      continue
    }

    const patchKey = key as ManageContactPatchKey
    const column = CONTACT_COLUMN_BY_PATCH_KEY[patchKey]
    if (!column) {
      throw new AuthzError(400, "invalid_patch", `Field "${key}" cannot be edited here.`)
    }

    switch (patchKey) {
      case "name":
        updatePayload[column] = requireNonEmptyString(value, "Name")
        break
      case "phone":
        updatePayload[column] = requireNonEmptyString(value, "Phone")
        break
      case "isFavorite":
        updatePayload[column] = optionalBoolean(value, "Favorite")
        break
      case "booksRead":
        updatePayload[column] = optionalStringArray(value, "Books Read")
        break
      case "locationIds": {
        const locationIds = optionalStringArray(value, "Location")
        await assertProgramLocations(staff.programId, locationIds)
        updatePayload[column] = locationIds
        break
      }
      case "college":
        updatePayload[column] = optionalString(value, "College")
        break
      case "company":
        updatePayload[column] = optionalString(value, "Company")
        break
      case "rounds":
        updatePayload[column] = optionalString(value, "Rounds")
        break
      case "notes":
        updatePayload[column] = optionalString(value, "Notes")
        break
      case "initialContact":
        updatePayload[column] = optionalString(value, "Initial Contact")
        break
      case "dateOfBirth":
        updatePayload[column] = optionalString(value, "Date of Birth")
        break
    }

    writtenKeys.push(patchKey)
  }

  if (writtenKeys.length === 0) {
    throw new AuthzError(400, "empty_patch", "No editable fields were supplied.")
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("contacts")
    .update(updatePayload)
    .eq("id", contactId)
    .eq("program_id", staff.programId)
    .select(CONTACT_COLUMNS)
    .single()

  if (error) {
    throw new AuthzError(500, "manage_contact_update_failed", "Unable to update the contact.")
  }

  const row = data as unknown as ContactRow

  await writeAuditEvent({
    programId: staff.programId,
    actorSupabaseUserId: staff.supabaseUserId,
    actorRole: staff.role,
    action: "manage.contact.update",
    targetId: contactId,
    source: AUDIT_SOURCE,
    syncState: "ok",
    metadata: { fields: writtenKeys },
  })

  return {
    id: row.id,
    name: text(row.name) ?? "Unknown",
    phone: text(row.phone) ?? "",
    college: text(row.college),
    company: text(row.company),
    rounds: text(row.rounds),
    booksRead: textArray(row.books_read),
    notes: text(row.notes),
    initialContact: text(row.initial_contact),
    dateOfBirth: text(row.date_of_birth),
    isFavorite: row.is_favorite === true,
    locationIds: textArray(row.location_ids),
  }
}

const PHOTO_EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

export const MANAGE_PHOTO_CONTENT_TYPES = Object.keys(PHOTO_EXTENSION_BY_CONTENT_TYPE)

export const MANAGE_PHOTO_MAX_BYTES = 5 * 1024 * 1024

export async function uploadManageContactPhoto(params: {
  staff: StaffContext
  contactId: string
  contentType: string
  bytes: ArrayBuffer
}): Promise<{ photoPath: string }> {
  const { staff, contactId, contentType, bytes } = params
  const previousPhotoPath = text((await assertManageContactInScope(staff, contactId)).photo_path)

  const extension = PHOTO_EXTENSION_BY_CONTENT_TYPE[contentType]
  if (!extension) {
    throw new AuthzError(400, "unsupported_photo_type", "Photos must be JPEG, PNG or WebP images.")
  }

  const objectPath = `${staff.programId}/${contactId}/${randomUUID()}.${extension}`
  const supabaseAdmin = createSupabaseAdminClient()
  const { error: uploadError } = await supabaseAdmin.storage
    .from(CONTACT_PHOTOS_BUCKET)
    .upload(objectPath, bytes, { contentType, upsert: false })

  if (uploadError) {
    throw new AuthzError(500, "manage_photo_upload_failed", "Unable to store the photo.")
  }

  const { error: updateError } = await supabaseAdmin
    .from("contacts")
    .update({ photo_path: objectPath })
    .eq("id", contactId)
    .eq("program_id", staff.programId)

  if (updateError) {
    await supabaseAdmin.storage.from(CONTACT_PHOTOS_BUCKET).remove([objectPath])
    throw new AuthzError(500, "manage_photo_upload_failed", "Unable to attach the photo to the contact.")
  }

  // Every upload writes a fresh path, so the object this one replaced is now
  // unreachable. Removing it keeps replacements from orphaning files forever;
  // a failure here must not fail an upload that already succeeded.
  if (previousPhotoPath && previousPhotoPath !== objectPath) {
    const removal = await supabaseAdmin.storage
      .from(CONTACT_PHOTOS_BUCKET)
      .remove([previousPhotoPath])

    if (removal.error) {
      console.error("[manage] failed to remove the replaced contact photo", removal.error)
    }
  }

  await writeAuditEvent({
    programId: staff.programId,
    actorSupabaseUserId: staff.supabaseUserId,
    actorRole: staff.role,
    action: "manage.contact.photo.upload",
    targetId: contactId,
    source: AUDIT_SOURCE,
    syncState: "ok",
    metadata: { path: objectPath, contentType },
  })

  return { photoPath: objectPath }
}

/**
 * Photos live in a private bucket, so the browser never sees a stable object
 * URL: the client asks for a short-lived signed URL per render instead.
 */
export async function createManageContactPhotoUrl(params: {
  staff: StaffContext
  contactId: string
}): Promise<{ url: string }> {
  const { staff, contactId } = params
  const scoped = await assertManageContactInScope(staff, contactId)
  const photoPath = text(scoped.photo_path)

  if (!photoPath) {
    throw new AuthzError(404, "photo_not_found", "This contact has no photo.")
  }

  const signed = await createSupabaseAdminClient().storage
    .from(CONTACT_PHOTOS_BUCKET)
    .createSignedUrl(photoPath, CONTACT_PHOTO_SIGNED_URL_TTL_SECONDS)

  if (signed.error || !signed.data?.signedUrl) {
    throw new AuthzError(404, "photo_not_found", "This contact has no photo.")
  }

  return { url: signed.data.signedUrl }
}