/**
 * The single place that knows who the seeded fixture staff are.
 *
 * Every other file in `e2e/` imports a role *key* from here rather than
 * hard-coding an address, so renaming a seeded fixture is a one-file change.
 *
 * Fixture emails carry a program subdomain -- `kavitha.raman@folk.fixture.test`,
 * not `@gita-life.fixture.test` -- because `scripts/seed-preview-fixtures.mjs`
 * seeds one staff set per program and `public.users` is keyed on
 * `(program_id, email)`.
 *
 * `.test` is RFC 2606's reserved TLD, so a seeded row's password reset can never
 * be delivered to a real inbox. That mattered more once the addresses stopped
 * being obviously fake: `preview-fixture-admin-folk@example.com` was never
 * mistakable for a real account, a plausible-looking one is.
 *
 * The addresses live in `scripts/fixture-reference-data.mjs`, shared with the
 * seeder that writes them. This module is the harness's own copy of the mapping
 * rather than an import, so a spec and the seeder cannot agree with each other
 * while disagreeing with the database. Every address is still overridable with an
 * `E2E_<ROLE>_EMAIL` environment variable for a stack seeded differently.
 */

import path from "node:path"

/** Role keys the harness signs in as. Mirrors `lib/authz`'s `StaffRole`. */
export type E2ERole = "admin" | "preacher" | "volunteer" | "assistant"

/** The roles that need a `storageState` file, in setup order. */
export const E2E_ROLES: readonly E2ERole[] = ["admin", "preacher", "volunteer", "assistant"] as const

/** Staff role name as stored in `public.users.role`. */
const STAFF_ROLE: Record<E2ERole, string> = {
  admin: "Admin",
  preacher: "Preacher",
  volunteer: "Volunteer",
  assistant: "Assistant",
}

/**
 * Mirrors `landingPathForRole` in `apps/folk/app/login/login-page-client.tsx`:
 * Admin and Preacher land on `/`, Volunteer and Assistant on `/contact`.
 */
const LANDING_PATH: Record<E2ERole, string> = {
  admin: "/",
  preacher: "/",
  volunteer: "/contact",
  assistant: "/contact",
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

/**
 * The seeded sign-in address per role and program.
 *
 * Duplicated from `scripts/fixture-reference-data.mjs` on purpose — see the header.
 * A mismatch between this table and the seeder's is a sign-in failure at setup
 * time, which is a loud and immediately diagnosable failure, and that is the
 * trade this is making over importing one side.
 */
const FIXTURE_EMAILS: Readonly<Record<string, Readonly<Record<E2ERole, string>>>> = {
  folk: {
    admin: "kavitha.raman@folk.fixture.test",
    preacher: "anand.narayanan@folk.fixture.test",
    volunteer: "divya.parthasarathy@folk.fixture.test",
    assistant: "suresh.kannan@folk.fixture.test",
  },
  "gita-life": {
    admin: "kavitha.raman@gita-life.fixture.test",
    preacher: "anand.narayanan@gita-life.fixture.test",
    volunteer: "divya.parthasarathy@gita-life.fixture.test",
    assistant: "suresh.kannan@gita-life.fixture.test",
  },
}

/** Seeded auth address for a role, unless `E2E_<ROLE>_EMAIL` overrides it. */
export function fixtureEmail(role: E2ERole): string {
  const override = process.env[`E2E_${role.toUpperCase()}_EMAIL`]
  if (override) {
    return override.trim().toLowerCase()
  }

  const program = FIXTURE_EMAILS[e2eProgramId()]
  if (!program) {
    throw new Error(
      `No fixture emails for program "${e2eProgramId()}". Add it to FIXTURE_EMAILS, ` +
        `or set E2E_${role.toUpperCase()}_EMAIL.`,
    )
  }

  return program[role]
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
