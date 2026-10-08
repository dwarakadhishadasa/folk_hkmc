/**
 * The single place that knows who the seeded fixture staff are.
 *
 * Every other file in `e2e/` imports a role *key* from here rather than
 * hard-coding an address, so renaming a seeded fixture is a one-file change.
 *
 * Fixture emails carry a program suffix -- `preview-fixture-admin-folk@…`, not
 * `preview-fixture-admin@…` -- because `scripts/seed-preview-fixtures.mjs` seeds
 * one staff set per program. Every address is overridable with an
 * `E2E_<ROLE>_EMAIL` environment variable for a stack that was seeded
 * differently.
 */

import path from "node:path"

/** Role keys the harness signs in as. Mirrors `lib/authz`'s `StaffRole`. */
export type E2ERole = "admin" | "preacher" | "volunteer"

/** The roles that need a `storageState` file, in setup order. */
export const E2E_ROLES: readonly E2ERole[] = ["admin", "preacher", "volunteer"] as const

/** Staff role name as stored in `public.users.role`. */
const STAFF_ROLE: Record<E2ERole, string> = {
  admin: "Admin",
  preacher: "Preacher",
  volunteer: "Volunteer",
}

/**
 * Mirrors `landingPathForRole` in `apps/folk/app/login/login-page-client.tsx`:
 * Admin and Preacher land on `/`, Volunteer and Assistant on `/contact`.
 */
const LANDING_PATH: Record<E2ERole, string> = {
  admin: "/",
  preacher: "/",
  volunteer: "/contact",
}

/** Program whose fixtures are exercised; the folk app is `PROGRAM_ID=folk`. */
export function e2eProgramId(): string {
  return process.env.E2E_PROGRAM_ID ?? "folk"
}

/** Repo root, resolved from this file so no cwd assumptions leak in. */
export const repoRoot = path.resolve(__dirname, "..", "..")

/** Directory holding live session tokens. Gitignored; see the root `.gitignore`. */
export const authStateDir = path.join(repoRoot, "e2e", ".auth")

/** Path of the per-role `storageState` file written by the setup projects. */
export function storageStatePath(role: E2ERole): string {
  const override = process.env[`E2E_${role.toUpperCase()}_STORAGE_STATE`]
  if (override) {
    return path.isAbsolute(override) ? override : path.join(repoRoot, override)
  }

  return path.join(authStateDir, `${role}.json`)
}

/** Seeded auth address for a role, unless `E2E_<ROLE>_EMAIL` overrides it. */
export function fixtureEmail(role: E2ERole): string {
  const override = process.env[`E2E_${role.toUpperCase()}_EMAIL`]
  if (override) {
    return override.trim().toLowerCase()
  }

  return `preview-fixture-${role}-${e2eProgramId()}@example.com`
}

/** Where `authenticateAsRole` expects the browser to land after the OTP. */
export function landingPathForRole(role: E2ERole): string {
  return LANDING_PATH[role]
}

/** The `public.users.role` value a live session for `role` must report. */
export function staffRoleName(role: E2ERole): string {
  return STAFF_ROLE[role]
}

/**
 * An address that is deliberately *not* a seeded staff account. Used to prove
 * `shouldCreateUser: false` -- a failed sign-in must not provision anything.
 */
export function unknownEmail(): string {
  return process.env.E2E_UNKNOWN_EMAIL ?? `preview-e2e-not-a-staff-${e2eProgramId()}@example.com`
}

/**
 * `GET /api/manage/contacts/photo` runs auth (and the role gate) *before* the
 * contact lookup, so any UUID works — the 401 and 403 rows need no seeded row.
 * The route is read-only for a dead session and a Volunteer: both are rejected
 * before `createSignedUrl` is reached. An Admin, however, does reach
 * `createManageContactPhotoUrl` and gets a signed URL back, so this is the probe
 * for *rejected* sessions, not a no-op to call casually.
 */
export function managePhotoProbeUrl(): string {
  return `/api/manage/contacts/photo?contactId=00000000-0000-4000-8000-000000000000`
}

/** Repo-relative form of an absolute path, for messages and `git check-ignore`. */
export function relativeToRepo(absolutePath: string): string {
  return path.relative(repoRoot, absolutePath) || absolutePath
}
