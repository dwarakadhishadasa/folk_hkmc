/**
 * The bulk-fixture selectors, in one place.
 *
 * `scripts/bulk-contact-fixtures.mjs` (`pnpm seed:bulk-local`) writes the row
 * volume `matrix-coverage-map.md` says 16 of story 2's 19 rows need. This module
 * is how a spec *reads* those rows back: the shared shapes story 4's rows select
 * from, and the cleanup helper a spec uses on a row it created itself.
 *
 * Credentials come from `readEnvValue` (process env first, then
 * `apps/folk/.env.local`) and the target is checked with the repo's own loopback
 * predicate. Both failures **throw** rather than degrade: a mis-pointed stack or a
 * missing key that silently yields an empty result set is a false green — the
 * worst possible outcome for a fixture reader, because every assertion built on it
 * would pass against the wrong database.
 */

import path from "node:path"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { isLocalSupabaseUrl } from "../../scripts/local-supabase-target.mjs"
import { readEnvValue } from "./auth-users"
import { e2eProgramId, fixtureEmail, repoRoot } from "./roles"

/** The tag `bulk-contact-fixtures.mjs` puts on every row it creates. */
export const BULK_TAG = "preview-fixture-bulk-"
/** The seeder's tag. A prefix of it, so the seeder's `--wipe` covers bulk rows. */
export const SEEDER_TAG = "preview-fixture-"

/**
 * The generator, as `pnpm seed:bulk-local` runs it.
 *
 * Exported so `global-setup.ts` and `bulk-fixtures.spec.ts` spawn the *same* path
 * this module documents. Two copies of an absolute path are two things to keep in
 * step, and a stale one would leave a spec asserting against a script the suite
 * never runs.
 */
export const GENERATOR = path.join(repoRoot, "scripts", "bulk-contact-fixtures.mjs")

/**
 * The hosted project the whole toolchain refuses to touch. Named here so the
 * refusal rows in `bulk-fixtures.spec.ts` and the provenance check in
 * `auth-users.ts` cannot drift onto different hosts.
 */
export const HOSTED_SUPABASE_URL = "https://etwunirahuucodcxydgs.supabase.co"

const PAGE_SIZE = 1000

/** The columns the grid reads, mirrored from `lib/supabase/manage.ts`'s `CONTACT_COLUMNS`. */
export const BULK_CONTACT_COLUMNS =
  "id,program_id,name,phone,location_ids,assigned_preacher_id,college,company,designation,notes,is_favorite,books_read,source" as const

export interface BulkContact {
  id: string
  program_id: string
  name: string
  phone: string
  location_ids: string[] | null
  assigned_preacher_id: string | null
  college: string | null
  company: string | null
  designation: string | null
  notes: string | null
  is_favorite: boolean | null
  books_read: string[] | null
  source: string | null
}

export interface BulkLocation {
  id: string
  program_id: string
  name: string
  status: string | null
}

/**
 * One client per suite, built lazily so a spec that never touches bulk fixtures
 * never requires the service-role key to be present.
 */
let cached: { url: string; client: SupabaseClient } | null = null

/**
 * The local service-role target, or a throw naming the fix.
 *
 * Exported separately from the client so a spec can assert the refusal — the
 * whole point of the check — without depending on whether a client has already
 * been cached this run.
 *
 * Throws rather than returning `null`: every selector below would otherwise
 * return an empty set against the wrong stack, and an assertion like "the
 * in-scope set has ≥2 rows" would fail — or worse, a "there are no out-of-scope
 * rows" assertion would pass — for reasons that have nothing to do with the code
 * under test.
 */
export function resolveBulkFixtureTarget(): { url: string; serviceRoleKey: string } {
  const serviceRoleKey = readEnvValue("SUPABASE_SERVICE_ROLE_KEY")
  const supabaseUrl = readEnvValue("SUPABASE_URL") ?? readEnvValue("NEXT_PUBLIC_SUPABASE_URL")

  if (!serviceRoleKey || !supabaseUrl) {
    throw new Error(
      "Cannot read bulk fixtures: SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL are missing. Run `pnpm supabase:env` " +
        "to write the local credentials into apps/folk/.env.local, or export them.",
    )
  }
  if (!isLocalSupabaseUrl(supabaseUrl)) {
    throw new Error(
      `Refusing to read bulk fixtures from "${supabaseUrl}": it is not a loopback address, so these selectors ` +
        "would query the hosted project instead of the local stack.",
    )
  }

  return { url: supabaseUrl, serviceRoleKey }
}

/** The service-role client for the local stack. Constructed after the refusal above. */
export function bulkFixtureClient(): SupabaseClient {
  const { url, serviceRoleKey } = resolveBulkFixtureTarget()

  if (cached?.url === url) return cached.client

  const client = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  cached = { url, client }
  return client
}

/** Every row matching `buildQuery`, paged — PostgREST caps a single response. */
async function collectPaged<T>(buildQuery: () => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }> }): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`Reading bulk fixtures failed: ${error.message}`)
    all.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return all
  }
}

// ---------------------------------------------------------------------------
// Core reads
// ---------------------------------------------------------------------------

/** Every `preview-fixture-bulk-` contact in the program, ordered by name. */
export async function listBulkContacts(program: string = e2eProgramId()): Promise<BulkContact[]> {
  const rows = await collectPaged<BulkContact>(() =>
    bulkFixtureClient()
      .from("contacts")
      .select(BULK_CONTACT_COLUMNS)
      .eq("program_id", program)
      .like("name", `${BULK_TAG}%`)
      .order("name", { ascending: true }),
  )
  return rows
}

/** Every location in the program, seeded and bulk alike. */
export async function listProgramLocations(program: string = e2eProgramId()): Promise<BulkLocation[]> {
  return collectPaged<BulkLocation>(() =>
    bulkFixtureClient().from("locations").select("id,program_id,name,status").eq("program_id", program).order("name"),
  )
}

/** The `preview-fixture-bulk-location-<n>-<program>` rows the generator created. */
export async function listBulkLocations(program: string = e2eProgramId()): Promise<BulkLocation[]> {
  return collectPaged<BulkLocation>(() =>
    bulkFixtureClient()
      .from("locations")
      .select("id,program_id,name,status")
      .eq("program_id", program)
      .like("name", `${BULK_TAG}%`)
      .order("name"),
  )
}

/**
 * The seeded staff address for `role` **in `program`**.
 *
 * The address is derived from `program`, not taken from `fixtureEmail(role)`:
 * that helper is suite-wide, so pairing it with a `program_id` filter would
 * search the folk address inside another program and find nothing — a caller
 * asking about `gita-life` would get a silent `null` and every caller above it
 * would report "run `pnpm seed:local` first" for a seed that is present.
 *
 * The `E2E_<ROLE>_EMAIL` override is honoured only for the suite's own program,
 * since it names one address on one program.
 */
function staffEmailFor(role: "preacher" | "admin", program: string): string {
  if (program === e2eProgramId()) return fixtureEmail(role)
  return `preview-fixture-${role}-${program}@example.com`
}

/** The seeded staff row for a role — `public.users`, not `auth.users`. */
export async function readFixtureStaff(
  role: "preacher" | "admin",
  program: string = e2eProgramId(),
): Promise<{ id: string; email: string; status: string; location_ids: string[] | null } | null> {
  const db = bulkFixtureClient()
  const email = staffEmailFor(role, program)
  const { data, error } = await db
    .from("users")
    .select("id,email,status,location_ids")
    .eq("program_id", program)
    .eq("email", email)
    .maybeSingle()
  if (error) throw new Error(`Reading the ${role} row for ${email} failed: ${error.message}`)
  return data as { id: string; email: string; status: string; location_ids: string[] | null } | null
}

/** The Preacher's `location_ids` — the set a Preacher session can resolve names for. */
export async function readPreacherLocationIds(program: string = e2eProgramId()): Promise<string[]> {
  const staff = await readFixtureStaff("preacher", program)
  if (!staff) throw new Error(`No Preacher row for ${program}. Run \`pnpm seed:local\` first.`)
  return staff.location_ids ?? []
}

// ---------------------------------------------------------------------------
// Shared shapes story 4's rows select from
// ---------------------------------------------------------------------------

/** The seeded Preacher's user id, which is what makes a row in scope for them. */
export async function preacherId(program: string = e2eProgramId()): Promise<string> {
  const staff = await readFixtureStaff("preacher", program)
  if (!staff) throw new Error(`No Preacher row for ${program}. Run \`pnpm seed:local\` first.`)
  return staff.id
}

/** The seeded Admin's user id, which is what makes a row out of the Preacher's scope. */
export async function adminId(program: string = e2eProgramId()): Promise<string> {
  const staff = await readFixtureStaff("admin", program)
  if (!staff) throw new Error(`No Admin row for ${program}. Run \`pnpm seed:local\` first.`)
  return staff.id
}

/**
 * Rows the Preacher's session can see: same program, assigned to the Preacher.
 * This is the set rows 6, 7, 8 and 9 select from.
 */
export async function inScopeContacts(program: string = e2eProgramId()): Promise<BulkContact[]> {
  const [contacts, id] = await Promise.all([listBulkContacts(program), preacherId(program)])
  return contacts.filter((contact) => contact.assigned_preacher_id === id)
}

/**
 * Rows in the program the Preacher's session cannot see: assigned to the Admin.
 * Row 12 and the "zero rows in scope" cases need a non-empty set to filter away.
 */
export async function outOfScopeContacts(program: string = e2eProgramId()): Promise<BulkContact[]> {
  const [contacts, id] = await Promise.all([listBulkContacts(program), adminId(program)])
  return contacts.filter((contact) => contact.assigned_preacher_id === id)
}

/**
 * The one row with a blank phone. `contacts.phone` is `NOT NULL` and
 * `UNIQUE (phone, program_id)`, so the empty string is the only possible
 * "contact with no phone" and exactly one can exist per program.
 */
export async function blankPhoneContact(program: string = e2eProgramId()): Promise<BulkContact | null> {
  const contacts = await listBulkContacts(program)
  return contacts.find((contact) => contact.phone === "") ?? null
}

/** Any row with a phone set — row 4's "empty required field" needs one to edit. */
export async function phoneSetContacts(program: string = e2eProgramId(), limit = 5): Promise<BulkContact[]> {
  const contacts = await listBulkContacts(program)
  return contacts.filter((contact) => contact.phone !== "").slice(0, limit)
}

/** The distinct `name` values in the generated set — row 18's sort input. */
export async function distinctContactNames(program: string = e2eProgramId()): Promise<string[]> {
  const contacts = await listBulkContacts(program)
  return [...new Set(contacts.map((contact) => contact.name))]
}

/**
 * The generated rows grouped by the location they point at, keyed by location
 * *name* — the value the grid's Location column actually renders.
 *
 * Grouping by name rather than id is the point: `manage-contacts-table.tsx` joins
 * `locationNameById.get(id) ?? id`, so a row whose location the Preacher is not
 * scoped to appears under a raw UUID and the per-column filter has nothing to
 * match. A group whose key is not a name is the failure this surfaces.
 */
export async function contactsByLocationName(
  program: string = e2eProgramId(),
): Promise<Array<{ locationId: string; locationName: string; contacts: BulkContact[] }>> {
  const [contacts, locations] = await Promise.all([listBulkContacts(program), listProgramLocations(program)])
  const nameById = new Map(locations.map((location) => [location.id, location.name]))

  const groups = new Map<string, { locationId: string; locationName: string; contacts: BulkContact[] }>()
  for (const contact of contacts) {
    for (const id of contact.location_ids ?? []) {
      const locationName = nameById.get(id) ?? id
      let group = groups.get(id)
      if (!group) {
        group = { locationId: id, locationName, contacts: [] }
        groups.set(id, group)
      }
      group.contacts.push(contact)
    }
  }

  return [...groups.values()].sort((a, b) => b.contacts.length - a.contacts.length)
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/**
 * Delete contacts a spec created itself, in the same test.
 *
 * The ids are **checked against the tag before anything is deleted**, and the
 * helper throws naming the offending ids. A spec handed a seeded row's id by
 * mistake must not be able to remove an untagged row through a helper whose whole
 * contract is that it only ever removes `preview-fixture-bulk-` rows — the
 * seeder's own data is shared with every other spec.
 *
 * Reading the rows first is what makes the tag check possible at all: the delete
 * itself carries no filter, so the ids have to be checked against the tag before
 * any of them is passed to it. A missing id is *not* an error — a spec's `finally`
 * legitimately re-runs the cleanup after a successful delete, and reporting that
 * as a caller bug would make the helper impossible to use defensively.
 *
 * A spec that wants the *shared* generated set leaves it alone: it is removed by
 * `pnpm seed:bulk-local --wipe`, which is tag-scoped in the same way.
 *
 * Returns the ids actually deleted, so a caller can assert the delete did
 * something rather than silently matching nothing.
 */
export async function cleanupTaggedContacts(ids: readonly string[]): Promise<string[]> {
  if (ids.length === 0) return []

  const db = bulkFixtureClient()

  const { data: rows, error: readError } = await db.from("contacts").select("id,name").in("id", [...ids])
  if (readError) throw new Error(`Reading the ${ids.length} contact(s) to clean up failed: ${readError.message}`)

  const found = new Map((rows ?? []).map((row) => [row.id as string, row.name as string]))
  const untagged = ids
    .filter((id) => {
      const name = found.get(id)
      return name !== undefined && !name.startsWith(BULK_TAG)
    })
    .map((id) => `${id} (${found.get(id)})`)

  if (untagged.length) {
    throw new Error(
      `cleanupTaggedContacts refuses to delete ${untagged.length} untagged contact(s): ${untagged.join(", ")}. ` +
        `It only removes rows whose name starts with "${BULK_TAG}".`,
    )
  }

  const present = ids.filter((id) => found.has(id))
  if (present.length === 0) return []

  const { data, error } = await db.from("contacts").delete().in("id", present).select("id")
  if (error) throw new Error(`Cleaning up ${present.length} tagged contact(s) failed: ${error.message}`)
  return (data as Array<{ id: string }> | null)?.map((row) => row.id) ?? []
}
