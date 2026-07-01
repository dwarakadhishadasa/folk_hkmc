import "server-only"

import { revalidateTag, unstable_cache } from "next/cache"
import {
  getProgramScopedEnv,
  getServerProgramProfile,
  resolveProgramId,
  type ServerProgramProfile,
} from "@hkmc/program-config/server"

export type StaffRole = "Admin" | "Preacher" | "Volunteer"
export type StaffStatus = "Active" | "Inactive"

export interface AirtableRecord<TFields extends object = Record<string, unknown>> {
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
  Name?: string
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
  invitedByAirtableUserId?: string
  assignedPreacherAirtableUserId?: string
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
}

export interface AttendanceRecord {
  id: string
  fields: AttendanceFields
  createdTime?: string
}

type TableKey = "contacts" | "attendance" | "sessions" | "users" | "locations"

interface AirtableConfig {
  apiToken: string
  baseId: string
  profile: ServerProgramProfile
}

const tableEnvNames: Record<TableKey, string> = {
  contacts: "AIRTABLE_CONTACTS_TABLE_ID",
  attendance: "AIRTABLE_ATTENDANCE_TABLE_ID",
  sessions: "AIRTABLE_SESSIONS_TABLE_ID",
  users: "AIRTABLE_USERS_TABLE_ID",
  locations: "AIRTABLE_LOCATIONS_TABLE_ID",
}

const DEFAULT_ANALYTICS_RECORD_ID = "reca0aQhvHSc5d5A1"
const AIRTABLE_DATE_TIME_ZONE = "Asia/Kolkata"
const AIRTABLE_REFERENCE_CACHE_TTL_SECONDS = 20 * 60
const AIRTABLE_LOCATIONS_CACHE_TAG = "airtable-locations"
const AIRTABLE_ACTIVE_PREACHERS_CACHE_TAG = "airtable-active-preachers"

export class AirtableConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AirtableConfigError"
  }
}

export class AirtableRequestError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "AirtableRequestError"
    this.status = status
  }
}

function requireProgramEnv(profile: ServerProgramProfile, name: string): string {
  const value = getProgramScopedEnv(profile, name)

  if (!value) {
    throw new AirtableConfigError(`${profile.envPrefix}_${name} or ${name} is required`)
  }

  return value
}

function programScopedAirtableIdEnv(profile: ServerProgramProfile, name: string): string | undefined {
  const prefixedValue = process.env[`${profile.envPrefix}_${name}`]?.trim()
  if (prefixedValue) {
    return prefixedValue
  }

  return profile.id === "folk" ? process.env[name]?.trim() || undefined : undefined
}

function getConfig(): AirtableConfig {
  const profile = getServerProgramProfile(resolveProgramId())

  return {
    apiToken: requireProgramEnv(profile, "AIRTABLE_API_TOKEN"),
    baseId: programScopedAirtableIdEnv(profile, "AIRTABLE_BASE_ID") || profile.airtable.baseId,
    profile,
  }
}

function tableUrl(table: TableKey): string {
  const config = getConfig()
  const tableId = programScopedAirtableIdEnv(config.profile, tableEnvNames[table]) || config.profile.airtable.tables[table].id
  return `https://api.airtable.com/v0/${config.baseId}/${encodeURIComponent(tableId)}`
}

function recordUrl(table: TableKey, recordId: string): string {
  return `${tableUrl(table)}/${recordId}`
}

function analyticsRecordId(): string | null {
  const config = getConfig()
  const programScopedRecordId = process.env[`${config.profile.envPrefix}_AIRTABLE_ANALYTICS_RECORD_ID`]?.trim()

  if (programScopedRecordId) {
    return programScopedRecordId
  }

  if (config.profile.id !== "folk") {
    return null
  }

  if (config.baseId !== config.profile.airtable.baseId) {
    return null
  }

  return process.env.AIRTABLE_ANALYTICS_RECORD_ID?.trim() || DEFAULT_ANALYTICS_RECORD_ID
}

function escapeFormulaString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")
}

function normalizeLinkedIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function currentAirtableDate(): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: AIRTABLE_DATE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const getPart = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value

  return `${getPart("year")}-${getPart("month")}-${getPart("day")}`
}

function linkedIdsInclude(value: unknown, recordId: string): boolean {
  return normalizeLinkedIds(value).includes(recordId)
}

function recordIdFormula(recordIds: string[]): string {
  const clauses = recordIds.map((recordId) => `RECORD_ID()='${escapeFormulaString(recordId)}'`)
  return clauses.length === 1 ? clauses[0] : `OR(${clauses.join(",")})`
}

export function normalizeMobile(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") {
    return null
  }

  const digits = String(value).replace(/\D/g, "").slice(-10)
  return digits.length === 10 ? digits : null
}

async function airtableFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const config = getConfig()
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  })

  if (!response.ok) {
    const text = await response.text()
    throw new AirtableRequestError(`Airtable request failed with ${response.status}: ${text}`, response.status)
  }

  return response.json() as Promise<T>
}

async function listRecords<TFields extends object>(
  table: TableKey,
  options: { filterFormula?: string; pageSize?: number; maxRecords?: number } = {},
): Promise<Array<AirtableRecord<TFields>>> {
  const url = new URL(tableUrl(table))
  if (options.filterFormula) {
    url.searchParams.set("filterByFormula", options.filterFormula)
  }
  if (options.pageSize) {
    url.searchParams.set("pageSize", String(options.pageSize))
  }
  if (options.maxRecords) {
    url.searchParams.set("maxRecords", String(options.maxRecords))
  }

  const records: Array<AirtableRecord<TFields>> = []
  let offset: string | undefined

  do {
    if (offset) {
      url.searchParams.set("offset", offset)
    }

    const result = await airtableFetch<{ records?: Array<AirtableRecord<TFields>>; offset?: string }>(url.toString())
    records.push(...(result.records || []))
    offset = result.offset
  } while (offset && (!options.maxRecords || records.length < options.maxRecords))

  return options.maxRecords ? records.slice(0, options.maxRecords) : records
}

async function listRecordsByIds<TFields extends object>(
  table: TableKey,
  recordIds: string[],
): Promise<Array<AirtableRecord<TFields>>> {
  const uniqueRecordIds = [...new Set(recordIds.map((recordId) => recordId.trim()).filter(Boolean))]

  if (uniqueRecordIds.length === 0) {
    return []
  }

  const records: Array<AirtableRecord<TFields>> = []
  const batchSize = 50

  for (let index = 0; index < uniqueRecordIds.length; index += batchSize) {
    const batchIds = uniqueRecordIds.slice(index, index + batchSize)
    records.push(
      ...(await listRecords<TFields>(table, {
        filterFormula: recordIdFormula(batchIds),
        pageSize: batchIds.length,
        maxRecords: batchIds.length,
      })),
    )
  }

  const recordsById = new Map(records.map((record) => [record.id, record]))
  return uniqueRecordIds
    .map((recordId) => recordsById.get(recordId))
    .filter((record): record is AirtableRecord<TFields> => Boolean(record))
}

async function createRecord<TFields extends object>(
  table: TableKey,
  fields: Record<string, unknown>,
  typecast = true,
): Promise<AirtableRecord<TFields>> {
  const result = await airtableFetch<{ records: Array<AirtableRecord<TFields>> }>(tableUrl(table), {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }], typecast }),
  })

  return result.records[0]
}

async function updateRecord<TFields extends object>(
  table: TableKey,
  recordId: string,
  fields: Record<string, unknown>,
  typecast = true,
): Promise<AirtableRecord<TFields>> {
  const result = await airtableFetch<{ records: Array<AirtableRecord<TFields>> }>(tableUrl(table), {
    method: "PATCH",
    body: JSON.stringify({ records: [{ id: recordId, fields }], typecast }),
  })

  return result.records[0]
}

function mapStaffUser(record: AirtableRecord<UserFields>): StaffUser | null {
  const email = normalizeString(record.fields.Email)?.toLowerCase()
  const role = record.fields.Role
  const status = record.fields.Status

  if (!email || !role || !["Admin", "Preacher", "Volunteer"].includes(role)) {
    return null
  }

  return {
    id: record.id,
    email,
    name: normalizeString(record.fields.Name) || email,
    role,
    status: status === "Active" ? "Active" : "Inactive",
    locationIds: normalizeLinkedIds(record.fields.Locations),
    portalAccount: normalizeString(record.fields["Portal Account"]),
    supabaseUserId: normalizeString(record.fields["Supabase User ID"]),
    invitedByAirtableUserId: normalizeLinkedIds(record.fields["Invited By"])[0],
    assignedPreacherAirtableUserId: normalizeLinkedIds(record.fields["Assigned Preacher"])[0],
  }
}

export async function findStaffUserByEmail(email: string): Promise<StaffUser | null> {
  const normalizedEmail = email.trim().toLowerCase()
  const records = await listRecords<UserFields>("users", {
    filterFormula: `LOWER({Email})='${escapeFormulaString(normalizedEmail)}'`,
    maxRecords: 1,
  })

  return records[0] ? mapStaffUser(records[0]) : null
}

export async function findStaffUserById(recordId: string): Promise<StaffUser | null> {
  try {
    const record = await airtableFetch<AirtableRecord<UserFields>>(recordUrl("users", recordId))
    return mapStaffUser(record)
  } catch (error) {
    if (error instanceof AirtableRequestError && error.status === 404) {
      return null
    }
    throw error
  }
}

export async function listActivePreachers(): Promise<StaffUser[]> {
  const records = await listRecords<UserFields>("users", {
    filterFormula: "AND({Role}='Preacher', {Status}='Active')",
  })

  return records.map(mapStaffUser).filter((user): user is StaffUser => Boolean(user))
}

export const listCachedActivePreachers = unstable_cache(
  async () => listActivePreachers(),
  [AIRTABLE_ACTIVE_PREACHERS_CACHE_TAG],
  {
    revalidate: AIRTABLE_REFERENCE_CACHE_TTL_SECONDS,
    tags: [AIRTABLE_ACTIVE_PREACHERS_CACHE_TAG],
  },
)

export async function upsertStaffUser(data: {
  email: string
  name: string
  role: StaffRole
  status?: StaffStatus
  invitedByAirtableUserId: string
  assignedPreacherAirtableUserId?: string
  locationIds?: string[]
  supabaseUserId?: string
}): Promise<StaffUser> {
  const existing = await findStaffUserByEmail(data.email)
  const fields: Record<string, unknown> = {
    Email: data.email.trim().toLowerCase(),
    Name: data.name,
    Role: data.role,
    Status: data.status || "Active",
    "Invited By": [data.invitedByAirtableUserId],
  }

  if (data.locationIds?.length) {
    fields.Locations = data.locationIds
  }
  if (data.assignedPreacherAirtableUserId) {
    fields["Assigned Preacher"] = [data.assignedPreacherAirtableUserId]
  }
  if (data.supabaseUserId) {
    fields["Supabase User ID"] = data.supabaseUserId
  }

  const record = existing
    ? await updateRecord<UserFields>("users", existing.id, fields)
    : await createRecord<UserFields>("users", fields)
  const mapped = mapStaffUser(record)

  if (!mapped) {
    throw new AirtableRequestError("Airtable Users record is missing required staff fields", 422)
  }

  return mapped
}

export async function syncStaffSupabaseUserId(recordId: string, supabaseUserId: string): Promise<void> {
  await updateRecord<UserFields>("users", recordId, { "Supabase User ID": supabaseUserId }, true)
}

export function mapContact(record: AirtableRecord<ContactFields>): ContactRecord {
  const phone = normalizeMobile(record.fields.Phone) || String(record.fields.Phone || "")

  return {
    id: record.id,
    name: normalizeString(record.fields.Name) || "Unknown",
    phone,
    age: typeof record.fields.Age === "number" ? record.fields.Age : undefined,
    dateOfBirth: normalizeString(record.fields["Date of Birth"]),
    year: normalizeString(record.fields.Year),
    college: normalizeString(record.fields.College),
    company: normalizeString(record.fields.Company),
    designation: normalizeString(record.fields.Designation),
    notes: normalizeString(record.fields.Notes),
    initialContact: normalizeString(record.fields["Initial Contact"]),
    lastContactedOn: normalizeString(record.fields["Last Contacted On"]),
    address: normalizeString(record.fields.Address),
    location: record.fields.Location,
    assignedPreacherIds: normalizeLinkedIds(record.fields["Assigned Preacher"]),
    collectedByIds: normalizeLinkedIds(record.fields["Collected By"]),
    analyticsIds: normalizeLinkedIds(record.fields.Analytics),
  }
}

export async function findContactByPhone(phone: string): Promise<ContactRecord | null> {
  const normalizedPhone = normalizeMobile(phone)
  if (!normalizedPhone) {
    return null
  }

  const records = await listRecords<ContactFields>("contacts", {
    filterFormula: `OR({Phone}='${normalizedPhone}', {Phone}=${normalizedPhone})`,
    maxRecords: 1,
  })

  return records[0] ? mapContact(records[0]) : null
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
  collectedByAirtableUserId?: string
  assignedPreacherAirtableUserId?: string
}): Promise<ContactRecord> {
  const normalizedPhone = normalizeMobile(data.phone)
  if (!normalizedPhone) {
    throw new AirtableRequestError("Invalid phone number", 422)
  }

  const fields: Record<string, unknown> = {
    Name: data.name.trim(),
    Phone: normalizedPhone,
  }
  const analyticsId = analyticsRecordId()
  const createdDate = currentAirtableDate()

  fields["Initial Contact"] = createdDate
  fields["Last Contacted On"] = createdDate
  if (analyticsId) {
    fields.Analytics = [analyticsId]
  }

  if (typeof data.age === "number") {
    fields.Age = data.age
  }
  if (data.dateOfBirth) {
    fields["Date of Birth"] = data.dateOfBirth
  }
  if (data.year) {
    fields.Year = data.year
  }
  if (data.college) {
    fields.College = data.college
  }
  if (data.company) {
    fields.Company = data.company
  }
  if (data.designation) {
    fields.Designation = data.designation
  }
  if (data.source) {
    fields.Source = data.source
  }
  if (data.comments) {
    fields.Notes = data.comments
  }
  if (data.address) {
    fields.Address = data.address
  }
  if (data.locationId) {
    fields.Location = [data.locationId]
  } else if (data.location) {
    fields.Location = data.location.startsWith("rec") ? [data.location] : data.location
  }
  if (data.assignedPreacherAirtableUserId) {
    fields["Assigned Preacher"] = [data.assignedPreacherAirtableUserId]
  }
  const collectorId = data.collectedByAirtableUserId || data.assignedPreacherAirtableUserId
  if (collectorId) {
    fields["Collected By"] = [collectorId]
  }

  return mapContact(await createRecord<ContactFields>("contacts", fields))
}

export async function findSessionById(recordId: string): Promise<SessionRecord | null> {
  try {
    const record = await airtableFetch<AirtableRecord<SessionFields>>(recordUrl("sessions", recordId))
    return mapSession(record)
  } catch (error) {
    if (error instanceof AirtableRequestError && error.status === 404) {
      return null
    }
    throw error
  }
}

export function mapSession(record: AirtableRecord<SessionFields>): SessionRecord {
  return {
    id: record.id,
    name: normalizeString(record.fields.Name) || "Untitled session",
    sessionDate: normalizeString(record.fields["Session Date"]),
    preacherIds: normalizeLinkedIds(record.fields.Preacher),
    locationIds: normalizeLinkedIds(record.fields.Location),
    analyticsIds: normalizeLinkedIds(record.fields.Analytics),
    attendanceRecordIds: normalizeLinkedIds(record.fields["Attendance Records"]),
    publicAttendanceEnabled: record.fields["Public Attendance Enabled"] === true,
    attendanceOpensAt: normalizeString(record.fields["Attendance Opens At"]),
    attendanceClosesAt: normalizeString(record.fields["Attendance Closes At"]),
    durationMinutes: typeof record.fields["Duration Minutes"] === "number" ? record.fields["Duration Minutes"] : undefined,
    attendanceUrl: normalizeString(record.fields["Attendance URL"]),
  }
}

export async function listSessions(): Promise<SessionRecord[]> {
  const records = await listRecords<SessionFields>("sessions")
  return records.map(mapSession)
}

export async function findLocationById(recordId: string): Promise<AirtableRecord<LocationFields> | null> {
  try {
    return await airtableFetch<AirtableRecord<LocationFields>>(recordUrl("locations", recordId))
  } catch (error) {
    if (error instanceof AirtableRequestError && error.status === 404) {
      return null
    }
    throw error
  }
}

export async function findLocationByName(name: string): Promise<LocationRecord | null> {
  const normalizedName = name.trim().replace(/\s+/g, " ")
  if (!normalizedName) {
    return null
  }

  const records = await listRecords<LocationFields>("locations", {
    filterFormula: `LOWER({Name})='${escapeFormulaString(normalizedName.toLowerCase())}'`,
    maxRecords: 1,
  })

  return records[0] ? mapLocation(records[0]) : null
}

export function mapLocation(record: AirtableRecord<LocationFields>): LocationRecord {
  return {
    id: record.id,
    name: normalizeString(record.fields.Name) || record.id,
    status: normalizeString(record.fields.Status),
  }
}

export async function listLocations(): Promise<LocationRecord[]> {
  const records = await listRecords<LocationFields>("locations")
  return records.map(mapLocation).sort((left, right) => left.name.localeCompare(right.name))
}

export const listCachedLocations = unstable_cache(async () => listLocations(), [AIRTABLE_LOCATIONS_CACHE_TAG], {
  revalidate: AIRTABLE_REFERENCE_CACHE_TTL_SECONDS,
  tags: [AIRTABLE_LOCATIONS_CACHE_TAG],
})

export async function createLocation(data: { name: string }): Promise<LocationRecord> {
  const name = data.name.trim().replace(/\s+/g, " ")
  const record = await createRecord<LocationFields>("locations", { Name: name })
  revalidateAirtableReferenceCache("locations")

  return mapLocation(record)
}

export function revalidateAirtableReferenceCache(scope: "locations" | "active-preachers" | "all" = "all"): void {
  if (scope === "locations" || scope === "all") {
    revalidateTag(AIRTABLE_LOCATIONS_CACHE_TAG, "max")
  }

  if (scope === "active-preachers" || scope === "all") {
    revalidateTag(AIRTABLE_ACTIVE_PREACHERS_CACHE_TAG, "max")
  }
}

export async function createSession(data: {
  name: string
  sessionDate: string
  preacherAirtableUserId: string
  locationId: string
  durationMinutes?: number
  publicAttendanceEnabled: boolean
  attendanceOpensAt?: string
  attendanceClosesAt?: string
}): Promise<SessionRecord> {
  const fields: Record<string, unknown> = {
    Name: data.name.trim(),
    "Session Date": data.sessionDate,
    Preacher: [data.preacherAirtableUserId],
    Location: [data.locationId],
    "Public Attendance Enabled": data.publicAttendanceEnabled,
  }
  const analyticsId = analyticsRecordId()

  if (typeof data.durationMinutes === "number") {
    fields["Duration Minutes"] = data.durationMinutes
  }
  if (analyticsId) {
    fields.Analytics = [analyticsId]
  }
  if (data.attendanceOpensAt) {
    fields["Attendance Opens At"] = data.attendanceOpensAt
  }
  if (data.attendanceClosesAt) {
    fields["Attendance Closes At"] = data.attendanceClosesAt
  }

  return mapSession(await createRecord<SessionFields>("sessions", fields))
}

export async function updateSessionAttendanceUrl(sessionId: string, attendanceUrl: string): Promise<SessionRecord> {
  return mapSession(await updateRecord<SessionFields>("sessions", sessionId, { "Attendance URL": attendanceUrl }))
}

export async function findAttendanceByContactAndSession(
  contactId: string,
  sessionId: string,
  session?: SessionRecord,
): Promise<AttendanceRecord | null> {
  const records = session ? await getAttendanceBySessionRecord(session) : await getAttendanceBySession(sessionId)
  return records.find((record) => linkedIdsInclude(record.fields.Contact, contactId)) || null
}

export async function createAttendanceRecord(data: {
  contactId: string
  sessionId: string
  phone: string
  name: string
}): Promise<AttendanceRecord> {
  return createRecord<AttendanceFields>("attendance", {
    Contact: [data.contactId],
    Session: [data.sessionId],
    Phone: data.phone,
    Name: data.name,
    "Processed?": true,
  })
}

export async function getAttendanceByDate(date: string): Promise<AttendanceRecord[]> {
  return listRecords<AttendanceFields>("attendance", {
    filterFormula: `IS_SAME(CREATED_TIME(), '${escapeFormulaString(date)}', 'day')`,
  })
}

export async function getAttendanceBySession(sessionId: string): Promise<AttendanceRecord[]> {
  const session = await findSessionById(sessionId)

  return session ? getAttendanceBySessionRecord(session) : []
}

export async function getAttendanceByRecordIds(recordIds: string[]): Promise<AttendanceRecord[]> {
  return listRecordsByIds<AttendanceFields>("attendance", recordIds)
}

export async function getAttendanceBySessionRecord(session: Pick<SessionRecord, "attendanceRecordIds">): Promise<AttendanceRecord[]> {
  if (!session.attendanceRecordIds.length) {
    return []
  }

  return getAttendanceByRecordIds(session.attendanceRecordIds)
}
