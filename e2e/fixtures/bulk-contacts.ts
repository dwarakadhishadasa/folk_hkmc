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

/**
 * The seeded staff addresses, per program, from `scripts/fixture-reference-data.mjs`.
 *
 * Imported here rather than re-spelled because `staffEmailFor` has to answer for a
 * program that is not the suite's own, and a constructed string was silently wrong
 * the moment the seeder's convention changed.
 */
import { STAFF_EMAILS } from "../../scripts/fixture-reference-data.mjs"

/**
 * The Chennai locations `bulk-contact-fixtures.mjs` owns.
 *
 * Duplicated from `scripts/fixture-reference-data.mjs` on purpose: this is the
 * fixture client the specs read through, and importing the generator's own pool
 * would let a spec and the thing it is checking agree with each other while
 * disagreeing with the database. `bulk-fixtures.spec.ts` asserts both against the
 * same list, so a change to one and not the other shows up as a failure rather
 * than as a silent pass.
 */
export const BULK_LOCATION_NAMES = [
  "Triplicane Temple",
  "Mylapore Temple",
  "Adyar Temple",
  "Nanganallur Temple",
  "Perungalathur Temple",
  "Koyambedu Temple",
  "Tambaram Temple",
  "Chennai Central Temple",
  "Washermanpet Temple",
  "Royapettah Temple",
] as const

/** The two locations `seed-preview-fixtures.mjs` owns — the other slice of the pool. */
export const PREVIEW_LOCATION_NAMES = ["T. Nagar Temple", "Velachery Temple"] as const

/**
 * The value in `contacts.source` on every row `bulk-contact-fixtures.mjs` creates.
 *
 * ## Why this replaced a name prefix
 *
 * Rows used to be found by `like('preview-fixture-bulk-%')` on `name`, which put a
 * `preview-fixture-` word on every contact an operator reads. `source` is a real
 * column, already this exact string, and is server-owned (`MANAGE_CONTACT_PATCH_KEYS`)
 * so nothing can drift it. `contacts.name` itself has no uniqueness constraint and
 * no marker, so the grid now shows `Rukmini Devi` and nothing else.
 *
 * A spec that selects generated rows must therefore use `.eq("source", BULK_TAG)`.
 */
export const BULK_TAG = "preview-fixture-bulk"

/**
 * The `source` a **spec-created** row carries.
 *
 * Suffix-distinct from `BULK_TAG` on purpose: the cleanup helper deletes rows whose
 * `source` starts with `BULK_TAG`, which is how it keeps a spec from deleting a row
 * it does not own. If a spec-created row carried the bare marker, that check would
 * accept it and the guard would prove nothing — the helper would be deleting the
 * very rows it exists to refuse.
 */
export const BULK_SPEC_SOURCE = `${BULK_TAG}-spec-created`

/**
 * The preview seeder's contact-name prefix, which it still uses.
 *
 * Its two fixed contacts, two sessions and their attendance keep the tag: they are
 * addressed by name throughout the `manage-contacts` suite, and a rename there
 * would rewrite a dozen specs for two rows of fixture. The bulk set does not, and
 * the bulk set is the one an operator scrolls through.
 */
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
      .eq("source", BULK_TAG)
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

/**
 * Every contact in the program, seeded and bulk alike.
 *
 * The set a program-scoped roster resolves, so a spec can compute what a
 * roster SHOULD hold rather than naming rows it hopes still exist. Paged,
 * because PostgREST caps a single response and `pnpm seed:bulk-full` creates
 * more than a cap's worth of contacts.
 */
export async function listProgramContacts(program: string = e2eProgramId()): Promise<BulkContact[]> {
  return collectPaged<BulkContact>(() =>
    bulkFixtureClient()
      .from("contacts")
      .select(BULK_CONTACT_COLUMNS)
      .eq("program_id", program)
      .order("id", { ascending: true }),
  )
}

/**
 * The rows the generator created, from its own Chennai pool.
 *
 * Located by name rather than by prefix: the generator's locations carry plain
 * names now, and the pool is disjoint from the preview seeder's two, so the names
 * are an unambiguous discriminator on their own. `locations` has no uniqueness
 * constraint, which is why the disjointness is a real requirement rather than a
 * convenience — two rows may legitimately share a name.
 */
export async function listBulkLocations(program: string = e2eProgramId()): Promise<BulkLocation[]> {
  return collectPaged<BulkLocation>(() =>
    bulkFixtureClient()
      .from("locations")
      .select("id,program_id,name,status")
      .eq("program_id", program)
      .in("name", BULK_LOCATION_NAMES)
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
  // Another programme's address, spelled from the same table `fixtureEmail` reads
  // so the two cannot drift. A constructed string here was correct only while the
  // seeder used one convention; it stopped being correct the moment that changed,
  // and the symptom was a DW-3 refusal naming an address no auth user has.
  const other = STAFF_EMAILS[program]
  if (!other) {
    throw new Error(
      `No fixture email for ${role} in program "${program}". Add it to STAFF_EMAILS in ` +
        `scripts/fixture-reference-data.mjs.`,
    )
  }
  return other[role === "preacher" ? "Preacher" : "Admin"]
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

/**
 * The tag `manage-contacts-row-lifecycle.spec.ts` puts on a contact it created
 * itself.
 *
 * Deliberately **not** `BULK_TAG`: the generated set's invariants (one row with a
 * blank phone, every row assigned to the program's Preacher or Admin, every
 * name distinct) are asserted by `bulk-fixtures.spec.ts` and re-asserted by the
 * generator on the next run, so a spec's leftover row must not land inside that
 * set. Its own tag gives `cleanupRowLifecycleContacts` the same "refuse anything
 * you did not create" guarantee `cleanupTaggedContacts` gives.
 */
export const ROW_LIFECYCLE_TAG = "preview-fixture-rowlife-"

// ---------------------------------------------------------------------------
// Row-lifecycle fixtures
// ---------------------------------------------------------------------------

/**
 * A phone that is unique per program and cannot collide with the generator's
 * `PHONE_PREFIX` range or the seeder's `9000000001-4`.
 *
 * `contacts.phone` is `NOT NULL` and `UNIQUE (phone, program_id)`, so a spec
 * that creates a record needs a phone it owns, and a second spec in the same run
 * needs a different one.
 */
export function rowLifecyclePhone(runId: string, index: number): string {
  const suffix = `${runId.replace(/[^0-9a-z]/gi, "").slice(-6)}${String(index).padStart(2, "0")}`
  return `7${suffix}`.slice(0, 15)
}

/**
 * Insert one contact this suite owns, bypassing the app.
 *
 * Used by the delete cases, which need a row that exists and can therefore be
 * removed — deleting a row the suite did not create would break the shared
 * fixtures every other spec reads.
 */
export async function createRowLifecycleContact(params: {
  name: string
  phone: string
  program?: string
  assignedPreacherId?: string | null
}): Promise<{ id: string; name: string }> {
  const program = params.program ?? e2eProgramId()
  const assignedPreacherId =
    params.assignedPreacherId === undefined ? await adminId(program) : params.assignedPreacherId

  const { data, error } = await bulkFixtureClient()
    .from("contacts")
    .insert({
      program_id: program,
      name: params.name,
      phone: params.phone,
      location_ids: [],
      assigned_preacher_id: assignedPreacherId,
      collected_by_id: null,
      notes: null,
      is_favorite: false,
      books_read: [],
      source: null,
    })
    .select("id,name")
    .single()

  if (error) throw new Error(`Creating the row-lifecycle contact failed: ${error.message}`)
  return { id: data.id as string, name: data.name as string }
}

/**
 * Delete the contacts a spec created itself, in the same test.
 *
 * Same contract as `cleanupTaggedContacts`, different tag: ids are **checked
 * against the tag before anything is deleted**, and the helper throws naming the
 * offending ids rather than removing a row another spec owns. A missing id is
 * not an error — a `finally` re-runs after a successful delete.
 *
 * Returns the ids actually deleted, so a caller can assert the cleanup did
 * something rather than silently matching nothing.
 */
export async function cleanupRowLifecycleContacts(ids: readonly string[]): Promise<string[]> {
  if (ids.length === 0) return []

  const db = bulkFixtureClient()

  const { data: rows, error: readError } = await db.from("contacts").select("id,name").in("id", [...ids])
  if (readError) throw new Error(`Reading the ${ids.length} contact(s) to clean up failed: ${readError.message}`)

  const found = new Map((rows ?? []).map((row) => [row.id as string, row.name as string]))
  const untagged = ids
    .filter((id) => {
      const name = found.get(id)
      return name !== undefined && !name.startsWith(ROW_LIFECYCLE_TAG)
    })
    .map((id) => `${id} (${found.get(id)})`)

  if (untagged.length) {
    throw new Error(
      `cleanupRowLifecycleContacts refuses to delete ${untagged.length} untagged contact(s): ${untagged.join(", ")}. ` +
        `It only removes rows whose name starts with "${ROW_LIFECYCLE_TAG}".`,
    )
  }

  const present = ids.filter((id) => found.has(id))
  if (present.length === 0) return []

  const { data, error } = await db.from("contacts").delete().in("id", present).select("id")
  if (error) throw new Error(`Cleaning up ${present.length} row-lifecycle contact(s) failed: ${error.message}`)
  return (data as Array<{ id: string }> | null)?.map((row) => row.id) ?? []
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
 * `pnpm seed:bulk-local --wipe`, which selects on `source` in the same way.
 *
 * Returns the ids actually deleted, so a caller can assert the delete did
 * something rather than silently matching nothing.
 */
export async function cleanupTaggedContacts(ids: readonly string[]): Promise<string[]> {
  if (ids.length === 0) return []

  const db = bulkFixtureClient()

  // CHANGED 2026-10-13: ownership is read from `source`, not from a name prefix.
  // The guard is the same guarantee — "never deletes a row this suite does not
  // own" — and it had to move with the wipe, because a generated name is now
  // `Rukmini Devi` and a prefix test would refuse every row it is meant to clean.
  const { data: rows, error: readError } = await db
    .from("contacts")
    .select("id,name,source")
    .in("id", [...ids])
  if (readError) throw new Error(`Reading the ${ids.length} contact(s) to clean up failed: ${readError.message}`)

  const found = new Map((rows ?? []).map((row) => [row.id as string, row]))
  const untagged = ids
    .filter((id) => {
      const row = found.get(id)
      return row !== undefined && !String(row.source ?? "").startsWith(BULK_TAG)
    })
    .map((id) => `${id} (${found.get(id)?.name})`)

  if (untagged.length) {
    throw new Error(
      `cleanupTaggedContacts refuses to delete ${untagged.length} contact(s) it does not own: ${untagged.join(", ")}. ` +
        `It only removes rows whose source starts with "${BULK_TAG}".`,
    )
  }

  const present = ids.filter((id) => found.has(id))
  if (present.length === 0) return []

  const { data, error } = await db.from("contacts").delete().in("id", present).select("id")
  if (error) throw new Error(`Cleaning up ${present.length} tagged contact(s) failed: ${error.message}`)
  return (data as Array<{ id: string }> | null)?.map((row) => row.id) ?? []
}
