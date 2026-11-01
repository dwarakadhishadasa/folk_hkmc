/**
 * Sessions fixtures — disposable rows a spec owns and removes.
 *
 * The seed holds exactly one open session and one out-of-scope session, so
 * every status, report total and attendee history a Sessions spec needs is
 * created here. Names carry a per-run tag so two runs (or a leftover from a
 * failed one) cannot collide, and teardown deletes attendance before sessions
 * because the FK holds no cascade.
 *
 * Writes go through the service role against the local stack only. The URL is
 * asserted loopback and the key is required; a silently skipped fixture would
 * make a status assertion pass against somebody else's rows.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { isLocalSupabaseUrl } from "../../scripts/local-supabase-target.mjs"
import { readEnvValue } from "./auth-users"
import { e2eProgramId, fixtureEmail, type E2ERole } from "./roles"

export function sessionsFixtureClient(): SupabaseClient {
  const serviceRoleKey = readEnvValue("SUPABASE_SERVICE_ROLE_KEY")
  const supabaseUrl = readEnvValue("SUPABASE_URL") ?? readEnvValue("NEXT_PUBLIC_SUPABASE_URL")

  if (!serviceRoleKey || !supabaseUrl) {
    throw new Error(
      "Cannot own a sessions fixture: SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL are missing. " +
        "Run `pnpm supabase:env` to write the local credentials into apps/folk/.env.local, or export them.",
    )
  }

  if (!isLocalSupabaseUrl(supabaseUrl)) {
    throw new Error(`Refusing sessions fixtures against a non-local Supabase URL: ${supabaseUrl}`)
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export interface FixtureStaff {
  id: string
  email: string
  name: string | null
  role: string
  locationIds: string[]
  assignedPreacherId: string | null
}

export interface FixtureLocation {
  id: string
  name: string
}

export interface FixtureContact {
  id: string
  name: string
  phone: string
}

export interface FixtureSession {
  id: string
  name: string
}

export function sessionRunTag(prefix = "e2e-sessions"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

function fail(label: string, error: { message: string } | null): never {
  throw new Error(`${label} failed: ${error?.message ?? "unknown error"}`)
}

/** The staff row behind a seeded role, read by its fixture address. */
export async function readFixtureStaff(client: SupabaseClient, role: E2ERole): Promise<FixtureStaff> {
  const { data, error } = await client
    .from("users")
    .select("id,email,name,role,location_ids,assigned_preacher_id")
    .eq("program_id", e2eProgramId())
    .eq("email", fixtureEmail(role))
    .single()

  if (error || !data) {
    fail(`reading the ${role} fixture staff`, error)
  }

  return {
    id: data.id as string,
    email: data.email as string,
    name: (data.name as string | null) ?? null,
    role: data.role as string,
    locationIds: (data.location_ids as string[] | null) ?? [],
    assignedPreacherId: (data.assigned_preacher_id as string | null) ?? null,
  }
}

export async function readFixtureLocations(client: SupabaseClient): Promise<FixtureLocation[]> {
  const { data, error } = await client
    .from("locations")
    .select("id,name")
    .eq("program_id", e2eProgramId())
    .order("name", { ascending: true })

  if (error || !data || data.length === 0) {
    fail("reading fixture locations", error)
  }

  return data.map((row) => ({ id: row.id as string, name: row.name as string }))
}

/** A location no session carries, for the filter-empty state. */
export async function createLocationFixture(client: SupabaseClient, name: string): Promise<FixtureLocation> {
  const { data, error } = await client
    .from("locations")
    .insert({ program_id: e2eProgramId(), name, status: "Active" })
    .select("id,name")
    .single()

  if (error || !data) {
    fail(`creating location ${name}`, error)
  }

  return { id: data.id as string, name: data.name as string }
}

export async function deleteLocationFixture(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from("locations").delete().eq("id", id)
  if (error) {
    fail(`deleting location ${id}`, error)
  }
}

export async function createContactFixture(
  client: SupabaseClient,
  input: {
    name: string
    phone: string
    locationId?: string
    assignedPreacherId?: string
  },
): Promise<FixtureContact> {
  const { data, error } = await client
    .from("contacts")
    .insert({
      program_id: e2eProgramId(),
      name: input.name,
      phone: input.phone,
      location_ids: input.locationId ? [input.locationId] : [],
      assigned_preacher_id: input.assignedPreacherId ?? null,
      initial_contact: "2025-09-14",
      source: "e2e-sessions",
    })
    .select("id,name,phone")
    .single()

  if (error || !data) {
    fail(`creating contact ${input.name}`, error)
  }

  return { id: data.id as string, name: data.name as string, phone: data.phone as string }
}

export async function deleteContactFixtures(client: SupabaseClient, ids: string[]): Promise<void> {
  if (ids.length === 0) {
    return
  }

  const { error } = await client.from("contacts").delete().in("id", ids)
  if (error) {
    fail("deleting contacts", error)
  }
}

export async function createSessionFixture(
  client: SupabaseClient,
  input: {
    name: string
    opensAt: string
    closesAt: string
    sessionDate: string
    durationMinutes?: number
    locationId?: string
    preacherId?: string | null
    createdBy: string
    publicAttendanceEnabled?: boolean
    programId?: string
  },
): Promise<FixtureSession> {
  const { data, error } = await client
    .from("sessions")
    .insert({
      program_id: input.programId ?? e2eProgramId(),
      name: input.name,
      session_date: input.sessionDate,
      preacher_id: input.preacherId ?? null,
      location_id: input.locationId ?? null,
      public_attendance_enabled: input.publicAttendanceEnabled ?? true,
      attendance_opens_at: input.opensAt,
      attendance_closes_at: input.closesAt,
      duration_minutes: input.durationMinutes ?? 60,
      created_by: input.createdBy,
    })
    .select("id,name")
    .single()

  if (error || !data) {
    fail(`creating session ${input.name}`, error)
  }

  return { id: data.id as string, name: data.name as string }
}

export async function addAttendanceFixture(
  client: SupabaseClient,
  input: {
    sessionId: string
    contact: FixtureContact
    createdAt?: string
  },
): Promise<void> {
  const { error } = await client.from("attendance").insert({
    program_id: e2eProgramId(),
    contact_id: input.contact.id,
    session_id: input.sessionId,
    phone: input.contact.phone,
    name: input.contact.name,
    ...(input.createdAt ? { created_at: input.createdAt } : {}),
  })

  if (error) {
    fail(`adding attendance for ${input.contact.name}`, error)
  }
}

/** Attendance first: the FK from `attendance.session_id` has no cascade. */
export async function deleteSessionFixtures(client: SupabaseClient, ids: string[]): Promise<void> {
  if (ids.length === 0) {
    return
  }

  const attendance = await client.from("attendance").delete().in("session_id", ids)
  if (attendance.error) {
    fail("deleting attendance for fixture sessions", attendance.error)
  }

  const sessions = await client.from("sessions").delete().in("id", ids)
  if (sessions.error) {
    fail("deleting fixture sessions", sessions.error)
  }
}

export function isoDaysFromNow(days: number, now = new Date()): string {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString()
}

/** Today's `YYYY-MM-DD` on the programme's clock. */
export function programDateToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(now)
}

export function addDays(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number)
  return new Date(Date.UTC(year!, month! - 1, day! + days)).toISOString().slice(0, 10)
}
