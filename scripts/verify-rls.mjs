#!/usr/bin/env node
/**
 * verify-rls.mjs — Story 2: scoped RLS policies on contacts, attendance,
 * sessions, locations, public.users.
 *
 * Seeds fixture users and in-scope / out-of-scope operational rows per
 * program (folk, gita-life), then asserts every row of the story's I/O
 * matrix per role per table. Prints a pass/fail matrix and exits non-zero on
 * any failure.
 *
 * Modes (auto-detected; force with --http / --sql):
 *   http — primary: fixtures created via the service-role admin API
 *          (email_confirm: true), real user JWTs via signInWithPassword.
 *   sql  — fallback when HTTP to the project host is blocked: fixtures are
 *          inserted via SQL and probes run via psql with
 *          SET ROLE authenticated + request.jwt.claims = {sub: <fixture id>}.
 *
 * Usage:
 *   node scripts/verify-rls.mjs            # seed + verify + cleanup
 *   node scripts/verify-rls.mjs --cleanup  # remove fixtures only
 *
 * Credentials are read from .env.migration.local (gitignored); secret values
 * are never printed.
 */

import { fileURLToPath } from "node:url"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createClient } from "@supabase/supabase-js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
try {
  process.loadEnvFile(path.join(repoRoot, ".env.migration.local"))
} catch {
  // fall back to already-exported environment
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const ANON_KEY = (
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
)?.trim()
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const POSTGRES_URL = process.env.POSTGRES_URL_NON_POOLING?.trim()

const PROGRAMS = ["folk", "gita-life"]
const ROLES = ["admin", "preacher", "volunteer", "assistant"]
const FIXTURE_PASSWORD = `Rls-Fixture-${crypto.randomUUID()}!`
const EMAIL = (role, program) => `rls-fixture-${role}-${program}@example.com`
const TAG = "RLS-FIXTURE"
const TABLES = ["contacts", "sessions", "attendance", "locations", "users"]

// ---------------------------------------------------------------------------
// Result bookkeeping
// ---------------------------------------------------------------------------
const results = []
function check(name, pass, detail = "") {
  results.push({ name, pass, detail })
}
function eqSet(actual, expected) {
  return actual.size === expected.size && [...expected].every((id) => actual.has(id))
}
function containsAll(actual, expected) {
  return [...expected].every((id) => actual.has(id))
}
function containsNone(actual, forbidden) {
  return [...forbidden].every((id) => !actual.has(id))
}
function fmt(actual) {
  return `got ${actual.size} row(s)`
}

function buildFixtureIds() {
  const fx = {}
  for (const program of PROGRAMS) {
    fx[program] = {
      users: Object.fromEntries(ROLES.map((r) => [r, crypto.randomUUID()])),
      locations: { loc1: crypto.randomUUID(), loc2: crypto.randomUUID() },
      contacts: { c_in: crypto.randomUUID(), c_out: crypto.randomUUID() },
      sessions: { s1: crypto.randomUUID(), s2: crypto.randomUUID(), s3: crypto.randomUUID(), s4: crypto.randomUUID() },
      attendance: { a1: crypto.randomUUID(), a2: crypto.randomUUID(), a3: crypto.randomUUID(), a4: crypto.randomUUID() },
    }
  }
  return fx
}

/**
 * Shared assertion matrix. `get(role, table, program)` must return
 * { ids: Set<string> } or { error } for the fixture persona's reads with the
 * CURRENT database state (callers re-invoke after status toggles).
 */
async function assertReadMatrix(fx, get) {
  const [pA, pB] = PROGRAMS
  for (const program of PROGRAMS) {
    const other = program === pA ? pB : pA
    const f = fx[program]
    const o = fx[other]
    const tag = `[${program}]`
    const oVals = (obj) => Object.values(obj)

    // --- Admin -------------------------------------------------------------
    let r = await get("admin", "contacts", program)
    check(`${tag} Admin contacts: all in program, none cross-program`,
      !r.error && containsAll(r.ids, Object.values(f.contacts)) && containsNone(r.ids, oVals(o.contacts)),
      r.error?.message ?? fmt(r.ids))
    r = await get("admin", "sessions", program)
    check(`${tag} Admin sessions: all in program, none cross-program`,
      !r.error && containsAll(r.ids, oVals(f.sessions)) && containsNone(r.ids, oVals(o.sessions)),
      r.error?.message ?? fmt(r.ids))
    r = await get("admin", "attendance", program)
    check(`${tag} Admin attendance: all in program, none cross-program`,
      !r.error && containsAll(r.ids, oVals(f.attendance)) && containsNone(r.ids, oVals(o.attendance)),
      r.error?.message ?? fmt(r.ids))
    r = await get("admin", "locations", program)
    check(`${tag} Admin locations: all in program, none cross-program`,
      !r.error && containsAll(r.ids, oVals(f.locations)) && containsNone(r.ids, oVals(o.locations)),
      r.error?.message ?? fmt(r.ids))
    r = await get("admin", "users", program)
    check(`${tag} Admin users: all program rows, none cross-program`,
      !r.error && containsAll(r.ids, oVals(f.users)) && containsNone(r.ids, oVals(o.users)),
      r.error?.message ?? fmt(r.ids))

    // --- Preacher ----------------------------------------------------------
    r = await get("preacher", "contacts", program)
    check(`${tag} Preacher contacts: only assigned to them`,
      !r.error && eqSet(r.ids, new Set([f.contacts.c_in])), r.error?.message ?? fmt(r.ids))
    r = await get("preacher", "sessions", program)
    check(`${tag} Preacher sessions: only created_by them`,
      !r.error && eqSet(r.ids, new Set([f.sessions.s1])), r.error?.message ?? fmt(r.ids))
    r = await get("preacher", "attendance", program)
    check(`${tag} Preacher attendance: sessions where preacher_id = them (incl. created by others)`,
      !r.error && eqSet(r.ids, new Set([f.attendance.a1, f.attendance.a2])), r.error?.message ?? fmt(r.ids))
    r = await get("preacher", "locations", program)
    check(`${tag} Preacher locations: only own location_ids`,
      !r.error && eqSet(r.ids, new Set([f.locations.loc1])), r.error?.message ?? fmt(r.ids))
    r = await get("preacher", "users", program)
    check(`${tag} Preacher users: own row only`,
      !r.error && eqSet(r.ids, new Set([f.users.preacher])), r.error?.message ?? fmt(r.ids))

    // --- Assistant ---------------------------------------------------------
    r = await get("assistant", "contacts", program)
    check(`${tag} Assistant contacts: assigned preacher's contacts`,
      !r.error && eqSet(r.ids, new Set([f.contacts.c_in])), r.error?.message ?? fmt(r.ids))
    r = await get("assistant", "sessions", program)
    check(`${tag} Assistant sessions: own + assigned preacher's created`,
      !r.error && eqSet(r.ids, new Set([f.sessions.s1, f.sessions.s4])), r.error?.message ?? fmt(r.ids))
    r = await get("assistant", "attendance", program)
    check(`${tag} Assistant attendance: assigned preacher's sessions`,
      !r.error && eqSet(r.ids, new Set([f.attendance.a1, f.attendance.a2])), r.error?.message ?? fmt(r.ids))
    r = await get("assistant", "locations", program)
    check(`${tag} Assistant locations: assigned preacher's location_ids`,
      !r.error && eqSet(r.ids, new Set([f.locations.loc1])), r.error?.message ?? fmt(r.ids))
    r = await get("assistant", "users", program)
    check(`${tag} Assistant users: own row only`,
      !r.error && eqSet(r.ids, new Set([f.users.assistant])), r.error?.message ?? fmt(r.ids))

    // --- Volunteer ---------------------------------------------------------
    for (const table of ["contacts", "sessions", "attendance"]) {
      r = await get("volunteer", table, program)
      check(`${tag} Volunteer ${table}: zero rows`,
        !r.error && r.ids.size === 0, r.error?.message ?? fmt(r.ids))
    }
    r = await get("volunteer", "locations", program)
    check(`${tag} Volunteer locations: assigned preacher's location_ids`,
      !r.error && eqSet(r.ids, new Set([f.locations.loc1])), r.error?.message ?? fmt(r.ids))
    r = await get("volunteer", "users", program)
    check(`${tag} Volunteer users: own row only`,
      !r.error && eqSet(r.ids, new Set([f.users.volunteer])), r.error?.message ?? fmt(r.ids))
  }
}

async function assertStatusCollapse(fx, get, setStatus) {
  for (const program of PROGRAMS) {
    const f = fx[program]
    const tag = `[${program}]`

    // Suspended caller: zero rows everywhere (JWT outlives suspension)
    await setStatus(f.users.volunteer, "Suspended")
    for (const table of TABLES) {
      const r = await get("volunteer", table, program)
      check(`${tag} Suspended volunteer ${table}: zero rows`,
        !r.error && r.ids.size === 0, r.error?.message ?? fmt(r.ids))
    }
    await setStatus(f.users.volunteer, "Active")

    // Inactive assigned preacher: dependent Volunteer/Assistant scope collapses
    // (Assistant keeps own-created sessions — that term does not resolve
    // through the assigned preacher).
    await setStatus(f.users.preacher, "Inactive")
    let r = await get("volunteer", "locations", program)
    check(`${tag} Volunteer locations with Inactive preacher: zero rows`,
      !r.error && r.ids.size === 0, r.error?.message ?? fmt(r.ids))
    for (const table of ["contacts", "attendance", "locations"]) {
      r = await get("assistant", table, program)
      check(`${tag} Assistant ${table} with Inactive preacher: zero rows`,
        !r.error && r.ids.size === 0, r.error?.message ?? fmt(r.ids))
    }
    r = await get("assistant", "sessions", program)
    check(`${tag} Assistant sessions with Inactive preacher: only own-created`,
      !r.error && eqSet(r.ids, new Set([f.sessions.s4])), r.error?.message ?? fmt(r.ids))
    await setStatus(f.users.preacher, "Active")
  }
}

// ===========================================================================
// HTTP mode (primary): admin-API fixtures + real user JWTs
// ===========================================================================
function httpClients() {
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / anon key / SUPABASE_SERVICE_ROLE_KEY in .env.migration.local")
  }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return { admin }
}

async function httpReachable() {
  if (!SUPABASE_URL) return false
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    await fetch(`${SUPABASE_URL}/auth/v1/health`, { signal: controller.signal })
    clearTimeout(timer)
    return true
  } catch {
    return false
  }
}

async function httpCleanup(admin) {
  await admin.from("attendance").delete().like("phone", "rls-fixture-%")
  await admin.from("sessions").delete().like("name", `${TAG}-%`)
  await admin.from("contacts").delete().like("phone", "rls-fixture-%")
  await admin.from("locations").delete().like("name", `${TAG}-%`)
  let page = 1
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`listUsers failed: ${error.message}`)
    for (const u of data.users) {
      if (/^rls-fixture-.*@example\.com$/.test(u.email ?? "")) {
        await admin.auth.admin.deleteUser(u.id) // cascades public.users
      }
    }
    if (data.users.length < 1000) break
    page += 1
  }
}

async function httpSeed(admin, fx) {
  for (const program of PROGRAMS) {
    const f = fx[program]

    for (const [key, id] of Object.entries(f.locations)) {
      const { error } = await admin.from("locations").insert({ id, program_id: program, name: `${TAG}-${program}-${key}`, status: "Active" })
      if (error) throw new Error(`seed locations ${program}/${key}: ${error.message}`)
    }

    for (const role of ROLES) {
      const email = EMAIL(role, program)
      const { data, error } = await admin.auth.admin.createUser({
        id: f.users[role],
        email,
        password: FIXTURE_PASSWORD,
        email_confirm: true,
      })
      if (error) throw new Error(`createUser ${email} failed: ${error.message}`)
      f.users[role] = data.user.id
      const row = { id: data.user.id, program_id: program, email, name: `${TAG} ${role} ${program}`, role: role[0].toUpperCase() + role.slice(1), status: "Active" }
      if (role === "preacher") row.location_ids = [f.locations.loc1]
      if (role === "volunteer" || role === "assistant") row.assigned_preacher_id = f.users.preacher
      const { error: uErr } = await admin.from("users").insert(row)
      if (uErr) throw new Error(`seed users ${program}/${role}: ${uErr.message}`)
    }

    for (const [key, id, assignee] of [["c_in", f.contacts.c_in, f.users.preacher], ["c_out", f.contacts.c_out, f.users.admin]]) {
      const { error } = await admin.from("contacts").insert({
        id, program_id: program, name: `${TAG} Contact ${program} ${key}`,
        phone: `rls-fixture-${program}-${key}`, assigned_preacher_id: assignee,
      })
      if (error) throw new Error(`seed contacts ${program}/${key}: ${error.message}`)
    }

    // s1 preacher-created/preacher-led; s2 admin-created/preacher-led;
    // s3 admin-created/admin-led; s4 assistant-created/admin-led
    const sessionDefs = [
      ["s1", f.users.preacher, f.users.preacher],
      ["s2", f.users.admin, f.users.preacher],
      ["s3", f.users.admin, f.users.admin],
      ["s4", f.users.assistant, f.users.admin],
    ]
    for (const [key, created_by, preacher_id] of sessionDefs) {
      const { error } = await admin.from("sessions").insert({
        id: f.sessions[key], program_id: program, name: `${TAG}-${program}-${key}`,
        session_date: "2026-10-06", created_by, preacher_id, location_id: f.locations.loc1,
      })
      if (error) throw new Error(`seed sessions ${program}/${key}: ${error.message}`)
    }

    for (const [key, sessionKey] of [["a1", "s1"], ["a2", "s2"], ["a3", "s3"], ["a4", "s4"]]) {
      const { error } = await admin.from("attendance").insert({
        id: f.attendance[key], program_id: program, contact_id: f.contacts.c_in,
        session_id: f.sessions[sessionKey], phone: `rls-fixture-att-${program}-${key}`,
        name: `${TAG} Attendee ${program} ${key}`,
      })
      if (error) throw new Error(`seed attendance ${program}/${key}: ${error.message}`)
    }
  }
}

async function httpVerify(admin, fx) {
  const clients = {}
  for (const program of PROGRAMS) {
    clients[program] = {}
    for (const role of ROLES) {
      const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
      const { error } = await client.auth.signInWithPassword({ email: EMAIL(role, program), password: FIXTURE_PASSWORD })
      if (error) throw new Error(`signIn ${EMAIL(role, program)} failed: ${error.message}`)
      clients[program][role] = client
    }
  }

  const get = async (role, table, program) => {
    const { data, error } = await clients[program][role].from(table).select("id")
    if (error) return { error }
    return { ids: new Set(data.map((r) => r.id)) }
  }
  const setStatus = async (userId, status) => {
    const { error } = await admin.from("users").update({ status }).eq("id", userId)
    if (error) throw new Error(`setStatus ${status}: ${error.message}`)
  }

  await assertReadMatrix(fx, get)
  await assertStatusCollapse(fx, get, setStatus)

  // Authenticated write rejection (preacher persona)
  for (const program of PROGRAMS) {
    const tag = `[${program}]`
    const preacher = clients[program].preacher
    const f = fx[program]
    const inserts = {
      contacts: { id: crypto.randomUUID(), program_id: program, name: "x", phone: "rls-fixture-writeprobe" },
      locations: { id: crypto.randomUUID(), program_id: program, name: "x" },
      sessions: { id: crypto.randomUUID(), program_id: program, name: "x" },
      attendance: { id: crypto.randomUUID(), program_id: program, contact_id: f.contacts.c_in, session_id: f.sessions.s1, phone: "x", name: "x" },
      users: { id: crypto.randomUUID(), program_id: program, email: `rls-fixture-writeprobe-${program}@example.com`, role: "Admin" },
    }
    for (const table of TABLES) {
      const { error } = await preacher.from(table).insert(inserts[table])
      check(`${tag} authenticated INSERT on ${table}: rejected (RLS)`,
        Boolean(error), error ? `code=${error.code}` : "unexpectedly succeeded")
    }
    const upd = await preacher.from("contacts").update({ notes: "rls-bypass-attempt" }).eq("id", f.contacts.c_in).select("id")
    check(`${tag} authenticated UPDATE on contacts: no effect`,
      Boolean(upd.error) || (upd.data?.length ?? 0) === 0,
      upd.error ? `code=${upd.error.code}` : `rows=${upd.data?.length}`)
    const del = await preacher.from("contacts").delete().eq("id", f.contacts.c_in).select("id")
    check(`${tag} authenticated DELETE on contacts: no effect`,
      Boolean(del.error) || (del.data?.length ?? 0) === 0,
      del.error ? `code=${del.error.code}` : `rows=${del.data?.length}`)
    const { data: stillThere, error: stErr } = await admin.from("contacts").select("id,notes").eq("id", f.contacts.c_in).single()
    check(`${tag} contact survives authenticated write attempts`,
      !stErr && stillThere.notes === null, stErr?.message ?? "notes unchanged")
  }

  // Service role unaffected (bypasses RLS)
  const svc = await admin.from("contacts").select("id").like("phone", "rls-fixture-%")
  check("service role reads all fixture contacts (bypasses RLS)",
    !svc.error && svc.data.length === 4, svc.error?.message ?? `got ${svc.data?.length}`)
  const roundtrip = await admin.from("contacts").insert({ program_id: "folk", name: `${TAG} svc roundtrip`, phone: "rls-fixture-svc-roundtrip" }).select("id").single()
  check("service role INSERT succeeds", !roundtrip.error, roundtrip.error?.message ?? "ok")
  if (!roundtrip.error) await admin.from("contacts").delete().eq("id", roundtrip.data.id)

  // Caller with no public.users row: zero rows
  const orphanEmail = "rls-fixture-orphan-folk@example.com"
  const { data: orphan, error: orphanErr } = await admin.auth.admin.createUser({ email: orphanEmail, password: FIXTURE_PASSWORD, email_confirm: true })
  if (orphanErr) throw new Error(`createUser orphan: ${orphanErr.message}`)
  const orphanClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error: orphanSignIn } = await orphanClient.auth.signInWithPassword({ email: orphanEmail, password: FIXTURE_PASSWORD })
  if (orphanSignIn) throw new Error(`signIn orphan: ${orphanSignIn.message}`)
  const { data: orphanRows, error: orphanReadErr } = await orphanClient.from("contacts").select("id")
  check("caller with no users row: zero rows",
    !orphanReadErr && orphanRows.length === 0, orphanReadErr?.message ?? `got ${orphanRows?.length}`)
  await admin.auth.admin.deleteUser(orphan.user.id)

  for (const program of PROGRAMS) for (const role of ROLES) await clients[program][role].auth.signOut()
}

// ===========================================================================
// SQL mode (fallback): psql probes with SET ROLE authenticated + JWT claims
// ===========================================================================
function pgEnv() {
  if (!POSTGRES_URL) throw new Error("POSTGRES_URL_NON_POOLING is required for SQL fallback mode")
  const u = new URL(POSTGRES_URL)
  return {
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: u.pathname.replace(/^\//, "") || "postgres",
    PGSSLMODE: u.searchParams.get("sslmode") || "require",
  }
}

function psql(sql, { file = false } = {}) {
  const args = ["-X", "-q", "-At", "-F", "|", "-v", "ON_ERROR_STOP=1"]
  if (file) args.push("-f", sql)
  else args.push("-c", sql)
  try {
    const out = execFileSync("psql", args, {
      env: { ...process.env, ...pgEnv() },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
    return { ok: true, out }
  } catch (e) {
    return { ok: false, out: e.stdout?.toString() ?? "", err: e.stderr?.toString() ?? "" }
  }
}

const SQL_CLEANUP = `
DELETE FROM public.attendance WHERE phone LIKE 'rls-fixture-%';
DELETE FROM public.sessions WHERE name LIKE '${TAG}-%';
DELETE FROM public.contacts WHERE phone LIKE 'rls-fixture-%';
DELETE FROM public.locations WHERE name LIKE '${TAG}-%';
DELETE FROM auth.users WHERE email LIKE 'rls-fixture-%@example.com';
`

function sqlCleanup() {
  const r = psql(SQL_CLEANUP)
  if (!r.ok) throw new Error(`cleanup failed: ${r.err.trim()}`)
}

function sqlSeedScript(fx) {
  const stmts = []
  for (const program of PROGRAMS) {
    const f = fx[program]
    for (const [key, id] of Object.entries(f.locations)) {
      stmts.push(`INSERT INTO public.locations (id, program_id, name, status) VALUES ('${id}', '${program}', '${TAG}-${program}-${key}', 'Active');`)
    }
    for (const role of ROLES) {
      const email = EMAIL(role, program)
      stmts.push(`INSERT INTO auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
        VALUES ('${f.users[role]}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '${email}', now(), now(), now());`)
      const roleName = role[0].toUpperCase() + role.slice(1)
      const loc = role === "preacher" ? `ARRAY['${f.locations.loc1}']::uuid[]` : `'{}'::uuid[]`
      const ap = role === "volunteer" || role === "assistant" ? `'${f.users.preacher}'` : "NULL"
      stmts.push(`INSERT INTO public.users (id, program_id, email, name, role, status, location_ids, assigned_preacher_id)
        VALUES ('${f.users[role]}', '${program}', '${email}', '${TAG} ${role} ${program}', '${roleName}', 'Active', ${loc}, ${ap});`)
    }
    for (const [key, assignee] of [["c_in", f.users.preacher], ["c_out", f.users.admin]]) {
      stmts.push(`INSERT INTO public.contacts (id, program_id, name, phone, assigned_preacher_id)
        VALUES ('${f.contacts[key]}', '${program}', '${TAG} Contact ${program} ${key}', 'rls-fixture-${program}-${key}', '${assignee}');`)
    }
    const sessionDefs = [
      ["s1", f.users.preacher, f.users.preacher],
      ["s2", f.users.admin, f.users.preacher],
      ["s3", f.users.admin, f.users.admin],
      ["s4", f.users.assistant, f.users.admin],
    ]
    for (const [key, created_by, preacher_id] of sessionDefs) {
      stmts.push(`INSERT INTO public.sessions (id, program_id, name, session_date, created_by, preacher_id, location_id)
        VALUES ('${f.sessions[key]}', '${program}', '${TAG}-${program}-${key}', '2026-10-06', '${created_by}', '${preacher_id}', '${f.locations.loc1}');`)
    }
    for (const [key, sessionKey] of [["a1", "s1"], ["a2", "s2"], ["a3", "s3"], ["a4", "s4"]]) {
      stmts.push(`INSERT INTO public.attendance (id, program_id, contact_id, session_id, phone, name)
        VALUES ('${f.attendance[key]}', '${program}', '${f.contacts.c_in}', '${f.sessions[sessionKey]}', 'rls-fixture-att-${program}-${key}', '${TAG} Attendee ${program} ${key}');`)
    }
  }
  return stmts.join("\n")
}

function sqlProbe(key, sub, table) {
  const claims = `{"sub":"${sub}","role":"authenticated","aud":"authenticated"}`
  return `BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '${claims}';
SELECT '${key}', COALESCE(json_agg(id::text)::text, '[]') FROM public.${table};
COMMIT;`
}

function sqlVerify(fx) {
  // Seed
  const seed = psql(sqlSeedScript(fx))
  if (!seed.ok) throw new Error(`seed failed: ${seed.err.trim()}`)

  // Read probes: one batch per phase so status toggles interleave correctly.
  const runProbes = (blocks) => {
    const tmp = path.join(os.tmpdir(), `verify-rls-probes-${process.pid}-${crypto.randomUUID()}.sql`)
    fs.writeFileSync(tmp, blocks.join("\n"))
    try {
      const r = psql(tmp, { file: true })
      if (!r.ok) throw new Error(`probes failed: ${r.err.trim()}`)
      const map = new Map()
      for (const line of r.out.split("\n")) {
        const m = line.match(/^((?:folk|gita-life)\|(?:admin|preacher|volunteer|assistant)\|[a-z]+(?:\|[a-z-]+)?)\|(\[.*\])$/)
        if (!m) continue
        map.set(m[1], new Set(JSON.parse(m[2])))
      }
      return map
    } finally {
      fs.unlinkSync(tmp)
    }
  }

  const keyOf = (role, table, program, label = "") =>
    [program, role, table, ...(label ? [label] : [])].join("|")
  const probeBlock = (role, table, program, label = "") =>
    sqlProbe(keyOf(role, table, program, label), fx[program].users[role], table)

  const allBlocks = []
  for (const program of PROGRAMS) {
    for (const role of ROLES) {
      for (const table of TABLES) allBlocks.push(probeBlock(role, table, program))
    }
  }
  const baseMap = runProbes(allBlocks)

  const getFrom = (map, label = "") => async (role, table, program) => {
    const ids = map.get(keyOf(role, table, program, label))
    if (!ids) return { error: new Error(`probe ${keyOf(role, table, program, label)} missing`) }
    return { ids }
  }

  // Status-collapse phases: toggle as postgres, probe, restore.
  const collapseBlocks = []
  for (const program of PROGRAMS) {
    const f = fx[program]
    collapseBlocks.push(`UPDATE public.users SET status = 'Suspended' WHERE id = '${f.users.volunteer}';`)
    for (const table of TABLES) collapseBlocks.push(probeBlock("volunteer", table, program, "suspended"))
    collapseBlocks.push(`UPDATE public.users SET status = 'Active' WHERE id = '${f.users.volunteer}';`)
    collapseBlocks.push(`UPDATE public.users SET status = 'Inactive' WHERE id = '${f.users.preacher}';`)
    collapseBlocks.push(probeBlock("volunteer", "locations", program, "inactive-preacher"))
    for (const table of ["contacts", "sessions", "attendance", "locations"]) {
      collapseBlocks.push(probeBlock("assistant", table, program, "inactive-preacher"))
    }    collapseBlocks.push(`UPDATE public.users SET status = 'Active' WHERE id = '${f.users.preacher}';`)
  }
  const collapseMap = runProbes(collapseBlocks)

  return { baseMap, collapseMap, getFrom }
}

async function sqlRunAssertions(fx, maps) {
  const { baseMap, collapseMap, getFrom } = maps

  await assertReadMatrix(fx, getFrom(baseMap))

  for (const program of PROGRAMS) {
    const tag = `[${program}]`
    const f = fx[program]
    for (const table of TABLES) {
      const ids = collapseMap.get([program, "volunteer", table, "suspended"].join("|"))
      check(`${tag} Suspended volunteer ${table}: zero rows`,
        ids !== undefined && ids.size === 0, ids ? fmt(ids) : "probe missing")
    }
    const volLoc = collapseMap.get([program, "volunteer", "locations", "inactive-preacher"].join("|"))
    check(`${tag} Volunteer locations with Inactive preacher: zero rows`,
      volLoc !== undefined && volLoc.size === 0, volLoc ? fmt(volLoc) : "probe missing")
    for (const table of ["contacts", "attendance", "locations"]) {
      const ids = collapseMap.get([program, "assistant", table, "inactive-preacher"].join("|"))
      check(`${tag} Assistant ${table} with Inactive preacher: zero rows`,
        ids !== undefined && ids.size === 0, ids ? fmt(ids) : "probe missing")
    }
    const asstSess = collapseMap.get([program, "assistant", "sessions", "inactive-preacher"].join("|"))
    check(`${tag} Assistant sessions with Inactive preacher: only own-created`,
      asstSess !== undefined && eqSet(asstSess, new Set([f.sessions.s4])),
      asstSess ? fmt(asstSess) : "probe missing")
  }
}

function sqlWriteProbes(fx) {
  for (const program of PROGRAMS) {
    const tag = `[${program}]`
    const f = fx[program]
    const claims = `{"sub":"${f.users.preacher}","role":"authenticated","aud":"authenticated"}`
    const prefix = `SET ROLE authenticated; SET request.jwt.claims = '${claims}';`
    const inserts = {
      contacts: `INSERT INTO public.contacts (id, program_id, name, phone) VALUES (gen_random_uuid(), '${program}', 'x', 'rls-fixture-writeprobe');`,
      locations: `INSERT INTO public.locations (id, program_id, name) VALUES (gen_random_uuid(), '${program}', 'x');`,
      sessions: `INSERT INTO public.sessions (id, program_id, name) VALUES (gen_random_uuid(), '${program}', 'x');`,
      attendance: `INSERT INTO public.attendance (id, program_id, contact_id, session_id, phone, name) VALUES (gen_random_uuid(), '${program}', '${f.contacts.c_in}', '${f.sessions.s1}', 'x', 'x');`,
      users: `INSERT INTO public.users (id, program_id, email, role) VALUES (gen_random_uuid(), '${program}', 'rls-fixture-writeprobe-${program}@example.com', 'Admin');`,
    }
    for (const table of TABLES) {
      const r = psql(`${prefix} ${inserts[table]}`)
      const denied = !r.ok && /42501|row-level security/i.test(r.err)
      check(`${tag} authenticated INSERT on ${table}: rejected (RLS)`,
        denied, r.ok ? "unexpectedly succeeded" : r.err.trim().split("\n")[0])
    }
    // UPDATE/DELETE with no policies silently affect zero rows; verify no effect.
    psql(`${prefix} UPDATE public.contacts SET notes = 'rls-bypass-attempt' WHERE id = '${f.contacts.c_in}';`)
    psql(`${prefix} DELETE FROM public.contacts WHERE id = '${f.contacts.c_in}';`)
    const verify = psql(`SELECT COALESCE(notes, '<null>') FROM public.contacts WHERE id = '${f.contacts.c_in}';`)
    check(`${tag} authenticated UPDATE/DELETE on contacts: no effect`,
      verify.ok && verify.out.trim() === "<null>", verify.ok ? verify.out.trim() : verify.err.trim())
  }

  // Service role (postgres connection bypasses RLS) unaffected
  const svc = psql(`SELECT count(*) FROM public.contacts WHERE phone LIKE 'rls-fixture-%';`)
  check("service role reads all fixture contacts (bypasses RLS)",
    svc.ok && svc.out.trim() === "4", svc.ok ? `got ${svc.out.trim()}` : svc.err.trim())
  const rt = psql(`INSERT INTO public.contacts (id, program_id, name, phone) VALUES (gen_random_uuid(), 'folk', '${TAG} svc roundtrip', 'rls-fixture-svc-roundtrip');`)
  check("service role INSERT succeeds", rt.ok, rt.ok ? "ok" : rt.err.trim())
  psql(`DELETE FROM public.contacts WHERE phone = 'rls-fixture-svc-roundtrip';`)

  // Caller with no public.users row: zero rows
  const orphanClaims = `{"sub":"${crypto.randomUUID()}","role":"authenticated","aud":"authenticated"}`
  const orphan = psql(`SET ROLE authenticated; SET request.jwt.claims = '${orphanClaims}'; SELECT count(*) FROM public.contacts;`)
  check("caller with no users row: zero rows",
    orphan.ok && orphan.out.trim() === "0", orphan.ok ? `got ${orphan.out.trim()}` : orphan.err.trim())
}

// ===========================================================================
// Main
// ===========================================================================
const cleanupOnly = process.argv.includes("--cleanup")
const forcedMode = process.argv.includes("--sql") ? "sql" : process.argv.includes("--http") ? "http" : null
const mode = forcedMode ?? ((await httpReachable()) ? "http" : "sql")

if (mode === "sql") {
  console.log("NOTE: HTTP to the project host is unreachable from this environment;")
  console.log("      using the documented SQL fallback (psql probes with SET ROLE authenticated")
  console.log("      + request.jwt.claims sub = fixture user id) per the story spec.")
}

try {
  if (mode === "http") {
    const { admin } = httpClients()
    await httpCleanup(admin)
    if (!cleanupOnly) {
      const fx = buildFixtureIds()
      await httpSeed(admin, fx)
      try {
        await httpVerify(admin, fx)
      } finally {
        await httpCleanup(admin)
      }
    }
  } else {
    sqlCleanup()
    if (!cleanupOnly) {
      const fx = buildFixtureIds()
      try {
        const maps = sqlVerify(fx)
        await sqlRunAssertions(fx, maps)
        sqlWriteProbes(fx)
      } finally {
        sqlCleanup()
      }
    }
  }
} catch (err) {
  console.error(`FATAL: ${err.message}`)
  process.exit(2)
}

if (!cleanupOnly) {
  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass)
  console.log(`\n=== RLS verification matrix (mode: ${mode}) ===`)
  for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.pass ? "" : `  (${r.detail})`}`)
  console.log(`\n${passed}/${results.length} passed`)
  if (failed.length > 0) process.exit(1)
} else {
  console.log("Fixture cleanup complete.")
}
