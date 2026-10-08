/**
 * Reading `auth.users` through Supabase's admin API, for the one row that has
 * to prove an address was never provisioned.
 *
 * Credentials come from `process.env` first, then the folk app's env file, so
 * the suite can be pointed at a differently-seeded stack without editing a
 * tracked file. Both sources are parsed with `parseSupabaseStatusEnv` — the repo
 * keeps exactly one `KEY=value` parser for this, and a second copy is how the
 * two would drift.
 *
 * The loopback check is the point: on a machine whose env file still points at
 * the hosted project, an unchecked admin query would prove "nothing was
 * provisioned" against the wrong stack and report green. Deliberately loud when
 * the key is absent too — a silently-skipped assertion is a false green.
 */

import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { isLocalSupabaseUrl, parseSupabaseStatusEnv } from "../../scripts/local-supabase-target.mjs"
import { repoRoot } from "./roles"

export const FOLK_ENV_FILE = path.join("apps", "folk", ".env.local")

/**
 * Read a variable from `process.env` first, then the app env file, without
 * pulling in a dotenv dependency. The environment wins so a caller can point the
 * suite at a differently-seeded stack without editing a tracked file.
 */
export function readEnvValue(variable: string): string | null {
  const fromProcess = process.env[variable]?.trim()
  if (fromProcess) {
    return fromProcess
  }

  const full = path.join(repoRoot, FOLK_ENV_FILE)
  if (!existsSync(full)) {
    return null
  }

  const parsed = parseSupabaseStatusEnv(readFileSync(full, "utf8")) as Record<string, string>
  return parsed[variable] ?? null
}

/** Supabase's admin API pages at 200; a single page can hide a match. */
const AUTH_USERS_PER_PAGE = 200
const AUTH_USERS_MAX_PAGES = 50

/** Emails in `auth.users` matching `email`, read through Supabase's admin API. */
export async function listAuthUsersMatching(email: string): Promise<string[]> {
  const serviceRoleKey = readEnvValue("SUPABASE_SERVICE_ROLE_KEY")
  const supabaseUrl = readEnvValue("SUPABASE_URL")

  if (!serviceRoleKey || !supabaseUrl) {
    throw new Error(
      `Cannot prove nothing was provisioned: SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL missing from ${FOLK_ENV_FILE}.`,
    )
  }

  if (!isLocalSupabaseUrl(supabaseUrl)) {
    throw new Error(
      `Refusing to query auth.users at "${supabaseUrl}": it is not a loopback address, so the provisioning ` +
        `assertion would be checking the hosted project instead of the local stack.`,
    )
  }

  const wanted = email.trim().toLowerCase()
  const matches: string[] = []

  for (let page = 1; page <= AUTH_USERS_MAX_PAGES; page += 1) {
    const url = `${supabaseUrl.replace(/\/+$/, "")}/auth/v1/admin/users?page=${page}&per_page=${AUTH_USERS_PER_PAGE}`
    const response = await fetch(url, {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    })

    if (!response.ok) {
      throw new Error(`Supabase admin users list failed: ${response.status} ${response.statusText} (GET ${url})`)
    }

    const body = (await response.json()) as { users?: Array<{ email?: string }> }
    const users = body.users ?? []
    for (const user of users) {
      if (user.email?.trim().toLowerCase() === wanted) {
        matches.push(user.email)
      }
    }

    // GoTrue's `/admin/users` returns no `last_page`; a short page is the only
    // reliable end-of-list signal, so keep paging while pages come back full.
    if (users.length < AUTH_USERS_PER_PAGE) {
      break
    }
  }

  return matches
}