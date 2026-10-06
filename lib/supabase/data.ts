import "server-only"

import { revalidateTag, unstable_cache } from "next/cache"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { resolveProgramId } from "@hkmc/program-config/server"
import { PostgrestError } from "@supabase/supabase-js"

export type StaffRole = "Admin" | "Preacher" | "Volunteer" | "Assistant"
export type StaffStatus = "Active" | "Inactive"

export interface DataRow<TFields extends object = Record<string, unknown>> {
  id: string
  fields: TFields
  createdTime?: string
}

export interface ContactFields {
  Name?: string
  Phone?: string | number
  Age?: number
  "Date of Birth"?: string
  Year?: string
  College?: string
  Company?: string
  Designation?: string
  Source?: string
  Notes?: string
  "Initial Contact"?: string
  "Last Contacted On"?: string
  Address?: string
  Location?: string | string[]
  "Assigned Preacher"?: string[]
  "Collected By"?: string[]
  Analytics?: string[]
}

export interface AttendanceFields {
  Phone?: string | number
  Name?: string | string[]
  "Attendance Date"?: string
  Contact?: string[]
  Session?: string[]
  "Processed?"?: boolean
}

export interface SessionFields {
  Name?: string
  "Session Date"?: string
  Preacher?: string[]
  Location?: string[]
  Analytics?: string[]
  "Attendance Records"?: string[]
  "Public Attendance Enabled"?: boolean
  "Attendance Opens At"?: string
  "Attendance Closes At"?: string
  "Duration Minutes"?: number
  "Attendance URL"?: string
  "Created By"?: string[]
}

export interface UserFields {
  Name?: string
  Email?: string
  Role?: StaffRole
  Status?: StaffStatus
  Locations?: string[]
  "Portal Account"?: string
  "Supabase User ID"?: string
  "Invited By"?: string[]
  "Assigned Preacher"?: string[]
}

export interface LocationFields {
  Name?: string
  Status?: string
}

export interface LocationRecord {
  id: string
  name: string
  status?: string
}

export interface StaffUser {
  id: string
  email: string
  name: string
  role: StaffRole
  status: StaffStatus
  locationIds: string[]
  portalAccount?: string
  supabaseUserId?: string
  invitedByUserId?: string
  assignedPreacherUserId?: string
}

export interface ContactRecord {
  id: string
  name: string
  phone: string
  age?: number
  dateOfBirth?: string
  year?: string
  college?: string
  company?: string
  designation?: string
  notes?: string
  initialContact?: string
  lastContactedOn?: string
  address?: string
  location?: string | string[]
  assignedPreacherIds: string[]
  collectedByIds: string[]
  analyticsIds: string[]
}

export interface SessionRecord {
  id: string
  name: string
  sessionDate?: string
  preacherIds: string[]
  locationIds: string[]
  analyticsIds: string[]
  attendanceRecordIds: string[]
  publicAttendanceEnabled: boolean
  attendanceOpensAt?: string
  attendanceClosesAt?: string
  durationMinutes?: number
  attendanceUrl?: string
  createdBy: string[]
}

export interface AttendanceRecord {
  id: string
  fields: AttendanceFields
  createdTime?: string
}

export interface AttendanceDashboardRecord {
  id: string
  mobile: string
  userName: string
  createdAt: string
}

const SUPABASE_DATE_TIME_ZONE = "Asia/Kolkata"
const SUPABASE_DATE_TIME_OFFSET = "+05:30"
const SUPABASE_REFERENCE_CACHE_TTL_SECONDS = 20 * 60
const SUPABASE_LOCATIONS_CACHE_TAG = "supabase-locations"
const SUPABASE_ACTIVE_PREACHERS_CACHE_TAG = "supabase-active-preachers"

export class SupabaseDataConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SupabaseDataConfigError"
  }
}

export class SupabaseDataRequestError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "SupabaseDataRequestError"
    this.status = status
  }
}

type StaffRoleLiteral = "Admin" | "Preacher" | "Volunteer" | "Assistant"
type StaffStatusLiteral = "Active" | "Inactive"
type ContactRow = {
  id: string
  program_id: string
  name: string
  phone: string
  age: number | null
  date_of_birth: string | null
  year: string | null
  college: string | null
  company: string | null
  designation: string | null
  notes: string | null
  initial_contact: string | null
  last_contacted_on: string | null
  address: string | null
  location_ids: string[] | null
  assigned_preacher_id: string | null
  collected_by_id: string | null
  source: string | null
}
type UsersRow = {
  id: string
  program_id: string
  email: string
  name: string | null
  role: string
  status: string
  location_ids: string[] | null
  invited_by: string | null
  assigned_preacher_id: string | null
}
type SessionsRow = {
  id: string
  program_id: string
  name: string
  session_date: string | null
  preacher_id: string | null
  location_id: string | null
  public_attendance_enabled: boolean | null
  attendance_opens_at: string | null
  attendance_closes_at: string | null
  duration_minutes: number | null
  attendance_url: string | null
  created_by: string | null
}
type LocationsRow = {
  id: string
  program_id: string
  name: string
  status: string | null
  created_at?: string | null
  updated_at?: string | null
}
type AttendanceRow = {
  id: string
  program_id: string
  contact_id: string
  session_id: string
  phone: string
  name: string
  created_at: string | null
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function normalizeLinkedIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function normalizeDisplayString(value: unknown, options: { rejectRecordIds?: boolean } = {}): string | undefined {
  if (typeof value === "string" || typeof value === "number") {
    const normalized = String(value).trim()
    if (options.rejectRecordIds && /^rec[a-zA-Z0-9]{4,32}$/.test(normalized)) {
      return undefined
    }

    return normalized || undefined
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = normalizeDisplayString(item, options)
      if (normalized) {
        return normalized
      }
    }
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    return normalizeDisplayString(record.name, options) || normalizeDisplayString(record.email, options)
  }

  return undefined
}

function currentProgramDate(): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: SUPABASE_DATE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const getPart = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value

  return `${getPart("year")}-${getPart("month")}-${getPart("day")}`
}

function toIsoString(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) {
    return undefined
  }

  return new Date(timestamp).toISOString()
}

function programScopedFilter(): string {
  const programId = resolveProgramId()
  if (!programId) {
    throw new SupabaseDataConfigError("program id is required")
  }
  return programId
}

export function normalizeMobile(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") {
    return null
  }

  const digits = String(value).replace(/\D/g, "").slice(-10)
  return digits.length === 10 ? digits : null
}

function mapStaffUser(row: UsersRow): StaffUser | null {
  const email = normalizeString(row.email)?.toLowerCase()
  const role = row.role
  const status: StaffStatusLiteral = row.status === "Active" ? "Active" : "Inactive"

  if (!email) {
    return null
  }

  if (!["Admin", "Preacher", "Volunteer", "Assistant"].includes(role)) {
    return null
  }

  return {
    id: row.id,
    email,
    name: normalizeString(row.name) || email,
    role: role as StaffRoleLiteral,
    status,
    locationIds: Array.isArray(row.location_ids) ? row.location_ids : [],
    invitedByUserId: row.invited_by ?? undefined,
    assignedPreacherUserId: row.assigned_preacher_id ?? undefined,
    supabaseUserId: row.id,
  }
}

export async function findStaffUserByEmail(email: string): Promise<StaffUser | null> {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) {
    return null
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id,program_id,email,name,role,status,location_ids,invited_by,assigned_preacher_id")
    .eq("program_id", programScopedFilter())
    .eq("email", normalizedEmail)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data ? mapStaffUser(data as UsersRow) : null
}

export async function findStaffUserById(recordId: string): Promise<StaffUser | null> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id,program_id,email,name,role,status,location_ids,invited_by,assigned_preacher_id")
    .eq("program_id", programScopedFilter())
    .eq("id", recordId)
    .maybeSingle()

  if (error) {
    if (error.code === "PGRST116") {
      return null
    }
    throw error
  }

  return data ? mapStaffUser(data as UsersRow) : null
}

export async function listActivePreachers(): Promise<StaffUser[]> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id,program_id,email,name,role,status,location_ids,invited_by,assigned_preacher_id")
    .eq("program_id", programScopedFilter())
    .eq("role", "Preacher")
    .eq("status", "Active")

  if (error) {
    throw error
  }

  return (data ?? [])
    .map((row) => mapStaffUser(row as UsersRow))
    .filter((user): user is StaffUser => Boolean(user))
}

export const listCachedActivePreachers = unstable_cache(
  async () => listActivePreachers(),
  [SUPABASE_ACTIVE_PREACHERS_CACHE_TAG],
  {
    revalidate: SUPABASE_REFERENCE_CACHE_TTL_SECONDS,
    tags: [SUPABASE_ACTIVE_PREACHERS_CACHE_TAG],
  },
)

export async function upsertStaffUser(data: {
  email: string
  name: string
  role: StaffRole
  status?: StaffStatus
  invitedByUserId: string
  assignedPreacherUserId?: string
  locationIds?: string[]
  supabaseUserId?: string
}): Promise<StaffUser> {
  const programId = programScopedFilter()
  const normalizedEmail = data.email.trim().toLowerCase()
  const status: StaffStatus = data.status ?? "Active"

  const existing = await findStaffUserByEmail(normalizedEmail)
  if (existing) {
    const updatePayload: Record<string, unknown> = {
      name: data.name,
      role: data.role,
      status,
      invited_by: data.invitedByUserId,
    }
    if (data.assignedPreacherUserId) {
      updatePayload.assigned_preacher_id = data.assignedPreacherUserId
    }
    if (data.locationIds?.length) {
      updatePayload.location_ids = data.locationIds
    }

    const supabaseAdmin = createSupabaseAdminClient()
    const { data: updated, error } = await supabaseAdmin
      .from("users")
      .update(updatePayload)
      .eq("program_id", programId)
      .eq("id", existing.id)
      .select("id,program_id,email,name,role,status,location_ids,invited_by,assigned_preacher_id")
      .single()

    if (error) {
      throw error
    }

    const mapped = mapStaffUser(updated as UsersRow)
    if (!mapped) {
      throw new SupabaseDataRequestError("Supabase Users row is missing required staff fields", 422)
    }

    if (existing.role !== data.role || existing.status !== status) {
      revalidateSupabaseReferenceCache("active-preachers")
    }

    return mapped
  }

  const supabaseAdmin = createSupabaseAdminClient()

  let authUserId: string | undefined = data.supabaseUserId
  if (!authUserId) {
    const listResult = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 })
    const match = listResult.data?.users?.find(
      (user) => typeof user.email === "string" && user.email.toLowerCase() === normalizedEmail,
    )
    if (match) {
      authUserId = match.id
    } else {
      const createResult = await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        email_confirm: true,
      })
      if (createResult.error || !createResult.data?.user) {
        throw new SupabaseDataRequestError(
          `Failed to provision auth user for ${normalizedEmail}: ${createResult.error?.message ?? "unknown error"}`,
          500,
        )
      }
      authUserId = createResult.data.user.id
    }
  }

  const insertPayload: Record<string, unknown> = {
    id: authUserId,
    program_id: programId,
    email: normalizedEmail,
    name: data.name,
    role: data.role,
    status,
    invited_by: data.invitedByUserId,
    location_ids: Array.isArray(data.locationIds) ? data.locationIds : [],
  }
  if (data.assignedPreacherUserId) {
    insertPayload.assigned_preacher_id = data.assignedPreacherUserId
  }

  const { data: inserted, error } = await supabaseAdmin
    .from("users")
    .insert(insertPayload)
    .select("id,program_id,email,name,role,status,location_ids,invited_by,assigned_preacher_id")
    .single()

  if (error) {
    throw error
  }

  const mapped = mapStaffUser(inserted as UsersRow)
  if (!mapped) {
    throw new SupabaseDataRequestError("Supabase Users row is missing required staff fields", 422)
  }
  return mapped
}

function mapContact(row: ContactRow): ContactRecord {
  const phone = normalizeMobile(row.phone) || row.phone || ""

  return {
    id: row.id,
    name: normalizeString(row.name) || "Unknown",
    phone,
    age: typeof row.age === "number" ? row.age : undefined,
    dateOfBirth: normalizeString(row.date_of_birth),
    year: normalizeString(row.year),
    college: normalizeString(row.college),
    company: normalizeString(row.company),
    designation: normalizeString(row.designation),
    notes: normalizeString(row.notes),
    initialContact: normalizeString(row.initial_contact),
    lastContactedOn: normalizeString(row.last_contacted_on),
    address: normalizeString(row.address),
    location: Array.isArray(row.location_ids) ? row.location_ids : [],
    assignedPreacherIds: row.assigned_preacher_id ? [row.assigned_preacher_id] : [],
    collectedByIds: row.collected_by_id ? [row.collected_by_id] : [],
    analyticsIds: [],
  }
}

export async function findContactByPhone(phone: string): Promise<ContactRecord | null> {
  const normalizedPhone = normalizeMobile(phone)
  if (!normalizedPhone) {
    return null
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("contacts")
    .select(
      "id,program_id,name,phone,age,date_of_birth,year,college,company,designation,notes,initial_contact,last_contacted_on,address,location_ids,assigned_preacher_id,collected_by_id,source",
    )
    .eq("program_id", programScopedFilter())
    .eq("phone", normalizedPhone)
    .limit(1)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data ? mapContact(data as ContactRow) : null
}

export async function getContactsByRecordIds(recordIds: string[]): Promise<ContactRecord[]> {
  const uniqueIds = [...new Set(recordIds.map((id) => id.trim()).filter(Boolean))]
  if (uniqueIds.length === 0) {
    return []
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("contacts")
    .select(
      "id,program_id,name,phone,age,date_of_birth,year,college,company,designation,notes,initial_contact,last_contacted_on,address,location_ids,assigned_preacher_id,collected_by_id,source",
    )
    .eq("program_id", programScopedFilter())
    .in("id", uniqueIds)

  if (error) {
    throw error
  }

  const byId = new Map<string, ContactRecord>()
  for (const row of data ?? []) {
    const mapped = mapContact(row as ContactRow)
    byId.set(mapped.id, mapped)
  }

  return uniqueIds
    .map((id) => byId.get(id))
    .filter((contact): contact is ContactRecord => Boolean(contact))
}

export async function createContact(data: {
  name: string
  phone: string
  age?: number
  dateOfBirth?: string
  year?: string
  college?: string
  company?: string
  designation?: string
  source?: string
  comments?: string
  address?: string
  locationId?: string
  location?: string
  collectedByUserId?: string
  assignedPreacherUserId?: string
}): Promise<ContactRecord> {
  const normalizedPhone = normalizeMobile(data.phone)
  if (!normalizedPhone) {
    throw new SupabaseDataRequestError("Invalid phone number", 422)
  }

  const createdDate = currentProgramDate()

  const insertPayload: Record<string, unknown> = {
    program_id: programScopedFilter(),
    name: data.name.trim(),
    phone: normalizedPhone,
    initial_contact: createdDate,
    last_contacted_on: createdDate,
  }

  if (typeof data.age === "number") {
    insertPayload.age = data.age
  }
  if (data.dateOfBirth) {
    insertPayload.date_of_birth = data.dateOfBirth
  }
  if (data.year) {
    insertPayload.year = data.year
  }
  if (data.college) {
    insertPayload.college = data.college
  }
  if (data.company) {
    insertPayload.company = data.company
  }
  if (data.designation) {
    insertPayload.designation = data.designation
  }
  if (data.source) {
    insertPayload.source = data.source
  }
  if (data.comments) {
    insertPayload.notes = data.comments
  }
  if (data.address) {
    insertPayload.address = data.address
  }
  if (data.locationId) {
    insertPayload.location_ids = [data.locationId]
  } else if (data.location) {
    insertPayload.location_ids = [data.location]
  }
  if (data.assignedPreacherUserId) {
    insertPayload.assigned_preacher_id = data.assignedPreacherUserId
  }
  const collectorId = data.collectedByUserId || data.assignedPreacherUserId
  if (collectorId) {
    insertPayload.collected_by_id = collectorId
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { data: inserted, error } = await supabaseAdmin
    .from("contacts")
    .insert(insertPayload)
    .select(
      "id,program_id,name,phone,age,date_of_birth,year,college,company,designation,notes,initial_contact,last_contacted_on,address,location_ids,assigned_preacher_id,collected_by_id,source",
    )
    .single()

  if (error) {
    if (error.code === "23505") {
      throw new SupabaseDataRequestError("duplicate key value violates unique constraint", 409)
    }
    throw error
  }

  return mapContact(inserted as ContactRow)
}

function mapSession(row: SessionsRow): SessionRecord {
  return {
    id: row.id,
    name: normalizeString(row.name) || "Untitled session",
    sessionDate: normalizeString(row.session_date),
    preacherIds: row.preacher_id ? [row.preacher_id] : [],
    locationIds: row.location_id ? [row.location_id] : [],
    analyticsIds: [],
    attendanceRecordIds: [],
    publicAttendanceEnabled: row.public_attendance_enabled === true,
    attendanceOpensAt: toIsoString(row.attendance_opens_at),
    attendanceClosesAt: toIsoString(row.attendance_closes_at),
    durationMinutes: typeof row.duration_minutes === "number" ? row.duration_minutes : undefined,
    attendanceUrl: normalizeString(row.attendance_url),
    createdBy: row.created_by ? [row.created_by] : [],
  }
}

export async function findSessionById(recordId: string): Promise<SessionRecord | null> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("sessions")
    .select(
      "id,program_id,name,session_date,preacher_id,location_id,public_attendance_enabled,attendance_opens_at,attendance_closes_at,duration_minutes,attendance_url,created_by",
    )
    .eq("program_id", programScopedFilter())
    .eq("id", recordId)
    .maybeSingle()

  if (error) {
    if (error.code === "PGRST116") {
      return null
    }
    throw error
  }

  return data ? mapSession(data as SessionsRow) : null
}

export async function listSessions(): Promise<SessionRecord[]> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("sessions")
    .select(
      "id,program_id,name,session_date,preacher_id,location_id,public_attendance_enabled,attendance_opens_at,attendance_closes_at,duration_minutes,attendance_url,created_by",
    )
    .eq("program_id", programScopedFilter())

  if (error) {
    throw error
  }

  return (data ?? []).map((row) => mapSession(row as SessionsRow))
}

export async function findLocationById(
  recordId: string,
): Promise<DataRow<LocationFields> | null> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("id,program_id,name,status,created_at")
    .eq("program_id", programScopedFilter())
    .eq("id", recordId)
    .maybeSingle()

  if (error) {
    if (error.code === "PGRST116") {
      return null
    }
    throw error
  }

  if (!data) {
    return null
  }

  const row = data as LocationsRow
  return {
    id: row.id,
    fields: {
      Name: row.name,
      Status: row.status ?? undefined,
    },
    createdTime: toIsoString(row.created_at),
  }
}

export async function findLocationByName(name: string): Promise<LocationRecord | null> {
  const normalizedName = name.trim().replace(/\s+/g, " ")
  if (!normalizedName) {
    return null
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("id,program_id,name,status")
    .eq("program_id", programScopedFilter())
    .eq("name", normalizedName)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    return null
  }

  const row = data as LocationsRow
  return {
    id: row.id,
    name: row.name,
    status: row.status ?? undefined,
  }
}

export async function listLocations(): Promise<LocationRecord[]> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("id,program_id,name,status")
    .eq("program_id", programScopedFilter())

  if (error) {
    throw error
  }

  return (data ?? [])
    .map((row) => {
      const r = row as LocationsRow
      return {
        id: r.id,
        name: r.name,
        status: r.status ?? undefined,
      }
    })
    .sort((left, right) => left.name.localeCompare(right.name))
}

export const listCachedLocations = unstable_cache(
  async () => listLocations(),
  [SUPABASE_LOCATIONS_CACHE_TAG],
  {
    revalidate: SUPABASE_REFERENCE_CACHE_TTL_SECONDS,
    tags: [SUPABASE_LOCATIONS_CACHE_TAG],
  },
)

export async function createLocation(data: { name: string }): Promise<LocationRecord> {
  const name = data.name.trim().replace(/\s+/g, " ")

  const supabaseAdmin = createSupabaseAdminClient()
  const { data: inserted, error } = await supabaseAdmin
    .from("locations")
    .insert({ program_id: programScopedFilter(), name, status: "Active" })
    .select("id,program_id,name,status")
    .single()

  if (error) {
    throw error
  }

  revalidateSupabaseReferenceCache("locations")

  const row = inserted as LocationsRow
  return {
    id: row.id,
    name: row.name,
    status: row.status ?? undefined,
  }
}

export function revalidateSupabaseReferenceCache(
  scope: "locations" | "active-preachers" | "all" = "all",
): void {
  if (scope === "locations" || scope === "all") {
    revalidateTag(SUPABASE_LOCATIONS_CACHE_TAG, "max")
  }

  if (scope === "active-preachers" || scope === "all") {
    revalidateTag(SUPABASE_ACTIVE_PREACHERS_CACHE_TAG, "max")
  }
}

export async function createSession(data: {
  name: string
  sessionDate: string
  preacherUserId: string
  locationId: string
  durationMinutes?: number
  publicAttendanceEnabled: boolean
  attendanceOpensAt?: string
  attendanceClosesAt?: string
  createdBy: string
}): Promise<SessionRecord> {
  const insertPayload: Record<string, unknown> = {
    program_id: programScopedFilter(),
    name: data.name.trim(),
    session_date: data.sessionDate,
    preacher_id: data.preacherUserId,
    location_id: data.locationId,
    public_attendance_enabled: data.publicAttendanceEnabled,
    created_by: data.createdBy,
  }

  if (typeof data.durationMinutes === "number") {
    insertPayload.duration_minutes = data.durationMinutes
  }
  if (data.attendanceOpensAt) {
    insertPayload.attendance_opens_at = data.attendanceOpensAt
  }
  if (data.attendanceClosesAt) {
    insertPayload.attendance_closes_at = data.attendanceClosesAt
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { data: inserted, error } = await supabaseAdmin
    .from("sessions")
    .insert(insertPayload)
    .select(
      "id,program_id,name,session_date,preacher_id,location_id,public_attendance_enabled,attendance_opens_at,attendance_closes_at,duration_minutes,attendance_url,created_by",
    )
    .single()

  if (error) {
    throw error
  }

  return mapSession(inserted as SessionsRow)
}

export async function updateSessionAttendanceUrl(
  sessionId: string,
  attendanceUrl: string,
): Promise<SessionRecord> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data: updated, error } = await supabaseAdmin
    .from("sessions")
    .update({ attendance_url: attendanceUrl })
    .eq("program_id", programScopedFilter())
    .eq("id", sessionId)
    .select(
      "id,program_id,name,session_date,preacher_id,location_id,public_attendance_enabled,attendance_opens_at,attendance_closes_at,duration_minutes,attendance_url,created_by",
    )
    .single()

  if (error) {
    if (error.code === "PGRST116") {
      throw new SupabaseDataRequestError("session not found", 404)
    }
    throw error
  }

  if (!updated) {
    throw new SupabaseDataRequestError("session not found", 404)
  }

  return mapSession(updated as SessionsRow)
}

function mapAttendance(row: AttendanceRow): AttendanceRecord {
  const createdIso = toIsoString(row.created_at)
  const fields: AttendanceFields = {
    Phone: row.phone,
    Name: row.name,
    Contact: [row.contact_id],
    Session: [row.session_id],
    "Processed?": true,
  }
  if (createdIso) {
    fields["Attendance Date"] = createdIso
  }

  return {
    id: row.id,
    fields,
    createdTime: createdIso,
  }
}

export async function findAttendanceByContactAndSession(
  contactId: string,
  sessionId: string,
  session?: SessionRecord,
): Promise<AttendanceRecord | null> {
  const target = session ?? (await findSessionById(sessionId))
  if (!target) {
    return null
  }

  const records = await getAttendanceBySessionRecord(target)
  return records.find((record) => {
    const linked = normalizeLinkedIds(record.fields.Contact)
    return linked.includes(contactId)
  }) ?? null
}

export async function createAttendanceRecord(data: {
  contactId: string
  sessionId: string
  phone: string
  name: string
}): Promise<AttendanceRecord> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data: inserted, error } = await supabaseAdmin
    .from("attendance")
    .insert({
      program_id: programScopedFilter(),
      contact_id: data.contactId,
      session_id: data.sessionId,
      phone: data.phone,
      name: data.name,
    })
    .select("id,program_id,contact_id,session_id,phone,name,created_at")
    .single()

  if (error) {
    if (error.code === "23505") {
      throw new SupabaseDataRequestError("duplicate key value violates unique constraint", 409)
    }
    throw error
  }

  return mapAttendance(inserted as AttendanceRow)
}

export async function getAttendanceByDate(date: string): Promise<AttendanceRecord[]> {
  const nextDay = nextIsoDate(date)
  if (!nextDay) {
    return []
  }

  const startAt = `${date} 00:00:00${SUPABASE_DATE_TIME_OFFSET}`
  const endAt = `${nextDay} 00:00:00${SUPABASE_DATE_TIME_OFFSET}`

  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("attendance")
    .select("id,program_id,contact_id,session_id,phone,name,created_at")
    .eq("program_id", programScopedFilter())
    .gte("created_at", startAt)
    .lt("created_at", endAt)

  if (error) {
    throw error
  }

  return (data ?? []).map((row) => mapAttendance(row as AttendanceRow))
}

function nextIsoDate(date: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) {
    return null
  }

  const [, yearStr, monthStr, dayStr] = match
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)

  const next = new Date(Date.UTC(year, month - 1, day + 1))
  if (
    next.getUTCFullYear() !== year ||
    next.getUTCMonth() + 1 !== month ||
    next.getUTCDate() !== day + 1
  ) {
    return null
  }

  const nextYear = next.getUTCFullYear()
  const nextMonth = String(next.getUTCMonth() + 1).padStart(2, "0")
  const nextDay = String(next.getUTCDate()).padStart(2, "0")
  return `${nextYear}-${nextMonth}-${nextDay}`
}

export async function getAttendanceBySession(sessionId: string): Promise<AttendanceRecord[]> {
  const session = await findSessionById(sessionId)
  return session ? getAttendanceBySessionRecord(session) : []
}

export async function getAttendanceByRecordIds(recordIds: string[]): Promise<AttendanceRecord[]> {
  const uniqueIds = [...new Set(recordIds.map((id) => id.trim()).filter(Boolean))]
  if (uniqueIds.length === 0) {
    return []
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("attendance")
    .select("id,program_id,contact_id,session_id,phone,name,created_at")
    .eq("program_id", programScopedFilter())
    .in("id", uniqueIds)

  if (error) {
    throw error
  }

  const byId = new Map<string, AttendanceRecord>()
  for (const row of data ?? []) {
    const mapped = mapAttendance(row as AttendanceRow)
    byId.set(mapped.id, mapped)
  }

  return uniqueIds
    .map((id) => byId.get(id))
    .filter((record): record is AttendanceRecord => Boolean(record))
}

export async function getAttendanceBySessionRecord(
  session: Pick<SessionRecord, "id">,
  options: { knownAttendanceIds?: ReadonlySet<string> | null } = {},
): Promise<AttendanceRecord[]> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("attendance")
    .select("id,program_id,contact_id,session_id,phone,name,created_at")
    .eq("program_id", programScopedFilter())
    .eq("session_id", session.id)

  if (error) {
    throw error
  }

  const mapped = (data ?? []).map((row) => mapAttendance(row as AttendanceRow))
  if (!options.knownAttendanceIds) {
    return mapped
  }

  return mapped.filter((record) => !options.knownAttendanceIds?.has(record.id))
}

export async function getAttendanceDashboardRecords(
  records: AttendanceRecord[],
  fallbackDate: string,
  options: { hydrateContacts?: boolean } = {},
): Promise<AttendanceDashboardRecord[]> {
  if (records.length === 0) {
    return []
  }

  const contactsById = new Map<string, ContactRecord>()
  if (options.hydrateContacts) {
    const contactIds = [...new Set(records.flatMap((record) => normalizeLinkedIds(record.fields.Contact)))]
    for (const contact of await getContactsByRecordIds(contactIds)) {
      contactsById.set(contact.id, contact)
    }
  }

  return records.map((record) => {
    const contact = normalizeLinkedIds(record.fields.Contact)
      .map((contactId) => contactsById.get(contactId))
      .find((mappedContact): mappedContact is ContactRecord => Boolean(mappedContact))
    const mobile = normalizeMobile(record.fields.Phone) || contact?.phone || normalizeDisplayString(record.fields.Phone) || ""
    const userName = contact?.name || normalizeDisplayString(record.fields.Name, { rejectRecordIds: true }) || "Unknown"

    return {
      id: record.id,
      mobile,
      userName,
      createdAt: record.createdTime || record.fields["Attendance Date"] || fallbackDate,
    }
  })
}

// Re-export PostgrestError so callers can narrow errors when desired.
export { PostgrestError }
