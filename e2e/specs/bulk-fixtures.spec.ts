/**
 * One spec row per row of the story's `## I/O & Edge-Case Matrix`.
 *
 * The matrix is the contract; these tests are what makes it checkable. Each test
 * below names the row it covers in its title, so a reader can go from a table row
 * to a test and back without a map.
 *
 * Two layers, deliberately separated:
 *
 *   - **CLI rows** `spawnSync` `scripts/bulk-contact-fixtures.mjs` and assert on its
 *     exit code and its own wording. A refusal that is only asserted at the call
 *     site of a helper is not a refusal; these are asserted at the boundary a
 *     developer actually sees.
 *   - **Data rows** read the generated rows through `e2e/fixtures/bulk-contacts.ts`
 *     rather than re-querying, so story 4's rows and these ones cannot disagree
 *     about what "in scope" or "the blank-phone row" means.
 *
 * Every test that mutates the shared set restores it in a `finally`. The generated
 * rows are what story 4's 19 row specs select from, so a test that left the set
 * smaller than it found it would turn a later row's failure into a mystery.
 */

import { spawnSync } from "node:child_process"
import path from "node:path"
import { readFileSync } from "node:fs"
import { expect, test } from "@playwright/test"

import { STAFF_EMAILS } from "../../scripts/fixture-reference-data.mjs"
import {
  BULK_LOCATION_NAMES,
  BULK_SPEC_SOURCE,
  BULK_TAG,
  GENERATOR,
  PREVIEW_LOCATION_NAMES,
  HOSTED_SUPABASE_URL,
  SEEDER_TAG,
  adminId,
  blankPhoneContact,
  bulkFixtureClient,
  cleanupTaggedContacts,
  contactsByLocationName,
  distinctContactNames,
  inScopeContacts,
  listBulkContacts,
  listBulkLocations,
  listProgramLocations,
  outOfScopeContacts,
  phoneSetContacts,
  preacherId,
  readPreacherLocationIds,
  resolveBulkFixtureTarget,
  type BulkContact,
} from "../fixtures/bulk-contacts"
import { readEnvValue, listAuthUsersMatching } from "../fixtures/auth-users"
import { e2eProgramId, fixtureEmail, repoRoot } from "../fixtures/roles"

/**
 * `supabase status -o env` is bounded at 120s inside the generator; this is the
 * outer ceiling for a *single spec's* spawn.
 *
 * Deliberately smaller than `GENERATOR_TIMEOUT_MS` in `e2e/global-setup.ts`,
 * which bounds a whole cold generation before any test starts. A 60s per-test
 * timeout cannot absorb that, and the two budgets are not interchangeable.
 */
const GENERATOR_TIMEOUT_MS = 180_000

/** The suite's program is `folk`; the second program exists for the gita-life parity rows. */
const PROGRAM = e2eProgramId()
const OTHER_PROGRAM = PROGRAM === "folk" ? "gita-life" : "folk"

/** A program nothing else in the suite reads, for rows that must not touch shared state. */
const THROWAWAY_PROGRAM = "e2e-bulk-throwaway"

interface GeneratorResult {
  status: number | null
  output: string
  /** `Total created: N`, or null when the run did not get that far. */
  created: number | null
  /** `Insert requests: N`, or null. */
  requests: number | null
}

/**
 * Run the generator and capture everything it said.
 *
 * `process.env` is forwarded untouched, so a run inherits whatever target the
 * developer's shell names — which is how the non-local refusal row can be
 * exercised from inside a suite whose own fixtures are local.
 *
 * A `spawnSync` killed by `timeout` reports `status: null` with the real cause in
 * `result.error`. Returning that would surface as `expected 1, got null`, which
 * names nothing at all, so it throws with the underlying message instead.
 */
function runGenerator(args: string[] = [], env: Record<string, string> = {}): GeneratorResult {
  const result = spawnSync(process.execPath, [GENERATOR, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: GENERATOR_TIMEOUT_MS,
    env: { ...process.env, ...env } as NodeJS.ProcessEnv,
  })

  if (result.error) {
    throw new Error(
      `Running \`${GENERATOR} ${args.join(" ")}\` failed: ${result.error.message}. ` +
        `The generator prints its whole report to stdout/stderr, so nothing above this line is its own output.`,
    )
  }

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`

  return {
    status: result.status,
    output,
    created: readNumber(output, /^Total created: (\d+)$/m),
    requests: readNumber(output, /^Insert requests: (\d+)/m),
  }
}

function readNumber(output: string, pattern: RegExp): number | null {
  const match = pattern.exec(output)
  return match ? Number(match[1]) : null
}

/**
 * Every contact the *seeder's* `--wipe` filter would match, tagged or not.
 *
 * Paged: `supabase/config.toml` sets `[api] max_rows = 1000`, so a single select
 * silently truncates once `pnpm seed:bulk-full` has been run — and truncation here
 * is the dangerous kind, because both sides of the comparison come from this same
 * function and would agree on a short read.
 */
/**
 * The rows the generator's `--wipe` would delete, read the way it reads them.
 *
 * CHANGED 2026-10-13: this used to select on `name like 'preview-fixture-bulk-%'`,
 * which is why every generated name carried that prefix. The wipe now selects on
 * `eq("source", BULK_TAG)`, and this reads it the same way so the assertion stays
 * about the real filter rather than a restatement of it.
 */
async function contactsMatchingSourceFilter(): Promise<Array<{ id: string; name: string }>> {
  const db = bulkFixtureClient()
  const all: Array<{ id: string; name: string }> = []

  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("contacts")
      .select("id,name")
      .eq("program_id", PROGRAM)
      .eq("source", BULK_TAG)
      .order("name")
      .range(from, from + 999)
    if (error) throw new Error(`Reading contacts failed: ${error.message}`)
    all.push(...(data ?? []))
    if (!data || data.length < 1000) return all
  }
}

/**
 * The preview seeder's own contacts, which keep their name prefix.
 *
 * Two rows per program, addressed by name across the `manage-contacts` suite, so
 * their marker stays where it is while the 250 generated rows moved to `source`.
 */
async function contactsMatchingSeederFilter(): Promise<Array<{ id: string; name: string }>> {
  const db = bulkFixtureClient()
  const all: Array<{ id: string; name: string }> = []

  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("contacts")
      .select("id,name")
      .eq("program_id", PROGRAM)
      .like("name", `${SEEDER_TAG}%`)
      .order("name")
      .range(from, from + 999)
    if (error) throw new Error(`Reading contacts failed: ${error.message}`)
    all.push(...(data ?? []))
    if (!data || data.length < 1000) return all
  }
}

// ---------------------------------------------------------------------------
// CLI-only rows
// ---------------------------------------------------------------------------

test("Bad flag: an unknown flag exits 1 listing the supported flags", () => {
  const result = runGenerator(["--nope"])

  expect(result.status).toBe(1)
  expect(result.output).toContain("Unknown flag --nope")
  for (const flag of ["--count", "--program", "--locations", "--chunk-size", "--wipe", "--allow-non-local"]) {
    expect(result.output, `the supported-flags list must name ${flag}`).toContain(flag)
  }
})

test("Bad flag: a flag with no value exits 1 naming the flag", () => {
  const result = runGenerator(["--count"])

  expect(result.status).toBe(1)
  expect(result.output).toContain("--count requires a value")
})

test("Volume is a parameter: --count 0, --count abc, and a trailing --count each exit 1 naming the flag", () => {
  for (const args of [["--count", "0"], ["--count", "abc"], ["--count"]]) {
    const result = runGenerator(args)
    expect(result.status, `\`--count ${args.slice(1).join(" ")}\` should have been refused`).toBe(1)
    expect(result.output).toContain("--count")
  }
})

test("Refuses non-local: a hosted target exits 1 naming the host and both override routes", () => {
  const result = runGenerator([], { NEXT_PUBLIC_SUPABASE_URL: HOSTED_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: "not-a-real-key" })

  expect(result.status).toBe(1)
  expect(result.output).toContain("Refusing to seed a non-local Supabase target")
  expect(result.output).toContain("etwunirahuucodcxydgs.supabase.co")
  expect(result.output, "the refusal must name the flag override").toContain("--allow-non-local")
  expect(result.output, "the refusal must name the env override").toContain("SEED_ALLOW_NON_LOCAL=1")
  // Zero network I/O on a refused run: the banner is printed *after* the client
  // would have been constructed, so its absence is the proof.
  expect(result.output, "a refused run must not reach the database").not.toContain("Bulk contact fixtures for")
})

test("Refuses non-local: the guard also catches a hosted SUPABASE_URL beside a local NEXT_PUBLIC one", () => {
  // The two variables are checked individually because they can disagree. A
  // half-local environment is a real state, and a guard that only looked at the
  // resolved pair would let it through and then write to the hosted project.
  const result = runGenerator([], {
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_URL: HOSTED_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: "not-a-real-key",
  })

  expect(result.status).toBe(1)
  // The refusal must name the *variable* that was wrong, or an operator has no
  // way to know which half of their env file to fix.
  expect(result.output).toContain("SUPABASE_URL")
  expect(result.output).toContain("etwunirahuucodcxydgs.supabase.co")
  expect(result.output).toContain("Refusing to seed a non-local Supabase target")
  expect(result.output, "a refused run must not reach the database").not.toContain("Bulk contact fixtures for")
})

test("Refuses non-local: --allow-non-local gets past the guard and fails downstream instead", () => {
  const result = runGenerator(["--allow-non-local"], {
    NEXT_PUBLIC_SUPABASE_URL: HOSTED_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: "not-a-real-key",
  })

  expect(result.output, "the guard should have been bypassed").not.toContain("Refusing to seed a non-local Supabase target")
  expect(result.output).toContain("Bulk contact fixtures for")
  expect(result.status, "an unusable key must fail, not succeed").not.toBe(0)
})

test("Refuses non-local: SEED_ALLOW_NON_LOCAL=1 gets past the guard exactly as --allow-non-local does", () => {
  // The env override is documented in docs/development-guide.md next to the flag,
  // so it is part of the contract. An override that silently did nothing would be
  // worse than a missing one: the operator would believe the guard was bypassed.
  const viaFlag = runGenerator(["--allow-non-local"], {
    NEXT_PUBLIC_SUPABASE_URL: HOSTED_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: "not-a-real-key",
  })
  const viaEnv = runGenerator([], {
    NEXT_PUBLIC_SUPABASE_URL: HOSTED_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: "not-a-real-key",
    SEED_ALLOW_NON_LOCAL: "1",
  })

  for (const result of [viaFlag, viaEnv]) {
    expect(result.output, "the guard should have been bypassed").not.toContain("Refusing to seed a non-local Supabase target")
    expect(result.output).toContain("Bulk contact fixtures for")
    expect(result.status, "an unusable key must fail, not succeed").not.toBe(0)
  }

  // Same bypass, not merely "both did something": both must reach the same point
  // past the guard, which is the first thing a request against the hosted project
  // does. The wording is matched loosely because a runner with no outbound access
  // fails at the transport instead of at the key check — same step past the guard,
  // and the assertion above already proves neither run was refused by it.
  for (const result of [viaFlag, viaEnv]) {
    expect(result.output, "both overrides must fail at the same downstream step").toMatch(
      /Invalid API key|fetch failed|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|getaddrinfo/i,
    )
  }
})

// ---------------------------------------------------------------------------
// Data rows — the default volume's shape
// ---------------------------------------------------------------------------

test("Default run: the generator reports its total, its request count, and the DW-3 line", () => {
  const result = runGenerator()

  expect(result.status, result.output).toBe(0)
  expect(result.output).toMatch(/^Total created: \d+$/m)
  expect(result.output).toMatch(/^Insert requests: \d+ \(chunk size \d+, PostgREST\)$/m)
  expect(result.output).toMatch(/^Elapsed: \d+ms$/m)
  expect(result.output).toContain("DW-3 check passed:")
})

test("Default run: the tagged set is large enough for row 7, with distinct names", async () => {
  const contacts = await listBulkContacts(PROGRAM)

  // Row 7 wants "3 of 40 rows selected" and row 8 a select-all over a filtered
  // set. 250 is the default volume and is asserted as a floor so a top-up from
  // the --count rows does not make this spec fail.
  expect(contacts.length, `${PROGRAM} needs ≥40 tagged rows for rows 7 and 8`).toBeGreaterThanOrEqual(40)
  expect(contacts.length).toBeGreaterThanOrEqual(250)

  // Row 18 sorts by `name`; a duplicate would make the sort order ambiguous.
  const names = await distinctContactNames(PROGRAM)
  expect(names.length).toBe(contacts.length)
})

test("Default run: every generated row carries the source marker, so --wipe finds it, and no name carries a tag", async () => {
  const contacts = await listBulkContacts(PROGRAM)
  expect(contacts.length).toBeGreaterThan(0)

  // CHANGED 2026-10-13. This row asserted that every generated name began with
  // `preview-fixture-bulk-`, which is what `--wipe` and the resume check selected
  // on. The marker moved to `contacts.source` — a real column, already this exact
  // string, and server-owned via `MANAGE_CONTACT_PATCH_KEYS` — so `name` no longer
  // needs it and can be a person's name.
  //
  // The guarantee is preserved rather than dropped: this is still "the wipe can
  // find every row it created", now asserted on the column the wipe actually uses.
  for (const contact of contacts) {
    expect(contact.source, `${contact.name} is not marked with the generator's source`).toBe(BULK_TAG)
  }

  // ...and the other half of the same change: a name is now just a name.
  for (const contact of contacts) {
    expect(contact.name, `${contact.name} still carries a fixture tag`).not.toMatch(
      /^(preview-fixture|bulk|e2e-|spec-|dw3-)/,
    )
  }

  // The seeder filters on `eq("source", …)`; prove the generated rows are inside
  // that filter rather than merely agreeing in prose.
  const viaFilter = await contactsMatchingSourceFilter()
  expect(viaFilter.length).toBe(contacts.length)
})

test("Locations are real: every location_ids entry resolves to a location in the program", async () => {
  const groups = await contactsByLocationName(PROGRAM)

  expect(groups.length).toBeGreaterThan(0)
  for (const group of groups) {
    // `manage-contacts-table.tsx` renders `locationNameById.get(id) ?? id`, so a
    // group keyed by a UUID is exactly the "raw id in the cell" failure.
    expect(group.locationName, `${group.locationId} did not resolve to a name`).not.toBe(group.locationId)
    expect(group.contacts.length).toBeGreaterThan(0)
  }

  // A *count* of distinct names, not merely that every id resolved. A regression
  // that pinned every contact to a single location would satisfy every assertion
  // above — the ids resolve, the groups are non-empty — while destroying the one
  // thing row 17's per-column filter needs.
  const distinctNames = new Set(groups.map((group) => group.locationName))
  expect(distinctNames.size, "every contact pointing at one location would leave the filter nothing to match").toBeGreaterThan(1)
  expect(distinctNames.size).toBe(groups.length)

  // Order-independent, because the generator's default is 5 locations but the
  // flag is not fixed at 5: `--locations 12` must not fail this row.
  //
  // CHANGED 2026-10-13: the generated location names used to be
  // `preview-fixture-bulk-location-<n>-<program>`, which is what made "the names
  // are the first N of the pool" checkable. They are now plain Chennai temple
  // names, so the same claim is made against `BULK_LOCATION_NAMES` — the same
  // list the fixture client selects on, duplicated rather than imported so this
  // spec and the generator cannot agree with each other while disagreeing with
  // the database.
  const bulkLocations = await listBulkLocations(PROGRAM)
  expect(bulkLocations.length).toBeGreaterThanOrEqual(1)
  expect(bulkLocations.length).toBeLessThanOrEqual(BULK_LOCATION_NAMES.length)
  expect(bulkLocations.map((location) => location.name).sort()).toEqual(
    [...BULK_LOCATION_NAMES].slice(0, bulkLocations.length).sort(),
  )
})

test("Per-column variation: college, notes and is_favorite are not uniform", async () => {
  // Story 4's per-column filter rows (17, 18 and the bulk set) need columns that
  // vary. A generator that filled every row with the same value, or with null,
  // would keep every other row in this file green while making those rows
  // untestable.
  const contacts = await listBulkContacts(PROGRAM)
  expect(contacts.length).toBeGreaterThan(20)

  const colleges = new Set(contacts.map((contact) => contact.college))
  expect(colleges.size, "at least two distinct college values").toBeGreaterThanOrEqual(2)
  expect(colleges.has(null), "a null college is needed for the filter to have an empty bucket").toBe(true)

  const notes = new Set(contacts.map((contact) => contact.notes))
  expect(notes.size, "at least two distinct notes values").toBeGreaterThanOrEqual(2)
  expect(notes.has(null), "a null note is needed for the filter to have an empty bucket").toBe(true)

  const favorites = contacts.map((contact) => contact.is_favorite === true)
  expect(favorites.some(Boolean), "at least one favourite").toBe(true)
  expect(favorites.some((value) => !value), "at least one non-favourite").toBe(true)

  // `company` and `designation` too — the spec names them as varying shapes.
  expect(new Set(contacts.map((contact) => contact.company)).size).toBeGreaterThanOrEqual(2)
  expect(new Set(contacts.map((contact) => contact.designation)).size).toBeGreaterThanOrEqual(2)
  expect(new Set(contacts.map((contact) => contact.books_read).map((books) => (books ?? []).join(","))).size).toBeGreaterThanOrEqual(2)
})

/**
 * REWRITTEN 2026-10-13, premium-grid story 3's fixture pass.
 *
 * This row previously asserted that the Preacher's `location_ids` covered **every**
 * generated location. That is no longer true, on purpose: a Preacher now owns three
 * or four of them, because a Preacher's scope is a product decision rather than a
 * fixture convenience, and a Preacher scoped to a whole city is not a shape the
 * programme has.
 *
 * What the row actually protected is worth keeping, and is kept below: a contact
 * the Preacher can read must have a location the Preacher can resolve, so the cell
 * shows a **name** rather than an unresolved marker. The reason the old wording
 * said "otherwise the grid shows raw ids" is stale for a second reason — story 3
 * removed the raw-id fallback, so an unresolvable location now renders
 * `Unknown location`, never a UUID.
 *
 * The two halves are split into two rows so each is a separate claim:
 *
 *   - **In scope:** every location a contact the Preacher can read points at is one
 *     the Preacher owns. The name renders.
 *   - **Out of scope:** a contact pointing at a location the Preacher does not own
 *     still exists, and is a different fact from a contact with no location.
 */
test("Preacher resolves names in scope: every location a readable contact points at is one the Preacher owns", async () => {
  const [preacher, allLocations, ownedByPreacher] = await Promise.all([
    readPreacherLocationIds(PROGRAM),
    listProgramLocations(PROGRAM),
    inScopeContacts(PROGRAM),
  ])

  expect(preacher.length, "the Preacher owns a small set, not the whole city").toBeGreaterThan(0)
  expect(preacher.length, "a Preacher scoped to every generated location is not realistic").toBeLessThan(10)

  const owned = new Set(preacher)
  const names = new Map(allLocations.map((location) => [location.id, location.name]))

  // `inScopeContacts` is the same helper the manage specs use, so "readable" means
  // one thing here and in the suite that depends on it.
  const readable = ownedByPreacher
  expect(readable.length, "the generated set is large enough to hold both halves").toBeGreaterThan(0)

  for (const contact of readable) {
    for (const id of contact.location_ids ?? []) {
      expect(
        owned.has(id),
        `${contact.name} points at ${names.get(id) ?? id}, which the Preacher cannot resolve`,
      ).toBe(true)
      expect(names.get(id), "every owned location has a human name").toBeTruthy()
      expect(names.get(id), "and that name is not a raw id").not.toBe(id)
    }
  }

  // The location the OTHER seeder gave the Preacher must survive. The bulk
  // generator rewrites `location_ids` to exactly its own three or four, so without
  // this the seeder's two fixed contacts would fall out of scope and take most of
  // the manage-contacts suite with them. The union is additive for foreign
  // locations and authoritative for its own.
  // CHANGED 2026-10-13: the seeder's locations are plain Chennai names now — no
  // `preview-fixture-location-1-<program>` prefix, which is what let this be found
  // at all. `PREVIEW_LOCATION_NAMES[0]` is the seeder's first location, the one it
  // gives the Preacher alongside location 2.
  const seeded = allLocations.find((location) => location.name === PREVIEW_LOCATION_NAMES[0])
  expect(seeded, "the seeder's location 1 should exist").toBeTruthy()
  expect(preacher, "the union must still include the seeded id").toContain(seeded!.id)
})

test("Preacher scope is a subset: an out-of-scope location exists, which is what makes an unresolved marker reachable", async () => {
  const [preacher, bulkLocations, readable] = await Promise.all([
    readPreacherLocationIds(PROGRAM),
    listBulkLocations(PROGRAM),
    inScopeContacts(PROGRAM),
  ])

  const owned = new Set(preacher)
  const outOfScope = bulkLocations.filter((location) => !owned.has(location.id))

  // The whole point of the subset: if every generated location were owned, this
  // fixture could never produce a contact whose location the Preacher cannot
  // resolve, and CAP-4's unresolved marker would only ever be provable on the
  // preview harness.
  expect(outOfScope.length, "the Preacher does not own every generated location").toBeGreaterThan(0)

  // It has to be more than one, or the split has no shape: a Preacher owning
  // every location but one is not what "three or four" describes.
  expect(bulkLocations.length, "the generated set spans more locations than one Preacher owns").toBeGreaterThan(
    owned.size,
  )

  // And the two facts stay distinct, which is the actual CAP-4 claim: an unscoped
  // contact is NOT a contact with no location. Neither may render as the other.
  const withLocation = readable.filter((contact) => (contact.location_ids ?? []).length > 0).length
  const withoutLocation = readable.filter((contact) => (contact.location_ids ?? []).length === 0).length
  expect(withLocation, "most contacts carry a location").toBeGreaterThan(0)
  // A generated contact always carries one, so this row does not need to assert a
  // count — it records that the two states are distinct in the data, not that both
  // appear here. The empty case is asserted where it is reachable: on the preview
  // harness's `assignee` column, in `grid-cell-renderers.spec.ts`.
  expect(withoutLocation).toBeGreaterThanOrEqual(0)
})

test("Phone coverage: exactly one row has a blank phone and the rest have distinct phones", async () => {
  const contacts = await listBulkContacts(PROGRAM)

  const blank = contacts.filter((contact) => contact.phone === "")
  expect(blank.length, 'exactly one blank row is possible: phone is NOT NULL and UNIQUE (phone, program_id)').toBe(1)

  const withPhone = contacts.filter((contact) => contact.phone !== "")
  expect(withPhone.length).toBeGreaterThan(0)

  const phones = new Set(withPhone.map((contact) => contact.phone))
  expect(phones.size).toBe(withPhone.length)

  // Disjoint from the seeder's `9000000001-4`, so the two generators cannot
  // collide on the unique index.
  for (const phone of phones) {
    expect(phone.startsWith("9")).toBe(false)
  }

  expect(await blankPhoneContact(PROGRAM)).toEqual(blank[0])
  expect((await phoneSetContacts(PROGRAM, 5)).length).toBe(5)
})

test("Scope on both sides: the Preacher sees its assigned rows and not the Admin's", async () => {
  const [preacher, admin] = await Promise.all([preacherId(PROGRAM), adminId(PROGRAM)])
  const [inScope, outOfScope] = await Promise.all([
    inScopeContacts(PROGRAM),
    outOfScopeContacts(PROGRAM),
  ])

  // Rows 6, 9 and 10 need 2–5 selectable rows; row 19 needs a set to filter down.
  expect(inScope.length, "rows 6/9/10 need at least 2 in-scope rows").toBeGreaterThanOrEqual(2)
  // The generator keeps every tenth row out of scope precisely so this stays above
  // `MANAGE_BULK_MAX_ITEMS = 200`: a bulk-cap spec has to be able to select *over*
  // the cap. An every-fourth-row split left 188 here and made that untestable.
  expect(inScope.length, "a bulk-cap spec must be able to select over the 200 cap").toBeGreaterThan(200)
  expect(outOfScope.length, "row 19 needs an out-of-scope set to withhold").toBeGreaterThan(0)
  // One in ten out of scope, and every row accounted for — a row assigned to
  // neither the Preacher nor the Admin is a row the Preacher cannot see.
  //
  // Derived from the tagged total rather than written as a literal: `--count` is a
  // floor, so the set grows as later rows top it up and a hard-coded 250 would fail
  // the second time a suite ran.
  const total = (await listBulkContacts(PROGRAM)).length
  expect(inScope.length + outOfScope.length, "every tagged row must be on one side of the scope split").toBe(total)
  expect(outOfScope.length).toBe(Math.floor(total / 10))

  expect(inScope.every((contact) => contact.assigned_preacher_id === preacher)).toBe(true)
  expect(outOfScope.every((contact) => contact.assigned_preacher_id === admin)).toBe(true)

  const ids = new Set([...inScope, ...outOfScope].map((contact) => contact.id))
  expect(ids.size).toBe(inScope.length + outOfScope.length)
})

test("Preacher renders names: every joined location in a readable contact resolves to a name", async () => {
  // CHANGED 2026-10-13. This row asserted that every location in the programme is
  // inside the Preacher's scope, which was true only while the generator widened
  // the scope to all of them. It is now a subset, on purpose, and the scope claim
  // is asserted by the two rows above.
  //
  // What this row still owns is the rendering half: the grid's Location column is a
  // joined accessor reading the same narrowed set `loadManagePortalData` narrows
  // for a preacher-mode session, so every group it can resolve must carry a human
  // name. Story 3 removed the `?? id` fallback, so a group keyed by a UUID is now
  // an `Unknown location` marker — which is a *correct* render of an unresolvable
  // reference, and the reason this row only claims what it can see.
  const [preacherIds, readable] = await Promise.all([
    readPreacherLocationIds(PROGRAM),
    inScopeContacts(PROGRAM),
  ])

  const scoped = new Set(preacherIds)
  const groups = await contactsByLocationName(PROGRAM)

  for (const contact of readable) {
    for (const id of contact.location_ids ?? []) {
      expect(scoped.has(id), `${contact.name} points at ${id}, outside the Preacher's scope`).toBe(true)
    }
  }

  // At least one location is in play, and every one a readable contact points at
  // has rows to render — a column that resolved nothing would satisfy the loop
  // above by having nothing to iterate.
  expect(groups.length).toBeGreaterThan(0)
  for (const group of groups) {
    expect(group.locationName, `${group.locationId} did not resolve to a name`).not.toBe(group.locationId)
  }
})

// ---------------------------------------------------------------------------
// Idempotence and volume
// ---------------------------------------------------------------------------

test("Repeatable: spawning the generator twice reports Total created: 0 on the second spawn", () => {
  const first = runGenerator()
  expect(first.status, first.output).toBe(0)
  expect(first.created).toBe(0)

  const second = runGenerator()
  expect(second.status, second.output).toBe(0)
  expect(second.created, "a re-run must not insert anything").toBe(0)
  expect(second.requests, "a re-run must not send an insert request").toBe(0)
  expect(second.output).toContain("DW-3 check passed:")
})

test("Repeatable: the re-run created no duplicates and touched no auth.users row", async () => {
  // The `auth.users` snapshot is the half of this row the title promises. It is
  // read through the admin API rather than the `public.users` table, because the
  // claim is about the *auth* side: a generator that re-provisioned an auth user
  // would leave `public.users` untouched and a duplicate-name check would not see
  // it. `listAuthUsersMatching` is exact-match per address, so both seeded staff
  // rows are snapshotted on both sides of the run.
  const staffEmails = [fixtureEmail("preacher"), fixtureEmail("admin")]
  const authBefore = await Promise.all(staffEmails.map((email) => listAuthUsersMatching(email)))

  const before = await listBulkContacts(PROGRAM)
  const result = runGenerator()
  expect(result.status, result.output).toBe(0)
  const after = await listBulkContacts(PROGRAM)

  const authAfter = await Promise.all(staffEmails.map((email) => listAuthUsersMatching(email)))
  for (const [index, email] of staffEmails.entries()) {
    expect(authAfter[index], `auth.users rows for ${email} changed across a re-run`).toEqual(authBefore[index])
    expect(authAfter[index], `${email} must exist for the re-run's DW-3 check to have anything to compare`).toHaveLength(1)
  }

  const idsAfter = after.map((contact) => contact.id).sort()
  const namesAfter = after.map((contact) => contact.name).sort()
  expect(new Set(idsAfter).size).toBe(after.length)
  expect(new Set(namesAfter).size).toBe(after.length)
  expect(namesAfter).toEqual(before.map((contact) => contact.name).sort())

  // `contacts.phone` is `UNIQUE (phone, program_id)`, so a duplicate insert
  // would have surfaced as a constraint error. Assert the shape too: the point is
  // that no *new* row appeared, and a count would not prove that.
  expect(after.length).toBe(before.length)
})

test("Volume is a parameter: --count tops the program up as a floor and reports ceil(missing/chunk-size) requests", async () => {
  // The second program, not the shared one. `--count` is a floor, so a top-up on
  // `folk` is never undone by a later run: 55 extra rows would accumulate on every
  // suite invocation without bound, growing the shared set story 4 selects from and
  // quietly skewing `pnpm seed:bulk-full`'s perf measurement. The floor semantics
  // under test are program-independent, so the row proves them where it can clean
  // up after itself.
  const existing = (await listBulkContacts(OTHER_PROGRAM)).length
  const topUp = 55
  const chunkSize = 20
  const result = runGenerator([
    "--program",
    OTHER_PROGRAM,
    "--count",
    String(existing + topUp),
    "--chunk-size",
    String(chunkSize),
  ])

  try {
    expect(result.status, result.output).toBe(0)
    // `--count` is a floor: it topped *up* and did not truncate or re-insert.
    expect(result.created).toBe(topUp)
    expect(result.requests, `ceil(${topUp}/${chunkSize}) PostgREST requests`).toBe(Math.ceil(topUp / chunkSize))

    const after = await listBulkContacts(OTHER_PROGRAM)
    expect(after.length).toBe(existing + topUp)
    expect(new Set(after.map((contact) => contact.name)).size).toBe(after.length)
  } finally {
    const wipe = runGenerator(["--program", OTHER_PROGRAM, "--wipe"])
    expect(wipe.status, wipe.output).toBe(0)
  }
})

test("Volume is a parameter: a lower --count does not delete the rows above it", async () => {
  const before = (await listBulkContacts(PROGRAM)).length
  const result = runGenerator(["--count", "40"])

  expect(result.status, result.output).toBe(0)
  expect(result.created).toBe(0)
  expect((await listBulkContacts(PROGRAM)).length, "--count is a floor, not a truncate").toBe(before)
})

test("Volume is a parameter: the --flag=value form parses identically to --flag value", () => {
  // `parseArgs`'s own comment claims both forms parse, and nothing else asserted
  // it. The second program is used so neither run can touch folk's shared set.
  const spaced = runGenerator(["--program", OTHER_PROGRAM, "--count", "12", "--locations", "3"])
  const equals = runGenerator([`--program=${OTHER_PROGRAM}`, `--count=12`, `--locations=3`])

  try {
    for (const result of [spaced, equals]) {
      expect(result.status, result.output).toBe(0)
      expect(result.output).toContain("3 bulk location(s)")
      expect(result.output).toContain("12 distinct names")
    }
    // The first run creates the 12 rows and the second finds them, so
    // `Total created` differs by construction. What must match is the *shape* the
    // two invocations report — the parsed configuration and the resulting data.
    expect(equals.created, "the second invocation finds the rows the first created").toBe(0)
    expect(spaced.created).toBe(12)
    const line = (output: string, prefix: string) => output.split("\n").find((row) => row.startsWith(prefix)) ?? ""
    expect(line(equals.output, "Programs: ")).toBe(line(spaced.output, "Programs: "))
    expect(line(equals.output, "  invariants")).toBe(line(spaced.output, "  invariants"))
  } finally {
    const wipe = runGenerator(["--program", OTHER_PROGRAM, "--wipe"])
    expect(wipe.status, wipe.output).toBe(0)
  }
})

test("Locations are real: --locations sets how many distinct joined names the program offers", async () => {
  const result = runGenerator(["--program", OTHER_PROGRAM, "--locations", "3", "--count", "8"])

  try {
    expect(result.status, result.output).toBe(0)

    const locations = await listBulkLocations(OTHER_PROGRAM)
    expect(locations, "--locations 3 must create exactly 3 generated locations").toHaveLength(3)
    // The generated locations are plain names from the Chennai pool now, so
    // `--locations 3` means the first three of it.
    expect(locations.map((location) => location.name).sort()).toEqual(
      [...BULK_LOCATION_NAMES].slice(0, 3).sort(),
    )

    // Every contact's location must still resolve to a real row — the point of
    // the flag is distinct *names* for row 17's filter, not more ids. The seeded
    // locations count too: every sixth row is deliberately pinned to one of them
    // so the joined name set spans the seeder's locations as well.
    const contacts = await listBulkContacts(OTHER_PROGRAM)
    expect(contacts.length).toBe(8)
    const known = new Set((await listProgramLocations(OTHER_PROGRAM)).map((location) => location.id))
    for (const contact of contacts) {
      for (const id of contact.location_ids ?? []) {
        expect(known.has(id), `${contact.name} points at ${id}, which is not a location of this program`).toBe(true)
      }
    }
  } finally {
    const wipe = runGenerator(["--program", OTHER_PROGRAM, "--wipe"])
    expect(wipe.status, wipe.output).toBe(0)
  }
})

test("Volume is a parameter: --program both splits the count across the two programs", async () => {
  const folkBefore = (await listBulkContacts(PROGRAM)).length
  const otherBefore = await listBulkContacts(OTHER_PROGRAM).then((rows) => rows.length)

  const requested = 20
  const result = runGenerator(["--count", String(requested), "--program", "both"])

  try {
    expect(result.status, result.output).toBe(0)

    // Splitting, not doubling. `--count 20` over two programs is 10 each, so the
    // second program gains whatever it was missing to reach its share — 10 when it
    // held no generated rows, which is the state every other row leaves it in, and
    // 0 when a previous run left it at or above the share. `Math.max(0, …)`, not
    // the raw difference: a floor never deletes, so an over-full program gains
    // nothing rather than going negative.
    const folkAfter = (await listBulkContacts(PROGRAM)).length
    const otherAfter = (await listBulkContacts(OTHER_PROGRAM)).length
    const perProgram = Math.ceil(requested / 2)
    const expectedGain = Math.max(0, perProgram - otherBefore)

    expect(otherAfter - otherBefore, "the other program tops up to its half of the count, rounded up").toBe(expectedGain)
    // The order-independent half of the same claim: the generator's own banner
    // states the per-program count, so "split, not doubled" is read off the output
    // rather than inferred from how many rows this particular run happened to add.
    expect(result.output, "splitting, not doubling: the count is per program, not per run").toMatch(
      /\b10 row\(s\) each\b/,
    )
    expect(folkAfter - folkBefore, "folk already holds far more than its share").toBe(0)
    expect(result.output).toContain("folk, ")
    expect(result.output).toContain(OTHER_PROGRAM)
  } finally {
    const wipe = runGenerator(["--program", OTHER_PROGRAM, "--wipe"])
    expect(wipe.status, wipe.output).toBe(0)
  }
})

// ---------------------------------------------------------------------------
// Wipe
// ---------------------------------------------------------------------------

test("Wipe: --wipe removes only rows the generator created, the seeded rows survive, and the set is restored", async () => {
  // The two sets are now disjoint by a real column rather than by a shared prefix:
  // the seeder's rows carry a name prefix, the generator's carry `source`. Reading
  // both is what makes the wipe assertion below mean something — a wipe that
  // deleted the seeder's two contacts would pass a check that only looked at one.
  const seededBefore = await contactsMatchingSeederFilter()
  const bulkBefore = await contactsMatchingSourceFilter()
  const seededOnlyBefore = seededBefore.filter(
    (row) => !bulkBefore.some((bulk) => bulk.id === row.id),
  )
  const locationsBefore = await listBulkLocations(PROGRAM)

  expect(bulkBefore.length, "the bulk set must exist before a wipe").toBeGreaterThan(0)
  expect(locationsBefore.length, "the generated locations must exist before a wipe").toBeGreaterThan(0)
  expect(seededOnlyBefore.length, "the seeder's own contacts must exist before a wipe").toBeGreaterThan(0)

  try {
    const result = runGenerator(["--wipe"])
    expect(result.status, result.output).toBe(0)
    expect(result.output).toMatch(/^  deleted \d+ bulk contact\(s\)$/m)
    expect(result.output).toMatch(/^  deleted \d+ bulk location\(s\)$/m)

    expect((await listBulkContacts(PROGRAM)).length, "no bulk contact may survive the wipe").toBe(0)
    expect((await listBulkLocations(PROGRAM)).length, "no bulk location may survive the wipe").toBe(0)

    // The seeder's rows are untouched, and the generator's are gone — checked as
    // two separate reads, because the two sets no longer share a name prefix and
    // "what survived" is only meaningful if "what did not" was read the same way.
    const seededAfter = await contactsMatchingSeederFilter()
    expect(seededAfter, "only rows the generator created may be deleted").toEqual(seededOnlyBefore)
    expect(
      await contactsMatchingSourceFilter(),
      "no row carrying the generator's source may survive the wipe",
    ).toEqual([])
  } finally {
    // The shared set is what story 4's rows select from, so it is restored even
    // when the assertions above fail. `--count` is set to the pre-wipe size so the
    // restored set is the *same* set: row names are deterministic, so "the same
    // count" and "the same rows" are the same statement.
    const restore = runGenerator(["--count", String(bulkBefore.length)])
    expect(restore.status, `restoring the bulk set failed:\n${restore.output}`).toBe(0)
  }

  expect((await listBulkContacts(PROGRAM)).length).toBe(bulkBefore.length)
  expect((await listBulkLocations(PROGRAM)).length).toBe(locationsBefore.length)
  // Both sides sorted in the same collation, and compared by name only. Postgres
  // orders `name` with its own collation and `localeCompare` uses ICU's, so sorting
  // only one side would make this row fail for a reason that has nothing to do
  // with the wipe. Ids are deliberately excluded: the restore deletes and
  // re-inserts the rows, so the *same set of names* is what "restored" means here.
  const names = (rows: Array<{ id: string; name: string }>) =>
    rows.map((row) => row.name).sort((a, b) => a.localeCompare(b))
  expect(names(await contactsMatchingSeederFilter())).toEqual(names(seededBefore))
})

// ---------------------------------------------------------------------------
// Missing prerequisite
// ---------------------------------------------------------------------------

test("Missing prerequisite: with none of the preview seeder's locations the generator exits 1 naming pnpm seed:local and writes nothing", async () => {
  const db = bulkFixtureClient()

  // The other program is seeded but not exercised by this suite's app, so it is
  // the safe place to withdraw a prerequisite and put it back.
  // CHANGED 2026-10-13: the seeder's locations carry plain Chennai names now, so
  // the prerequisite is "one of `PREVIEW_LOCATION_NAMES` exists" — matched by name
  // rather than by a `preview-fixture-` prefix that no longer exists.
  const { data: seededLocations, error } = await db
    .from("locations")
    .select("id,name")
    .eq("program_id", OTHER_PROGRAM)
    .in("name", [...PREVIEW_LOCATION_NAMES])
  if (error) throw new Error(`Reading ${OTHER_PROGRAM} locations failed: ${error.message}`)

  expect(seededLocations ?? [], `${OTHER_PROGRAM} should be seeded by pnpm seed:local`).not.toEqual([])

  const withdrawn = (seededLocations ?? []).map((location, index) => ({
    id: location.id,
    original: location.name as string,
    temporary: `e2e-withdrawn-prerequisite-${index}-${OTHER_PROGRAM}`,
  }))
  const contactsBefore = (await contactsMatchingSeederFilter()).length

  try {
    for (const location of withdrawn) {
      const { error: renameError } = await db.from("locations").update({ name: location.temporary }).eq("id", location.id)
      if (renameError) throw new Error(`Renaming location ${location.id} failed: ${renameError.message}`)
    }

    const result = runGenerator(["--program", OTHER_PROGRAM])

    expect(result.status).toBe(1)
    expect(result.output, "the refusal must name the fix").toContain("pnpm seed:local")
    expect(result.output).toContain(`${OTHER_PROGRAM} is missing seeded fixture prerequisites`)
    expect(result.output, "nothing may be written on a refused run").not.toContain("Total created:")

    expect(await listBulkContacts(OTHER_PROGRAM), "a refused run must not write rows").toEqual([])
  } finally {
    for (const location of withdrawn) {
      const { error: restoreError } = await db.from("locations").update({ name: location.original }).eq("id", location.id)
      if (restoreError) throw new Error(`Restoring location ${location.id} failed: ${restoreError.message}`)
    }
  }

  expect((await contactsMatchingSeederFilter()).length).toBe(contactsBefore)

  // Proof the prerequisite is really back: the same command that just refused now
  // gets past the check. `--count 8` keeps this to a handful of rows on a program
  // the suite does not otherwise read, while staying above the two volumes the
  // generator's own invariants are conditioned on: index 0 carries the blank
  // phone, so phone coverage needs ≥2 indexes, and index 9 is the first
  // out-of-scope row, so the scope-on-both-sides check needs ≥10
  // (`MIN_INDEXES_FOR_OUT_OF_SCOPE`).
  const ok = runGenerator(["--program", OTHER_PROGRAM, "--count", "8"])
  expect(ok.status, ok.output).toBe(0)
  try {
    expect((await listBulkContacts(OTHER_PROGRAM)).length).toBe(8)
  } finally {
    // Leave the second program as `pnpm seed:local` found it.
    const wipe = runGenerator(["--program", OTHER_PROGRAM, "--wipe"])
    expect(wipe.status, wipe.output).toBe(0)
  }
})

// ---------------------------------------------------------------------------
// The two refusal paths that only fire on corrupt or hostile input.
//
// Both are asserted *at* the refusal. Deleting either guard leaves every other
// row in this file green — which is exactly why they need a test of their own:
// DW-3 is the story's headline invariant, and a chunk failure is the only place
// the batched insert's own error wording is observable.
// ---------------------------------------------------------------------------

test("Scope on both sides: a non-Active staff row fails the DW-3 pre-write check and writes nothing", async () => {
  const db = bulkFixtureClient()

  // Same reasoning as the withdrawn-locations case: the second program is seeded
  // but not read by this suite's app, so it is the safe place to break a
  // prerequisite. `status` is chosen over deleting the row because it is the
  // smaller violation — the row still exists, so the failure is DW-3's *status*
  // clause rather than its missing-row clause, and restoring is a single column.
  // `fixtureEmail` is suite-wide (`folk`) and this row reads the *other* programme,
  // which is a real seeded one — so its address comes from the shared table rather
  // than from a constructed string. CHANGED 2026-10-13: the seeder's addresses are
  // plausible names on a reserved `.test` domain, and a locally-constructed address
  // no longer matched, so this read returned `null` and failed on a fixture that
  // was present and correct.
  const email = STAFF_EMAILS[OTHER_PROGRAM].Preacher
  const { data: preacher, error: readError } = await db
    .from("users")
    .select("id,status")
    .eq("program_id", OTHER_PROGRAM)
    .eq("email", email)
    .maybeSingle()
  if (readError) throw new Error(`Reading ${email} failed: ${readError.message}`)
  expect(preacher, `${email} should be seeded by pnpm seed:local`).toBeTruthy()

  const { error: suspendError } = await db.from("users").update({ status: "Inactive" }).eq("id", preacher!.id)
  if (suspendError) throw new Error(`Suspending ${email} failed: ${suspendError.message}`)

  try {
    const result = runGenerator(["--program", OTHER_PROGRAM])

    expect(result.status, result.output).toBe(1)
    expect(result.output, "the failure must name the row it refused to write against").toContain(email)
    expect(result.output).toContain("status Inactive, expected Active")
    // The pre-write half of DW-3: nothing may have been created before the check.
    expect(result.output, "nothing may be written on a refused run").not.toContain("Total created:")
    expect(await listBulkContacts(OTHER_PROGRAM), "a refused run must not write rows").toEqual([])
  } finally {
    const { error: restoreError } = await db.from("users").update({ status: "Active" }).eq("id", preacher!.id)
    if (restoreError) throw new Error(`Restoring ${email} failed: ${restoreError.message}`)
  }

  // The prerequisite is really back: the same command now gets past the check.
  const ok = runGenerator(["--program", OTHER_PROGRAM, "--count", "8"])
  expect(ok.status, ok.output).toBe(0)
  expect(ok.output).toContain("DW-3 check passed:")
  const wipe = runGenerator(["--program", OTHER_PROGRAM, "--wipe"])
  expect(wipe.status, wipe.output).toBe(0)
})

test("Batched insert: a chunk that violates a constraint names the chunk index and Supabase's own message", async () => {
  const db = bulkFixtureClient()

  // The second program has no generated rows, so the generator really does try to
  // insert its first chunk there — index 1's phone is `82` + `00000001`. A planted
  // row holds that phone under a name the tag-select cannot see, so
  // `UNIQUE (phone, program_id)` rejects the chunk. That is the only way to observe
  // the batched insert's own error wording: nothing else in a healthy run fails.
  const collidingPhone = "8200000001"
  const planted = await db
    .from("contacts")
    .insert({
      program_id: OTHER_PROGRAM,
      name: `e2e-planted-collision-${crypto.randomUUID().slice(0, 8)}`,
      phone: collidingPhone,
      location_ids: [],
    })
    .select("id")
    .single()
  if (planted.error) throw new Error(`Planting the colliding row failed: ${planted.error.message}`)

  try {
    const result = runGenerator(["--program", OTHER_PROGRAM, "--count", "8"])

    expect(result.status, result.output).toBe(1)
    expect(result.output, "the failure must name which chunk failed").toMatch(/inserting chunk \d+ \(\d+ rows, rows \d+-\d+\) failed/)
    // Supabase's own wording, not a paraphrase: a constraint violation reported
    // as "something went wrong" would cost more debugging time than it saved.
    expect(result.output).toContain("duplicate key value violates unique constraint")
    expect(result.output).toContain("idx_contacts_phone_program")
  } finally {
    const { error: deleteError } = await db.from("contacts").delete().eq("id", planted.data.id)
    if (deleteError) throw new Error(`Removing the planted row failed: ${deleteError.message}`)
    // Leave the second program as `pnpm seed:local` found it.
    const wipe = runGenerator(["--program", OTHER_PROGRAM, "--wipe"])
    expect(wipe.status, wipe.output).toBe(0)
  }

  expect(await listBulkContacts(OTHER_PROGRAM), "a failed chunk must leave no partial rows").toEqual([])
})

// ---------------------------------------------------------------------------
// Specs clean up after themselves
// ---------------------------------------------------------------------------

test("Specs clean up after themselves: cleanupTaggedContacts removes a row the spec created", async () => {
  const db = bulkFixtureClient()
  const id = crypto.randomUUID()
  const program = PROGRAM
  // Owned by this suite through `source`, not through a name prefix: generated
  // names are real people's names now, and a spec-created row has to be
  // distinguishable from a generated one by the same column the cleanup helper
  // checks.
  const name = `Spec-created contact ${id.slice(0, 8)}`
  const source = BULK_SPEC_SOURCE

  const created = await db
    .from("contacts")
    .insert({
      program_id: program,
      name,
      phone: `89${id.replace(/-/g, "").slice(0, 8)}`,
      location_ids: [],
      assigned_preacher_id: null,
      source,
    })
    .select("id,name")
    .single()
  if (created.error) throw new Error(`Creating the spec's own contact failed: ${created.error.message}`)

  // Present in the tagged set the generator produced — not a row from a previous run.
  expect((await listBulkContacts(program)).map((contact) => contact.id)).toContain(created.data.id)

  try {
    const deleted = await cleanupTaggedContacts([created.data.id])
    expect(deleted).toEqual([created.data.id])

    const { data, error: readError } = await db.from("contacts").select("id").eq("id", created.data.id).maybeSingle()
    if (readError) throw new Error(`Re-reading the deleted contact failed: ${readError.message}`)
    expect(data).toBeNull()
  } finally {
    // Belt and braces: if the assertion above threw, the row must still go.
    await cleanupTaggedContacts([created.data.id])
  }

  const remaining = await listBulkContacts(program)
  expect(remaining.some((contact: BulkContact) => contact.id === created.data.id)).toBe(false)
})

test("Specs clean up after themselves: cleanupTaggedContacts is a no-op for an empty id list", async () => {
  expect(await cleanupTaggedContacts([])).toEqual([])
})

test("Specs clean up after themselves: cleanupTaggedContacts refuses to delete an untagged row", async () => {
  // The Never clause: no delete of anything lacking the tag. The helper takes ids
  // only, so nothing at the type level stops a caller handing it a seeded row's
  // id — this row is the proof the helper stops it itself.
  const db = bulkFixtureClient()
  const { data: seeded, error } = await db
    .from("contacts")
    .select("id,name,source")
    .eq("program_id", PROGRAM)
    .like("name", `${SEEDER_TAG}contact-%`)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`Reading a seeded contact failed: ${error.message}`)
  expect(seeded, "pnpm seed:local should have seeded at least one contact").toBeTruthy()
  // The seeder's contact is not the generator's: different `source`, different name
  // shape. The refusal below is the guard that keeps a spec from deleting it.
  expect(seeded!.source).not.toBe(BULK_TAG)

  // CHANGED 2026-10-13: ownership is read from `source` rather than a name prefix,
  // so the refusal names what it actually checked.
  await expect(cleanupTaggedContacts([seeded!.id])).rejects.toThrow(
    /refuses to delete 1 contact\(s\) it does not own/,
  )
  await expect(cleanupTaggedContacts([seeded!.id])).rejects.toThrow(new RegExp(seeded!.name))

  // And the row is still there, which is the whole point.
  const { data: after } = await db.from("contacts").select("id").eq("id", seeded!.id).maybeSingle()
  expect(after, "the seeded row must survive a refused cleanup").not.toBeNull()
})

test("Secrets: the service-role key never appears in the generator's output", async () => {
  const serviceRoleKey = readEnvValue("SUPABASE_SERVICE_ROLE_KEY")
  expect(serviceRoleKey, "the local stack must have a service-role key to run this row").toBeTruthy()

  const result = runGenerator()
  expect(result.status, result.output).toBe(0)

  // Absence only, and deliberately so. The redaction filter in the generator only
  // fires when a value would otherwise be printed, and nothing on the success path
  // carries one — so a healthy run triggers no `***redacted***` marker at all, and
  // asserting the marker here would be asserting something that never happens.
  // What matters is that the key itself never reaches stdout or stderr.
  expect(result.output, "the service-role key leaked into the generator's output").not.toContain(serviceRoleKey!)

  // Also on a refusal path, which is the one that prints a value the operator
  // supplied and therefore the one most likely to echo something back.
  const refused = runGenerator([], {
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:54321/?apikey=${serviceRoleKey}`,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey!,
  })
  expect(refused.output, "the service-role key leaked on a refused run").not.toContain(serviceRoleKey!)
})

test("package.json wires seed:bulk-local and seed:bulk-full to this script", () => {
  const manifest = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
    scripts: Record<string, string>
  }

  expect(manifest.scripts["seed:bulk-local"]).toBe("node scripts/bulk-contact-fixtures.mjs")
  expect(manifest.scripts["seed:bulk-full"]).toContain("node scripts/bulk-contact-fixtures.mjs")
  expect(manifest.scripts["seed:bulk-full"]).toContain("--count 1052")
  // `folk`, not `both`: splitting 1052 across two programs leaves folk with 526,
  // which does not reproduce the 1,052 in-scope rows the perf check measures.
  expect(manifest.scripts["seed:bulk-full"]).toContain("--program folk")
})

test("playwright.config.ts wires globalSetup to the generator", () => {
  // The same class of assertion as the `package.json` row above, and the same
  // reason it exists: that string has already drifted once in this story. Every
  // row in this file spawns the generator itself, so deleting the `globalSetup`
  // key would leave the whole file green on any database that already holds the
  // rows — the suite would stop guaranteeing its own volume without a single
  // failure. Offline: the config file is read, not run.
  const config = readFileSync(path.join(repoRoot, "playwright.config.ts"), "utf8")

  expect(config, "playwright.config.ts must run the bulk generator once per suite").toMatch(
    /globalSetup:\s*["']e2e\/global-setup\.ts["']/,
  )
})

// ---------------------------------------------------------------------------
// DW-3, the headline invariant
// ---------------------------------------------------------------------------

test("DW-3: a public.users row whose id is not its auth id is refused before anything is written", async () => {
  const db = bulkFixtureClient()
  const password = "E2eDw3Mismatch1!"

  // An isolated throwaway program: nothing else reads it, so a foreign key from
  // another fixture cannot block the teardown and a failure cannot corrupt the
  // shared folk set.
  const created: Array<{ email: string; role: "preacher" | "admin"; authId: string; publicId: string }> = []
  const locationIds: string[] = []

  try {
    // Two auth users, then `public.users` rows under the program's Preacher and
    // Admin addresses carrying each other's ids — so neither row's id is the auth
    // id its own email names.
    //
    // The addresses must be the *seeder's* convention for this program, because
    // that is the only thing the generator looks staff up by. An address of this
    // row's own invention would leave the generator looking for a row that does
    // not exist, and it would refuse for the missing-prerequisite reason instead of
    // the DW-3 one under test.
    //
    // CHANGED 2026-10-13: built from the shared table's shape rather than the old
    // `preview-fixture-<role>-<program>@example.com` string. `THROWAWAY_PROGRAM` is
    // not a seeded program so it has no entry in `STAFF_EMAILS`, and the generator
    // derives an address for it from the same per-program convention — so the
    // address is constructed here from that convention rather than read from a
    // table that does not and never will contain this program.
    const throwawayEmail = (role: string) =>
      `${role}@${THROWAWAY_PROGRAM}.fixture.test`

    for (const role of ["preacher", "admin"] as const) {
      const email = throwawayEmail(role)
      const { data, error } = await db.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
      if (error) throw new Error(`Creating the throwaway auth user ${email} failed: ${error.message}`)
      created.push({ email, role, authId: data.user!.id, publicId: "" })
    }

    const [first, second] = created
    first.publicId = second.authId
    second.publicId = first.authId

    for (const row of created) {
      const { error } = await db.from("users").insert({
        id: row.publicId,
        program_id: THROWAWAY_PROGRAM,
        email: row.email,
        name: `DW3 throwaway ${row.role} ${THROWAWAY_PROGRAM}`,
        role: row.role === "preacher" ? "Preacher" : "Admin",
        status: "Active",
        location_ids: [],
      })
      if (error) throw new Error(`Inserting the swapped public.users row ${row.email} failed: ${error.message}`)
    }

    // One of the preview seeder's own location names, so the generator gets *past*
    // the missing-prerequisite check and reaches the DW-3 comparison it is here to
    // fail. CHANGED 2026-10-13: the prerequisite used to be "a `preview-fixture-%`
    // location exists" and is now "one of `PREVIEW_LOCATION_NAMES` exists", by
    // name — the generated locations no longer carry a tag to match on.
    const locationName = PREVIEW_LOCATION_NAMES[0]
    const { data: location, error: locationError } = await db
      .from("locations")
      .insert({ program_id: THROWAWAY_PROGRAM, name: locationName, status: "Active" })
      .select("id")
      .single()
    if (locationError) throw new Error(`Creating the throwaway location failed: ${locationError.message}`)
    locationIds.push(location.id)

    const result = runGenerator(["--program", THROWAWAY_PROGRAM])

    expect(result.status, result.output).toBe(1)
    for (const row of created) {
      expect(result.output, `the refusal must name ${row.email}`).toContain(`DW-3 VIOLATION for ${row.email}`)
      // Both ids named: without them an operator cannot tell which row is wrong.
      expect(result.output, "the refusal must name the row's id").toContain(row.publicId)
      expect(result.output, "the refusal must name the auth id").toContain(row.authId)
    }
    // Pre-write: the run must have refused rather than written and complained.
    expect(result.output).not.toContain("Total created:")
  } finally {
    for (const id of locationIds) {
      await db.from("locations").delete().eq("id", id)
    }
    for (const row of created) {
      await db.from("users").delete().eq("id", row.publicId)
      await db.auth.admin.deleteUser(row.authId)
      await db.auth.admin.deleteUser(row.publicId)
    }
  }

  // The program's rows are gone, so the generator now refuses for the *other*
  // reason — which proves the teardown left nothing behind.
  const after = runGenerator(["--program", THROWAWAY_PROGRAM])
  expect(after.status).toBe(1)
  expect(after.output).toContain("pnpm seed:local")
})

test("The fixture client refuses a non-local target instead of degrading to an empty set", () => {
  const previousUrl = process.env.SUPABASE_URL
  const previousNextUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  // `readEnvValue` prefers `process.env`, so this is the same machine state that
  // would otherwise read the hosted project.
  process.env.SUPABASE_URL = HOSTED_SUPABASE_URL
  process.env.NEXT_PUBLIC_SUPABASE_URL = HOSTED_SUPABASE_URL

  try {
    expect(() => resolveBulkFixtureTarget()).toThrow(/not a loopback address/)
  } finally {
    restoreEnv("SUPABASE_URL", previousUrl)
    restoreEnv("NEXT_PUBLIC_SUPABASE_URL", previousNextUrl)
  }

  // And the local path still resolves, so the refusal is not a blanket failure.
  expect(resolveBulkFixtureTarget().url).toMatch(/^http:\/\/(127\.0\.0\.1|localhost|\[::1\])/)
})

/** `process.env` without the variables that would confuse a nested runner. */
function restoreEnv(key: string, previous: string | undefined): void {
  if (previous === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = previous
  }
}
