import "server-only"

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
  Year?: string
  Source?: string
  Location?: string | string[]
  "Assigned Preacher"?: string[]
  "Collected By"?: string[]
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
  "Public Attendance Enabled"?: boolean
  "Attendance Opens At"?: string
  "Attendance Closes At"?: string
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
  year?: string
  location?: string | string[]
  assignedPreacherIds: string[]
  collectedByIds: string[]
}

export interface SessionRecord {
  id: string
  name: string
  sessionDate?: string
  preacherIds: string[]
  locationIds: string[]
  publicAttendanceEnabled: boolean
  attendanceOpensAt?: string
  attendanceClosesAt?: string
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
  tables: Record<TableKey, string>
}

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

function requireEnv(name: string): string {
  const value = process.env[name]

  if (!value) {
    throw new AirtableConfigError(`${name} is required`)
  }

  return value
}

function getConfig(): AirtableConfig {
  return {
    apiToken: requireEnv("AIRTABLE_API_TOKEN"),
    baseId: requireEnv("AIRTABLE_BASE_ID"),
    tables: {
      contacts: requireEnv("AIRTABLE_CONTACTS_TABLE_ID"),
      attendance: requireEnv("AIRTABLE_ATTENDANCE_TABLE_ID"),
      sessions: requireEnv("AIRTABLE_SESSIONS_TABLE_ID"),
      users: requireEnv("AIRTABLE_USERS_TABLE_ID"),
      locations: requireEnv("AIRTABLE_LOCATIONS_TABLE_ID"),
    },
  }
}

function tableUrl(table: TableKey): string {
  const config = getConfig()
  return `https://api.airtable.com/v0/${config.baseId}/${encodeURIComponent(config.tables[table])}`
}

function recordUrl(table: TableKey, recordId: string): string {
  return `${tableUrl(table)}/${recordId}`
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
    year: normalizeString(record.fields.Year),
    location: record.fields.Location,
    assignedPreacherIds: normalizeLinkedIds(record.fields["Assigned Preacher"]),
    collectedByIds: normalizeLinkedIds(record.fields["Collected By"]),
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
  year?: string
  source?: string
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

  if (typeof data.age === "number") {
    fields.Age = data.age
  }
  if (data.year) {
    fields.Year = data.year
  }
  if (data.source) {
    fields.Source = data.source
  }
  if (data.location) {
    fields.Location = data.location.startsWith("rec") ? [data.location] : data.location
  }
  if (data.collectedByAirtableUserId) {
    fields["Collected By"] = [data.collectedByAirtableUserId]
  }
  if (data.assignedPreacherAirtableUserId) {
    fields["Assigned Preacher"] = [data.assignedPreacherAirtableUserId]
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
    publicAttendanceEnabled: record.fields["Public Attendance Enabled"] === true,
    attendanceOpensAt: normalizeString(record.fields["Attendance Opens At"]),
    attendanceClosesAt: normalizeString(record.fields["Attendance Closes At"]),
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

export async function createSession(data: {
  name: string
  sessionDate: string
  preacherAirtableUserId: string
  locationId: string
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

export async function findAttendanceByContactAndSession(contactId: string, sessionId: string): Promise<AttendanceRecord | null> {
  const records = await listRecords<AttendanceFields>("attendance", {
    filterFormula: `AND(FIND('${escapeFormulaString(contactId)}', ARRAYJOIN({Contact})), FIND('${escapeFormulaString(
      sessionId,
    )}', ARRAYJOIN({Session})))`,
    maxRecords: 1,
  })

  return records[0] || null
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
