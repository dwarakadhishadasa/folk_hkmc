#!/usr/bin/env node
/**
 * verify-preview-environment.mjs — guard the preview branch against database drift.
 *
 * The preview environment is the free-plan substitute for Supabase branching:
 * the `preview` git branch deploys against `supabase-byzantium-battery`
 * (`cparpinmalqsimninyfw`) instead of the production project
 * (`etwunirahuucodcxydgs`). Nothing in Vercel prevents the Preview environment
 * from being repointed at production, and a silent repoint would let preview
 * writes reach live data.
 *
 * Checks, in order:
 *   1. the Supabase project is ACTIVE_HEALTHY and is the preview ref;
 *   2. every committed migration version is recorded in the ledger;
 *   3. the fixture seed is present, including active password-sign-in staff;
 *   4. the preview origin serves /login and reports no staff to anonymous callers;
 *   5. the served client bundle contains the preview ref and not the production ref;
 *   6. /preview-login serves the QA form with FOLK fixture accounts and /login links to it.
 *
 * Usage:
 *   node scripts/verify-preview-environment.mjs
 *   node scripts/verify-preview-environment.mjs --base-url https://...
 *
 * Credentials: `SUPABASE_ACCESS_TOKEN` from `.env.migration.local`. The script
 * never prints a key or a URL containing one.
 */

import { readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
for (const file of [".env.migration.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(repoRoot, file))
  } catch {
    // Fall back to an already-exported environment.
  }
}

const PREVIEW_REF = "cparpinmalqsimninyfw"
const PRODUCTION_REF = "etwunirahuucodcxydgs"
const DEFAULT_BASE_URL = "https://folk-hkmc-preview-dwarakadhishadasa-5018s-projects.vercel.app"

const argv = process.argv.slice(2)
function flagValue(name) {
  const index = argv.indexOf(name)
  return index === -1 ? undefined : argv[index + 1]
}

const baseUrl = (flagValue("--base-url") || DEFAULT_BASE_URL).replace(/\/+$/, "")
const projectRef = (flagValue("--project-ref") || PREVIEW_REF).trim()
const productionRef = (flagValue("--production-ref") || PRODUCTION_REF).trim()

if (projectRef === productionRef) {
  console.error(`ERROR refusing to verify: --project-ref and --production-ref are both ${projectRef}`)
  process.exit(1)
}

const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim()
if (!accessToken) {
  console.error("ERROR SUPABASE_ACCESS_TOKEN is not set. Set it in .env.migration.local.")
  process.exit(1)
}

const failures = []
function pass(message) {
  console.log(`PASS ${message}`)
}
function fail(message) {
  console.error(`FAIL ${message}`)
  failures.push(message)
}

async function json(url, options = {}, attempts = 3) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          ...(options.headers ?? {}),
        },
        signal: AbortSignal.timeout(60_000),
      })
      const text = await response.text()
      if (!response.ok) {
        const error = new Error(
          `${options.method ?? "GET"} ${url} -> HTTP ${response.status}: ${text.slice(0, 300)}`,
        )
        error.retryable = response.status >= 500
        throw error
      }
      try {
        return JSON.parse(text)
      } catch {
        const error = new Error(`${options.method ?? "GET"} ${url} -> response was not JSON`)
        error.retryable = false
        throw error
      }
    } catch (error) {
      lastError = error
      if (error.retryable === false || attempt === attempts) {
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 1_000))
    }
  }
  throw lastError
}

function query(sql) {
  return json(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    body: JSON.stringify({ query: sql }),
  })
}

// 1. Project identity and health -------------------------------------------------
try {
  const project = await json(`https://api.supabase.com/v1/projects/${projectRef}`)
  if (project.status === "ACTIVE_HEALTHY") {
    pass(`Supabase project ${projectRef} is ACTIVE_HEALTHY`)
  } else {
    fail(`Supabase project ${projectRef} is ${project.status}, expected ACTIVE_HEALTHY (restore it first)`)
  }
} catch (error) {
  fail(`could not read project ${projectRef}: ${error.message}`)
}

// 2. Migration ledger ------------------------------------------------------------
try {
  const entries = await readdir(path.join(repoRoot, "supabase", "migrations"))
  const expected = entries
    .map((entry) => /^(\d{14})_.+\.sql$/.exec(entry))
    .filter(Boolean)
    .map((match) => match[1])
    .sort()
  const rows = await query(
    "select version from supabase_migrations.schema_migrations order by version",
  )
  const applied = new Set(rows.map((row) => row.version))
  const missing = expected.filter((version) => !applied.has(version))
  if (missing.length === 0) {
    pass(`all ${expected.length} committed migration versions are recorded`)
  } else {
    fail(`${missing.length} migration version(s) missing from the ledger: ${missing.slice(0, 5).join(", ")}`)
  }
} catch (error) {
  fail(`could not verify the migration ledger: ${error.message}`)
}

// 3. Fixture seed ----------------------------------------------------------------
try {
  const [counts] = await query(`
    select
      (select count(*) from public.users)::int as users,
      (select count(*) from public.locations)::int as locations,
      (select count(*) from public.contacts)::int as contacts,
      (select count(*) from public.sessions)::int as sessions,
      (select count(*) from public.attendance)::int as attendance,
      (select count(*) from public.users where program_id = 'folk' and status = 'Active' and email like '%.fixture.test')::int as folk_fixture_staff
  `)
  const minimums = { users: 8, locations: 4, contacts: 4, sessions: 4, attendance: 4, folk_fixture_staff: 4 }
  const short = Object.entries(minimums).filter(([table, minimum]) => (counts?.[table] ?? 0) < minimum)
  if (short.length === 0) {
    pass(
      `fixtures present: ${counts.users} users, ${counts.folk_fixture_staff} active FOLK fixture staff, ` +
        `${counts.locations} locations, ${counts.contacts} contacts, ${counts.sessions} sessions, ` +
        `${counts.attendance} attendance`,
    )
  } else {
    fail(
      `fixture seed is incomplete: ${short
        .map(([table, minimum]) => `${table}=${counts?.[table] ?? 0} (<${minimum})`)
        .join(", ")}`,
    )
  }
} catch (error) {
  fail(`could not verify the fixture seed: ${error.message}`)
}

// 4. Anonymous access ------------------------------------------------------------
try {
  const login = await fetch(`${baseUrl}/login`, { signal: AbortSignal.timeout(60_000) })
  if (login.status === 200) {
    pass(`preview origin serves /login (HTTP 200)`)
  } else {
    fail(`preview origin ${baseUrl}/login returned HTTP ${login.status}`)
  }

  const me = await fetch(`${baseUrl}/api/auth/me`, { signal: AbortSignal.timeout(60_000) })
  const body = await me.json().catch(() => null)
  if (me.status === 200 && body && body.staff === null) {
    pass("anonymous /api/auth/me returns {\"staff\":null}")
  } else {
    fail(`anonymous /api/auth/me returned HTTP ${me.status}: ${JSON.stringify(body).slice(0, 200)}`)
  }
} catch (error) {
  fail(`could not reach ${baseUrl}: ${error.message}`)
}

// 5. Served bundle ---------------------------------------------------------------
try {
  const loginHtml = await (await fetch(`${baseUrl}/login`, { signal: AbortSignal.timeout(60_000) })).text()
  const chunks = [...new Set(loginHtml.match(/_next\/static\/chunks\/[^"']+?\.js/g) ?? [])].slice(0, 40)
  let sawPreview = false
  let sawProduction = false
  for (const chunk of chunks) {
    const source = await (await fetch(`${baseUrl}/${chunk}`, { signal: AbortSignal.timeout(60_000) })).text()
    if (source.includes(projectRef)) sawPreview = true
    if (source.includes(productionRef)) sawProduction = true
  }
  if (sawPreview && !sawProduction) {
    pass(`served bundle contains ${projectRef} and not ${productionRef}`)
  } else if (!sawPreview) {
    fail(`served bundle does not contain ${projectRef}; the Preview environment may point elsewhere`)
  } else {
    fail(`served bundle contains the production ref ${productionRef}; stop using this preview`)
  }
} catch (error) {
  fail(`could not inspect the served bundle: ${error.message}`)
}

// 6. Preview QA password sign-in -------------------------------------------------
try {
  const previewLogin = await fetch(`${baseUrl}/preview-login`, { signal: AbortSignal.timeout(60_000) })
  const previewLoginHtml = await previewLogin.text()
  if (previewLogin.status === 200) {
    pass("preview password sign-in page serves HTTP 200")
  } else {
    fail(`${baseUrl}/preview-login returned HTTP ${previewLogin.status}`)
  }

  if (previewLogin.status === 200 && previewLoginHtml.includes("@folk.fixture.test")) {
    pass("preview password sign-in page lists FOLK fixture accounts")
  } else {
    fail("preview password sign-in page does not list any FOLK fixture account")
  }

  const loginHtml = await (await fetch(`${baseUrl}/login`, { signal: AbortSignal.timeout(60_000) })).text()
  if (loginHtml.includes("/preview-login") && loginHtml.includes("Sign in with a password")) {
    pass("preview /login links to the password sign-in page")
  } else {
    fail("preview /login does not link to /preview-login; the preview branch gate may not be active")
  }
} catch (error) {
  fail(`could not inspect the preview password sign-in route: ${error.message}`)
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed.`)
  process.exit(1)
}

console.log("\nAll preview environment checks passed.")
