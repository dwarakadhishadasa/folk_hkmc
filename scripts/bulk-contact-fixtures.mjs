#!/usr/bin/env node
/**
 * bulk-contact-fixtures.mjs — `pnpm seed:bulk-local`, the row-volume prerequisite
 * for the manage-contacts matrix.
 *
 * `scripts/seed-preview-fixtures.mjs` seeds **one** in-scope contact per program.
 * `matrix-coverage-map.md` shows 16 of story 2's 19 rows needing volume the local
 * environment does not produce: ≥40 rows for the indeterminate header and
 * select-all, distinct joined location names for the per-column location filter,
 * and 2–5 selectable rows for the bulk rows. Building the harness without this
 * data produces a green suite that still cannot cover the matrix it exists to
 * cover.
 *
 * Defaults are chosen for the fast path: **250** rows for `folk` — above the
 * 200-item bulk cap in `lib/manage/api-handlers.ts` and far above row 7's 40.
 * The 1,052 rows story 2 measured belongs to `pnpm seed:bulk-full`, a
 * manual/perf check, not to every run.
 *
 * Invariants this script will not trade away:
 *
 *   - **Local only.** A non-loopback `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL`
 *     is refused by `assertLocalSupabaseTarget` *before* a client is
 *     constructed, so a refused run performs zero network I/O.
 *   - **DW-3.** `public.users.id` MUST equal the `auth.users.id` it names and the
 *     row MUST be `Active`. Checked **before** anything is written: the sign-in
 *     route no longer self-heals a mismatch, so it is unfixable corrupt data.
 *   - **Every row is tagged** `preview-fixture-bulk-`, a strict prefix of the
 *     seeder's own `preview-fixture-` tag, so `seed-preview-fixtures.mjs --wipe`
 *     finds and removes it. No untagged row is ever created or deleted.
 *   - **Batched.** One PostgREST call per `--chunk-size` rows, never one per row.
 *   - **Idempotent.** `--count` is a *floor*, not a truncate: the generator tops
 *     up to at least N tagged rows per program and never deletes a row a lower
 *     count would drop. A second run inserts 0.
 *   - **Deterministic.** No randomness anywhere in row generation, so a re-run
 *     produces byte-identical rows. That is what lets the generator select
 *     existing rows by `(program_id, name like 'preview-fixture-bulk-%')` and
 *     insert only the difference rather than upserting — upserting would
 *     silently revert a name a story-4 row edited.
 *
 * Usage:
 *   pnpm seed:bulk-local                            # 250 rows for folk
 *   pnpm seed:bulk-local --count 60 --chunk-size 25
 *   pnpm seed:bulk-local --program both             # split the count across both
 *   pnpm seed:bulk-local --wipe                     # delete only bulk-tagged rows
 *
 * Must run **after** `pnpm seed:local`: a re-seed resets the Preacher's
 * `location_ids`, which this script then re-widens.
 */

import path from "node:path"
import { fileURLToPath } from "node:url"
import { createClient } from "@supabase/supabase-js"
import { assertLocalSupabaseTarget, sanitizeSupabaseUrl } from "./local-supabase-target.mjs"
import { readLocalSupabaseCredentials } from "./local-supabase-credentials.mjs"

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const PROGRAMS = ["folk", "gita-life"]

/**
 * Each program's Preacher's offset into the location pool.
 *
 * The two programs get different locations, so an out-of-scope contact in one is
 * not out of scope in the other. `locationsForPreacher` reads this as the
 * starting index — a per-program constant, not a counter, so a reseed of one
 * program cannot shift the other's scope.
 */
const PROGRAM_INDEX = { folk: 0, "gita-life": 1 }
/**
 * The marker every generated contact carries in `source`.
 *
 * Contacts are located by this column rather than by a name prefix, and locations
 * by their plain names out of `BULK_LOCATIONS`. No generated row carries a tag on
 * any field an operator reads.
 */
const SOURCE_MARKER = "preview-fixture-bulk"
/** Role names in `public.users.role` this script's scope depends on. */
const PREACHER = "Preacher"
const ADMIN = "Admin"

/**
 * Phone ranges, disjoint from the seeder's `9000000001-4` so
 * `UNIQUE (phone, program_id)` never collides across the two generators and the
 * index stays the idempotency key rather than something to work around.
 */
const PHONE_PREFIX = { folk: "81", "gita-life": "82" }

/**
 * A fixed name pool. Combined with the 4-digit index it is already distinct; the
 * pool exists so a human reading a grid sees names, not digits.
 */
const {
  BULK_LOCATIONS,
  PREVIEW_LOCATIONS,
  STAFF_EMAILS,
  COLLECTED_BY_RATIO,
  COLLEGES,
  COMPANIES,
  DESIGNATIONS,
  NOTES,
  contactName,
  locationsForPreacher,
  booksFor,
} = await import("./fixture-reference-data.mjs")

// `SOURCE_MARKER` is declared above with the other markers; the rationale for it
// living on `source` rather than on `name` is recorded there.

const CONTACT_COLUMNS =
  "id,program_id,name,phone,location_ids,assigned_preacher_id,college,company,designation,notes,is_favorite,books_read,source"
const PAGE_SIZE = 1000

/**
 * How many ids one PostgREST `.in(...)` may carry.
 *
 * `.in()` puts every id in the query string, so a 305-row wipe on one request is
 * a `URI too long` — a wipe that only works while the set is small is a wipe that
 * fails exactly when it is needed most, right after the default-volume run. 100
 * uuids is ~3.7 KB, comfortably inside every proxy's header limit.
 */
const DELETE_BATCH_SIZE = 100

// ---------------------------------------------------------------------------
// Output
//
// Redaction is registered before the first print: a service-role key is a
// credential, and an error echo can carry it back.
// ---------------------------------------------------------------------------

const REDACTED = "***redacted***"
const secretValues = new Set()

for (const name of [
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_JWT_SECRET",
  "POSTGRES_PASSWORD",
]) {
  const value = process.env[name]
  if (typeof value === "string" && value.length >= 8) secretValues.add(value)
}

function redact(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value)
  let out = text
  for (const secret of secretValues) {
    if (out.includes(secret)) out = out.split(secret).join(REDACTED)
  }
  return out
}

function log(message = "") {
  console.log(redact(message))
}

function fail(message) {
  console.error(redact(`ERROR ${message}`))
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

const SUPPORTED_FLAGS = ["count", "program", "locations", "chunk-size", "wipe", "allow-non-local"]
const SWITCH_FLAGS = new Set(["wipe", "allow-non-local"])
const DEFAULTS = { count: 250, program: "folk", locations: 5, chunkSize: 250, wipe: false, allowNonLocal: false }

/**
 * Throws on bad input rather than calling `process.exit`, so every refusal below
 * is one `try` at the call site and the wording stays next to the rule that
 * produced it. Follows `scripts/verify-local-stack-readiness.mjs`'s `parseArgs`:
 * `--flag value` and `--flag=value` both parse, and a trailing flag with no value
 * is named rather than silently becoming `NaN`.
 */
export function parseArgs(argv) {
  const options = { ...DEFAULTS }
  const raw = {}

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    // A positional is not a flag and this script takes no positional arguments.
    // Skipping it silently is the worst outcome available: `bulk-contact-fixtures
    // .mjs folk --count 10` would seed the *defaults* and report success, so the
    // typo would be invisible until someone wondered why `--count` did nothing.
    if (!arg.startsWith("--")) {
      throw new Error(
        `Unexpected argument ${JSON.stringify(arg)}. This script takes only flags ` +
          `(${SUPPORTED_FLAGS.map((flag) => `--${flag}`).join(", ")}); did you mean to quote it, or drop it?`,
      )
    }
    const eq = arg.indexOf("=")
    const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq)

    if (!SUPPORTED_FLAGS.includes(name)) {
      throw new Error(`Unknown flag --${name}. Supported: ${SUPPORTED_FLAGS.map((flag) => `--${flag}`).join(", ")}.`)
    }

    if (SWITCH_FLAGS.has(name)) {
      if (eq !== -1) throw new Error(`--${name} is a switch and takes no value.`)
      options[name === "wipe" ? "wipe" : "allowNonLocal"] = true
      continue
    }

    let value = eq === -1 ? undefined : arg.slice(eq + 1)
    if (value === undefined) {
      const next = argv[index + 1]
      // `--count` as the final token, or `--count --program both`, used to yield
      // NaN/undefined and surface as a confusing crash further down.
      if (next === undefined || next.startsWith("--")) {
        throw new Error(`--${name} requires a value.`)
      }
      value = next
      index += 1
    }
    if (value === "") throw new Error(`--${name} requires a non-empty value.`)

    // `Number` is far too permissive for a count: it accepts `1e3`, `0x10`,
    // ` 5 ` and `Infinity`, so the value seeded would not be the value typed.
    // Requiring plain decimal digits makes `--count 10` mean 10 and nothing else.
    if (name !== "program" && !/^\d+$/.test(value)) {
      throw new Error(`--${name} must be a whole number written in decimal digits, got ${JSON.stringify(value)}.`)
    }

    switch (name) {
      case "count":
        raw.count = value
        options.count = Number(value)
        break
      case "locations":
        raw.locations = value
        options.locations = Number(value)
        break
      case "chunk-size":
        raw.chunkSize = value
        options.chunkSize = Number(value)
        break
      case "program":
        raw.program = value
        options.program = value
        break
    }
  }

  // 0 for `--count` would silently disable the row-volume requirement the matrix
  // depends on; 0 for `--chunk-size` divides by zero in the chunk loop; 0 for
  // `--locations` leaves every generated row pointing at the seeded location,
  // which defeats the per-column filter. The floor is 1 for all three.
  for (const [flag, key, rawKey] of [
    ["--count", "count", "count"],
    ["--locations", "locations", "locations"],
    ["--chunk-size", "chunkSize", "chunkSize"],
  ]) {
    if (!Number.isInteger(options[key]) || options[key] < 1) {
      throw new Error(`${flag} must be an integer >= 1, got ${JSON.stringify(raw[rawKey] ?? options[key])}.`)
    }
  }

  // `both` is the one magic value; every other value names a single program to
  // generate for. The two real programs are not a closed list: the acceptance
  // criteria and the spec's own `--program` description only require a default and
  // a splitting mode, and a closed list would make the DW-3 pre-write check
  // unreachable in isolation — the one invariant the story names as its headline
  // needs a program whose staff rows a test can corrupt without touching a shared
  // fixture. Typo protection is kept for the case that matters: an id within one
  // edit of a real program, which is what a mistyped `folk` looks like.
  if (options.program === "") {
    throw new Error("--program requires a non-empty program id.")
  }
  for (const program of PROGRAMS) {
    if (options.program !== program && program.startsWith(options.program)) {
      throw new Error(`--program ${JSON.stringify(options.program)} looks like a typo of \`${program}\`.`)
    }
  }

  return options
}

// ---------------------------------------------------------------------------
// Local-target refusal and credentials — both before a client exists
// ---------------------------------------------------------------------------

/**
 * Every URL the run could be about, refused before a client exists. The two
 * environment variables are checked individually because they can disagree — a
 * local `NEXT_PUBLIC_SUPABASE_URL` beside a hosted `SUPABASE_URL` is a real
 * state, and refusing only the resolved pair would let it through.
 *
 * The env variables are checked *before* credentials are resolved so that a run
 * pointed at the hosted project is refused for the right reason even when the
 * service-role key is not exported. The resolved URL is checked again
 * afterwards, because it can come from `supabase status -o env` rather than the
 * environment.
 */
function assertLocalTarget(allowNonLocal) {
  for (const variableName of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"]) {
    try {
      assertLocalSupabaseTarget({ url: process.env[variableName], allowNonLocal, variableName })
    } catch (error) {
      console.error(`ERROR ${redact(error.message)}`)
      process.exit(1)
    }
  }
}

function assertResolvedTargetIsLocal(apiUrl, allowNonLocal) {
  try {
    assertLocalSupabaseTarget({ url: apiUrl, allowNonLocal, variableName: "the resolved Supabase URL" })
  } catch (error) {
    console.error(`ERROR ${redact(error.message)}`)
    process.exit(1)
  }
}

/**
 * The environment wins when it names a target *and* a key, because that is the
 * only way a run can be pointed somewhere specific (which is how the refusal and
 * its override are exercised). With nothing set the chain is
 * `supabase status -o env` — the same one `pnpm seed:local` uses, through the
 * same helper — so `pnpm seed:bulk-local` works from a clean shell.
 *
 * Resolution runs `pnpm dlx` and nothing else, so it is not network I/O against
 * the target; the refusal above still fires before any Supabase request.
 */
function resolveCredentials() {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim() || null
  const envKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null

  if (envUrl && envKey) return { apiUrl: envUrl, serviceRoleKey: envKey, source: "the environment" }

  if (envUrl || envKey) {
    const missing = envUrl ? "SUPABASE_SERVICE_ROLE_KEY" : "NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)"
    fail(
      `${missing} is not set, so the target named in the environment is incomplete. Set both, or unset ` +
        `both so the credentials come from \`supabase status -o env\` via \`pnpm supabase:start\`.`,
    )
  }

  try {
    const { apiUrl, serviceRoleKey } = readLocalSupabaseCredentials({ cwd: repoRoot })
    return { apiUrl, serviceRoleKey, source: "supabase status -o env" }
  } catch (error) {
    fail(error.message)
  }
}

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

/** The service-role client. Constructed only after the local-target refusal. */
let db = null

async function unwrap(promise, what) {
  const { data, error } = await promise
  if (error) fail(`${what} failed: ${error.code ?? ""} ${error.message}`.replace(/\s+/g, " "))
  return data
}

/** Every row matching `buildQuery`, paged — PostgREST caps a single response. */
async function collectPaged(buildQuery) {
  const all = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const batch = await unwrap(buildQuery().range(from, from + PAGE_SIZE - 1), "reading rows")
    all.push(...(batch ?? []))
    if (!batch || batch.length < PAGE_SIZE) return all
  }
}

/** Slices into fixed-size batches. Used for both inserts and deletes. */
function* chunked(items, size) {
  for (let offset = 0; offset < items.length; offset += size) {
    yield items.slice(offset, offset + size)
  }
}

/** `auth.users`, paginated. A single page silently under-counts. */
async function listAuthUsers() {
  const all = []
  for (let page = 1; ; page += 1) {
    const data = await unwrap(db.auth.admin.listUsers({ page, perPage: PAGE_SIZE }), `listing auth users (page ${page})`)
    all.push(...data.users)
    if (!data.nextPage) return all
  }
}

const authUsersByEmail = async () =>
  new Map((await listAuthUsers()).map((user) => [user.email?.trim().toLowerCase(), user]))

/**
 * The staff sign-in address for a role in a program.
 *
 * Owned by `seed-preview-fixtures.mjs`, which creates the `auth.users` and
 * `public.users` rows. This script only *reads* them: it verifies DW-3 alignment
 * and resolves the ids, and inventing a second address here would create a
 * `public.users` row with no `auth.users` twin — which is exactly the corruption
 * DW-3 exists to catch.
 */
const emailFor = (role, program) =>
  // `STAFF_EMAILS` covers the two seeded programs. A program this script has not
  // seeded — the e2e suite's throwaway — gets the same convention derived from its
  // own name, which is what that program must have created for the lookup to find.
  STAFF_EMAILS[program]?.[role] ?? `${role.toLowerCase()}@${program}.fixture.test`

// ---------------------------------------------------------------------------
// Deterministic row generation
// ---------------------------------------------------------------------------

const pad = (value, width) => String(value).padStart(width, "0")

/**
 * A contact's name: a person's name and nothing else.
 *
 * No prefix and no index suffix. Uniqueness comes from `contactName`, which
 * cross-pairs two pools into 2,304 distinct names — the requirement is the
 * generator's resume check, not a database constraint.
 */
function nameFor(program, index) {
  return contactName(index)
}

/**
 * `8` + program digit + an 8-digit index, so generated phones cannot collide with
 * the seeder's `9000000001-4`. Index 0 carries `""` — see the design note: with
 * `phone TEXT NOT NULL` and `UNIQUE (phone, program_id)`, the empty string is the
 * *only* "contact with no phone", and at most one such row per program can exist.
 */
/**
 * The location names this generator owns, in generation order.
 *
 * `--count`/`--locations` index into this, so the default of 5 draws the first
 * five temples and the pool is the ceiling.
 */
const bulkLocationNames = () => BULK_LOCATIONS

function phoneFor(program, index) {
  if (index === 0) return ""
  return `${PHONE_PREFIX[program] ?? "80"}${pad(index, 8)}`
}

/**
 * One row. Shapes vary across `college` / `company` / `designation` / `notes` /
 * `is_favorite` / `books_read` so a per-column filter has something to filter on
 * rather than a column that is uniformly empty or uniformly equal.
 *
 * Every tenth row is out of scope (assigned to the Admin), so at the 250-row
 * default the Preacher's session sees 225 in-scope rows — comfortably above
 * `MANAGE_BULK_MAX_ITEMS = 200`, which a bulk-cap spec has to be able to select
 * *over*. An every-fourth-row split (the earlier ratio) left only 188 in-scope
 * at the same default, below the cap, so no spec could exercise it.
 */
/**
 * Who recorded this contact, on a 70 / 25 / 5 split across the Preacher, the
 * Admin and nobody.
 *
 * Derived from the index rather than random, so a re-run is byte-identical — the
 * property `bulk-fixtures.spec.ts` asserts for the whole tagged set.
 */
function collectorFor(index, preacherId, adminId) {
  const bucket = index % 20
  if (bucket < COLLECTED_BY_RATIO.preacher * 20) return preacherId
  if (bucket < (COLLECTED_BY_RATIO.preacher + COLLECTED_BY_RATIO.admin) * 20) return adminId
  return null
}

/**
 * One generated contact.
 *
 * ## Why `locationIds` is split, not one pool
 *
 * A contact is assigned to a Preacher AND sits at a location. Those must agree: a
 * contact owned by a Preacher at a location that Preacher does not serve is not a
 * state the programme has, and it renders as an unresolvable reference — the grid
 * would show `Unknown location` for a contact that is plainly in scope, which reads
 * as a data bug rather than as the scope case it is.
 *
 * So in-scope rows draw from the Preacher's own locations and out-of-scope rows
 * from the ones it does not own. That is what makes the unresolved marker reachable
 * through a **real** scope boundary rather than through accidental data: the
 * out-of-scope tenth is genuinely elsewhere.
 */
function buildContact({ program, index, locationIds, seededLocationId, preacherId, adminId }) {
  const inScope = index % 10 !== 9
  // `locationIds` arrives as the Preacher's own set; the generator keeps the rest
  // separately so an out-of-scope row can be placed somewhere else.
  const own = locationIds.owned ?? locationIds.all
  const elsewhere = locationIds.elsewhere ?? locationIds.all
  // `elsewhere` is empty whenever the Preacher owns every generated location — a
  // real configuration at `--locations 2`, where the scope draw covers the whole
  // pool. Indexing an empty array gives `index % 0 === NaN` and `pool[NaN]` is
  // `undefined`, which PostgREST stores as a `NULL` inside a `text[]`. The symptom
  // is an unresolvable `location_ids` entry on the out-of-scope tenth row, found
  // only by the post-insert invariant, so the insert had already happened by the
  // time it was caught.
  //
  // Falling back to the owned set means an out-of-scope row is still placed
  // somewhere real. It is no longer a *scope* demonstration, and nothing depends
  // on that: the unresolved-marker case is covered by the preview harness's `site`
  // column and by the deliberate split at `--locations 5`.
  const pool = inScope || elsewhere.length === 0 ? own : elsewhere

  return {
    program_id: program,
    name: nameFor(program, index),
    phone: phoneFor(program, index),
    // Every sixth row sits on one of the seeder's own locations, so the joined name
    // set spans both seeders' locations and not only this script's. The seeder
    // gives its Preacher location 1, so that id is inside the owned set.
    location_ids:
      index % 6 === 5 && seededLocationId ? [seededLocationId] : [pool[index % pool.length]],
    // In-scope = assigned to the program's Preacher; out-of-scope = the Admin,
    // matching `contacts` SELECT scope in the RLS policies.
    assigned_preacher_id: inScope ? preacherId : adminId,
    // Deliberately not the same as the owner: `assigned_preacher_id` is who owns
    // the contact, `collected_by_id` is who recorded it. Keeping them separate is
    // what makes CAP-4's collector labels worth reading, and the null slice is
    // the only way its empty branch stays reachable in `/manage`.
    collected_by_id: collectorFor(index, preacherId, adminId),
    age: 18 + (index % 50),
    college: index % 3 === 0 ? COLLEGES[index % COLLEGES.length] : null,
    company: index % 3 === 1 ? COMPANIES[index % COMPANIES.length] : null,
    designation: index % 4 === 2 ? DESIGNATIONS[index % DESIGNATIONS.length] : null,
    notes: index % 4 === 0 ? NOTES[index % NOTES.length] : null,
    is_favorite: index % 5 === 0,
    // Two to four titles, so the multiselect cell renders a real multi-pill row
    // rather than one value that never exercises the unpacking.
    books_read: booksFor(index),
    source: SOURCE_MARKER,
  }
}

// ---------------------------------------------------------------------------
// Wipe
// ---------------------------------------------------------------------------

async function wipe(program) {
  log(`Wiping rows with source "${SOURCE_MARKER}" for ${program} (every other row is left untouched)…`)

  // Contacts are selected by `source` and locations by name, which is what the
  // names being plain now requires. The filter is still the only path to a delete,
  // so "never deletes a row this script did not create" stays structural rather
  // than a promise.
  const contacts = await collectPaged(() =>
    db.from("contacts").select("id").eq("program_id", program).eq("source", SOURCE_MARKER),
  )
  const locations = await collectPaged(() =>
    db.from("locations").select("id").eq("program_id", program).in("name", bulkLocationNames()),
  )

  // `.select("id")` is required: PostgREST returns no rows for a bare DELETE, so
  // without it the reported count would always be 0 and a no-op wipe would be
  // indistinguishable from a real one. Batched for the same reason as the insert.
  let deletedContacts = 0
  for (const batch of chunked(contacts, DELETE_BATCH_SIZE)) {
    const removed = await unwrap(
      db.from("contacts").delete().in("id", batch.map((row) => row.id)).select("id"),
      "deleting bulk contacts",
    )
    deletedContacts += removed?.length ?? 0
  }

  let deletedLocations = 0
  for (const batch of chunked(locations, DELETE_BATCH_SIZE)) {
    const removed = await unwrap(
      db.from("locations").delete().in("id", batch.map((row) => row.id)).select("id"),
      "deleting bulk locations",
    )
    deletedLocations += removed?.length ?? 0
  }

  log(`  deleted ${deletedContacts} bulk contact(s)`)
  log(`  deleted ${deletedLocations} bulk location(s)`)
  log(`Wipe complete: ${deletedContacts + deletedLocations} bulk-tagged row(s) removed for ${program}.`)
  return deletedContacts + deletedLocations
}

// ---------------------------------------------------------------------------
// Prerequisites — the DW-3 pre-write check
// ---------------------------------------------------------------------------

/**
 * Checks the staff and locations this script's scope depends on, and applies DW-3
 * **before** anything is written.
 *
 * The order matters for the reason `seed-preview-fixtures.mjs:394-407` gives: a
 * post-write comparison can never detect a repointed id, because the row it reads
 * already carries the id that was just written. Reading first is the only point at
 * which the old id is still visible.
 */
async function verifyPrerequisites(program, authByEmail) {
  const missing = []

  const staff = {}
  for (const role of [PREACHER, ADMIN]) {
    const email = emailFor(role, program)
    const row =
      (await unwrap(
        db.from("users").select("id,email,role,status,location_ids").eq("program_id", program).eq("email", email).maybeSingle(),
        `reading public.users ${email}`,
      )) ?? null

    if (!row) {
      missing.push(`no ${role} row (${email})`)
      continue
    }
    if (row.status !== "Active") missing.push(`${role} row ${email} has status ${row.status}, expected Active`)

    const authUser = authByEmail.get(email)
    if (!authUser) {
      missing.push(`${role} row ${email} names an auth.users row that does not exist`)
    } else if (authUser.id !== row.id) {
      missing.push(
        `DW-3 VIOLATION for ${email}: public.users.id ${row.id} != auth.users.id ${authUser.id}. ` +
          `The sign-in route no longer self-heals a mismatch, so this is corrupt data. Delete that ` +
          `public.users row and re-run; nothing was written.`,
      )
    }

    staff[role] = row
  }

  // The preview seeder's own locations, found by name. They used to be found by
  // `preview-fixture-` prefix, which is only possible while its names carry the
  // tag — and `PREVIEW_LOCATIONS` is a disjoint slice of the Chennai pool, so the
  // names are enough on their own.
  //
  // Ordered, because `buildContact` reads `seededLocations[0]` and PostgREST
  // guarantees no row order. Without `.order` the id could differ between two runs
  // over the same data, which would make the "a re-run is byte-identical" promise
  // false for the `index % 6 === 5` rows.
  const seededLocations = await collectPaged(() =>
    db
      .from("locations")
      .select("id,name")
      .eq("program_id", program)
      .in("name", PREVIEW_LOCATIONS)
      .order("name", { ascending: true }),
  )
  if (seededLocations.length === 0) {
    missing.push(`none of the preview seeder's locations (${PREVIEW_LOCATIONS.join(", ")}) exist for ${program}`)
  } else {
    // The Preacher must own at least one of them. Without this, a programme whose
    // Preacher was scoped to only the generated locations would produce every
    // `index % 6 === 5` row with `location_ids: [null]` — a row that is neither in
    // scope nor resolvable, and that the invariants catch only *after* the insert
    // rather than before it.
    // `staff[PREACHER]`, not the loop variable the staff block above ended on.
    const owned = new Set(staff[PREACHER].location_ids ?? [])
    const shareable = seededLocations.filter((location) => owned.has(location.id))
    if (shareable.length === 0) {
      missing.push(
        `the ${program} Preacher owns none of the preview seeder's locations, so every ` +
          `sixth generated row would point at nothing`,
      )
    }
  }

  if (missing.length > 0) {
    fail(
      `${program} is missing seeded fixture prerequisites: ${missing.join("; ")}.\n` +
        `Run \`pnpm seed:local\` first — it seeds the locations and staff rows this generator depends on. ` +
        `Nothing was written.`,
    )
  }

  return { staff, seededLocations }
}

/** Create-or-update keyed by the deterministic location name. */
async function ensureLocation(program, name) {
  const existing = await unwrap(
    db.from("locations").select("*").eq("program_id", program).eq("name", name).maybeSingle(),
    `reading location ${name}`,
  )
  if (existing) return { row: existing, created: false }

  const inserted = await unwrap(
    db.from("locations").insert({ program_id: program, name, status: "Active" }).select("*").single(),
    `creating location ${name}`,
  )
  return { row: inserted, created: true }
}

/**
 * Widens the Preacher's `location_ids` to the union of the ids that still resolve
 * to a location of the program and the program's bulk locations.
 *
 * `caller_effective_location_ids()` hands a Preacher only its own
 * `users.location_ids`, and `manage-contacts-table.tsx` renders
 * `locationNameById.get(id) ?? id` — so a contact pointing at a location the
 * Preacher is not scoped to degrades to a raw UUID in the cell and breaks the
 * per-column location filter. That is why the generator runs *after*
 * `pnpm seed:local`, which resets this column.
 *
 * Ids that no longer resolve are dropped, so a `--wipe` — which removes the bulk
 * locations and leaves the stale ids behind — cannot make the column grow forever.
 */
/**
 * Set the Preacher's scope to exactly the ids it is given, plus anything it
 * already held that still exists.
 *
 * Named for what it used to do — it widened the Preacher to every generated
 * location — and kept because the *seeder's own* locations are still part of the
 * union. A Preacher must keep reading the rows the other seeder created, or
 * `manage-contacts` loses its two fixed contacts and half its suite with them.
 *
 * What changed is that the generated locations are no longer all of them. The
 * union therefore takes the caller's list as authoritative for the *generated*
 * set and adds the pre-existing ids, rather than adding the generated set to
 * whatever the Preacher happened to hold. Passing every generated location here
 * would restore the old behaviour and silently un-scope the out-of-scope rows
 * this fixture now depends on.
 */
async function widenPreacherLocations(preacher, generatedLocationIds, program, allGeneratedIds) {
  const programLocations = await collectPaged(() => db.from("locations").select("id").eq("program_id", program))
  const known = new Set(programLocations.map((row) => row.id))
  const previous = preacher.location_ids ?? []
  const generated = new Set(allGeneratedIds ?? generatedLocationIds)

  // Anything the Preacher held that is not one of the generated locations is a
  // location this script does not own, and it must survive the rewrite.
  const preserved = previous.filter((id) => known.has(id) && !generated.has(id))
  const union = []
  for (const id of [...preserved, ...generatedLocationIds]) {
    if (known.has(id) && !union.includes(id)) union.push(id)
  }

  if (union.length === previous.length && union.every((id, index) => id === previous[index])) {
    return { row: preacher, changed: false }
  }

  const updated = await unwrap(
    db.from("users").update({ location_ids: union }).eq("id", preacher.id).select("id,location_ids").single(),
    `setting the ${program} Preacher's location_ids`,
  )
  return { row: { ...preacher, location_ids: updated.location_ids }, changed: true }
}

// ---------------------------------------------------------------------------
// Post-write assertions
// ---------------------------------------------------------------------------

/**
 * The matrix invariants, asserted against a **re-read** rather than the rows this
 * run built. A count derived from the insert would only prove the insert returned
 * what it was given.
 */
async function assertInvariants(program, target, preacherId, adminId) {
  const rows = await collectPaged(() =>
    db
      .from("contacts")
      .select(CONTACT_COLUMNS)
      .eq("program_id", program)
      .eq("source", SOURCE_MARKER)
      .order("name", { ascending: true }),
  )
  const locations = await collectPaged(() => db.from("locations").select("id").eq("program_id", program))
  const locationIds = new Set(locations.map((row) => row.id))

  const problems = []
  if (rows.length < target) problems.push(`${rows.length} generated contact(s), expected at least ${target}`)

  // Every row this script created carries the marker; a row without it means the
  // select matched something we did not generate, which is worth failing on.
  const unmarked = rows.filter((row) => row.source !== SOURCE_MARKER)
  if (unmarked.length) problems.push(`${unmarked.length} row(s) in the selected set are not marked source="${SOURCE_MARKER}"`)

  const names = new Set(rows.map((row) => row.name))
  if (names.size !== rows.length) problems.push(`${rows.length - names.size} duplicate name(s)`)

  const unresolved = new Set()
  for (const row of rows) {
    for (const id of row.location_ids ?? []) {
      if (!locationIds.has(id)) unresolved.add(`${row.name}: ${id}`)
    }
  }
  if (unresolved.size) {
    problems.push(`${unresolved.size} unresolvable location_ids entry/entries — e.g. ${[...unresolved][0]}`)
  }

  const blank = rows.filter((row) => row.phone === "")
  const withPhone = rows.filter((row) => row.phone !== "")
  if (blank.length !== 1) {
    problems.push(
      `${blank.length} row(s) with phone = "" — exactly one is possible: contacts.phone is NOT NULL and ` +
        `UNIQUE (phone, program_id), so a second blank row would violate the index`,
    )
  }

  // Two of the matrix's coverage promises can only be made by *some* set of
  // indexes, so they are conditioned on the volume rather than asserted flat:
  // index 0 carries the blank phone, so a set with phone coverage needs at least
  // 2 indexes, and index 9 is the first out-of-scope row, so it needs at least 10.
  // At the 250-row default both thresholds are far below the volume, so nothing is
  // skipped in practice — but `--count 1` is a legal flag value, and a generator
  // that exits 1 on legal input is worse than one that asserts what it can.
  const MIN_INDEXES_FOR_PHONE = 2
  const MIN_INDEXES_FOR_OUT_OF_SCOPE = 10

  if (target >= MIN_INDEXES_FOR_PHONE && withPhone.length === 0) {
    problems.push(`no row has a phone set (expected at least one of the first ${target} indexes)`)
  }

  const inScope = rows.filter((row) => row.assigned_preacher_id === preacherId)
  const outOfScope = rows.filter((row) => row.assigned_preacher_id === adminId)
  if (inScope.length === 0) problems.push("no in-scope rows (assigned to the program's Preacher)")
  if (target >= MIN_INDEXES_FOR_OUT_OF_SCOPE && outOfScope.length === 0) {
    problems.push(`no out-of-scope rows (assigned to the program's Admin; expected at least one of the first ${target} indexes)`)
  }

  // The complement of the two sets above. A row assigned to neither — a null id,
  // or an id from another program, or a Preacher/Admin swap — shrinks both sets
  // and would otherwise pass unnoticed as long as one row of each kind remained.
  // An Admin sees every such row, so it would be visible in the grid while the
  // Preacher could not see it at all; naming it is the only way it gets fixed.
  const unassigned = rows.filter(
    (row) => row.assigned_preacher_id !== preacherId && row.assigned_preacher_id !== adminId,
  )
  if (unassigned.length) {
    const sample = unassigned[0]
    problems.push(
      `${unassigned.length} row(s) are assigned to neither the Preacher ${preacherId} nor the Admin ${adminId} — ` +
        `e.g. ${sample.name} is assigned to ${sample.assigned_preacher_id ?? "null"}`,
    )
  }

  if (problems.length > 0) {
    fail(`matrix invariants failed for ${program}:\n  - ${problems.join("\n  - ")}`)
  }

  return {
    rows: rows.length,
    distinctNames: names.size,
    distinctLocations: new Set(rows.flatMap((row) => row.location_ids ?? [])).size,
    inScope: inScope.length,
    outOfScope: outOfScope.length,
    blank: blank.length,
    withPhone: withPhone.length,
  }
}

/**
 * The post-write DW-3 re-assert. Same two questions as the pre-write check, read
 * again: `public.users.id` must still equal the `auth.users.id` it names, and the
 * row must still be `Active`.
 */
async function assertIdAlignment(program, authByEmail) {
  const problems = []
  for (const role of [PREACHER, ADMIN]) {
    const email = emailFor(role, program)
    const row = await unwrap(
      db.from("users").select("id,status").eq("program_id", program).eq("email", email).maybeSingle(),
      `re-reading public.users ${email}`,
    )
    if (!row) {
      problems.push(`${email}: the row disappeared`)
      continue
    }
    const authUser = authByEmail.get(email)
    if (!authUser) problems.push(`${email}: no auth.users row`)
    else if (authUser.id !== row.id) problems.push(`${email}: public.users.id ${row.id} != auth.users.id ${authUser.id}`)
    if (row.status !== "Active") problems.push(`${email}: status is ${row.status}, expected Active`)
  }
  return problems
}

// ---------------------------------------------------------------------------
// Per-program generation
// ---------------------------------------------------------------------------

async function generateProgram(program, options) {
  const authByEmail = await authUsersByEmail()
  const { staff, seededLocations } = await verifyPrerequisites(program, authByEmail)
  const preacher = staff[PREACHER]
  const adminId = staff[ADMIN].id

  // --- locations ------------------------------------------------------------
  // Real Chennai locations behind the fixture tag. `bulk-fixtures.spec.ts` finds
  // these by the prefix and `listBulkLocations` in `e2e/fixtures/bulk-contacts.ts`
  // selects on it, so the tag must stay the first token — the *name* is what
  // changes, and it is what the grid's `linked` renderer puts on screen.
  const bulkLocations = []
  let locationsCreated = 0
  for (let n = 1; n <= options.locations; n += 1) {
    // A plain Chennai temple name. The pool is disjoint from the preview seeder's
    // two, which is what lets both find their own rows by name now that neither
    // carries a marker.
    const { row, created } = await ensureLocation(program, bulkLocationNames()[n - 1])
    bulkLocations.push(row)
    if (created) locationsCreated += 1
  }

  // --- the Preacher's scope -------------------------------------------------
  // Three or four locations, deliberately a SUBSET of the generated ones. The
  // Preacher previously received every generated location, because a contact
  // outside a Preacher's scope renders its location as an unresolved marker and
  // `bulk-fixtures.spec.ts` had no case for it.
  //
  // That is a scope decision with teeth: it changes which rows a Preacher session
  // can read at all, so `bulk-fixtures.spec.ts:345` is rewritten rather than
  // deleted — see that spec's own header for what it now claims.
  const widened = await widenPreacherLocations(
    preacher,
    locationsForPreacher(bulkLocations.map((row) => row.id), PROGRAM_INDEX[program] ?? 0),
    program,
    bulkLocations.map((row) => row.id),
  )

  // --- what is missing ------------------------------------------------------
  // Selecting by `source` — not by a generated id list — is what makes a run that
  // was interrupted mid-insert recoverable, and what keeps a spec that edited a
  // generated row from having that edit reverted.
  const existing = await collectPaged(() =>
    db.from("contacts").select("id,name").eq("program_id", program).eq("source", SOURCE_MARKER),
  )
  const existingNames = new Set(existing.map((row) => row.name))

  const missing = []
  for (let index = 0; index < options.count; index += 1) {
    const name = nameFor(program, index)
    if (existingNames.has(name)) continue
    missing.push(
      buildContact({
        program,
        index,
        locationIds: {
          // What the Preacher can resolve, plus the seeder's own location it was
          // given. `elsewhere` is the complement within the generated set — the
          // locations that exist for this program but are outside its scope.
          owned: [...widened.row.location_ids ?? []],
          elsewhere: bulkLocations
            .map((row) => row.id)
            .filter((id) => !(widened.row.location_ids ?? []).includes(id)),
        },
        // Only a location the Preacher can resolve — see the check above.
        seededLocationId: seededLocations.find((location) =>
          (widened.row.location_ids ?? []).includes(location.id),
        )?.id ?? null,
        preacherId: widened.row.id,
        adminId,
      }),
    )
  }

  // --- batched insert -------------------------------------------------------
  let insertRequests = 0
  for (let offset = 0; offset < missing.length; offset += options.chunkSize) {
    const chunk = missing.slice(offset, offset + options.chunkSize)
    const chunkIndex = Math.floor(offset / options.chunkSize)
    const { error } = await db.from("contacts").insert(chunk)
    if (error) {
      fail(
        `inserting chunk ${chunkIndex} (${chunk.length} rows, rows ${offset}-${offset + chunk.length - 1}) failed: ` +
          `${error.code ?? ""} ${error.message}`.replace(/\s+/g, " "),
      )
    }
    insertRequests += 1
  }

  // --- re-assert against a re-read -----------------------------------------
  const problems = await assertIdAlignment(program, await authUsersByEmail())
  if (problems.length > 0) {
    fail(`DW-3 / fixture integrity check failed:\n  - ${problems.join("\n  - ")}`)
  }

  const summary = await assertInvariants(program, options.count, widened.row.id, adminId)

  return {
    program,
    created: missing.length,
    existing: existing.length,
    insertRequests,
    locationsCreated,
    bulkLocations: bulkLocations.length,
    widened: widened.changed,
    scopeLocationCount: widened.row.location_ids?.length ?? 0,
    summary,
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const startedAt = Date.now()

  let options
  try {
    options = parseArgs(process.argv.slice(2))
  } catch (error) {
    fail(error.message)
  }

  const allowNonLocal = options.allowNonLocal || process.env.SEED_ALLOW_NON_LOCAL === "1"

  // Order matters: flags → refusal → credentials → refusal → client. A bad flag
  // must not touch the network, and a refused run must not have constructed a
  // client, let alone sent a request.
  assertLocalTarget(allowNonLocal)
  const { apiUrl, serviceRoleKey, source } = resolveCredentials()
  assertResolvedTargetIsLocal(apiUrl, allowNonLocal)

  secretValues.add(serviceRoleKey)
  db = createClient(apiUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })

  const programs = options.program === "both" ? PROGRAMS : [options.program]
  // `both` splits the count rather than doubling it: `--count 1052 --program both`
  // is 1,052 rows in total across the two programs, not 1,052 of each.
  const perProgram = programs.length === 1 ? options.count : Math.ceil(options.count / programs.length)

  log(`Bulk contact fixtures for ${sanitizeSupabaseUrl(apiUrl)} (credentials from ${source}).`)
  log(
    `Programs: ${programs.join(", ")} — ${perProgram} row(s) each, ${options.locations} bulk location(s) each, ` +
      `chunk size ${options.chunkSize}.`,
  )
  log("")

  if (options.wipe) {
    let removed = 0
    for (const program of programs) removed += await wipe(program)
    log(`Total removed: ${removed}`)
    log(`Elapsed: ${Date.now() - startedAt}ms`)
    return
  }

  const results = []
  for (const program of programs) {
    results.push(await generateProgram(program, { ...options, count: perProgram }))
  }

  const totalCreated = results.reduce((sum, result) => sum + result.created, 0)
  const totalRequests = results.reduce((sum, result) => sum + result.insertRequests, 0)

  for (const result of results) {
    const { summary } = result
    log(`[${result.program}]`)
    log(`  bulk locations   ${result.bulkLocations} (${result.locationsCreated} created this run)`)
    log(`  preacher scope   ${result.scopeLocationCount} location id(s)${result.widened ? " (widened this run)" : " (unchanged)"}`)
    log(`  tagged contacts  ${result.existing + result.created} total, ${result.created} inserted this run`)
    log(
      `  invariants       ${summary.rows} tagged rows, ${summary.distinctNames} distinct names, ` +
        `${summary.distinctLocations} resolvable location id(s), ${summary.withPhone} phone(s) set, ` +
        `${summary.blank} empty, ${summary.inScope} in-scope, ${summary.outOfScope} out-of-scope`,
    )
    log("")
  }

  log(`Total created: ${totalCreated}`)
  log(`Insert requests: ${totalRequests} (chunk size ${options.chunkSize}, PostgREST)`)
  log(`Elapsed: ${Date.now() - startedAt}ms`)
  log("DW-3 check passed: every public.users.id equals its auth.users.id; the Preacher and Admin rows are Active.")
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
