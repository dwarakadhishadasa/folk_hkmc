/**
 * Client-safe payload and chart-series types for the `/manage` portal.
 *
 * This module intentionally imports nothing: the guardrail's
 * `serverOnlySpecifierPrefixes` cover `@/lib/supabase/manage`,
 * `@/lib/supabase/admin`, `@/lib/supabase/server` and `@/lib/authz`, and a
 * `"use client"` file in `components/manage/` may not reach any of them at
 * runtime. Keeping the shapes here is what lets `lib/supabase/manage.ts` stay
 * the single owner of the `any`-adjacent Supabase surface while the portal
 * components stay plain typed props.
 */

export type ManageView = "dashboard" | "contacts" | "sessions" | "attendance" | "favorites"

export const MANAGE_VIEWS: readonly ManageView[] = [
  "dashboard",
  "contacts",
  "sessions",
  "attendance",
  "favorites",
] as const

export type ManageMode = "admin" | "preacher"

export interface ManageScope {
  mode: ManageMode
  role: "Admin" | "Preacher"
  /** `public.users.id` of the signed-in staff member. */
  staffUserId: string
  staffName: string
  programId: string
  /** Location ids the signed-in staff member may filter by (`users.location_ids`). */
  locationIds: string[]
}

export interface ManageLocation {
  id: string
  name: string
  status: string | null
}

export interface ManageContact {
  id: string
  name: string
  phone: string
  college: string | null
  company: string | null
  rounds: string | null
  booksRead: string[]
  notes: string | null
  initialContact: string | null
  lastContactedOn: string | null
  dateOfBirth: string | null
  photoPath: string | null
  isFavorite: boolean
  locationIds: string[]
  assignedPreacherId: string | null
  collectedById: string | null
  /**
   * Rollups resolved from `contact_attendance_counts` keyed to the already
   * RLS-scoped contact ids. A contact with no rollup row reports `0` for both.
   */
  totalAttendanceCount: number
  past60DayAttendanceCount: number
}

export interface ManageAttendee {
  contactId: string
  name: string
  phone: string
}

export interface ManageSession {
  id: string
  name: string
  sessionDate: string | null
  locationId: string | null
  locationName: string | null
  preacherId: string | null
  preacherName: string | null
  createdById: string | null
  attendees: ManageAttendee[]
}

export interface ManageAttendanceRecord {
  id: string
  contactId: string
  sessionId: string
  sessionName: string | null
  sessionDate: string | null
  locationId: string | null
  recordedAt: string | null
}

export interface ManageQuarterPoint {
  quarter: string
  contacts: number
}

export interface ManageStatusQuoPoint {
  bucket: string
  sessions: number
}

/** One bar (a preacher) in the two stacked preacher x location charts. */
export interface ManageStackedBarPoint {
  key: string
  label: string
  values: Record<string, number>
  total: number
}

export interface ManageStackedBarSeries {
  /** Location names, in display order — one stacked segment each. */
  seriesKeys: string[]
  points: ManageStackedBarPoint[]
}

/** Pre-computed per calendar month so the dashboard filters without a round-trip. */
export interface ManageMonthlySeries {
  years: number[]
  months: number[]
  /** Keyed by `YYYY-MM`; an unfiltered view reads the `"all"` entry. */
  byPeriod: Record<string, ManageStackedBarSeries>
}

export interface ManageDashboardCharts {
  contactsPerQuarter: ManageQuarterPoint[]
  statusQuo: ManageStatusQuoPoint[]
  sessionsByPreacherLocation: ManageMonthlySeries
  attendanceByPreacherLocation: ManageMonthlySeries
}

export interface ManagePortalPayload {
  scope: ManageScope
  generatedAt: string
  locations: ManageLocation[]
  /** `public.users.id` -> display name, resolved server-side (picker-list exception). */
  staffNames: Record<string, string>
  contacts: ManageContact[]
  sessions: ManageSession[]
  attendance: ManageAttendanceRecord[]
  charts: ManageDashboardCharts
  booksReadOptions: string[]
}

/** Fields the contact PATCH route accepts. Keys are camelCase API names. */
export const MANAGE_CONTACT_PATCH_KEYS = [
  "name",
  "phone",
  "college",
  "company",
  "rounds",
  "booksRead",
  "notes",
  "initialContact",
  "dateOfBirth",
  "isFavorite",
  "locationIds",
] as const

export type ManageContactPatchKey = (typeof MANAGE_CONTACT_PATCH_KEYS)[number]

export type ManageContactPatch = Partial<Record<ManageContactPatchKey, unknown>>

/**
 * The editable columns as returned by a successful `PATCH /api/manage/contacts`.
 * Attendance rollups are intentionally absent so a client can merge the result
 * into its existing row without clobbering the counts it already resolved.
 */
export interface ManageContactWriteResult {
  id: string
  name: string
  phone: string
  college: string | null
  company: string | null
  rounds: string | null
  booksRead: string[]
  notes: string | null
  initialContact: string | null
  dateOfBirth: string | null
  isFavorite: boolean
  locationIds: string[]
}

/**
 * One item of a bulk request. A per-item patch rather than one shared patch, so
 * a future bulk action whose rows need different values does not need a second
 * endpoint.
 *
 * The `patch` keys are validated per item against `MANAGE_CONTACT_PATCH_KEYS`,
 * so a client cannot widen what the single-row route accepts.
 */
export interface ManageContactBulkItem {
  contactId: string
  patch: ManageContactPatch
}

/**
 * One row's outcome. `ok: false` carries the reason that row failed and is a
 * `200` outcome, not a rejection of the batch.
 *
 * `contactId` echoes the id as supplied — a malformed one is preserved so the
 * response can be matched back to what was requested, and is `null` when the item
 * carried no usable id at all.
 */
export interface ManageContactBulkResult {
  contactId: string | null
  ok: boolean
  contact?: ManageContactWriteResult
  error?: string
}

export function isManageView(value: unknown): value is ManageView {
  return typeof value === "string" && (MANAGE_VIEWS as readonly string[]).includes(value)
}

export function resolveManageMode(value: unknown): ManageMode {
  return value === "preacher" ? "preacher" : "admin"
}