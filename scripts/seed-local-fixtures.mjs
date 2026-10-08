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
 *      uses, pinned to the same CLI version), via the shared
 *      `scripts/local-supabase-credentials.mjs` helper — one definition, so the
 *      bulk generator cannot drift on the credential chain,
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

import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { readLocalSupabaseCredentials } from "./local-supabase-credentials.mjs"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const SEEDER = path.join(repoRoot, "scripts", "seed-preview-fixtures.mjs")
const SEED_FILE = path.join(repoRoot, ".env.preview-seed.local")

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

function main() {
  // The credential chain itself lives in `local-supabase-credentials.mjs` so the
  // bulk generator resolves it identically. Only the wording of the failure
  // belongs here, and the helper already words it around `pnpm supabase:start`.
  let credentials
  try {
    credentials = readLocalSupabaseCredentials({ cwd: repoRoot })
  } catch (error) {
    fail(error.message)
    return
  }

  const { apiUrl, serviceRoleKey } = credentials

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
