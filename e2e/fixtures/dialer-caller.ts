/**
 * Disposable caller profiles and assignments for the denial sweep.
 *
 * The caller routes are the first ones in the suite that need a real caller
 * profile and a real assignment. The sweep cannot use a seeded role as its
 * non-owner unless that role actually holds an active profile: otherwise
 * `requireDialerCaller` answers 403 and the no-oracle 404 branch is never
 * reached.
 *
 * The seed has no caller profiles and no campaigns. Every row here is created
 * through the service-role client (which holds INSERT/UPDATE but no DELETE on
 * the dialer tables) and removed through the local stack's SQL endpoint, after
 * the target is asserted loopback.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { createClient } from "@supabase/supabase-js"

import { isLocalSupabaseUrl } from "../../scripts/local-supabase-target.mjs"
import { readEnvValue } from "./auth-users"
import { e2eProgramId } from "./roles"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function resolveLocalServiceRole(): { url: string; serviceRoleKey: string } {
  const serviceRoleKey = readEnvValue("SUPABASE_SERVICE_ROLE_KEY")
  const supabaseUrl = readEnvValue("SUPABASE_URL") ?? readEnvValue("NEXT_PUBLIC_SUPABASE_URL")

  if (!serviceRoleKey || !supabaseUrl) {
    throw new Error(
      "Cannot own a dialer caller fixture: SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL are missing. " +
        "Run `pnpm supabase:env` to write the local credentials into apps/folk/.env.local, or export them.",
    )
  }

  if (!isLocalSupabaseUrl(supabaseUrl)) {
    throw new Error(
      `Refusing to create a dialer caller fixture at "${supabaseUrl}": it is not a loopback address.`,
    )
  }

  return { url: supabaseUrl, serviceRoleKey }
}

let cachedClient: { url: string; client: SupabaseClient } | null = null

export function serviceRoleClient(): SupabaseClient {
  const { url, serviceRoleKey } = resolveLocalServiceRole()

  if (cachedClient?.url === url) {
    return cachedClient.client
  }

  const client = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  cachedClient = { url, client }
  return client
}

async function runLocalSql(query: string): Promise<void> {
  const { url, serviceRoleKey } = resolveLocalServiceRole()
  const response = await fetch(`${url.replace(/\/+$/, "")}/pg/query`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  })

  if (!response.ok) {
    throw new Error(`The dialer caller fixture cleanup failed: ${response.status} ${response.statusText}`)
  }
}

function requireUuid(value: string, what: string): string {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`Refusing to interpolate a non-UUID ${what} into SQL: ${value}`)
  }

  return value
}

/** The seeded staff row for an e2e address. */
export async function fixtureStaffId(email: string): Promise<string> {
  const { data, error } = await serviceRoleClient()
    .from("users")
    .select("id")
    .eq("program_id", e2eProgramId())
    .eq("email", email.trim().toLowerCase())
    .maybeSingle()

  if (error) {
    throw new Error(`Reading the staff row for ${email} failed: ${error.message}`)
  }

  if (!data) {
    throw new Error(`No staff row for ${email} in program "${e2eProgramId()}". Run \`pnpm seed:local\` first.`)
  }

  return (data as { id: string }).id
}

export interface CallerFixture {
  callerId: string
  userId: string
  cleanup: () => Promise<void>
}

/**
 * Give a seeded staff user an active caller profile. A row that already exists
 * is reactivated and restored to its previous state on cleanup; a row this run
 * creates is deleted.
 */
export async function ensureActiveCaller(email: string): Promise<CallerFixture> {
  const client = serviceRoleClient()
  const program = e2eProgramId()
  const userId = await fixtureStaffId(email)

  const { data: existing, error: readError } = await client
    .from("dialer_callers")
    .select("id,is_active,display_name")
    .eq("program_id", program)
    .eq("user_id", userId)
    .maybeSingle()

  if (readError) {
    throw new Error(`Reading the caller profile for ${email} failed: ${readError.message}`)
  }

  if (existing) {
    const row = existing as { id: string; is_active: boolean; display_name: string }

    if (!row.is_active) {
      const { error } = await client.from("dialer_callers").update({ is_active: true }).eq("id", row.id)
      if (error) {
        throw new Error(`Reactivating the caller profile for ${email} failed: ${error.message}`)
      }

      return {
        callerId: row.id,
        userId,
        cleanup: async () => {
          await client.from("dialer_callers").update({ is_active: false }).eq("id", row.id)
        },
      }
    }

    return { callerId: row.id, userId, cleanup: async () => undefined }
  }

  const displayName = email.split("@")[0] ?? email
  const { data: created, error: insertError } = await client
    .from("dialer_callers")
    .insert({ program_id: program, user_id: userId, display_name: displayName, is_active: true })
    .select("id")
    .single()

  if (insertError || !created) {
    throw new Error(`Creating the caller profile for ${email} failed: ${insertError?.message ?? "no row"}`)
  }

  const callerId = (created as { id: string }).id

  return {
    callerId,
    userId,
    cleanup: async () => {
      await runLocalSql(`DELETE FROM public.dialer_callers WHERE id = '${requireUuid(callerId, "caller id")}'`)
    },
  }
}

export interface AssignmentFixture {
  assignmentId: string
  cleanup: () => Promise<void>
}

/** One PENDING assignment for the caller, on a campaign this run owns. */
export async function createCallerAssignment(
  campaignId: string,
  callerId: string,
  contactId: string,
): Promise<AssignmentFixture> {
  const client = serviceRoleClient()
  const { data, error } = await client
    .from("dialer_assignments")
    .insert({
      program_id: e2eProgramId(),
      campaign_id: campaignId,
      caller_id: callerId,
      contact_id: contactId,
      status: "PENDING",
      sort_order: 0,
      assigned_at: new Date().toISOString(),
    })
    .select("id")
    .single()

  if (error || !data) {
    throw new Error(`Creating the caller assignment failed: ${error?.message ?? "no row"}`)
  }

  const assignmentId = (data as { id: string }).id

  return {
    assignmentId,
    cleanup: async () => {
      await runLocalSql(
        `DELETE FROM public.dialer_assignments WHERE id = '${requireUuid(assignmentId, "assignment id")}'`,
      )
    },
  }
}

/** A seeded contact in the program, for an assignment that needs a real parent. */
export async function firstContactId(): Promise<string> {
  const { data, error } = await serviceRoleClient()
    .from("contacts")
    .select("id")
    .eq("program_id", e2eProgramId())
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    throw new Error(`Reading a contact for the caller fixture failed: ${error?.message ?? "no row"}`)
  }

  return (data as { id: string }).id
}
