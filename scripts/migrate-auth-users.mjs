#!/usr/bin/env node
/**
 * migrate-auth-users.mjs — story 7.9: move `auth.users` + `auth.identities`
 * from the old project to the new one, preserving UUIDs.
 *
 * Direct Postgres does not connect from this environment, so `pg_dump` /
 * `pg_restore` of the auth schema — what the playbook's original step 25
 * assumed — is not available. The Management API's
 * `POST /v1/projects/{ref}/database/query` endpoint is the channel that does
 * work, and a row-preserving copy through it is equivalent for this purpose: a
 * SELECT on the source produces exactly the columns, and an INSERT on the target
 * re-creates them under the same `id`.
 *
 * Why ids must be preserved rather than re-created: `public.users.id` is an FK
 * to `auth.users(id)`, `audit_events.actor_supabase_user_id` references it, and
 * attendance links and session cookies name it. A re-created user with a new id
 * silently orphans all of them. So email is the join key and `id` is copied.
 *
 * The target holds four *development* auth users for real staff emails, created
 * ad hoc during migration development, whose ids disagree with the source. They
 * are reported row by row and deleted ONLY under `--reconcile-target-users`
 * (cascading their `auth.identities`, their `auth.sessions` and their ad-hoc
 * `public.users` rows); without the flag this script exits non-zero and deletes
 * nothing. The `preview-fixture-*` accounts match no source email and are never
 * touched.
 *
 * Order matters inside a run, and two constraints pull in opposite directions.
 * `users_email_partial_key` is a UNIQUE index on `auth.users(email)`, so the
 * source row cannot be inserted while the development row still holds that
 * email — the DELETE has to come first. But a column with `ON DELETE NO
 * ACTION` at `auth.users` (the target's `invite_log.inviter_supabase_user_id`
 * is one) blocks the DELETE while it points at the development id, and
 * repointing it at the source id cannot satisfy its own foreign key until that
 * id is a row. Deleting first and repointing afterwards is the only order that
 * satisfies both, so the repoints are queued during the delete and applied once
 * the source ids exist. `auth.identities` goes last of all, because GoTrue's
 * `identities_provider_id_provider_unique` would collide with a development
 * identity that is still there.
 *
 * Neither project has the GoTrue `handle_new_user` trigger, so inserting
 * `auth.users` does NOT auto-create `auth.identities` — this script inserts the
 * identities explicitly, with `identity_data.sub` equal to the user id (which is
 * what `provider_id` already is).
 *
 * No password hash is ever printed or sent to the client: verification compares
 * `sha256(encrypted_password)` computed in the database on each side.
 *
 * Usage:
 *   node scripts/migrate-auth-users.mjs --dry-run
 *   node scripts/migrate-auth-users.mjs --reconcile-target-users
 *
 * Options:
 *   --dry-run                 Report the plan, write nothing on either project.
 *   --reconcile-target-users  Permit deletion of target auth users whose email
 *                             matches a source user but whose id disagrees.
 */

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
  "OLD_SUPABASE_SERVICE_ROLE_KEY",
  "OLD_POSTGRES_PASSWORD",
  "POSTGRES_PASSWORD",
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
// Pure helpers — imported by migrate-auth-users.test.mjs, so they must stay free
// of I/O and of any dependency on the module having been run as the entry point.
// ---------------------------------------------------------------------------

/**
 * The columns both projects actually declare for a table, minus the generated
 * ones.
 *
 * Computed at runtime rather than hard-coded: `auth.users` is owned by GoTrue,
 * not by this repo, so the two projects can and do drift when one is upgraded
 * before the other. A hard-coded list would either fail on a column the target
 * gained or silently skip one the source has.
 *
 * `is_generated = 'ALWAYS'` is excluded rather than copied. Postgres rejects an
 * explicit value for such a column (`428C9 cannot insert a non-DEFAULT value`),
 * and nothing is lost: `auth.users.confirmed_at` is
 * `LEAST(email_confirmed_at, phone_confirmed_at)` and `auth.identities.email`
 * is `lower(identity_data ->> 'email')`, both derived from columns that ARE
 * copied.
 */
export function sharedColumns(sourceColumns, targetColumns) {
  const targetNames = new Set(
    targetColumns.filter((column) => column.is_generated !== "ALWAYS").map((column) => column.column_name),
  )
  return sourceColumns
    .filter((column) => column.is_generated !== "ALWAYS" && targetNames.has(column.column_name))
    .map((column) => column.column_name)
    .sort()
}

/**
 * Target `NOT NULL` columns with no default that the caller must supply. Each
 * one must be in the copied set or the INSERT would fail — reported here instead
 * of as a mid-batch 23502. Generated columns are skipped: they are unwritable by
 * definition, so their absence is not a problem to report.
 */
export function requiredTargetColumns(targetColumns) {
  return targetColumns
    .filter(
      (column) =>
        column.is_nullable === "NO" && !column.column_default && column.is_generated !== "ALWAYS",
    )
    .map((column) => column.column_name)
    .sort()
}

export function normalizeEmail(value) {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null
}

/**
 * Partition the source users against the target's, by email.
 *
 * - `alreadyMigrated`: the target holds that email under the same id.
 * - `conflicts`: the target holds that email under a DIFFERENT id.
 * - `fresh`: the target holds no row for that email.
 *
 * A target row with no email (the phone-only development account) belongs to
 * none of these: it can never be matched, so it is never a conflict.
 */
export function reconcileByEmail(sourceUsers, targetUsers) {
  const targetByEmail = new Map()
  for (const user of targetUsers) {
    const email = normalizeEmail(user.email)
    if (email && !targetByEmail.has(email)) targetByEmail.set(email, user)
  }
  const alreadyMigrated = []
  const conflicts = []
  const fresh = []
  for (const user of sourceUsers) {
    const email = normalizeEmail(user.email)
    const target = email ? targetByEmail.get(email) : undefined
    if (!target) {
      fresh.push(user)
    } else if (target.id === user.id) {
      alreadyMigrated.push(user)
    } else {
      conflicts.push({ source: user, target })
    }
  }
  return { alreadyMigrated, conflicts, fresh }
}

/** A single-quoted Postgres literal. `standard_conforming_strings` is on. */
export function quoteLiteral(value) {
  if (value === null || value === undefined) return "null"
  return `'${String(value).replaceAll("'", "''")}'`
}

/** A single-quoted Postgres literal for a jsonb column. */
export function quoteJson(value) {
  if (value === null || value === undefined) return "null"
  return `'${JSON.stringify(value ?? null).replaceAll("'", "''")}'::jsonb`
}

export function columnIndex(columns) {
  return new Map(columns.map((column) => [column.column_name, column]))
}

function literalFor(dataType, value) {
  if (value === null || value === undefined) return "null"
  if (dataType === "jsonb" || dataType === "json") return quoteJson(value)
  if (dataType === "boolean") return value === true || value === "true" ? "true" : "false"
  // uuid / text / bigint / integer / date / timestamptz all arrive as strings
  // from the Management API's JSON, which is lossless for these types.
  return quoteLiteral(value)
}

/**
 * A multi-row INSERT for one table, keyed on `conflictColumn`, carrying the
 * shared columns only. `on conflict (…) do nothing` is what makes a re-run a
 * no-op rather than a duplicate-key error.
 */
export function buildInsert(table, rows, targetColumns, conflictColumn) {
  if (rows.length === 0) return null
  const meta = columnIndex(targetColumns)
  const names = Object.keys(rows[0]).filter((name) => meta.has(name))
  if (names.length === 0) return null
  const tuples = rows
    .map((row) => `(${names.map((name) => literalFor(meta.get(name).data_type, row[name])).join(", ")})`)
    .join(", ")
  return (
    `insert into ${table} (${names.join(", ")}) values ${tuples} ` +
    `on conflict (${conflictColumn}) do nothing`
  )
}

/** Split into fixed-size batches so one statement never grows unbounded. */
export function batch(items, size) {
  const out = []
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size))
  }
  return out
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2)
const dryRun = argv.includes("--dry-run")
const reconcile = argv.includes("--reconcile-target-users")

/**
 * A parked email address for a development row while its real email is taken
 * over by the source row. RFC 2606 reserves `.invalid`, so it cannot collide
 * with a real address and cannot receive mail. The row is deleted in the same
 * transaction, so nothing is left holding it.
 */
export const PLACEHOLDER_EMAIL = "replaced-by-migration@auth.invalid"

function requireEnv(name, purpose) {
  const value = process.env[name]?.trim()
  if (!value) fail(`${name} is not set (needed to ${purpose}). Set it in .env.migration.local or the environment.`)
  return value
}

const ACCESS_TOKEN = requireEnv("SUPABASE_ACCESS_TOKEN", "call the Supabase Management API")

function refOf(url) {
  try {
    return new URL(url).hostname.split(".")[0]
  } catch {
    fail(`not a parseable project URL: ${url}`)
  }
  return ""
}

const TARGET_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL", "reach the new project")
const SOURCE_URL = requireEnv("OLD_SUPABASE_URL", "reach the old project")
const targetRef = refOf(TARGET_URL)
const sourceRef = refOf(SOURCE_URL)
const TARGET_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY", "probe the new project's PostgREST/GoTrue")
const SOURCE_KEY = requireEnv("OLD_SUPABASE_SERVICE_ROLE_KEY", "probe the old project's PostgREST/GoTrue")

if (targetRef === sourceRef) {
  fail(
    "the old and new project refs are identical; there is nothing to migrate, and a later step would " +
      "delete live rows it believes are development rows",
  )
}

// ---------------------------------------------------------------------------
// Project access
// ---------------------------------------------------------------------------

/**
 * An undici `fetch failed` names only the socket layer, so the useful half of
 * the diagnosis — which host, and why — is on `error.cause`.
 */
function describeNetworkError(error) {
  const cause = error?.cause
  const code = cause?.code ? ` (${cause.code})` : ""
  const address = cause?.address ? ` to ${cause.address}` : ""
  return `${error?.message ?? error}${code}${address}`
}

/**
 * `fetch` with a bounded retry, so one dropped connection does not abandon a
 * migration that is otherwise progressing. Only transport failures retry: a 4xx
 * or 5xx is a real answer and is returned to the caller as-is, because retrying
 * an auth rejection just delays the same error.
 */
async function fetchWithRetry(url, init, timeoutMs, attempts = 3) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
    } catch (error) {
      lastError = error
      if (attempt < attempts) {
        log(`  retrying ${url} (${attempt}/${attempts}): ${describeNetworkError(error)}`)
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))
      }
    }
  }
  throw lastError
}

async function apiFetch(ref, sql) {
  const url = `https://api.supabase.com/v1/projects/${ref}/database/query`
  let response
  try {
    response = await fetchWithRetry(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    }, 120_000)
  } catch (error) {
    fail(`POST ${url} did not complete: ${describeNetworkError(error)}. Nothing was written.`)
  }
  const text = await response.text()
  if (!response.ok) {
    fail(`POST ${url} -> HTTP ${response.status}: ${redact(text).slice(0, 600)}. Nothing was written.`)
  }
  try {
    return JSON.parse(text)
  } catch {
    fail(`POST ${url} returned a non-JSON body: ${redact(text).slice(0, 200)}. Nothing was written.`)
  }
  return []
}

async function count(ref, sql) {
  const rows = await apiFetch(ref, sql)
  const value = Array.isArray(rows) ? Number(rows[0]?.c ?? 0) : 0
  return Number.isFinite(value) ? value : 0
}

/**
 * Probe before any read or write, so an unreachable archive fails in one clear
 * sentence instead of half way through a batch.
 */
async function probe(label, ref, projectUrl, key) {
  const checks = [
    {
      what: "management api",
      url: `https://api.supabase.com/v1/projects/${ref}`,
      init: { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } },
    },
    {
      what: "postgrest",
      url: `${projectUrl}/rest/v1/`,
      init: { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    },
    {
      what: "gotrue",
      url: `${projectUrl}/auth/v1/settings`,
      init: { headers: { apikey: key } },
    },
  ]

  const problems = []
  for (const check of checks) {
    // A probe that cannot reach its host must be reported, not thrown: an
    // uncaught `fetch failed` would exit non-zero without naming the project,
    // which is the one thing this check exists to do.
    let response
    try {
      response = await fetchWithRetry(check.url, check.init, 30_000)
    } catch (error) {
      problems.push(`${check.what}: ${check.url} did not complete — ${describeNetworkError(error)}`)
      continue
    }
    if (!response.ok) problems.push(`${check.what}: GET ${check.url} -> HTTP ${response.status}`)
  }

  if (problems.length > 0) {
    fail(
      `${label} project ${ref} is not fully reachable:\n  - ${problems.join("\n  - ")}\n` +
        "No migration step ran.",
    )
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

const columnQuery =
  "select column_name, data_type, is_nullable, is_generated, column_default " +
  "from information_schema.columns " +
  "where table_schema = 'auth' and table_name = '%s' order by column_name"

// `sha256(encrypted_password)` is computed in the database so the bcrypt hash
// itself never crosses the wire or enters this process.
const userSummaryQuery =
  "select id, email, " +
  "encode(digest(coalesce(encrypted_password, ''), 'sha256'), 'hex') as password_digest, " +
  "encrypted_password = '' as password_is_empty " +
  "from auth.users order by email nulls last"

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  log(`Source (old) project : ${sourceRef}`)
  log(`Target (new) project : ${targetRef}`)
  log("")

  await probe("old", sourceRef, SOURCE_URL, SOURCE_KEY)
  await probe("new", targetRef, TARGET_URL, TARGET_KEY)
  log("Reachability: old and new both answer the Management API, PostgREST and GoTrue.")
  log("")

  // --- schema intersection -------------------------------------------------
  const sourceUserColumns = await apiFetch(sourceRef, columnQuery.replace("%s", "users"))
  const targetUserColumns = await apiFetch(targetRef, columnQuery.replace("%s", "users"))
  const sourceIdentityColumns = await apiFetch(sourceRef, columnQuery.replace("%s", "identities"))
  const targetIdentityColumns = await apiFetch(targetRef, columnQuery.replace("%s", "identities"))

  const userColumns = sharedColumns(sourceUserColumns, targetUserColumns)
  const identityColumns = sharedColumns(sourceIdentityColumns, targetIdentityColumns)
  const missingRequired = requiredTargetColumns(targetUserColumns).filter((name) => !userColumns.includes(name))
  if (missingRequired.length > 0) {
    fail(
      `the new project's auth.users declares ${missingRequired.join(", ")} as NOT NULL with no default, ` +
        "and the old project has no such column, so those rows cannot be written. Nothing was written.",
    )
  }
  log(
    `auth.users     : copying ${userColumns.length} shared column(s); ` +
      `source-only ${sourceUserColumns.length - userColumns.length}, ` +
      `target-only ${targetUserColumns.length - userColumns.length}`,
  )
  log(`auth.identities: copying ${identityColumns.length} shared column(s)`)
  log("")

  // --- read both sides -----------------------------------------------------
  const sourceUsers = await apiFetch(sourceRef, userSummaryQuery)
  const targetUsers = await apiFetch(targetRef, userSummaryQuery)
  if (!Array.isArray(sourceUsers) || !Array.isArray(targetUsers)) {
    fail("reading auth.users did not return rows on both projects; nothing was written.")
  }

  const sourceUserRows = await apiFetch(sourceRef, `select ${userColumns.join(", ")} from auth.users order by email nulls last`)
  const sourceIdentityRows = await apiFetch(
    sourceRef,
    `select ${identityColumns.join(", ")} from auth.identities order by created_at nulls last`,
  )
  const sourceIdentities = await apiFetch(
    sourceRef,
    "select id, user_id, provider from auth.identities order by created_at nulls last",
  )

  const { alreadyMigrated, conflicts, fresh } = reconcileByEmail(sourceUsers, targetUsers)
  const sourceEmails = new Set(sourceUsers.map((user) => normalizeEmail(user.email)).filter(Boolean))
  const fixtureEmails = targetUsers
    .map((user) => normalizeEmail(user.email))
    .filter((email) => email && !sourceEmails.has(email))

  log(`Source auth.users : ${sourceUsers.length}`)
  log(`Target auth.users : ${targetUsers.length} (${targetUsers.length - targetUsers.filter((u) => normalizeEmail(u.email)).length} with no email)`)
  log("")
  log(`Already migrated (same email, same id) : ${alreadyMigrated.length}`)
  log(`Not yet in the target                  : ${fresh.length}`)
  log(`Target email conflicts (different id)  : ${conflicts.length}`)
  log("")

  for (const { source, target } of conflicts) {
    log(`  CONFLICT ${source.email}`)
    log(`    source id ${source.id}`)
    log(`    target id ${target.id}  (development row; --reconcile-target-users would delete it and cascade its identities, sessions and public.users rows)`)
  }
  if (conflicts.length > 0) log("")

  log(`Target auth users matching no source email (left untouched): ${fixtureEmails.length}`)
  for (const email of fixtureEmails) log(`  ${email}`)
  log("")

  const identityUserIds = new Set(sourceIdentities.map((identity) => identity.user_id))
  const withoutIdentity = sourceUsers.filter((user) => !identityUserIds.has(user.id))
  const nonEmailIdentities = sourceIdentities.filter((identity) => identity.provider !== "email")
  log(
    `Source users with no auth.identities row: ${withoutIdentity.length}` +
      `${withoutIdentity.length > 0 ? ` (${withoutIdentity.map((user) => user.email ?? "(no email)").join(", ")})` : ""}`,
  )
  log(`Source identities with a non-email provider: ${nonEmailIdentities.length}`)
  log("")

  if (dryRun) {
    log("--dry-run: only SELECTs were sent; neither project was written to.")
    if (conflicts.length > 0) {
      log("")
      log(`A real run would refuse to continue with ${conflicts.length} conflict(s). Re-run with --reconcile-target-users to delete them.`)
    } else {
      log("")
      log("No conflicts. A real run would insert the missing rows and re-assert every id and password digest.")
    }
    return
  }

  if (conflicts.length > 0 && !reconcile) {
    console.error(`${conflicts.length} target auth user(s) hold a source email under a different id:`)
    for (const { source, target } of conflicts) {
      console.error(redact(`  - ${source.email}: target ${target.id} would have to become ${source.id}`))
    }
    console.error("")
    console.error("Nothing was deleted. Re-run with --reconcile-target-users to remove those development rows.")
    process.exit(1)
  }

  // The order below is forced by two constraints that point in opposite
  // directions, so each conflict is resolved in one transaction that satisfies
  // both at once.
  //
  //   * `users_email_partial_key` is a UNIQUE index on `auth.users(email)`. The
  //     source row cannot be inserted while the development row still holds
  //     that email.
  //   * The child columns that reference `auth.users` (`invite_log
  //     .inviter_supabase_user_id`, `audit_events.actor_supabase_user_id`,
  //     `auth.scim_users.user_id`) are `ON DELETE SET NULL`. Deleting the
  //     development row before repointing them would silently erase the link,
  //     and repointing them before the source id exists would fail their own
  //     foreign key.
  //
  // So, per conflict, inside one `begin … commit`:
  //
  //   1. move the development row's email onto an un-colliding placeholder,
  //      which frees the real email without deleting anything yet;
  //   2. insert the source row, so the source id exists and is a valid target;
  //   3. repoint every child column from the development id to the source id,
  //      so the links survive;
  //   4. delete the development row, which now cascades only its own
  //      identities, sessions and `public.users` rows.
  //
  // If any step fails the whole transaction rolls back, so a partial run cannot
  // leave a half-reconciled user behind.

  // --- 1. reconcile each conflicting development user ----------------------
  if (conflicts.length > 0) {
    log("")
    log(`Reconciling ${conflicts.length} conflicting development auth user(s) on ${targetRef} …`)

    // Child columns at `auth.users` are discovered from the catalog rather than
    // hard-coded, because a table this script has never heard of must not turn a
    // documented run into a silently lost reference. `ON DELETE CASCADE` is
    // excluded: those rows are meant to disappear with the user, not be moved.
    const setNullColumns = await apiFetch(
      targetRef,
      "select c.conrelid::regclass::text as child, a.attname as col " +
        "from pg_constraint c " +
        "join unnest(c.conkey) with ordinality as k(attnum, ord) on true " +
        "join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum " +
        "where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and c.confdeltype = 'n' " +
        "order by child, col",
    )
    log(
      `  ON DELETE SET NULL columns pointing at auth.users: ${setNullColumns.length} ` +
        `(${setNullColumns.map((row) => `${row.child}.${row.col}`).join(", ") || "none"})`,
    )

    for (const { source, target } of conflicts) {
      const before = {
        identities: await count(targetRef, `select count(*)::int as c from auth.identities where user_id = ${quoteLiteral(target.id)}`),
        sessions: await count(targetRef, `select count(*)::int as c from auth.sessions where user_id = ${quoteLiteral(target.id)}`),
        publicUsers: await count(targetRef, `select count(*)::int as c from public.users where id = ${quoteLiteral(target.id)}`),
      }
      const referenced = []
      for (const row of setNullColumns) {
        const n = await count(
          targetRef,
          `select count(*)::int as c from ${row.child} where ${row.col} = ${quoteLiteral(target.id)}`,
        )
        if (n > 0) referenced.push({ ...row, rows: n })
      }

      const sourceRow = sourceUserRows.find((row) => row.id === source.id)
      if (!sourceRow) {
        fail(`source auth.users row ${source.id} (${source.email}) was not in the copied column set`)
      }

      const statements = [
        "begin",
        // `.invalid` is reserved by RFC 2606, so the placeholder can never
        // collide with a real address and can never receive mail.
        `update auth.users set email = ${quoteLiteral(PLACEHOLDER_EMAIL)} where id = ${quoteLiteral(target.id)}`,
        buildInsert("auth.users", [sourceRow], targetUserColumns, "id"),
        // Repoint before the delete: after it, the SET NULL action has already
        // replaced the development id with NULL and the link is gone.
        ...referenced.map(
          (row) =>
            `update ${row.child} set ${row.col} = ${quoteLiteral(source.id)} where ${row.col} = ${quoteLiteral(target.id)}`,
        ),
        `delete from auth.users where id = ${quoteLiteral(target.id)}`,
        "commit",
      ]

      await apiFetch(targetRef, `${statements.join("; ")};`)

      log(
        `  reconciled ${target.email}: ${target.id} → ${source.id}; ` +
          `${referenced.map((row) => `${row.rows} in ${row.child}.${row.col}`).join(", ") || "no references"} repointed; ` +
          `deleted the development row and cascaded ${before.identities} identity row(s), ` +
          `${before.sessions} session row(s), ${before.publicUsers} public.users row(s)`,
      )
    }
  }

  // --- 2. auth.users, for everyone not already reconciled -------------------
  let writtenUsers = 0
  for (const chunk of batch(sourceUserRows, 10)) {
    await apiFetch(targetRef, buildInsert("auth.users", chunk, targetUserColumns, "id"))
    writtenUsers += chunk.length
  }
  log("")
  log(`auth.users     : ${writtenUsers} source row(s) written, ids preserved (a re-run of an existing id is a no-op)`)

  // --- 3. auth.identities last ---------------------------------------------
  // `(provider_id, provider)` is unique, and a still-present development identity
  // for the same email holds the development id there — so this must follow the
  // deletions, not precede them.
  let writtenIdentities = 0
  for (const chunk of batch(sourceIdentityRows, 10)) {
    await apiFetch(targetRef, buildInsert("auth.identities", chunk, targetIdentityColumns, "id"))
    writtenIdentities += chunk.length
  }
  log("")
  log(`auth.identities: ${writtenIdentities} identity row(s) written (identity_data.sub = the user id)`)

  // --- 5. verify ------------------------------------------------------------
  const verifyUsers = await apiFetch(targetRef, userSummaryQuery)
  const verifyIdentities = await apiFetch(
    targetRef,
    "select user_id, provider, email, identity_data->>'sub' as sub from auth.identities",
  )
  const verifyByEmail = new Map()
  for (const user of verifyUsers) {
    const email = normalizeEmail(user.email)
    if (email) verifyByEmail.set(email, user)
  }
  const identityCountByUser = new Map()
  const emailIdentityByUser = new Set()
  for (const identity of verifyIdentities) {
    identityCountByUser.set(identity.user_id, (identityCountByUser.get(identity.user_id) ?? 0) + 1)
    if (identity.provider === "email") emailIdentityByUser.add(identity.user_id)
  }

  const problems = []
  for (const source of sourceUsers) {
    const email = normalizeEmail(source.email)
    if (!email) continue
    const target = verifyByEmail.get(email)
    if (!target) {
      problems.push(`${email}: no auth.users row in the target`)
      continue
    }
    if (target.id !== source.id) {
      problems.push(`${email}: id is ${target.id}, expected the source id ${source.id}`)
    }
    if (target.password_digest !== source.password_digest) {
      problems.push(`${email}: sha256(encrypted_password) differs between the projects`)
    }
    if (source.password_is_empty !== target.password_is_empty) {
      problems.push(`${email}: password presence differs (source empty=${source.password_is_empty}, target empty=${target.password_is_empty})`)
    }
    if (!emailIdentityByUser.has(target.id)) {
      problems.push(`${email}: no email identity in auth.identities`)
    }
    const identityCount = identityCountByUser.get(target.id) ?? 0
    if (identityCount !== 1) {
      problems.push(`${email}: ${identityCount} identity row(s) in the target, expected exactly 1`)
    }
  }
  for (const { target } of conflicts) {
    if (verifyByEmail.get(normalizeEmail(target.email))?.id === target.id) {
      problems.push(`${target.email}: the development id ${target.id} is still the one in the target`)
    }
  }

  log("")
  log(`Verification: ${sourceUsers.length} source email(s) checked for id, password digest and identity count.`)
  if (problems.length > 0) {
    console.error(`${problems.length} check(s) failed:`)
    for (const line of problems) console.error(redact(`  - ${line}`))
    process.exit(1)
  }
  log(
    "Every migrated id equals its source id, every password digest matches, and each migrated user has " +
      "exactly one email identity.",
  )
  log(
    `Target auth.users now holds ${verifyUsers.length} rows: ${sourceUsers.length} migrated ` +
      `+ ${verifyUsers.length - sourceUsers.length} local (fixtures and the phone-only account).`,
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}