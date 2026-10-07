#!/usr/bin/env node
/**
 * apply-migrations.mjs — story 7.9: the committed, re-runnable DDL path.
 *
 * Story 7.8 deferred this. Direct Postgres does not connect from this
 * environment — `pg_isready` on the old pooler exits 124, and the new project's
 * pooler answers "no response" — so `supabase db push` cannot run here at all.
 * The documented channel that does work is the Management API's
 * `POST /v1/projects/{ref}/database/query` endpoint, which runs as `postgres`.
 * This script is that channel, made repeatable.
 *
 * It applies every migration file under `supabase/migrations/` whose version is
 * missing from `supabase_migrations.schema_migrations`, in version order, then
 * records the version with a populated `name` and `on conflict do nothing` — the
 * two properties story 7.8's ad-hoc DDL path was missing. (Its
 * `20261007000000` row landed with `name` null; this script leaves that row
 * alone, because rewriting applied history is not its job, but it never repeats
 * the omission.)
 *
 * `supabase config push` is deliberately NOT called: `supabase/config.toml`'s
 * `[auth]` section is the discarded local-Mailpit configuration, and pushing it
 * would repoint the hosted project's Auth at localhost.
 *
 * Usage:
 *   node scripts/apply-migrations.mjs --dry-run   # list pending versions, send nothing
 *   node scripts/apply-migrations.mjs             # apply pending versions, then verify
 *
 * Options:
 *   --dry-run                   Print the plan and exit 0. No request is sent.
 *   --project-ref <ref>         Override the target ref (default: derived from
 *                               NEXT_PUBLIC_SUPABASE_URL).
 *   --allow-non-disposable      Permit a ref that is not the app's own project.
 *
 * Every secret is scrubbed from this script's own output.
 */

import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

// `.env.migration.local` first so it wins every key it defines; `.env` then
// fills in what it does not (the retired service's read-only API token, which
// only the exporter needs). `process.loadEnvFile` never overwrites a variable
// that is already set, which is what makes that ordering mean anything.
for (const file of [".env.migration.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(repoRoot, file))
  } catch {
    // Fall back to an already-exported environment, or to `.env` for the token.
  }
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
  "POSTGRES_PASSWORD",
  "OLD_SUPABASE_SERVICE_ROLE_KEY",
  "OLD_POSTGRES_PASSWORD",
  "VERCEL_TOKEN",
]) {
  registerSecret(name)
}
for (const name of [
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_PRISMA_URL",
  "OLD_POSTGRES_URL",
  "OLD_POSTGRES_URL_NON_POOLING",
]) {
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
  if (value === null || value === undefined) return value
  const isString = typeof value === "string"
  let text = isString ? value : JSON.stringify(value)
  for (const secret of secretValues) {
    for (const spelling of new Set([secret, JSON.stringify(secret).slice(1, -1)])) {
      if (spelling && text.includes(spelling)) text = text.split(spelling).join(REDACTED)
    }
  }
  if (isString) return text
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function log(message = "") {
  console.log(redact(message))
}

function fail(message) {
  console.error(redact(`ERROR ${message}`))
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Pure helpers — imported by apply-migrations.test.mjs, so they must stay free of
// I/O and of any dependency on the module having been run as the entry point.
// ---------------------------------------------------------------------------

/**
 * `<version>_<name>.sql` → `{ version, name }`, or null when the file is not
 * named that way.
 *
 * The ledger's `name` is null when a migration was applied by hand without it,
 * so parsing the name out of the filename is what lets this script write a
 * populated value on the rows it creates.
 */
export function parseMigrationFileName(fileName) {
  const match = /^(\d{14})_(.+)\.sql$/.exec(fileName)
  if (!match) return null
  return { version: match[1], name: match[2] }
}

/** A single-quoted Postgres literal. `standard_conforming_strings` is on. */
export function quoteLiteral(value) {
  if (value === null || value === undefined) return "null"
  return `'${String(value).replaceAll("'", "''")}'`
}

/**
 * Which of `files` are missing from `ledgerRows`, in version order.
 *
 * `files` must already be sorted; the sort lives here only so a caller cannot
 * apply two versions out of order by accident.
 */
export function pendingMigrations(files, ledgerRows) {
  const applied = new Set(ledgerRows.map((row) => row.version))
  return files.filter((file) => !applied.has(file.version))
}

/**
 * The `statements` array value the ledger row is written with.
 *
 * `ARRAY[…]::text[]`, not `'{…}'::text[]`: a quoted string is a scalar, so the
 * cast alone fails with `22P02 malformed array literal` on any non-empty body.
 * The statement itself is stored whole, which is what the Supabase CLI does and
 * what makes the ledger a real record of what was run rather than a version
 * number with no provenance.
 */
export function ledgerInsertSql(file, sql) {
  return (
    `insert into supabase_migrations.schema_migrations (version, name, statements) ` +
    `values (${quoteLiteral(file.version)}, ${quoteLiteral(file.name)}, array[${quoteLiteral(sql)}]::text[]) ` +
    `on conflict (version) do nothing`
  )
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2)
const dryRun = argv.includes("--dry-run")
const allowNonDisposable = argv.includes("--allow-non-disposable")

const REF_FLAGS = ["--project-ref", "--project-id"]
const refFlagIndex = argv.findIndex((arg) => REF_FLAGS.includes(arg))
const projectRefOverride = refFlagIndex === -1 ? null : argv[refFlagIndex + 1]
if (refFlagIndex !== -1 && (!projectRefOverride || projectRefOverride.startsWith("--"))) {
  fail(`${REF_FLAGS.join(" or ")} requires a value, e.g. --project-ref etwunirahuucodcxydgs`)
}

function requireEnv(name, purpose) {
  const value = process.env[name]?.trim()
  if (!value) fail(`${name} is not set (needed to ${purpose}). Set it in .env.migration.local or the environment.`)
  return value
}

const ACCESS_TOKEN = requireEnv("SUPABASE_ACCESS_TOKEN", "call the Supabase Management API")

const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL", "derive the project ref")
let derivedRef
try {
  derivedRef = new URL(supabaseUrl).hostname.split(".")[0]
} catch {
  fail("NEXT_PUBLIC_SUPABASE_URL is not a parseable URL")
}
const projectRef = projectRefOverride?.trim() || derivedRef

// Same guard as `configure-hosted-project.mjs`: an explicit ref override is the
// only way to aim this at another project, and it must be asked for by name. A
// mistyped ref would otherwise apply DDL to a live project.
if (projectRefOverride && projectRef !== derivedRef && !allowNonDisposable) {
  fail(
    [
      `Refusing to apply DDL to ${projectRef} from --project-ref: the app's own project is ${derivedRef}.`,
      `Re-run with --project-ref ${derivedRef}, or pass --allow-non-disposable if you really`,
      "mean to apply migrations to another project.",
    ].join("\n"),
  )
}

const MIGRATIONS_DIR = path.join(repoRoot, "supabase", "migrations")

async function listMigrationFiles() {
  const entries = await readdir(MIGRATIONS_DIR)
  const parsed = entries.map((entry) => ({ entry, parsed: parseMigrationFileName(entry) }))
  const files = parsed.filter(({ parsed: file }) => file).map(({ parsed: file }) => file)
  const stray = parsed
    .filter(({ entry, parsed: file }) => !file && entry.endsWith(".sql"))
    .map(({ entry }) => entry)
  if (stray.length > 0) {
    fail(
      `these files under supabase/migrations/ are not named <version>_<name>.sql: ${stray.join(", ")}. ` +
        "A version this script cannot read cannot be ordered against the ledger.",
    )
  }
  files.sort((a, b) => (a.version < b.version ? -1 : a.version > b.version ? 1 : 0))
  for (let index = 1; index < files.length; index += 1) {
    if (files[index].version === files[index - 1].version) {
      fail(`two migration files declare version ${files[index].version}; the ledger's primary key cannot hold both`)
    }
  }
  return files
}

async function runSql(sql, { timeoutMs = 180_000 } = {}) {
  const url = `https://api.supabase.com/v1/projects/${projectRef}/database/query`
  let response
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    fail(`POST ${url} did not complete: ${error?.message ?? error}`)
  }
  const text = await response.text()
  if (!response.ok) {
    const detail = redact(text).slice(0, 800)
    fail(`POST ${url} -> HTTP ${response.status}: ${detail}`)
  }
  try {
    return JSON.parse(text)
  } catch {
    fail(`POST ${url} returned a non-JSON body: ${redact(text).slice(0, 200)}`)
  }
  return undefined
}

async function main() {
  const files = await listMigrationFiles()

  const ledger = await runSql("select version, name from supabase_migrations.schema_migrations")
  if (!Array.isArray(ledger)) {
    fail(`reading supabase_migrations.schema_migrations from ${projectRef} did not return rows; nothing was applied.`)
  }

  const pending = pendingMigrations(files, ledger)

  log(`Target project : ${projectRef}  (ref derived from NEXT_PUBLIC_SUPABASE_URL: ${derivedRef})`)
  log(`Migrations dir : supabase/migrations/  (${files.length} file(s))`)
  log(`Ledger rows    : ${ledger.length}`)
  log("")

  if (pending.length === 0) {
    log("No pending migrations. Nothing to apply.")
    return
  }

  log(`${pending.length} pending migration(s):`)
  for (const file of pending) log(`  ${file.version}  ${file.name}`)
  log("")

  if (dryRun) {
    for (const file of pending) {
      const sql = await readFile(path.join(MIGRATIONS_DIR, `${file.version}_${file.name}.sql`), "utf8")
      log(`--dry-run: would apply ${file.version}_${file.name}.sql (${sql.length} bytes), then record`)
      log(`  version='${file.version}' name='${file.name}' into supabase_migrations.schema_migrations`)
    }
    log("")
    log("--dry-run complete. No request was sent and no row was written.")
    return
  }

  const appliedNow = []
  for (const file of pending) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, `${file.version}_${file.name}.sql`), "utf8")
    log(`Applying ${file.version}_${file.name}.sql …`)

    // The DDL goes first and alone. If it fails, nothing about this version has
    // changed and the run stops before the ledger claims it did — which is the
    // entire reason the ledger write is a separate statement.
    await runSql(sql)

    await runSql(ledgerInsertSql(file, sql))
    appliedNow.push(file.version)
    log(`  applied ${file.version}  ${file.name}  (ledger recorded)`)
  }

  // Verify by re-reading — a 2xx on the INSERT is not proof it landed.
  const after = await runSql(
    "select version, name from supabase_migrations.schema_migrations where version in (" +
      pending.map((file) => quoteLiteral(file.version)).join(", ") +
      ") order by version",
  )

  const failures = []
  for (const file of pending) {
    const row = (after ?? []).find((candidate) => candidate.version === file.version)
    if (!row) {
      failures.push(`${file.version} is missing from the ledger after the run`)
    } else if (!row.name) {
      failures.push(`${file.version} is in the ledger with a NULL name`)
    } else if (row.name !== file.name) {
      failures.push(`${file.version} is in the ledger as "${row.name}", expected "${file.name}"`)
    }
  }

  log("")
  if (failures.length > 0) {
    console.error(`${failures.length} ledger row(s) are wrong:`)
    for (const line of failures) console.error(redact(`  - ${line}`))
    process.exit(1)
  }

  log(`Applied and recorded ${appliedNow.length} migration(s): ${appliedNow.join(", ")}`)
  log(`Ledger now holds ${ledger.length + appliedNow.length} row(s), each with a populated name.`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}