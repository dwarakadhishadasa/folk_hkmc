#!/usr/bin/env node
/**
 * seed-local-fixtures.mjs — `pnpm seed:local`.
 *
 * `scripts/seed-preview-fixtures.mjs` resolves its target from
 * `.env.migration.local`, which holds the **hosted** URL, and it refuses any
 * non-loopback target. So running it directly cannot reach local Postgres.
 *
 * The redirect is an export, not a code change: `process.loadEnvFile` does not
 * override already-exported variables (verified — see
 * `_bmad-output/specs/spec-playwright-test-foundation/branch-and-schema-baseline.md:84-88`).
 * This wrapper therefore:
 *
 *   1. reads `supabase status -o env` (the same source `use-local-supabase-env.sh`
 *      uses, pinned to the same CLI version),
 *   2. strips the surrounding quotes the CLI emits,
 *   3. exports `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL` = `API_URL` and
 *      `SUPABASE_SERVICE_ROLE_KEY` = `SERVICE_ROLE_KEY`,
 *   4. spawns the seeder with that environment and `stdio: "inherit"`.
 *
 * Argv is forwarded verbatim, so `--wipe` and `--allow-non-local` work here too.
 * Credential values are never printed.
 *
 * Usage:
 *   pnpm seed:local
 *   pnpm seed:local --wipe
 */

import { spawn, spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseSupabaseStatusEnv } from "./local-supabase-target.mjs"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const SEEDER = path.join(repoRoot, "scripts", "seed-preview-fixtures.mjs")
const SEED_FILE = path.join(repoRoot, ".env.preview-seed.local")

// Pinned to the same version `scripts/use-local-supabase-env.sh` and the
// `supabase:*` package scripts use, so a credential shape can never differ
// between the two paths into the local stack.
const STATUS_COMMAND = ["dlx", "supabase@2.98.2", "status", "-o", "env"]

// `pnpm dlx` resolves a package before answering; on a cold cache that can
// exceed the default spawnSync budget. A hang here would look like a hung
// readiness check, so bound it.
const STATUS_TIMEOUT_MS = 120000

/**
 * The fixture-password default, as a decision rather than an inline `if`.
 *
 * The seeder's own precedence is env → `.env.preview-seed.local` → generate.
 * Exporting a literal default *unconditionally* would override it and silently
 * repoint the password of auth users that already exist: the run would still
 * print `Total created: 0` and pass DW-3 while every seeded sign-in broke.
 *
 * So the default is supplied only when there is nothing for the seeder to read.
 * Returns the password to export, or `null` to leave the env untouched.
 */
export function resolveFixturePasswordDefault({ envPassword, seedFileExists }) {
  if (envPassword) return null
  if (seedFileExists) return null
  return "LocalDevFixture123!"
}

function fail(message) {
  console.error(`ERROR ${message}`)
  process.exit(1)
}

/**
 * A `spawnSync` that was killed by `timeout` reports `status === null` and
 * `signal` set. Printing that as "exited null" would be a lie.
 */
function describeExit(result) {
  if (result.error) return result.error.message
  if (result.status === null) return `timed out after ${STATUS_TIMEOUT_MS}ms${result.signal ? ` (signal ${result.signal})` : ""}`
  return `exit ${result.status}`
}

function main() {
  const status = spawnSync("pnpm", STATUS_COMMAND, { cwd: repoRoot, encoding: "utf8", timeout: STATUS_TIMEOUT_MS })
  if (status.error || status.status !== 0) {
    fail(
      [
        "Could not read local Supabase credentials from `supabase status -o env`.",
        "Is the local stack running? Start it with `pnpm supabase:start`.",
        `Underlying result: ${describeExit(status)}.`,
      ].join("\n"),
    )
  }

  const credentials = parseSupabaseStatusEnv(status.stdout)
  const apiUrl = credentials.API_URL
  const serviceRoleKey = credentials.SERVICE_ROLE_KEY

  if (!apiUrl || !serviceRoleKey) {
    fail(
      [
        "Local Supabase status did not report both API_URL and SERVICE_ROLE_KEY.",
        "Start the stack with `pnpm supabase:start`, then retry.",
        `Got: API_URL=${apiUrl ? "<set>" : "<missing>"}, SERVICE_ROLE_KEY=${serviceRoleKey ? "<set>" : "<missing>"}`,
      ].join("\n"),
    )
  }

  const childEnv = {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: apiUrl,
    SUPABASE_URL: apiUrl,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  }

  const passwordDefault = resolveFixturePasswordDefault({
    envPassword: process.env.PREVIEW_FIXTURE_PASSWORD,
    seedFileExists: existsSync(SEED_FILE),
  })
  if (passwordDefault) childEnv.PREVIEW_FIXTURE_PASSWORD = passwordDefault

  console.log(`Seeding local Supabase at ${apiUrl} (credentials not printed).`)
  if (passwordDefault) {
    console.log(`No PREVIEW_FIXTURE_PASSWORD and no ${path.relative(repoRoot, SEED_FILE)}: using the local-only default password.`)
  }

  const child = spawn(process.execPath, [SEEDER, ...process.argv.slice(2)], {
    cwd: repoRoot,
    env: childEnv,
    stdio: "inherit",
  })

  child.on("error", (error) => fail(`Could not run the seeder: ${error.message}`))
  child.on("exit", (code, signal) => {
    if (signal) {
      console.error(`ERROR the seeder was terminated by signal ${signal}.`)
      process.exit(1)
    }
    process.exit(code ?? 1)
  })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
