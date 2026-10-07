#!/usr/bin/env node
/**
 * seed-preview-fixtures.mjs — story 7.8: durable preview fixtures.
 *
 * The hosted project is disposable pre-cutover, so these rows are safe to wipe
 * and re-create. They exist so an operator can sign in on the preview, and so
 * `verify-attendance-contract.mjs` (CAP-5) has a real staff chain to exercise.
 *
 * Per program (`folk`, `gita-life`) this seeds:
 *   - two locations
 *   - four staff — Admin, Preacher, Volunteer, Assistant (the latter two
 *     routed through the Preacher) — each with a confirmed `auth.users` row
 *   - an in-scope and an out-of-scope contact
 *   - one open session (`public_attendance_enabled`, opens now, closes in 30d)
 *     plus one deliberately out-of-scope session for the CAP-5 GET scope check
 *   - one attendance row (the in-scope contact, in the open session)
 *
 * Every tagged row carries a `preview-fixture-` prefix so `--wipe` is a filter
 * rather than a truncate. Rows without the tag are never touched.
 *
 * DW-3: `public.users.id` MUST equal the `auth.users.id` it names. The
 * pre-Supabase sign-in route's self-heal is gone, so a mismatch is unfixable
 * corrupt data. This script asserts the equality for every seeded user and
 * exits 1 on mismatch rather than writing a row it cannot vouch for.
 *
 * Usage:
 *   node scripts/seed-preview-fixtures.mjs            # seed (idempotent)
 *   node scripts/seed-preview-fixtures.mjs --wipe     # delete tagged rows + auth users
 *
 * Credentials come from the gitignored `.env.migration.local`. The fixture
 * password is never printed: it is taken from PREVIEW_FIXTURE_PASSWORD, else
 * from the gitignored `.env.preview-seed.local`, else generated and written
 * there (the path is printed, the value is not).
 */

import { existsSync, readFileSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createClient } from "@supabase/supabase-js"

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

const PROGRAMS = ["folk", "gita-life"]
const TAG = "preview-fixture-"
const SEED_FILE = path.join(repoRoot, ".env.preview-seed.local")
const SITE_URL = (process.env.PRODUCTION_URL?.trim() || "https://folk-hkmc-rho.vercel.app").replace(/\/+$/, "")

const ROLES = [
  { role: "Admin", routedThroughPreacher: false },
  { role: "Preacher", routedThroughPreacher: false },
  { role: "Volunteer", routedThroughPreacher: true },
  { role: "Assistant", routedThroughPreacher: true },
]

// Deterministic, collision-free mobiles. The (phone, program_id) unique index
// makes these the idempotency key for contacts.
const MOBILE = {
  folk: { inScope: "9000000001", outOfScope: "9000000002" },
  "gita-life": { inScope: "9000000003", outOfScope: "9000000004" },
}

const argv = process.argv.slice(2)
const wipeOnly = argv.includes("--wipe")

function requireEnv(name, purpose) {
  const value = process.env[name]?.trim()
  if (!value) fail(`${name} is not set (needed to ${purpose}). Set it in .env.migration.local or the environment.`)
  return value
}

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL", "reach the hosted project")
const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY", "seed as the service role")

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ---------------------------------------------------------------------------
// Fixture password
//
// Resolution order keeps re-runs stable: an explicit env var wins, then the
// previously written file, then a fresh generation. The value is written to the
// gitignored file and its path printed — never the value itself.
// ---------------------------------------------------------------------------

function generatePassword() {
  // 24 chars from a set without shell/URL-hostile characters.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%^*-_=+"
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")
}

function readSeedFilePassword() {
  if (!existsSync(SEED_FILE)) return null
  const match = /^PREVIEW_FIXTURE_PASSWORD=(.*)$/m.exec(readFileSync(SEED_FILE, "utf8"))
  return match ? match[1].trim() || null : null
}

async function resolvePassword() {
  // Registered for every source, not just the generated one: an error echo
  // from Supabase or from a failed sign-in can carry the credential back, and
  // the two verifiers already scrub it. The seeder must not be the odd one out.
  const fromEnv = process.env.PREVIEW_FIXTURE_PASSWORD?.trim()
  if (fromEnv) {
    secretValues.add(fromEnv)
    return { password: fromEnv, source: "PREVIEW_FIXTURE_PASSWORD", wroteFile: false }
  }

  const fromFile = readSeedFilePassword()
  if (fromFile) {
    secretValues.add(fromFile)
    return { password: fromFile, source: path.relative(repoRoot, SEED_FILE), wroteFile: false }
  }

  const generated = generatePassword()
  const body = [
    "# Preview fixture credentials — generated by scripts/seed-preview-fixtures.mjs.",
    "# Gitignored via the `.env*` rule in .gitignore. NEVER commit this file.",
    `# Sign in on ${SITE_URL} as any preview-fixture-*@example.com address using this password.`,
    `PREVIEW_FIXTURE_PASSWORD=${generated}`,
    "",
  ].join("\n")
  await writeFile(SEED_FILE, body, { mode: 0o600 })
  secretValues.add(generated)
  return { password: generated, source: `generated into ${path.relative(repoRoot, SEED_FILE)}`, wroteFile: true }
}

const emailFor = (role, program) => `${TAG}${role.toLowerCase()}-${program}@example.com`
const likeTag = `${TAG}%`

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

async function unwrap(promise, what) {
  const { data, error } = await promise
  if (error) fail(`${what} failed: ${error.code ?? ""} ${error.message}`.replace(/\s+/g, " "))
  return data
}

async function findAuthUserByEmail(email) {
  let page = 1
  for (;;) {
    const data = await unwrap(
      db.auth.admin.listUsers({ page, perPage: 1000 }),
      `listing auth users (page ${page})`,
    )
    const found = data.users.find((candidate) => candidate.email?.trim().toLowerCase() === email)
    if (found || !data.nextPage) return found ?? null
    page = data.nextPage
  }
}

/**
 * Every auth user, paginated. A single page would silently under-count once the
 * project holds more than `perPage` users — which is exactly the case a wipe
 * must not get wrong.
 */
async function listAllAuthUsers() {
  const all = []
  let page = 1
  for (;;) {
    const data = await unwrap(
      db.auth.admin.listUsers({ page, perPage: 1000 }),
      `listing auth users (page ${page})`,
    )
    all.push(...data.users)
    if (!data.nextPage) return all
    page = data.nextPage
  }
}

/**
 * Ensure an `auth.users` row exists and its password is the fixture password.
 * Returns `{ id, created }`. Reuses an existing id rather than creating a
 * second row, because `public.users.id` must equal it (DW-3).
 */
async function ensureAuthUser(email, password) {
  const existing = await findAuthUserByEmail(email)
  if (existing) {
    await unwrap(
      db.auth.admin.updateUserById(existing.id, { password, email_confirm: true }),
      `updating auth user ${email}`,
    )
    return { id: existing.id, created: false }
  }
  const created = await unwrap(
    db.auth.admin.createUser({ email, password, email_confirm: true }),
    `creating auth user ${email}`,
  )
  return { id: created.user.id, created: true }
}

/** Insert-or-update keyed by an explicit lookup. */
async function upsert({ table, key, row, label }) {
  const existing = await unwrap(db.from(table).select("*").eq(key.column, key.value).maybeSingle(), `reading ${label}`)
  if (existing) {
    const { error } = await db.from(table).update(row).eq(key.column, key.value)
    if (error) fail(`updating ${label} failed: ${error.code ?? ""} ${error.message}`)
    return { row: { ...existing, ...row }, created: false }
  }
  const inserted = await unwrap(db.from(table).insert(row).select("*").single(), `creating ${label}`)
  return { row: inserted, created: true }
}

// ---------------------------------------------------------------------------
// Wipe
// ---------------------------------------------------------------------------

async function wipe() {
  log(`Wiping rows tagged "${TAG}" (untagged rows are left untouched)…`)

  const taggedSessions = (await unwrap(db.from("sessions").select("id").like("name", likeTag), "reading tagged sessions")) ?? []
  const taggedContacts = (await unwrap(db.from("contacts").select("id").like("name", likeTag), "reading tagged contacts")) ?? []
  const sessionIds = taggedSessions.map((row) => row.id)
  const contactIds = taggedContacts.map((row) => row.id)

  let removed = 0
  // `.select("id")` is required: PostgREST returns no rows for a bare DELETE,
  // so without it the reported count would always be 0 and a no-op wipe would
  // be indistinguishable from a real one.
  const del = async (promise, what) => {
    const data = await unwrap(promise, `deleting ${what}`)
    removed += data?.length ?? 0
    log(`  deleted ${data?.length ?? 0} ${what}`)
  }

  // Order matters: attendance references contacts and sessions; sessions
  // reference locations (ON DELETE RESTRICT) and users.
  if (sessionIds.length || contactIds.length) {
    let query = db.from("attendance").delete().like("name", likeTag).select("id")
    query = contactIds.length ? query.in("contact_id", contactIds) : query.eq("id", "00000000-0000-0000-0000-000000000000")
    await del(query, "tagged attendance rows")
  }
  if (sessionIds.length) await del(db.from("sessions").delete().in("id", sessionIds).select("id"), "tagged sessions")
  if (contactIds.length) await del(db.from("contacts").delete().in("id", contactIds).select("id"), "tagged contacts")
  await del(db.from("locations").delete().like("name", likeTag).select("id"), "tagged locations")

  const taggedUsers = (await unwrap(db.from("users").select("id,email").like("email", likeTag), "reading tagged users")) ?? []
  if (taggedUsers.length) {
    await del(db.from("users").delete().in("id", taggedUsers.map((row) => row.id)).select("id"), "tagged public.users rows")
  }

  let authRemoved = 0
  const authEmails = new Set()
  for (const user of await listAllAuthUsers()) {
    const email = user.email?.trim().toLowerCase()
    if (email && email.startsWith(TAG)) authEmails.add(email)
  }
  for (const email of authEmails) {
    const user = await findAuthUserByEmail(email)
    if (!user) continue
    await unwrap(db.auth.admin.deleteUser(user.id), `deleting auth user ${email}`)
    authRemoved += 1
  }
  log(`  deleted ${authRemoved} tagged auth.users rows`)
  log(`Wipe complete: ${removed} public rows and ${authRemoved} auth users removed.`)
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function seedProgram(program) {
  const summary = { program, locations: [], users: [], contacts: [], sessions: [], attendance: null, outOfScopeAttendance: null, created: 0 }

  // --- locations -----------------------------------------------------------
  const locations = []
  for (const index of [1, 2]) {
    const name = `${TAG}location-${index}-${program}`
    const { row, created } = await upsert({
      table: "locations",
      key: { column: "name", value: name },
      row: { program_id: program, name, status: "Active" },
      label: `location ${name}`,
    })
    locations.push(row)
    if (created) summary.created += 1
  }
  summary.locations = locations

  // --- auth users + public.users ------------------------------------------
  // The Preacher is seeded first because Volunteer and Assistant point at it.
  const publicUsers = {}
  for (const { role, routedThroughPreacher } of ROLES) {
    const email = emailFor(role, program)
    const { id, created: authCreated } = await ensureAuthUser(email, fixturePassword)
    if (authCreated) summary.created += 1

    const isAdmin = role === "Admin"
    const row = {
      id,
      program_id: program,
      email,
      name: `${TAG}${role.toLowerCase()}-${program}`,
      role,
      status: "Active",
      // Admin sees both locations; the Preacher only location 1, so the
      // out-of-scope session on location 2 is unreadable by the Preacher.
      location_ids: isAdmin ? locations.map((location) => location.id) : [locations[0].id],
      // Routed roles point at the program's Preacher.
      assigned_preacher_id: routedThroughPreacher ? publicUsers.Preacher.id : null,
      invited_by: null,
    }
    // DW-3 has to be checked BEFORE the write. The upsert matches on
    // (program_id, email), so a row already holding a different id would be
    // silently repointed at the new auth user -- and the row it returns would
    // then carry the id we just wrote, so a post-write comparison can never
    // detect the corruption this check exists to stop. Reading first is the
    // only point at which the old id is still visible.
    const { data: previous, error: previousError } = await db
      .from("users")
      .select("id")
      .eq("program_id", program)
      .eq("email", email)
      .maybeSingle()
    if (previousError) fail(`reading public.users ${email} failed: ${previousError.code ?? ""} ${previousError.message}`.replace(/\s+/g, " "))
    if (previous && previous.id !== id) {
      fail(
        `DW-3 VIOLATION for ${email}: the existing public.users row has id ${previous.id}, ` +
          `but the auth user is ${id}. The sign-in route no longer self-heals a mismatch, so this ` +
          `is corrupt data. Delete that public.users row and re-run; nothing was written.`,
      )
    }

    // (program_id, email) is the unique key; `id` is the PK. Upsert on email and
    // let `id` follow the auth user -- that is DW-3, not an optimization.
    const { data, error } = await db.from("users").upsert(row, { onConflict: "program_id,email" }).select("*").single()
    if (error) fail(`upserting public.users ${email} failed: ${error.code ?? ""} ${error.message}`.replace(/\s+/g, " "))
    if (data.id !== id) {
      fail(`DW-3 VIOLATION for ${email}: public.users.id ${data.id} != auth.users.id ${id} after upsert.`)
    }
    publicUsers[role] = data
    summary.users.push(data)
  }

  // --- contacts -----------------------------------------------------------
  const contacts = {}
  for (const scope of ["inScope", "outOfScope"]) {
    const phone = MOBILE[program][scope]
    const name = `${TAG}contact-${scope === "inScope" ? "in" : "out-of"}-scope-${program}`
    const { row, created } = await upsert({
      table: "contacts",
      key: { column: "phone", value: phone },
      row: {
        program_id: program,
        name,
        phone,
        location_ids: [locations[0].id],
        // In-scope = assigned to the program's Preacher; out-of-scope = another user.
        assigned_preacher_id: scope === "inScope" ? publicUsers.Preacher.id : publicUsers.Admin.id,
        collected_by_id: null,
        source: "preview-fixture",
      },
      label: `contact ${name}`,
    })
    contacts[scope] = row
    if (created) summary.created += 1
  }
  summary.contacts = contacts

  // --- sessions -----------------------------------------------------------
  const openName = `${TAG}session-open-${program}`
  const openOpensAt = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const openClosesAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  const openSeed = {
    program_id: program,
    name: openName,
    session_date: new Date().toISOString().slice(0, 10),
    preacher_id: publicUsers.Preacher.id,
    location_id: locations[0].id,
    public_attendance_enabled: true,
    attendance_opens_at: openOpensAt,
    attendance_closes_at: openClosesAt,
    duration_minutes: 90,
    created_by: publicUsers.Admin.id,
  }
  const openExisting = await unwrap(db.from("sessions").select("*").eq("name", openName).maybeSingle(), `reading session ${openName}`)
  let openSession
  let openCreated = false
  if (openExisting) {
    const { data, error } = await db.from("sessions").update(openSeed).eq("id", openExisting.id).select("*").single()
    if (error) fail(`updating session ${openName} failed: ${error.message}`)
    openSession = data
  } else {
    openSession = await unwrap(db.from("sessions").insert(openSeed).select("*").single(), `creating session ${openName}`)
    openCreated = true
  }
  // The attendance URL is derived from the session id, so it is written after
  // the row exists. This is the same field `updateSessionAttendanceUrl` writes.
  const openAttendanceUrl = `${SITE_URL}/attend?session=${openSession.id}`
  const { data: withUrl, error: urlError } = await db
    .from("sessions")
    .update({ attendance_url: openAttendanceUrl })
    .eq("id", openSession.id)
    .select("*")
    .single()
  if (urlError) fail(`setting attendance_url on ${openName} failed: ${urlError.message}`)
  openSession = withUrl
  summary.sessions.push({ ...openSession, kind: "open" })
  if (openCreated) summary.created += 1

  // Out-of-scope session: same program, but owned by the Admin on location 2,
  // which the Preacher can neither match by preacher nor by location — the
  // CAP-5 403 case. Public attendance stays off; it exists to be scoped.
  const outName = `${TAG}session-out-of-scope-${program}`
  const outSeed = {
    program_id: program,
    name: outName,
    session_date: new Date().toISOString().slice(0, 10),
    preacher_id: publicUsers.Admin.id,
    location_id: locations[1].id,
    public_attendance_enabled: false,
    attendance_opens_at: openOpensAt,
    attendance_closes_at: openClosesAt,
    duration_minutes: 60,
    created_by: publicUsers.Admin.id,
  }
  const outExisting = await unwrap(db.from("sessions").select("*").eq("name", outName).maybeSingle(), `reading session ${outName}`)
  let outSession
  let outCreated = false
  if (outExisting) {
    const { data, error } = await db.from("sessions").update(outSeed).eq("id", outExisting.id).select("*").single()
    if (error) fail(`updating session ${outName} failed: ${error.message}`)
    outSession = data
  } else {
    outSession = await unwrap(db.from("sessions").insert(outSeed).select("*").single(), `creating session ${outName}`)
    outCreated = true
  }
  summary.sessions.push({ ...outSession, kind: "out-of-scope" })
  if (outCreated) summary.created += 1

  // --- attendance ---------------------------------------------------------
  // The in-scope contact already has a row in the open session, so
  // verify-attendance-contract.mjs uses the out-of-scope contact for its
  // 201 -> 409 sequence and cleans up after itself.
  const attendanceSeed = {
    program_id: program,
    contact_id: contacts.inScope.id,
    session_id: openSession.id,
    phone: contacts.inScope.phone,
    name: contacts.inScope.name,
  }
  const att = await upsert({
    table: "attendance",
    key: { column: "contact_id", value: contacts.inScope.id },
    row: attendanceSeed,
    label: `attendance for contact ${contacts.inScope.name}`,
  })
  summary.attendance = att.row
  if (att.created) summary.created += 1

  // A second row in the out-of-scope session. Without it the CAP-5 403 check has
  // nothing to withhold: "this session is outside your allowed scope" is only
  // observable when the service role can see attendance that the caller cannot.
  // `verify-attendance-contract.mjs` creates and deletes its own row in the OPEN
  // session, so this one stays put and the wipe still removes it by tag.
  const outAttendance = await upsert({
    table: "attendance",
    key: { column: "contact_id", value: contacts.outOfScope.id },
    row: {
      program_id: program,
      contact_id: contacts.outOfScope.id,
      session_id: outSession.id,
      phone: contacts.outOfScope.phone,
      name: contacts.outOfScope.name,
    },
    label: `attendance for contact ${contacts.outOfScope.name}`,
  })
  summary.outOfScopeAttendance = outAttendance.row
  if (outAttendance.created) summary.created += 1

  return summary
}

// ---------------------------------------------------------------------------
// DW-3 assertion — re-read, never trust the write
// ---------------------------------------------------------------------------

async function assertIdAlignment(summaries) {
  const byEmail = new Map((await listAllAuthUsers()).map((user) => [user.email?.trim().toLowerCase(), user]))

  const problems = []
  for (const summary of summaries) {
    for (const user of summary.users) {
      const authUser = byEmail.get(user.email)
      if (!authUser) problems.push(`${user.email}: no auth.users row`)
      else if (authUser.id !== user.id) problems.push(`${user.email}: public.users.id ${user.id} != auth.users.id ${authUser.id}`)
      if (user.status !== "Active") problems.push(`${user.email}: status is ${user.status}, expected Active`)
    }
    const byRole = Object.fromEntries(summary.users.map((user) => [user.role, user]))
    const preacherId = byRole.Preacher?.id
    for (const role of ["Volunteer", "Assistant"]) {
      if (byRole[role]?.assigned_preacher_id !== preacherId) {
        problems.push(`${summary.program}/${role}: assigned_preacher_id is ${byRole[role]?.assigned_preacher_id}, expected the Preacher ${preacherId}`)
      }
    }
  }
  return problems
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

if (wipeOnly) {
  await wipe()
  process.exit(0)
}

// Resolved after the wipe branch on purpose: a wipe needs no credential, and
// minting one here would leave `.env.preview-seed.local` holding a password no
// auth user has, so the operator's next sign-in would fail for no stated reason.
const { password: fixturePassword, source: passwordSource, wroteFile } = await resolvePassword()

const summaries = []
for (const program of PROGRAMS) {
  summaries.push(await seedProgram(program))
}

const problems = await assertIdAlignment(summaries)
if (problems.length > 0) {
  console.error(`DW-3 / fixture integrity check failed:`)
  for (const line of problems) console.error(redact(`  - ${line}`))
  process.exit(1)
}

log(`Preview fixtures for ${SUPABASE_URL}`)
log(`Fixture password: ${passwordSource}${wroteFile ? " (value not printed)" : ""}`)
log("")

for (const summary of summaries) {
  log(`[${summary.program}] created ${summary.created} row(s)`)
  for (const user of summary.users) {
    const routed = user.assigned_preacher_id ? ` → preacher ${user.assigned_preacher_id}` : ""
    log(`  ${user.role.padEnd(9)} ${user.email}  (status=${user.status}${routed})`)
  }
  for (const location of summary.locations) log(`  Location  ${location.name}  ${location.id}`)
  for (const contact of Object.values(summary.contacts)) log(`  Contact   ${contact.name}  phone=${contact.phone}  preacher=${contact.assigned_preacher_id}`)
  for (const session of summary.sessions) {
    log(`  Session   ${session.kind.padEnd(12)} ${session.id}  public_attendance=${session.public_attendance_enabled}`)
    if (session.kind === "open") log(`            ${session.attendance_url}`)
  }
  log(`  Attendance ${summary.attendance.id}  contact=${summary.attendance.name}  session=${summary.attendance.session_id}`)
  if (summary.outOfScopeAttendance) {
    log(`  Attendance ${summary.outOfScopeAttendance.id}  contact=${summary.outOfScopeAttendance.name}  session=${summary.outOfScopeAttendance.session_id}  (out-of-scope; the CAP-5 403 case)`)
  }
  log("")
}

log(`Total created: ${summaries.reduce((sum, summary) => sum + summary.created, 0)}`)
log("DW-3 check passed: every public.users.id equals its auth.users.id; all fixture staff are Active.")
