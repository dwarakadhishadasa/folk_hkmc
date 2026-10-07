#!/usr/bin/env node
/**
 * verify-attendance-contract.mjs — story 7.8: CAP-5, the `/attendance`
 * payload/status contract, verified against a real deployment.
 *
 * The attendance route (`apps/<program>/app/attendance/route.ts`) is frozen.
 * This script only observes it.
 * Every assertion below is a read-only probe except the create/duplicate pair,
 * which cleans up the row it created.
 *
 * Staff requests carry the **Supabase session cookie**, not a bearer token:
 * `getStaffContext` reads `createSupabaseServerClient()`, which resolves the
 * session from cookies only. So the script signs in through Supabase Auth with
 * the seeded fixture password and replays the cookies the server would set.
 * A hand-signed JWT would prove nothing about that path.
 *
 * Usage:
 *   node scripts/verify-attendance-contract.mjs
 *   node scripts/verify-attendance-contract.mjs --base-url https://host --program folk
 *
 * Options:
 *   --base-url <url>   Deployment under test (default: PRODUCTION_URL, else the go-live URL).
 *   --program <id>     folk | gita-life (default: folk).
 *   --keep             Do not delete the attendance row this script created.
 *
 * Credentials come from the gitignored `.env.migration.local` and
 * `.env.preview-seed.local`; the fixture password is never printed.
 */

import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createClient } from "@supabase/supabase-js"
import { createServerClient, serializeCookieHeader } from "@supabase/ssr"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
try {
  process.loadEnvFile(path.join(repoRoot, ".env.migration.local"))
} catch {
  // Fall back to an already-exported environment.
}

// ---------------------------------------------------------------------------
// Output redaction — registered before anything is printed.
// ---------------------------------------------------------------------------

const REDACTED = "***redacted***"
const secretValues = new Set()

function registerSecret(name) {
  const value = process.env[name]
  if (typeof value === "string" && value.length >= 8) secretValues.add(value)
}

for (const name of [
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_JWT_SECRET",
  "SMTP_PASS",
  "SMTP_USER",
  "POSTGRES_PASSWORD",
  "PREVIEW_FIXTURE_PASSWORD",
  "OLD_SUPABASE_SERVICE_ROLE_KEY",
  "VERCEL_TOKEN",
]) {
  registerSecret(name)
}
for (const name of ["POSTGRES_URL", "POSTGRES_URL_NON_POOLING", "POSTGRES_PRISMA_URL", "OLD_POSTGRES_URL", "OLD_POSTGRES_URL_NON_POOLING"]) {
  const url = process.env[name]
  if (typeof url !== "string") continue
  try {
    const password = new URL(url).password
    if (password.length >= 8) secretValues.add(password)
  } catch {
    // Not a parseable URL; nothing to register.
  }
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
// Configuration
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2)

function flagValue(...names) {
  for (const name of names) {
    const index = argv.indexOf(name)
    if (index !== -1) return argv[index + 1]
  }
  return null
}

const BASE_URL = (flagValue("--base-url") || process.env.PRODUCTION_URL?.trim() || "https://folk-hkmc-rho.vercel.app").replace(/\/+$/, "")
const PROGRAM = flagValue("--program")?.trim() || "folk"
const KEEP_CREATED = argv.includes("--keep")

if (!["folk", "gita-life"].includes(PROGRAM)) {
  fail(`--program must be folk or gita-life (got ${PROGRAM})`)
}

const TAG = "preview-fixture-"
const SEED_FILE = path.join(repoRoot, ".env.preview-seed.local")

function requireEnv(name, purpose) {
  const value = process.env[name]?.trim()
  if (!value) fail(`${name} is not set (needed to ${purpose}). Set it in .env.migration.local or the environment.`)
  return value
}

function requireFixturePassword() {
  const fromEnv = process.env.PREVIEW_FIXTURE_PASSWORD?.trim()
  if (fromEnv) return fromEnv
  if (existsSync(SEED_FILE)) {
    const match = /^PREVIEW_FIXTURE_PASSWORD=(.*)$/m.exec(readFileSync(SEED_FILE, "utf8"))
    if (match?.[1].trim()) {
      secretValues.add(match[1].trim())
      return match[1].trim()
    }
  }
  fail(`No fixture password. Run scripts/seed-preview-fixtures.mjs first, or set PREVIEW_FIXTURE_PASSWORD.`)
}

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL", "read the seeded fixtures")
const ANON_KEY = (
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
)?.trim()
const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY", "read and clean up the fixtures")
const FIXTURE_PASSWORD = requireFixturePassword()

if (!ANON_KEY) fail("NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) is not set.")

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ---------------------------------------------------------------------------
// Result bookkeeping
// ---------------------------------------------------------------------------

const results = []
const warnings = []
function check(name, pass, detail = "") {
  results.push({ name, pass, detail })
  log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${redact(detail)}` : ""}`)
}

async function unwrap(promise, what) {
  const { data, error } = await promise
  if (error) fail(`${what} failed: ${error.code ?? ""} ${error.message}`.replace(/\s+/g, " "))
  return data
}

// ---------------------------------------------------------------------------
// Staff session (cookie-based, exactly as the app resolves it)
// ---------------------------------------------------------------------------

/**
 * Sign in through Supabase Auth and return the Cookie header the app's server
 * client would see. @supabase/ssr is used as the cookie codec so the header is
 * byte-identical to what a browser sign-in produces — hand-assembling it is
 * how a verifier ends up testing a format the server never reads.
 */
async function signInCookieHeader(email) {
  const store = new Map()
  const client = createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll: () => [...store].map(([name, value]) => ({ name, value })),
      setAll: (cookiesToSet) => cookiesToSet.forEach(({ name, value }) => store.set(name, value)),
    },
  })

  const { error } = await client.auth.signInWithPassword({ email, password: FIXTURE_PASSWORD })
  if (error) fail(`sign-in failed for ${email}: ${error.message}. Run scripts/seed-preview-fixtures.mjs to (re)create the fixtures.`)

  const header = [...store]
    .map(([name, value]) => serializeCookieHeader(name, value, {}))
    .join("; ")
  if (!header) fail(`sign-in for ${email} set no session cookie`)
  return header
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function post(pathname, body, cookie) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })
  return { status: response.status, body: await safeJson(response) }
}

async function get(pathname, cookie) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    headers: cookie ? { Cookie: cookie } : {},
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  })
  return { status: response.status, body: await safeJson(response) }
}

async function safeJson(response) {
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * The columns the renamed service-role inserts depend on.
 *
 * `lib/invite-log.ts` and `lib/authz.ts` write `user_id`, `inviter_user_id` and
 * `actor_user_id` after `20261007000000_retire_airtable_named_columns.sql`. If
 * the DDL ever does not take effect while the migration ledger row is still
 * recorded, PostgREST answers 42703 -- and because neither insert inspects
 * `error`, the invite route still returns 201 and the audit trail silently stops
 * being written. Nothing else in this repo would notice: the insert payload is
 * untyped (`createSupabaseAdminClient()` passes no `Database` generic, so
 * `pnpm typecheck:workspace` stays green with the old names), and the Airtable
 * gate only reads source text. Selecting the columns is what makes PostgREST
 * validate them against the live schema.
 */
async function assertRenamedColumnsExist() {
  const { data, error } = await db
    .from("invite_log")
    .select("id, user_id, inviter_user_id")
    .limit(1)
  check(
    `${PROGRAM}/invite_log exposes user_id + inviter_user_id (20261007000000 applied)`,
    !error,
    error ? `${error.code ?? ""} ${error.message}` : undefined,
  )
  void data

  const audit = await db.from("audit_events").select("id, actor_user_id").limit(1)
  check(
    `${PROGRAM}/audit_events exposes actor_user_id (20261007000000 applied)`,
    !audit.error,
    audit.error ? `${audit.error.code ?? ""} ${audit.error.message}` : undefined,
  )
}

async function loadFixtures() {
  const openSession = await unwrap(
    db
      .from("sessions")
      .select("id,name,preacher_id,location_id,public_attendance_enabled,attendance_opens_at,attendance_closes_at,attendance_url")
      .eq("program_id", PROGRAM)
      .eq("name", `${TAG}session-open-${PROGRAM}`)
      .maybeSingle(),
    `reading the ${PROGRAM} open session`,
  )
  if (!openSession) fail(`No open fixture session for ${PROGRAM}. Run scripts/seed-preview-fixtures.mjs first.`)

  const outOfScopeSession = await unwrap(
    db
      .from("sessions")
      .select("id,name,preacher_id,location_id")
      .eq("program_id", PROGRAM)
      .eq("name", `${TAG}session-out-of-scope-${PROGRAM}`)
      .maybeSingle(),
    `reading the ${PROGRAM} out-of-scope session`,
  )
  if (!outOfScopeSession) fail(`No out-of-scope fixture session for ${PROGRAM}. Run scripts/seed-preview-fixtures.mjs first.`)

  const contacts = await unwrap(
    db.from("contacts").select("id,name,phone,assigned_preacher_id").eq("program_id", PROGRAM).eq("source", "preview-fixture"),
    `reading ${PROGRAM} fixture contacts`,
  )
  const inScope = contacts?.find((contact) => contact.assigned_preacher_id === openSession.preacher_id) ?? null
  const outOfScope = contacts?.find((contact) => contact.assigned_preacher_id !== openSession.preacher_id) ?? null
  if (!inScope) fail(`No in-scope fixture contact for ${PROGRAM}. Run scripts/seed-preview-fixtures.mjs first.`)
  if (!outOfScope) fail(`No out-of-scope fixture contact for ${PROGRAM}. Run scripts/seed-preview-fixtures.mjs first.`)

  const users = await unwrap(
    db.from("users").select("id,email,role,status,assigned_preacher_id,location_ids").eq("program_id", PROGRAM).like("email", `${TAG}%`),
    `reading ${PROGRAM} fixture staff`,
  )
  if (!users?.some((user) => user.role === "Preacher")) {
    fail(`No fixture Preacher for ${PROGRAM}. Run scripts/seed-preview-fixtures.mjs first.`)
  }

  // DW-3: the row the server reads must be the auth user the cookie names.
  const byEmail = new Map()
  let page = 1
  for (;;) {
    const listed = await unwrap(db.auth.admin.listUsers({ page, perPage: 1000 }), `listing auth users (page ${page})`)
    for (const user of listed.users) byEmail.set(user.email?.trim().toLowerCase(), user)
    if (!listed.nextPage) break
    page = listed.nextPage
  }
  // Fatal, not a recorded check: every assertion below runs inside a real staff
  // chain, so continuing from a fixture set already known to be corrupt would
  // report green over data the server cannot sign in against. Both ids are named
  // because an actual mismatch -- not a missing row -- is the case an operator
  // has to diagnose.
  for (const user of users ?? []) {
    const authUser = byEmail.get(user.email)
    if (!authUser) {
      fail(`DW-3: ${user.email} has a public.users row but no auth.users row. Re-run scripts/seed-preview-fixtures.mjs.`)
    }
    if (authUser.id !== user.id) {
      fail(
        `DW-3: ${user.email} public.users.id ${user.id} != auth.users.id ${authUser.id}. ` +
          "The sign-in route no longer self-heals a mismatch; delete the public.users row and re-seed.",
      )
    }
    check(`${PROGRAM}/DW-3 ${user.role} id alignment`, true)
  }

  return { openSession, outOfScopeSession, inScope, outOfScope, users }
}

// ---------------------------------------------------------------------------
// CAP-5
// ---------------------------------------------------------------------------

const UNKNOWN_SESSION_ID = "11111111-2222-3333-4444-555555555555"

async function run() {
  log(`CAP-5 attendance contract`)
  log(`Base URL : ${BASE_URL}`)
  log(`Program  : ${PROGRAM}`)
  log("")

  // Freshness probe. Story 7.7 removed this string from
  // `apps/*/app/layout.tsx`, so its presence means the deployment predates the
  // branch under test. It is reported as a WARN, not a failure: every assertion
  // below still characterises the route as deployed, which is a real result --
  // but it is a result about the OLD build, and the run must say so rather than
  // let a green matrix imply the branch was verified.
  const freshness = await get("/")
  const freshnessText = typeof freshness.body === "string" ? freshness.body : JSON.stringify(freshness.body ?? {})
  const staleMarker = "Airtable handoff"
  if (freshnessText.includes(staleMarker)) {
    log(`WARN  the deployment at ${BASE_URL} still serves a pre-story-7.7 build (its <meta description> says "${staleMarker}").`)
    log("WARN  Everything below characterises the route AS DEPLOYED, not the branch in this diff.")
    log("WARN  Redeploy the branch and re-run before treating these results as branch verification.")
    warnings.push("deployed build predates this branch (stale <meta description>)")
  }

  await assertRenamedColumnsExist()
  const { openSession, outOfScopeSession, inScope, outOfScope, users } = await loadFixtures()

  const preacherUser = users.find((user) => user.role === "Preacher")
  const volunteerUser = users.find((user) => user.role === "Volunteer")
  if (!preacherUser || !volunteerUser) fail(`The ${PROGRAM} fixtures are missing a Preacher or Volunteer. Run scripts/seed-preview-fixtures.mjs.`)

  log(`Open session        : ${openSession.id}`)
  log(`Out-of-scope session: ${outOfScopeSession.id}`)
  log(`Registered mobiles  : in-scope ${inScope.phone}, out-of-scope ${outOfScope.phone}`)
  log("")

  // --- POST validation (no session needed: all of these fail before auth) ---

  const empty = await post("/attendance", {})
  check("POST {} -> 400 Invalid mobile number", empty.status === 400 && empty.body?.error === "Invalid mobile number", `got ${empty.status} ${JSON.stringify(empty.body)?.slice(0, 80)}`)

  const badMobile = await post("/attendance", { mobile: "abc", sessionId: openSession.id })
  check("POST {mobile:'abc'} -> 400 Invalid mobile number", badMobile.status === 400 && badMobile.body?.error === "Invalid mobile number", `got ${badMobile.status} ${JSON.stringify(badMobile.body)?.slice(0, 80)}`)

  const emptySession = await post("/attendance", { mobile: outOfScope.phone, sessionId: "" })
  check(
    'POST with empty sessionId -> 400',
    emptySession.status === 400 && typeof emptySession.body?.error === "string" && emptySession.body.error.length > 0,
    `got ${emptySession.status} ${JSON.stringify(emptySession.body)?.slice(0, 80)}`,
  )

  const unknownSession = await post("/attendance", { mobile: outOfScope.phone, sessionId: UNKNOWN_SESSION_ID })
  check(
    'POST nonexistent sessionId -> 404 "Invalid attendance session."',
    unknownSession.status === 404 && unknownSession.body?.error === "Invalid attendance session.",
    `got ${unknownSession.status} ${JSON.stringify(unknownSession.body)?.slice(0, 80)}`,
  )

  // --- POST unregistered contact -------------------------------------------

  const unregistered = await post("/attendance", { mobile: "9999999999", sessionId: openSession.id })
  check(
    "POST unregistered mobile -> 404 notRegistered: true",
    unregistered.status === 404 && unregistered.body?.notRegistered === true,
    `got ${unregistered.status} ${JSON.stringify(unregistered.body)?.slice(0, 120)}`,
  )

  // --- POST create then duplicate ------------------------------------------
  //
  // The out-of-scope contact is used so the seeded attendance row (in-scope
  // contact) stays untouched and the seeder remains idempotent. UNIQUE
  // (contact_id, session_id) -> 23505 must surface as 409 duplicate: true.

  // A previous aborted run may have left the row this script creates. Removing
  // it first is what makes the create assertion mean "the route created it"
  // rather than "the row was already there".
  await unwrap(
    db.from("attendance").delete().eq("contact_id", outOfScope.id).eq("session_id", openSession.id).select("id"),
    "clearing a stale attendance row for the create assertion",
  )

  let createdId = null
  try {
    const create = await post("/attendance", { mobile: outOfScope.phone, sessionId: openSession.id })
    createdId = typeof create.body?.id === "string" ? create.body.id : null
    check(
      "POST registered mobile -> 201 with id",
      create.status === 201 && createdId !== null && /^[0-9a-f-]{36}$/i.test(createdId),
      `got ${create.status} ${JSON.stringify(create.body)?.slice(0, 120)}`,
    )

    const duplicate = await post("/attendance", { mobile: outOfScope.phone, sessionId: openSession.id })
    check(
      "POST same mobile + session again -> 409 duplicate: true",
      duplicate.status === 409 && duplicate.body?.duplicate === true,
      `got ${duplicate.status} ${JSON.stringify(duplicate.body)?.slice(0, 120)}`,
    )

  // --- GET scoping ---------------------------------------------------------

  const unauth = await get("/attendance")
  check("GET unauthenticated -> 401", unauth.status === 401, `got ${unauth.status}`)

  const preacherCookie = await signInCookieHeader(preacherUser.email)
  const volunteerCookie = await signInCookieHeader(volunteerUser.email)

  const outOfScopeRead = await get(`/attendance?session=${outOfScopeSession.id}`, preacherCookie)
  check(
    'GET another session -> 403 "This session is outside your allowed scope."',
    outOfScopeRead.status === 403 && outOfScopeRead.body?.error === "This session is outside your allowed scope.",
    `got ${outOfScopeRead.status} ${JSON.stringify(outOfScopeRead.body)?.slice(0, 120)}`,
  )
  // The 403 body is `{error}`, so a check on the body's shape could never fail.
  // What the matrix row actually promises is "no attendance rows returned", and
  // only a service-role read of the session can witness that: the row set is
  // real, and the caller's 403 is the only thing standing between it and a
  // Preacher who is outside its scope.
  const outOfScopeRows = await unwrap(
    db.from("attendance").select("id").eq("session_id", outOfScopeSession.id),
    "reading the out-of-scope session's attendance rows",
  )
  const outOfScopeIsSeeded = (outOfScopeRows?.length ?? 0) > 0
  check(
    "403 withheld rows the service role can read",
    outOfScopeIsSeeded ? outOfScopeRead.status === 403 && !Array.isArray(outOfScopeRead.body) : false,
    outOfScopeIsSeeded
      ? `service role sees ${outOfScopeRows.length} row(s); the Preacher's response was ${outOfScopeRead.status} ${JSON.stringify(outOfScopeRead.body)?.slice(0, 80)}`
      : "the out-of-scope session has no attendance rows, so there is nothing for the 403 to withhold",
  )

  const ownRead = await get(`/attendance?session=${openSession.id}`, preacherCookie)
  check(
    "GET as the owning Preacher -> 200 array",
    ownRead.status === 200 && Array.isArray(ownRead.body) && ownRead.body.length > 0,
    `got ${ownRead.status} ${Array.isArray(ownRead.body) ? `array of ${ownRead.body.length}` : typeof ownRead.body}`,
  )

  // A Volunteer has no attendance-dashboard grant; the route's role list is
  // Admin/Preacher/Assistant, so this must be 403 rather than an empty list.
  const volunteerRead = await get(`/attendance?session=${openSession.id}`, volunteerCookie)
  check(
    "GET as a Volunteer -> 403 (no dashboard grant)",
    volunteerRead.status === 403,
    `got ${volunteerRead.status} ${JSON.stringify(volunteerRead.body)?.slice(0, 120)}`,
  )

  // --- parseKnownAttendanceIds --------------------------------------------

  // Filter by the single row this script created, so "excluded" is a real
  // difference between the two reads. Filtering by every id would return an
  // empty list, where "nothing survived the filter" and "the filter ran" are
  // indistinguishable.
  const excludedId = createdId
  const allIds = Array.isArray(ownRead.body) ? ownRead.body.map((row) => row.id).filter(Boolean) : []

  if (excludedId && allIds.length > 1) {
    const filtered = await get(`/attendance?session=${openSession.id}&knownAttendanceIds=${excludedId}`, preacherCookie)
    const filteredIds = Array.isArray(filtered.body) ? filtered.body.map((row) => row.id) : []
    check(
      `GET knownAttendanceIds=<created uuid> excludes it and keeps the rest`,
      filtered.status === 200 && !filteredIds.includes(excludedId) && filteredIds.length === allIds.length - 1,
      `got ${filtered.status}; ${allIds.length} rows unfiltered, ${filteredIds.length} filtered`,
    )

    // `parseKnownAttendanceIds` returns null when any entry is not a UUID, so
    // the whole filter is ignored rather than partially applied.
    const poisoned = await get(`/attendance?session=${openSession.id}&knownAttendanceIds=not-a-uuid,${excludedId}`, preacherCookie)
    const poisonedIds = Array.isArray(poisoned.body) ? poisoned.body.map((row) => row.id) : []
    check(
      "GET knownAttendanceIds with a non-UUID entry is ignored entirely",
      poisoned.status === 200 && poisonedIds.includes(excludedId) && poisonedIds.length === allIds.length,
      `got ${poisoned.status}; filtered=${filteredIds.length} poisoned=${poisonedIds.length} unfiltered=${allIds.length}`,
    )
  } else {
    check(
      "GET knownAttendanceIds filter assertions",
      false,
      `needs at least two attendance rows in the open session (saw ${allIds.length}); seed another or run with a session that has more history`,
    )
  }

  } finally {
    // `fail()` calls process.exit(1), which skips a `finally`, so the hard-exit
    // path is deliberately NOT relied on here. This covers the ordinary throw,
    // timeout and fall-through paths, each of which would otherwise leak a real
    // attendance row and make the NEXT run's create assertion fail against its
    // own residue. It has to close here rather than right after the create:
    // the knownAttendanceIds filter below needs this row to still exist.
    if (createdId !== null && KEEP_CREATED) {
      log(`Left in place (--keep): attendance ${createdId}`)
    } else if (createdId !== null) {
      const deleted = await unwrap(
        db.from("attendance").delete().eq("id", createdId).select("id"),
        "deleting the attendance row this script created",
      )
      check(`Cleaned up the row this script created (${createdId.slice(0, 8)}…)`, (deleted?.length ?? 0) === 1, `${deleted?.length ?? 0} row(s) removed`)
    }
  }

  log("")
  const passed = results.filter((result) => result.pass).length
  log(`${passed}/${results.length} passed`)
  if (warnings.length > 0) {
    log(`${warnings.length} warning(s): ${warnings.join("; ")}`)
  }

  if (passed !== results.length) {
    console.error("")
    console.error(`${results.length - passed} CAP-5 assertion(s) failed against ${BASE_URL}.`)
    if (unknownSession.status !== 404 || ownRead.status !== 200) {
      console.error("The deployment may predate this branch. The story records such a failure; it is not worked around.")
    }
    process.exit(1)
  }
  process.exit(0)
}

await run()
