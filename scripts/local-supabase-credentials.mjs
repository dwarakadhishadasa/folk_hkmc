#!/usr/bin/env node
/**
 * local-supabase-credentials.mjs — the one way a script asks the running local
 * stack for its API URL and service-role key.
 *
 * `pnpm seed:local` needs this chain, and so does `scripts/bulk-contact-fixtures.mjs`.
 * Written twice it drifts twice: the wrapper would resolve a credential shape the
 * generator cannot, the `NAME="value"` quote handling would disagree, and the
 * "did the CLI time out?" question would get two different answers — one of them
 * printing `exited null`, which is a lie a `spawnSync` timeout produces.
 *
 * One module, one answer. It is deliberately pure with respect to the *process*:
 * it returns values or throws, and never calls `process.exit`, so a caller can
 * decide how to report the failure and `verify-seed-local-guard.mjs` can assert
 * the failure without killing itself.
 */

import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseSupabaseStatusEnv } from "./local-supabase-target.mjs"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

/**
 * Pinned to the same version `scripts/use-local-supabase-env.sh` and the
 * `supabase:*` package scripts use, so a credential shape can never differ
 * between the paths into the local stack. Exported so a caller asserting the
 * chain does not re-spell the version.
 */
export const STATUS_COMMAND = ["dlx", "supabase@2.98.2", "status", "-o", "env"]

/**
 * `pnpm dlx` resolves a package before answering; on a cold cache that can
 * exceed the default spawnSync budget. A hang here would look like a hung
 * readiness check, so it is bounded.
 */
export const STATUS_TIMEOUT_MS = 120000

/**
 * A `spawnSync` that was killed by `timeout` reports `status === null` and
 * `signal` set. Printing that as "exited null" would be a lie, so the case is
 * named for what it is.
 */
function describeExit(result, timeoutMs) {
  if (result.error) return result.error.message
  if (result.status === null) return `timed out after ${timeoutMs}ms${result.signal ? ` (signal ${result.signal})` : ""}`
  return `exit ${result.status}`
}

/**
 * Reads `supabase status -o env` and returns `{ apiUrl, serviceRoleKey }`.
 *
 * Throws — never exits, never returns a partial value — when the command cannot
 * be run, when it fails, or when it succeeds without reporting both values. Each
 * message names `pnpm supabase:start`, because "there is nothing to connect to"
 * is the fix in every one of those cases and a reader should never have to guess
 * which one they hit.
 */
export function readLocalSupabaseCredentials({ cwd = repoRoot, timeoutMs = STATUS_TIMEOUT_MS } = {}) {
  const status = spawnSync("pnpm", STATUS_COMMAND, { cwd, encoding: "utf8", timeout: timeoutMs })
  if (status.error || status.status !== 0) {
    throw new Error(
      [
        "Could not read local Supabase credentials from `supabase status -o env`.",
        "Is the local stack running? Start it with `pnpm supabase:start`.",
        `Underlying result: ${describeExit(status, timeoutMs)}.`,
      ].join("\n"),
    )
  }

  // Quotes are part of the CLI's output, not part of the value: a leading `"`
  // corrupts both a URL comparison and a bearer header. The repo keeps exactly
  // one `KEY=value` parser for this.
  const credentials = parseSupabaseStatusEnv(status.stdout)
  const apiUrl = credentials.API_URL
  const serviceRoleKey = credentials.SERVICE_ROLE_KEY

  if (!apiUrl || !serviceRoleKey) {
    throw new Error(
      [
        "Local Supabase status did not report both API_URL and SERVICE_ROLE_KEY.",
        "Start the stack with `pnpm supabase:start`, then retry.",
        `Got: API_URL=${apiUrl ? "<set>" : "<missing>"}, SERVICE_ROLE_KEY=${serviceRoleKey ? "<set>" : "<missing>"}`,
      ].join("\n"),
    )
  }

  return { apiUrl, serviceRoleKey }
}
