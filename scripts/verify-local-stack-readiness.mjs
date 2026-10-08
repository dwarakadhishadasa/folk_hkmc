#!/usr/bin/env node
/**
 * verify-local-stack-readiness.mjs — `pnpm local:readiness`.
 *
 * "Is the stack running?" and "is the stack usable?" are different questions,
 * and only the second one matters before a suite runs. A container that answers
 * HTTP is a *reachable-but-empty* database when an app env file points at the
 * hosted project — the app boots, renders empty states, and every spec that
 * needs a signed-in staff user fails at sign-in with an error that reads like an
 * auth bug.
 *
 * So this script asserts three independent things:
 *
 *   1. **Baseline** — offline filesystem reads. The migrations and the code that
 *      queries them must both be present, or every later failure is noise.
 *   2. **Services** — Supabase `:54321/auth/v1/health` → 200 and Mailpit
 *      `GET /api/v1/messages` → 200. Readiness genuinely requires the mailbox;
 *      `seed:local` does not, which is why Mailpit is asserted here and not there.
 *   3. **Data and target agreement** — PostgREST row counts for the four tables
 *      the seeder fills, and **every** Supabase URL variable present in **each**
 *      app env file, compared to `API_URL`. Checking one variable out of two
 *      lets a file holding a local `SUPABASE_URL` and a hosted
 *      `NEXT_PUBLIC_SUPABASE_URL` pass while the browser reads hosted — the
 *      browser reads `NEXT_PUBLIC_*`, so a partial check is a false green.
 *
 * Every failure is collected before exiting, so one run reports every problem;
 * a failing baseline does not suppress the other sections. Failures print
 * `supabase status` output in the message: a bare timeout here costs more
 * debugging time than the assertion costs to write.
 *
 * `GET :3000/login` is reported as a **warning, not an assertion** — `dev:local`
 * runs the app last and blocks, so a script that hard-requires the app port can
 * never run from the chain it is meant to validate.
 *
 * Usage:
 *   pnpm local:readiness
 *   node scripts/verify-local-stack-readiness.mjs --app-env-file=/tmp/hosted.env
 *   node scripts/verify-local-stack-readiness.mjs --min-rows 1000000
 *   node scripts/verify-local-stack-readiness.mjs --mailpit-url http://127.0.0.1:9
 *
 * Options:
 *   --mailpit-url <url>   Mailpit base URL (default: http://127.0.0.1:8025).
 *   --app-env-file <path> Check this env file instead of both app defaults.
 *   --min-rows <n>        Minimum rows per seeded table (default: 1, minimum 1).
 *   --timeout-ms <n>      Per-request timeout (default: 8000).
 */

import { spawnSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { endpointsAgree, parseSupabaseStatusEnv, unquoteEnvValue } from "./local-supabase-target.mjs"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

// Both apps by default: `scripts/use-local-supabase-env.sh` writes both, and
// they run on different ports (:3000 / :3001). A stale gita-life file is
// invisible to a folk-only check.
const DEFAULT_APP_ENV_FILES = [
  path.join(repoRoot, "apps", "folk", ".env.local"),
  path.join(repoRoot, "apps", "gita-life", ".env.local"),
]

// Every variable that names a Supabase target. Both are checked; the browser
// reads `NEXT_PUBLIC_*`, the server reads the unprefixed one, so a split is a
// real bug even when one half looks right.
const TARGET_VARIABLES = ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]

const DEFAULTS = {
  mailpitUrl: "http://127.0.0.1:8025",
  appEnvFiles: DEFAULT_APP_ENV_FILES,
  minRows: 1,
  timeoutMs: 8000,
}

// The four tables `scripts/seed-preview-fixtures.mjs` fills, per program.
// Deliberately not the bulk volumes story 4's generator will produce: this
// script's real requirement is non-zero, and `--min-rows` is the dial story 4
// raises once that generator ships.
const SEEDED_TABLES = ["contacts", "users", "locations", "sessions"]

const REQUIRED_PATHS = [
  "supabase/migrations",
  "lib/supabase",
  "components/grid",
]

// 12 is the count on `dev` after the schema-migration branch is fast-forwarded
// in. 6 of those 12 exist ONLY on that branch — the core-table creation, the
// `public.users` table and contact-column backfill, the scoped per-role RLS
// policies, the legacy-named-column retirement, preacher session scoping, and
// the import id map. Without the fast-forward `dev` carries only 6 and there is
// no Supabase schema at all. The exact six are tabulated in
// _bmad-output/specs/spec-playwright-test-foundation/branch-and-schema-baseline.md.
//
// Deliberately a constant with no flag: the threshold encodes a specific
// checkout state, and a flag would let it drift silently.
const MIN_MIGRATIONS = 12

// `pnpm dlx` may resolve a package before answering; a cold cache can exceed
// the default spawnSync budget, and an unbounded wait would hang the readiness
// check that story 2's Playwright `webServer` depends on.
const STATUS_TIMEOUT_MS = 120000

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

/**
 * Throws on bad input rather than calling `process.exit`, so
 * `verify-seed-local-guard.mjs` can assert the failures without killing itself.
 */
export function parseArgs(argv) {
  const options = { ...DEFAULTS }
  const raw = {}

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith("--")) continue
    const eq = arg.indexOf("=")
    const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq)

    const SUPPORTED_FLAGS = ["mailpit-url", "app-env-file", "min-rows", "timeout-ms"]
    if (!SUPPORTED_FLAGS.includes(name)) {
      throw new Error(`Unknown flag --${name}. Supported: ${SUPPORTED_FLAGS.map((flag) => `--${flag}`).join(", ")}.`)
    }

    let value = eq === -1 ? undefined : arg.slice(eq + 1)
    if (value === undefined) {
      const next = argv[index + 1]
      // `--min-rows` as the final token, or `--min-rows --mailpit-url x`, used
      // to yield NaN/undefined and surface as a confusing crash further down.
      if (next === undefined || next.startsWith("--")) {
        throw new Error(`--${name} requires a value.`)
      }
      value = next
      index += 1
    }
    if (value === "") throw new Error(`--${name} requires a non-empty value.`)

    switch (name) {
      case "mailpit-url":
        options.mailpitUrl = value
        break
      case "app-env-file":
        // An explicit file narrows the check to exactly that file.
        options.appEnvFiles = [path.resolve(repoRoot, value)]
        break
      case "min-rows":
        raw.minRows = value
        options.minRows = Number.parseInt(value, 10)
        break
      case "timeout-ms":
        raw.timeoutMs = value
        options.timeoutMs = Number.parseInt(value, 10)
        break
    }
  }

  // 0 would silently disable the story's non-zero requirement, so the floor is 1.
  if (!Number.isInteger(options.minRows) || options.minRows < 1) {
    throw new Error(`--min-rows must be an integer >= 1, got ${JSON.stringify(raw.minRows ?? DEFAULTS.minRows)}.`)
  }
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error(`--timeout-ms must be a positive integer, got ${JSON.stringify(raw.timeoutMs ?? DEFAULTS.timeoutMs)}.`)
  }
  return options
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const failures = []
const warnings = []

function beginSection(title) {
  console.log(title)
}

function fail(message) {
  console.error(`ERROR ${message}`)
  process.exit(1)
}

function recordFailure(message) {
  failures.push(message)
  console.error(`  ✗ ${message}`)
}

function recordWarning(message) {
  warnings.push(message)
  console.log(`  ! ${message}`)
}

function pass(message) {
  console.log(`  ✓ ${message}`)
}

/**
 * `supabase status` output, embedded in every failure report. A readiness
 * failure without it makes the reader reach for the CLI themselves.
 */
function supabaseStatusOutput() {
  const result = spawnSync("pnpm", ["dlx", "supabase@2.98.2", "status"], { cwd: repoRoot, encoding: "utf8", timeout: STATUS_TIMEOUT_MS })
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim()
  return output || "(no output — the CLI could not be run)"
}

function reportFailure() {
  console.error("")
  console.error(`Local stack readiness FAILED (${failures.length} problem(s)):`)
  for (const message of failures) console.error(`  - ${message}`)
  console.error("")
  console.error("`supabase status` output:")
  console.error(supabaseStatusOutput())
  process.exit(1)
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

/**
 * Fetches and **drains** the body. A response whose body is never read leaves a
 * socket open, and this script ends in `process.exit(0)` — Node would be killed
 * with the connection still held. Story 2's Playwright `webServer` runs this as
 * a `dependsOn`, so a hang here is a hang there.
 */
async function probe(url, { timeoutMs, headers = {} } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { headers, signal: controller.signal, redirect: "manual" })
    // Bounded by the same timeout the fetch used; every caller ignores the body.
    await response.arrayBuffer().catch(() => {})
    return response
  } finally {
    clearTimeout(timer)
  }
}

/**
 * PostgREST exact count via `Prefer: count=exact` + `Range: 0-0`: one row is
 * transferred and the total arrives in `Content-Range: 0-0/<count>`. An empty
 * table reports the unsatisfied-range form, which must parse to 0 — and not to
 * null, which callers read as "could not count".
 */
export function countFromContentRange(value) {
  if (!value) return null
  const match = /\/(\d+)$/.exec(value.trim())
  if (!match) return null
  return Number.parseInt(match[1], 10)
}

function readEnvFile(file) {
  const values = {}
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed)
    if (!match) continue
    values[match[1]] = unquoteEnvValue(match[2])
  }
  return values
}

function displayPath(file) {
  const relative = path.relative(repoRoot, file)
  return relative && !relative.startsWith("..") ? relative : file
}

// ---------------------------------------------------------------------------
// 1. Baseline — offline filesystem reads
// ---------------------------------------------------------------------------

function checkBaseline() {
  beginSection("Baseline")
  const missing = REQUIRED_PATHS.filter((relative) => !existsSync(path.join(repoRoot, relative)))
  if (missing.length > 0) {
    for (const relative of missing) recordFailure(`Baseline path is missing: ${relative}/ — the schema migration branch is not merged into this checkout. See _bmad-output/specs/spec-playwright-test-foundation/branch-and-schema-baseline.md.`)
    return
  }

  // `existsSync` passing does not guarantee the directory can be listed — a
  // permissions error or a raced deletion lands here.
  let migrations
  try {
    migrations = readdirSync(path.join(repoRoot, "supabase", "migrations")).filter((name) => name.endsWith(".sql"))
  } catch (error) {
    recordFailure(`Could not read supabase/migrations/: ${error.message}. The schema migration branch is likely not merged into this checkout.`)
    return
  }

  if (migrations.length < MIN_MIGRATIONS) {
    recordFailure(`Baseline expects at least ${MIN_MIGRATIONS} files in supabase/migrations/, found ${migrations.length} (${migrations.join(", ") || "none"}). The schema migration branch is not merged into this checkout.`)
    return
  }

  pass(`supabase/migrations/ has ${migrations.length} migrations`)
  pass("lib/supabase/ present")
  pass("components/grid/ present")
}

// ---------------------------------------------------------------------------
// 2. Local credentials
// ---------------------------------------------------------------------------

function describeExit(result) {
  if (result.error) return result.error.message
  if (result.status === null) return `timed out after ${STATUS_TIMEOUT_MS}ms${result.signal ? ` (signal ${result.signal})` : ""}`
  return `exit ${result.status}`
}

function resolveLocalCredentials() {
  const result = spawnSync("pnpm", ["dlx", "supabase@2.98.2", "status", "-o", "env"], { cwd: repoRoot, encoding: "utf8", timeout: STATUS_TIMEOUT_MS })
  if (result.error || result.status !== 0) {
    recordFailure(`Could not read local Supabase credentials from \`supabase status -o env\` (${describeExit(result)}). Start the stack with \`pnpm supabase:start\`.`)
    return null
  }
  const credentials = parseSupabaseStatusEnv(result.stdout)
  if (!credentials.API_URL || !credentials.SERVICE_ROLE_KEY) {
    recordFailure("Local Supabase status did not report both API_URL and SERVICE_ROLE_KEY. Start the stack with `pnpm supabase:start`.")
    return null
  }
  return credentials
}

// ---------------------------------------------------------------------------
// 3. Services, data, and target agreement
// ---------------------------------------------------------------------------

async function checkHealth(credentials, options) {
  beginSection("Services")
  const url = `${credentials.API_URL.replace(/\/+$/, "")}/auth/v1/health`
  try {
    const response = await probe(url, { timeoutMs: options.timeoutMs })
    if (response.status === 200) pass(`Supabase auth health ${response.status} at ${url}`)
    else recordFailure(`Supabase auth health at ${url} returned ${response.status}, expected 200.`)
  } catch (error) {
    recordFailure(`Supabase auth health at ${url} failed: ${error.name === "AbortError" ? `timed out after ${options.timeoutMs}ms` : error.message}.`)
  }

  const mailpit = `${options.mailpitUrl.replace(/\/+$/, "")}/api/v1/messages`
  try {
    const response = await probe(mailpit, { timeoutMs: options.timeoutMs })
    if (response.status === 200) pass(`Mailpit messages API ${response.status} at ${mailpit}`)
    else recordFailure(`Mailpit messages API at ${mailpit} returned ${response.status}, expected 200. Start it with \`pnpm mailpit:start\`.`)
  } catch (error) {
    recordFailure(`Mailpit messages API at ${mailpit} failed: ${error.name === "AbortError" ? `timed out after ${options.timeoutMs}ms` : error.message}. Start it with \`pnpm mailpit:start\`.`)
  }
}

async function checkRows(credentials, options) {
  beginSection("Data")
  const base = credentials.API_URL.replace(/\/+$/, "")
  const headers = {
    apikey: credentials.SERVICE_ROLE_KEY,
    Authorization: `Bearer ${credentials.SERVICE_ROLE_KEY}`,
    Prefer: "count=exact",
    Range: "0-0",
  }

  for (const table of SEEDED_TABLES) {
    const url = `${base}/rest/v1/${table}?select=*`
    try {
      const response = await probe(url, { headers, timeoutMs: options.timeoutMs })
      // 206 is PostgREST's correct answer to a ranged request: the Range header
      // is what makes the count cheap. Anything else is a real error.
      if (response.status !== 200 && response.status !== 206) {
        recordFailure(`Counting ${table} via PostgREST at ${url} returned ${response.status}, expected 200/206. The local schema may not be applied — run \`pnpm supabase:push\`.`)
        continue
      }
      const contentRange = response.headers.get("content-range")
      const count = countFromContentRange(contentRange)
      if (count === null) {
        recordFailure(`Counting ${table} returned no parseable Content-Range (got ${contentRange ?? "nothing"}). Expected \`Prefer: count=exact\` to be honoured.`)
        continue
      }
      if (count < options.minRows) {
        recordFailure(`Table ${table} has ${count} row(s), expected at least ${options.minRows}. The local database is reachable but not populated to the required depth — run \`pnpm seed:local\`, or lower --min-rows if the current volume is sufficient for your use.`)
      } else {
        pass(`${table}: ${count} row(s)`)
      }
    } catch (error) {
      recordFailure(`Counting ${table} at ${url} failed: ${error.name === "AbortError" ? `timed out after ${options.timeoutMs}ms` : error.message}.`)
    }
  }
}

/**
 * Every URL variable present in the file, not just the first one found. A file
 * holding a local `SUPABASE_URL` beside a hosted `NEXT_PUBLIC_SUPABASE_URL` is
 * the dangerous shape: the server looks right, the browser reads hosted.
 */
function checkAppEnvAgreement(credentials, options) {
  beginSection("Target agreement")
  const expected = credentials.API_URL

  for (const file of options.appEnvFiles) {
    const relative = displayPath(file)
    if (!existsSync(file)) {
      recordFailure(`App env file is missing: ${relative}. Run \`pnpm supabase:env\` to write the local Supabase block.`)
      continue
    }

    let values
    try {
      values = readEnvFile(file)
    } catch (error) {
      recordFailure(`Could not read app env file ${relative}: ${error.message}`)
      continue
    }

    const present = TARGET_VARIABLES.filter((name) => values[name])
    if (present.length === 0) {
      recordFailure(`${relative} sets neither SUPABASE_URL nor NEXT_PUBLIC_SUPABASE_URL, so the app has no Supabase target. Run \`pnpm supabase:env\`.`)
      continue
    }

    const disagreeing = present.filter((name) => !endpointsAgree(values[name], expected))
    if (disagreeing.length > 0) {
      // Name every disagreeing variable: the fix is per-variable, and a file
      // that is half-local is the case most likely to be misread as fine.
      recordFailure(
        `Wrong target: ${relative} sets ${disagreeing.map((name) => `${name}=${values[name]}`).join(" and ")}, but the local stack's API_URL is ${expected} (these variables agree: ${present.filter((name) => !disagreeing.includes(name)).join(", ") || "none"}). The app would read ${disagreeing.map((name) => values[name]).join(" and ")} while this check reads local Postgres. Run \`pnpm supabase:env\` to rewrite the local block.`,
      )
      continue
    }

    pass(`${relative} ${present.map((name) => `${name}=${values[name]}`).join(" ")} agrees with API_URL=${expected}`)
  }
}

async function warnIfAppNotRunning(options) {
  beginSection("App")
  const url = "http://127.0.0.1:3000/login"
  try {
    const response = await probe(url, { timeoutMs: options.timeoutMs })
    if (response.status === 200) pass(`App login page ${response.status} at ${url}`)
    else recordWarning(`App login page at ${url} returned ${response.status}, expected 200. Not a failure: \`pnpm dev:local\` runs the app last and blocks, so this script is commonly run before the app starts.`)
  } catch (error) {
    recordWarning(`App login page at ${url} is not reachable (${error.name === "AbortError" ? `timed out after ${options.timeoutMs}ms` : error.message}). Not a failure — see above.`)
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  let options
  try {
    options = parseArgs(process.argv.slice(2))
  } catch (error) {
    fail(error.message)
  }

  console.log("Local stack readiness")
  console.log(`  app env files: ${options.appEnvFiles.map(displayPath).join(", ")}`)
  console.log(`  mailpit      : ${options.mailpitUrl}`)
  console.log(`  min rows     : ${options.minRows} per table (${SEEDED_TABLES.join(", ")})`)
  console.log("")

  checkBaseline()

  // Deliberately NOT gated on `failures.length === 0`: a broken baseline is one
  // problem, not a reason to hide the health, row-count, and target-agreement
  // results behind it. Only unreadable credentials legitimately skip sections,
  // and the skip is reported.
  const credentials = resolveLocalCredentials()
  if (credentials) {
    await checkHealth(credentials, options)
    await checkRows(credentials, options)
    checkAppEnvAgreement(credentials, options)
  } else {
    for (const title of ["Services", "Data", "Target agreement"]) {
      recordFailure(`SKIPPED ${title}: local Supabase credentials could not be read, so this section cannot run.`)
    }
  }

  await warnIfAppNotRunning(options)

  if (failures.length > 0) reportFailure()

  console.log("")
  console.log(`Local stack readiness PASSED${warnings.length > 0 ? ` with ${warnings.length} warning(s)` : ""}.`)
  process.exit(0)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
