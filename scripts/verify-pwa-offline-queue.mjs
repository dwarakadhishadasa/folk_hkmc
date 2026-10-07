#!/usr/bin/env node
/**
 * verify-pwa-offline-queue.mjs — story 7.8: CAP-6, the service-worker offline
 * queue, verified in a real browser.
 *
 * `public/sw.js` is frozen. This script drives it and observes: the synthetic
 * `202 {queued:true}` the fetch handler returns while offline, the IndexedDB
 * row it leaves in `folk-offline-db/pending-requests`, and the drain that
 * `syncQueuedRequests` performs when the browser is back online — including
 * the rule that a `409` counts as synced.
 *
 * `playwright-core` (driver only) is used with an executable resolved from the
 * environment. No browser is downloaded and no test runner or bundler is added
 * to the repo. When no executable is resolvable the script exits non-zero with
 * an explicit environment message: a missing browser must never be mistaken for
 * a pass.
 *
 * Usage:
 *   node scripts/verify-pwa-offline-queue.mjs
 *   node scripts/verify-pwa-offline-queue.mjs --base-url https://host --program folk
 *
 * Options:
 *   --base-url <url>          Deployment under test (default: PRODUCTION_URL, else the go-live URL).
 *   --program <id>            folk | gita-life (default: folk).
 *   --chromium <path>         Chromium executable. Same as PW_CHROMIUM_PATH.
 *   --headed                  Run with a visible window (default is headless).
 *   --keep-queue              Do not clear a queue the browser left behind.
 *   --keep-attendance         Do not delete the attendance row the replay created.
 *
 * Environment:
 *   PW_CHROMIUM_PATH          Explicit Chromium executable.
 *   PREVIEW_FIXTURE_PASSWORD  Needed to read the seeded session the replay posts against.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
try {
  process.loadEnvFile(path.join(repoRoot, ".env.migration.local"))
} catch {
  // Fall back to an already-exported environment.
}

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
const KEEP_QUEUE = argv.includes("--keep-queue")
const KEEP_ATTENDANCE = argv.includes("--keep-attendance")
const HEADED = argv.includes("--headed")

if (!["folk", "gita-life"].includes(PROGRAM)) {
  console.error(`ERROR --program must be folk or gita-life (got ${PROGRAM})`)
  process.exit(1)
}

// Both apps share the same sw.js constants; the story pins them.
const DB_NAME = "folk-offline-db"
const STORE_NAME = "pending-requests"
const SEED_FILE = path.join(repoRoot, ".env.preview-seed.local")

// ---------------------------------------------------------------------------
// Redaction — registered before anything is printed.
// ---------------------------------------------------------------------------

const REDACTED = "***redacted***"
const secretValues = new Set()

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

function fail(message, code = 1) {
  console.error(redact(`ERROR ${message}`))
  process.exit(code)
}

// ---------------------------------------------------------------------------
// Chromium resolution
// ---------------------------------------------------------------------------

function probeList() {
  const candidates = []

  if (process.env.PW_CHROMIUM_PATH?.trim()) {
    candidates.push({ path: process.env.PW_CHROMIUM_PATH.trim(), source: "PW_CHROMIUM_PATH" })
  }

  // A playwright-core install ships no browsers, so any cache is a sibling
  // tool's. Both the full chromium and the headless shell are acceptable.
  const cacheRoot = process.env.PLAYWRIGHT_BROWSERS_PATH?.trim() || path.join(os.homedir(), ".cache", "ms-playwright")
  if (existsSync(cacheRoot)) {
    for (const entry of readdirSync(cacheRoot)) {
      if (!entry.startsWith("chromium")) continue
      candidates.push(
        { path: path.join(cacheRoot, entry, "chrome-linux64", "chrome"), source: `${cacheRoot}/${entry}` },
        { path: path.join(cacheRoot, entry, "chrome-linux", "chrome"), source: `${cacheRoot}/${entry}` },
        { path: path.join(cacheRoot, entry, "chrome-headless-shell-linux64", "chrome-headless-shell"), source: `${cacheRoot}/${entry}` },
        { path: path.join(cacheRoot, entry, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"), source: `${cacheRoot}/${entry}` },
      )
    }
  }

  for (const candidate of [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/snap/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ]) {
    candidates.push({ path: candidate, source: "probe list" })
  }

  return candidates
}

function resolveChromium() {
  const explicit = flagValue("--chromium")?.trim()
  // One refusal for every way the browser can fail to resolve, so the "this is
  // an environment gap, NOT a pass" contract is stated identically whether the
  // caller pointed at a missing path or nothing on the probe list exists.
  const refuse = (reason) =>
    fail(
      [
        "This environment cannot run the CAP-6 check: no usable Chromium executable.",
        reason,
        "Set PW_CHROMIUM_PATH=/path/to/chrome (or pass --chromium /path/to/chrome) and re-run.",
        "This is an environment gap, NOT a pass. CAP-6 remains unverified.",
        "Paths tried:",
        probeList()
          .map((candidate) => `  - ${candidate.path}`)
          .join("\n"),
      ].join("\n"),
    )

  if (explicit) {
    if (!existsSync(explicit)) refuse(`--chromium ${explicit} does not exist.`)
    return { path: explicit, source: "--chromium" }
  }

  for (const candidate of probeList()) {
    // existsSync alone would accept a directory, and the next failure would be a
    // raw Playwright launch error instead of this script's environment message.
    if (existsSync(candidate.path) && statSync(candidate.path).isFile()) return candidate
  }

  refuse("Neither PW_CHROMIUM_PATH nor any probe path resolved to an existing executable.")
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
  // The browser drives the real sign-in UI through the service worker; the
  // password is only needed to verify the replayed row landed server-side.
  return null
}

async function loadOpenSession() {
  const { createClient } = await import("@supabase/supabase-js")
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to read the seeded session.")
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data, error } = await db
    .from("sessions")
    .select("id,name,attendance_url")
    .eq("program_id", PROGRAM)
    .eq("name", `preview-fixture-session-open-${PROGRAM}`)
    .maybeSingle()
  if (error) fail(`reading the ${PROGRAM} open session failed: ${error.message}`)
  if (!data) fail(`No open fixture session for ${PROGRAM}. Run scripts/seed-preview-fixtures.mjs first.`)

  // The mobile is read from the program's own fixture contacts, not hardcoded.
  // Hardcoding folk's `9000000002` made `--program gita-life` post a contact the
  // gita-life route cannot resolve, so the replay answered 404 and
  // `sw.js` (which removes a row only on ok-or-409) never drained the queue --
  // the advertised flag could not pass.
  const { data: contacts, error: contactsError } = await db
    .from("contacts")
    .select("id,name,phone,assigned_preacher_id")
    .eq("program_id", PROGRAM)
    .eq("source", "preview-fixture")
  if (contactsError) fail(`reading the ${PROGRAM} fixture contacts failed: ${contactsError.message}`)
  const mobile = contacts?.find((contact) => contact.name?.includes("out-of-scope"))?.phone
  if (!mobile) fail(`No out-of-scope fixture contact for ${PROGRAM}. Run scripts/seed-preview-fixtures.mjs first.`)

  return { openSession: data, mobile }
}

// ---------------------------------------------------------------------------
// Result bookkeeping
// ---------------------------------------------------------------------------

const results = []
function check(name, pass, detail = "") {
  results.push({ name, pass, detail })
  log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${redact(detail)}` : ""}`)
}

// ---------------------------------------------------------------------------
// In-page helpers
//
// These run in the browser, so they are strings rather than functions that
// close over Node state. Each is installed once via addInitScript and later
// called through page.evaluate.
// ---------------------------------------------------------------------------

/**
 * Queue operations, installed in the page as `window.__readQueue` /
 * `window.__clearQueue` via addInitScript and then called through
 * page.evaluate.
 *
 * They are installed rather than passed per-call for two reasons. First, a
 * function handed to page.evaluate cannot close over Node scope, so the db and
 * store names would have to travel as arguments on every call. Second — and
 * load-bearing — Playwright resolves `page.evaluate` on the microtask queue, so
 * an IndexedDB promise that settles in a later task can be reported as
 * "Resulting promise was garbage collected" before its events fire. Keeping the
 * helper installed on the page and awaiting it from a single evaluate is
 * stable; re-declaring a fresh promise per evaluate is not.
 *
 * Every open mirrors the service worker's own openDB(): same database name,
 * same version, same create-on-upgrade. Opening with a bare name would pin
 * version 1 with no object store, and the worker's later identical open would
 * never fire onupgradeneeded — the store would never exist and every
 * transaction would throw.
 */

const QUEUE_HELPERS = `
function __openQueueDb(dbName, storeName) {
  const keepAlive = []
  const request = indexedDB.open(dbName, 1)
  keepAlive.push(request)
  return new Promise((resolve, reject) => {
    // The same create-on-upgrade the service worker's openDB() does. Without it,
    // whichever side opens first pins version 1 with no object store, and the
    // other side's identical open never fires onupgradeneeded — the store then
    // never exists and every later transaction throws NotFoundError.
    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: "id", autoIncrement: true })
      }
    }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

/** Read every row in the offline queue. */
window.__readQueue = async function ([dbName, storeName]) {
  const db = await __openQueueDb(dbName, storeName)
  if (!db.objectStoreNames.contains(storeName)) {
    db.close()
    return []
  }
  return new Promise((resolve, reject) => {
    // A throw inside the transaction callback would leave the outer promise
    // pending forever, which Playwright reports as a garbage-collected result
    // rather than as the IndexedDB error. Reject explicitly instead.
    let request
    try {
      request = db.transaction(storeName, "readonly").objectStore(storeName).getAll()
    } catch (error) {
      db.close()
      reject(error)
      return
    }
    request.onsuccess = () => {
      const rows = request.result
      db.close()
      resolve(rows)
    }
    request.onerror = () => {
      db.close()
      reject(request.error)
    }
  })
}

/** Clear the offline queue. Returns the count that was there. */
window.__clearQueue = async function ([dbName, storeName]) {
  const db = await __openQueueDb(dbName, storeName)
  if (!db.objectStoreNames.contains(storeName)) {
    db.close()
    return 0
  }
  const before = await window.__readQueue([dbName, storeName])
  await new Promise((resolve, reject) => {
    let tx
    try {
      tx = db.transaction(storeName, "readwrite")
      tx.objectStore(storeName).clear()
    } catch (error) {
      db.close()
      reject(error)
      return
    }
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
    tx.onabort = () => {
      db.close()
      reject(tx.error)
    }
  })
  return before.length
}
`

/** Install the queue helpers on every document of the context. */
async function installQueueHelpers(page) {
  await page.addInitScript(QUEUE_HELPERS)
}

/**
 * Register /sw.js and wait until it controls the page.
 *
 * `navigator.serviceWorker.ready` resolves as soon as the worker is *active*,
 * which is not the same as controlling the document: the first install leaves
 * `navigator.serviceWorker.controller` null until `clients.claim()` lands (or
 * until the next navigation). Waiting for `controllerchange` and reloading as a
 * fallback is what gets the page into the worker's scope, which every
 * assertion below depends on.
 */
async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return { ok: false, reason: "navigator.serviceWorker is unavailable (needs a secure origin)" }
  }

  let registration
  try {
    registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" })
    await navigator.serviceWorker.ready
  } catch (error) {
    // A rejected register() (404, wrong MIME type, a syntax error in the worker)
    // must surface as a recorded reason, not an evaluation rejection that ends
    // the run before any check is written.
    return { ok: false, reason: `service worker registration failed: ${error?.message ?? error}` }
  }

  if (!navigator.serviceWorker.controller) {
    await Promise.race([
      new Promise((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }),
      ),
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ])
  }

  return { ok: Boolean(navigator.serviceWorker.controller), scope: registration.scope }
}

/** Ask the active worker to drain the queue, awaiting its reply. */
function syncQueue() {
  return new Promise((resolve, reject) => {
    const worker = navigator.serviceWorker.controller
    if (!worker) {
      reject(new Error("no controlling service worker"))
      return
    }
    const channel = new MessageChannel()
    const timer = setTimeout(() => reject(new Error("SYNC_QUEUE timed out after 30s")), 30_000)
    channel.port1.onmessage = (event) => {
      clearTimeout(timer)
      resolve(event.data)
    }
    worker.postMessage({ type: "SYNC_QUEUE" }, [channel.port2])
  })
}

/** Post /attendance through the page, so the service worker sees it. */
async function postAttendance({ mobile, sessionId }) {
  return fetch("/attendance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mobile, sessionId }),
  }).then(async (response) => ({
    status: response.status,
    body: await response.json().catch(() => null),
  }))
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const chromium = resolveChromium()
let playwright
try {
  playwright = await import("playwright-core")
} catch {
  fail(
    "playwright-core is not installed. Run `pnpm install` — it is a devDependency of this repo (driver only; no browser is downloaded).",
  )
}

const { openSession, mobile } = await loadOpenSession()
const fixturePassword = requireFixturePassword()

log(`CAP-6 PWA offline queue`)
log(`Base URL  : ${BASE_URL}`)
log(`Program   : ${PROGRAM}`)
log(`Chromium  : ${chromium.path}  (${chromium.source})`)
log(`Session   : ${openSession.id}`)
log("")

const browser = await playwright.chromium.launch({
  executablePath: chromium.path,
  headless: !HEADED,
  // The sandbox is unavailable in most CI containers, and the browser only ever
  // loads this deployment.
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
})

let createdAttendanceIds = []

try {
  const context = await browser.newContext()
  const page = await context.newPage()
  const QUEUE_TARGET = [DB_NAME, STORE_NAME]

  await installQueueHelpers(page)
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 60_000 })

  // --- PWA assets ----------------------------------------------------------

  const manifestResponse = await page.request.get(`${BASE_URL}/manifest.json`)
  check("/manifest.json is served", manifestResponse.status() === 200, `status ${manifestResponse.status()}`)

  const manifest = await manifestResponse.json().catch(() => null)
  check(
    "manifest declares a name and icons",
    Boolean(manifest?.name) && Array.isArray(manifest?.icons) && manifest.icons.length > 0,
    `name=${manifest?.name ?? "(none)"} icons=${Array.isArray(manifest?.icons) ? manifest.icons.length : "(none)"}`,
  )

  const swResponse = await page.request.get(`${BASE_URL}/sw.js`)
  const swBody = await swResponse.text()
  check("/sw.js is served", swResponse.status() === 200, `status ${swResponse.status()}`)
  check(
    "sw.js uses the pinned DB/store names",
    swBody.includes(`"${DB_NAME}"`) && swBody.includes(`"${STORE_NAME}"`),
    `looked for "${DB_NAME}" and "${STORE_NAME}"`,
  )

  // --- service worker registration ----------------------------------------

  let registration = await page.evaluate(registerServiceWorker)
  if (!registration.ok) {
    // A first install leaves the document uncontrolled; a reload adopts the
    // now-active worker. Without a controller the offline queue is unreachable,
    // so this reload is load-bearing, not a retry convenience.
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 })
    registration = await page.evaluate(registerServiceWorker)
  }
  check("service worker registered and controlling the page", registration.ok, registration.reason ?? `scope ${registration.scope}`)
  if (!registration.ok) {
    log("")
    log("The service worker never took control, so the offline queue cannot be observed.")
    // report() ends the process, so the browser is closed first or Chromium is
    // orphaned.
    await browser.close().catch(() => {})
    report()
  }

  // Start from a known-empty queue so "one row" means one row.
  if (!KEEP_QUEUE) {
    await page.evaluate(([n, s]) => window.__clearQueue([n, s]), QUEUE_TARGET)
  }

  const queueBefore = await page.evaluate(([n, s]) => window.__readQueue([n, s]), QUEUE_TARGET)
  // `--keep-queue` deliberately preserves whatever was already queued, so the
  // emptiness precondition does not hold there; asserting it anyway would make
  // the flag always fail.
  check(
    `offline queue starts empty${KEEP_QUEUE ? " (skipped: --keep-queue preserves what was there)" : ""}`,
    KEEP_QUEUE ? true : queueBefore.length === 0,
    `${queueBefore.length} row(s) already queued`,
  )

  // --- offline POST -> 202 {queued:true} ------------------------------------

  await context.setOffline(true)
  const offlinePost = await page.evaluate(postAttendance, { mobile, sessionId: openSession.id })
  check(
    "offline POST /attendance -> 202 with queued: true",
    offlinePost.status === 202 && offlinePost.body?.queued === true,
    `got ${offlinePost.status} ${JSON.stringify(offlinePost.body)?.slice(0, 160)}`,
  )

  const queuedOffline = await page.evaluate(([n, s]) => window.__readQueue([n, s]), QUEUE_TARGET)
  check(
    `exactly one row in ${DB_NAME}/${STORE_NAME}`,
    queuedOffline.length === 1,
    `${queuedOffline.length} row(s)`,
  )
  check(
    "queued row carries the original /attendance URL",
    typeof queuedOffline[0]?.url === "string" && new URL(queuedOffline[0].url).pathname === "/attendance",
    `url=${queuedOffline[0]?.url ?? "(none)"}`,
  )
  check(
    "queued row keeps the POST body and method",
    queuedOffline[0]?.method === "POST" && typeof queuedOffline[0]?.body === "string" && queuedOffline[0].body.includes(mobile),
    `method=${queuedOffline[0]?.method ?? "(none)"}`,
  )

  // --- the row survives losing the page -----------------------------------
  //
  // Queue -> sync within one document lifetime only proves the row reached
  // IndexedDB. What makes the queue useful is that it survives the tab closing:
  // submit offline, reopen later, sync. A reload is the cheapest observable
  // stand-in for that, and it still goes through the service worker.

  await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 })
  const queuedAfterReload = await page.evaluate(([n, s]) => window.__readQueue([n, s]), QUEUE_TARGET)
  check(
    "queued row survives a page reload",
    queuedAfterReload.length === 1 && queuedAfterReload[0]?.url === queuedOffline[0]?.url,
    `${queuedAfterReload.length} row(s) after reload; url=${queuedAfterReload[0]?.url ?? "(none)"}`,
  )

  // --- replay: the queued row reaches the server ---------------------------

  await context.setOffline(false)
  const firstSync = await page.evaluate(syncQueue).catch((error) => ({ error: error?.message ?? String(error) }))
  check(
    "SYNC_QUEUE replies with success",
    firstSync?.success === true,
    `got ${JSON.stringify(firstSync)}`,
  )

  const queueAfterFirstSync = await page.evaluate(([n, s]) => window.__readQueue([n, s]), QUEUE_TARGET)
  check(
    "queue drains after the replay",
    queueAfterFirstSync.length === 0,
    `${queueAfterFirstSync.length} row(s) left`,
  )

  if (fixturePassword) {
    // The row is now server-side. Read it as the service role rather than
    // trusting the browser's say-so.
    const { createClient } = await import("@supabase/supabase-js")
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: contact } = await db
      .from("contacts")
      .select("id")
      .eq("program_id", PROGRAM)
      .eq("phone", mobile)
      .maybeSingle()
    const { data: replayed } = contact
      ? await db.from("attendance").select("id").eq("contact_id", contact.id).eq("session_id", openSession.id)
      : { data: [] }
    if (replayed?.length) createdAttendanceIds.push(...replayed.map((row) => row.id))
    check(
      "replayed attendance is visible server-side",
      (replayed?.length ?? 0) === 1,
      `${replayed?.length ?? 0} row(s) for mobile ${mobile} in session ${openSession.id}`,
    )

    // --- replay again: the server answers 409, which counts as synced -------

    await context.setOffline(true)
    const secondQueued = await page.evaluate(postAttendance, { mobile, sessionId: openSession.id })
    check(
      "second offline POST -> 202 queued (the row already exists server-side)",
      secondQueued.status === 202 && secondQueued.body?.queued === true,
      `got ${secondQueued.status}`,
    )

    const queuedSecond = await page.evaluate(([n, s]) => window.__readQueue([n, s]), QUEUE_TARGET)
    check("exactly one row re-queued", queuedSecond.length === 1, `${queuedSecond.length} row(s)`)

    await context.setOffline(false)
    const secondSync = await page.evaluate(syncQueue).catch((error) => ({ error: error?.message ?? String(error) }))
    check("SYNC_QUEUE replies with success on the 409 replay", secondSync?.success === true, `got ${JSON.stringify(secondSync)}`)

    const queueAfterSecondSync = await page.evaluate(([n, s]) => window.__readQueue([n, s]), QUEUE_TARGET)
    check(
      "queue drains on a 409 response (409 counts as synced)",
      queueAfterSecondSync.length === 0,
      `${queueAfterSecondSync.length} row(s) left`,
    )

    const { data: afterDuplicate } = contact
      ? await db.from("attendance").select("id").eq("contact_id", contact.id).eq("session_id", openSession.id)
      : { data: [] }
    check(
      "the 409 replay created no duplicate row",
      (afterDuplicate?.length ?? 0) === 1,
      `${afterDuplicate?.length ?? 0} row(s)`,
    )
  } else {
    check(
      "server-side replay + 409-drain assertions",
      false,
      "no fixture password available (PREVIEW_FIXTURE_PASSWORD / .env.preview-seed.local), so the replayed row cannot be read back",
    )
  }

  // --- offline navigation fallback -----------------------------------------
  //
  // Reported, not asserted. `cache.addAll(PRECACHE_ASSETS)` is all-or-nothing,
  // and PRECACHE_ASSETS lists `/manifest.webmanifest`, which this deployment
  // serves as 404 — so the install handler's catch swallows the rejection and
  // nothing is precached. Offline navigation therefore falls through to the
  // synthetic `503 Offline` instead of the cached shell.
  //
  // That is a defect in the frozen `public/sw.js` plus its missing asset, not in
  // CAP-6's queue contract, and this story does not edit sw.js. It is surfaced
  // as a warning so the gap is visible rather than silently passed over.

  await context.setOffline(true)
  const offlineAttend = await page
    .goto(`${BASE_URL}/attend`, { waitUntil: "domcontentloaded", timeout: 30_000 })
    .catch((error) => ({ status: () => `error: ${error.message}` }))
  await context.setOffline(false)
  const offlineStatus = typeof offlineAttend?.status === "function" ? offlineAttend.status() : String(offlineAttend)
  if (offlineStatus !== 200) {
    log(`WARN  offline navigation to /attend returned ${offlineStatus}, not the cached shell.`)
    log("WARN  Known cause: sw.js precaches /manifest.webmanifest (404 here), so cache.addAll rejects")
    log("WARN  and no asset is cached. sw.js is frozen for this story; recorded, not worked around.")
  } else {
    log(`PASS  offline navigation to /attend served the cached shell`)
  }
} finally {
  await browser.close().catch(() => {})
}

// Clean up the attendance row the replay created, so the seeder stays
// idempotent and this script is re-runnable.
// Independent of --keep-queue: that flag is about the browser's queue, not about
// the server row the replay created. Coupling them left a real attendance row
// behind, and the next run's "replayed attendance is visible server-side == 1"
// then asserted against its own residue. `--keep-attendance` opts out.
if (createdAttendanceIds.length > 0 && !KEEP_ATTENDANCE) {
  const { createClient } = await import("@supabase/supabase-js")
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error: deleteError } = await db
    .from("attendance")
    .delete()
    .in("id", createdAttendanceIds)
    .select("id")
  if (deleteError) {
    // Reporting "Cleaned up 0" here would let the run exit 0 with the row still
    // present, which is exactly the residue that breaks the next run.
    fail(`deleting the attendance row(s) this script created failed: ${deleteError.code ?? ""} ${deleteError.message}`)
  }
  log(`Cleaned up ${data?.length ?? 0} attendance row(s) this script created.`)
} else if (createdAttendanceIds.length > 0) {
  log(`Left in place (--keep-attendance): ${createdAttendanceIds.length} attendance row(s)`)
}

report()

function report() {
  log("")
  const passed = results.filter((result) => result.pass).length
  log(`${passed}/${results.length} passed`)
  if (passed !== results.length) {
    console.error("")
    console.error(`${results.length - passed} CAP-6 assertion(s) failed against ${BASE_URL}.`)
    process.exit(1)
  }
  process.exit(0)
}
