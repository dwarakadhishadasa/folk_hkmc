---
title: 'Authz rework — staff context resolves from Supabase'
type: 'feature'
created: '2026-10-06'
status: 'in-progress'
baseline_revision: 382e880ebc9c90a016b7f79ef9d8b98d46074fc4
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/specs/spec-airtable-to-supabase/SPEC.md'
  - '_bmad-output/specs/spec-airtable-to-supabase/data-model-mapping.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** `lib/authz.ts` resolves staff identity by syncing from Airtable into Supabase bridge tables (`staff_memberships`, `staff_profiles`, `airtable_identities`), enforces a staleness window, and only then trusts the row. With `public.users` (story 1) authoritative and RLS scoping (story 2) in place, that round-trip is dead weight — CAP-2's "zero network calls to api.airtable.com from `getStaffContext` and every invite/admin route" is blocked until the authz hot path reads `public.users` directly.

**Approach:** Rewrite `lib/authz.ts` so `getStaffContext` authenticates via Supabase Auth (unchanged) then loads the `public.users` row by `(id, program_id)`. Drop the Airtable round-trip — `findStaffUserByEmail`, `syncStaffSupabaseUserId`, the staleness threshold, and every read against the three bridge tables. Keep `AuthzError` codes and `writeAuditEvent` behavior so call sites and audit trail are stable. `StaffContext.airtableUserId` keeps its field name for caller compat but now carries the `public.users.id` UUID; the rename is story 5's work. Routes and components are NOT modified — story 5 owns the import swap.

## Boundaries & Constraints

**Always:**
- `getStaffContext` reads `public.users` via `createSupabaseAdminClient()` (`service_role`) using `.eq("id", authUserId).eq("program_id", programId).maybeSingle()`; never reads `staff_memberships`, `staff_profiles`, or `airtable_identities`.
- Supabase Auth user lookup is unchanged: `createSupabaseServerClient().auth.getUser()`; no `error` swallowed silently.
- `StaffContext.airtableUserId` continues to expose the user's record id; populated with `public.users.id` (UUID). Field name is preserved for caller compat per the dispatch contract — story 5 renames.
- `StaffContext.assignedPreacherAirtableUserId` is populated with `public.users.assigned_preacher_id` (UUID or undefined).
- `StaffContext.status` is validated against `users.status`; a row at `Inactive|Suspended|Revoked` throws `AuthzError(403, "staff_inactive", …)` (same code as today).
- `AuthzError`, `authzErrorResponse`, `requireRole`, `isRoleAllowed`, `writeAuditEvent` keep their current signatures and behavior.
- `syncStaffProfileByEmail` stays as an exported function (callers in `apps/folk/app/api/auth/{signin,complete-implicit}/route.ts`, `apps/folk/app/auth/confirm/route.ts` and the gita-life twins still import it). Its body becomes a public.users-only lookup that returns `StaffContext`; the Airtable round-trip and bridge-table writes are removed. Callers in story 5 will replace it.
- `StaffRole` / `StaffStatus` continue to be re-exported from `lib/supabase/data.ts` (already the case at `lib/authz.ts:10`). No new dependency on `@/lib/airtable`.
- `lib/authz.ts` keeps `import "server-only"` (asserted by `scripts/verify-monorepo-guardrails.mjs:14`).
- All Supabase access goes through `lib/supabase/{admin,server}.ts` — never read env vars directly.
- App code (`apps/folk/**`, `apps/gita-life/**`), `lib/airtable.ts`, `lib/invite-log.ts`, `lib/supabase/data.ts`, and `lib/supabase/types.ts` are NOT touched in this story.
- `pnpm typecheck` passes (every workspace project); `pnpm lint` and the monorepo guardrails script pass; no `lib/airtable` imports are added to `lib/authz.ts`.

**Never:**
- No reads of `staff_memberships`, `staff_profiles`, `airtable_identities`, or any other bridge table.
- No calls to `findStaffUserByEmail`, `syncStaffSupabaseUserId`, or any other Airtable-side symbol.
- No `STAFF_SYNC_STALE_AFTER_MINUTES` / `STAFF_PROFILE_STALE_AFTER_MINUTES` env reads, no `staleThresholdMs` / `isSyncStale` helpers.
- No edits to `supabase/migrations/`, `lib/supabase/types.ts`, or `lib/supabase/data.ts`. Stories 1 and 2 already did the schema/types work.
- No field rename on `StaffContext` in this story; downstream callers are story 5.
- No changes to `proxy.ts`, `public/sw.js`, the auth email templates, or Vercel/Supabase config — story 8 owns that.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH | Authenticated user with a matching `public.users (id=auth.uid, program_id=resolved, status='Active')` | `getStaffContext` returns `StaffContext` with `airtableUserId = users.id` (UUID), `role`, `status`, `locationIds`, `assignedPreacherAirtableUserId = users.assigned_preacher_id ?? undefined` | No error expected |
| ERROR_CASE | Authenticated user whose `public.users` row has `status='Suspended'` (or `'Inactive'/'Revoked'`) | `AuthzError(403, "staff_inactive", "This staff account is inactive.")` | Same code as today |
| ERROR_CASE | Authenticated user with no `public.users` row at `(auth.uid, program_id)` | `AuthzError(403, "staff_not_found", "No staff user is linked to this email.")` | Distinct from `staff_inactive` so story 5's CA can decide fallback |
| ERROR_CASE | Supabase Auth `getUser()` returns `error` or no user | `AuthzError(401, "unauthenticated", "Staff sign-in is required.")` | Same code as today |
| ERROR_CASE | Authenticated user with email missing on the auth row | `AuthzError(403, "missing_email", "The signed-in user does not have an email.")` | Same code as today |
| HAPPY_PATH | `syncStaffProfileByEmail({supabaseUserId, email, programId})` called for an existing `Active` `public.users` row | Returns the same `StaffContext` as `getStaffContext`; no Airtable call, no bridge-table write | No error expected |
| ERROR_CASE | `syncStaffProfileByEmail` called for an unknown email / no `public.users` row | `AuthzError(403, "staff_not_found", …)`; no audit row written | Distinct from `staff_inactive` |

</intent-contract>

## Code Map

- `lib/authz.ts` — full rewrite target. Remove `findStaffUserByEmail`/`syncStaffSupabaseUserId` imports (`airtable.ts`), the bridge-table mapper functions (`mapStaffProfileRowToStaffContext`, `mapStaffMembershipRowToStaffContext`), the staleness helpers (`staleThresholdMs`, `isSyncStale`), and the `staff_memberships`/`staff_profiles`/`airtable_identities` SELECTs. Replace `getStaffContext`'s body with a `public.users` lookup; rewrite `syncStaffProfileByEmail` to a public.users-only lookup.
- `lib/supabase/admin.ts` — `createSupabaseAdminClient()`; the read goes through service role so RLS does not gate the lookup (avoids a chicken-and-egg with `auth.uid()`).
- `lib/supabase/server.ts` — `createSupabaseServerClient()`; the Supabase Auth user fetch stays here.
- `lib/supabase/data.ts` — `StaffUser` (re-exported via `lib/authz.ts:10`); `findStaffUserByEmail`/`syncStaffSupabaseUserId` exist for callers but are no longer used by `lib/authz.ts`.
- `lib/supabase/types.ts:629-678` — `Database['public']['Tables']['users']` (Row/Insert/Update). Story 1 added this; story 4 reads it.
- `lib/supabase/env.ts` — env resolution (URL + keys); never read `process.env` outside this module.
- `supabase/migrations/20261006000000_add_users_and_contact_columns.sql` — `public.users` schema (story 1's deliverable). Read-only here.
- `supabase/migrations/20261006010000_scoped_rls_policies.sql` — RLS on `public.users` (story 2's deliverable): Admin reads own program; non-admin reads own row only. Read-only here.
- `supabase/migrations/20260613010000_add_program_scoped_staff_memberships.sql` — defines `staff_memberships`, `staff_profiles`, `airtable_identities`, `airtable_sync_state`, `audit_events`. Untouched this story.
- `packages/data-contracts/src/index.ts` — `StaffRole`, `StaffStatus`, `ProgramId`, type guards; `lib/authz.ts` continues to import `isProgramId` and `isStaffRole` (drops `isStaffMembershipStatus`).
- `packages/program-config/src/server.ts` — `resolveProgramId()` and `getServerProgramProfile()` (still used by `writeAuditEvent` and `getStaffContext` for `programId` resolution).
- Caller set (NOT touched this story; story 5 owns the rename): `apps/folk/app/api/auth/{signin,complete-implicit}/route.ts`, `apps/folk/app/auth/confirm/route.ts`, the gita-life twins, every route that reads `staff.airtableUserId` or `staff.assignedPreacherAirtableUserId` (sessions/dashboard/contact/admin/volunteers/attendance — both apps). Field names stay; only the underlying value space changes.
- `scripts/verify-monorepo-guardrails.mjs:14` — asserts `@/lib/airtable` and `@/lib/supabase/{admin,server}` are server-only. The rewrite must keep `import "server-only"`.
- `.env.migration.local` (gitignored) — credentials for CLI/Postgres; not needed by this story (no migration push), still off-limits to copy.

## Tasks & Acceptance

**Execution:**
- `lib/authz.ts` -- REWRITE -- Replace the bridge-table hot path with a `public.users` lookup. Remove `findStaffUserByEmail` / `syncStaffSupabaseUserId` imports from `@/lib/airtable`; remove `mapStaffProfileRowToStaffContext`, `mapStaffMembershipRowToStaffContext`, `staleThresholdMs`, `isSyncStale`, `StaffProfileRow`, `StaffMembershipRow`. Replace `getStaffContext`'s body: `auth.getUser()` → lookup `public.users` by `(id, program_id)` via admin client → validate `status === 'Active'` (else `staff_inactive`) → validate program_id (else `unsupported_program`) → return `StaffContext`. Rewrite `syncStaffProfileByEmail` to a public.users-only lookup (no Airtable call, no bridge writes) that returns `StaffContext`; keep its audit/AuthzError surface. Drop the `refresh` branch — the public.users table is the source of truth, no Airtable refresh path. Keep `writeAuditEvent`, `AuthzError`, `authzErrorResponse`, `requireRole`, `isRoleAllowed`, the `StaffContext` interface (field names unchanged), and `StaffRole`/`StaffStatus` re-exports.
- `scripts/verify-monorepo-guardrails.mjs` -- INVOKE -- Confirm `@/lib/authz` is server-only, no `lib/airtable` import in `lib/authz.ts`, no broken cross-package externals.
- `pnpm typecheck` -- INVOKE -- All workspace projects compile; no remaining references to `mapStaffProfileRowToStaffContext`, `mapStaffMembershipRowToStaffContext`, `syncStaffProfileByEmail` Airtable semantics, or stale thresholds.

**Acceptance Criteria:**
- Given the hosted project at story 2's state, when `auth/auth/users` row exists at `(auth.uid, program_id)` with `status='Active'`, then `getStaffContext()` returns a `StaffContext` whose `airtableUserId` equals `users.id`, whose `assignedPreacherAirtableUserId` equals `users.assigned_preacher_id ?? undefined`, and whose `role`/`status`/`locationIds` match the row's columns.
- Given `getStaffContext` is called and `public.users` has no row for `(auth.uid, program_id)`, then it throws `AuthzError(403, "staff_not_found", …)` without reading `staff_memberships` / `staff_profiles` / `airtable_identities`.
- Given `getStaffContext` is called and `public.users.status = 'Suspended'` (or `Inactive|Revoked`), then it throws `AuthzError(403, "staff_inactive", …)`.
- Given `getStaffContext` is called and Supabase Auth returns no user / an error, then it throws `AuthzError(401, "unauthenticated", …)`.
- Given `syncStaffProfileByEmail` is called for an existing active `public.users` row, then it returns the same `StaffContext` as `getStaffContext` with zero network calls to `api.airtable.com` and no writes to `staff_memberships` / `staff_profiles` / `airtable_identities`.
- Given `lib/authz.ts` after the rewrite, when I `grep -n "@/lib/airtable" lib/authz.ts`, then no lines match. When I `grep -n "staff_memberships\|staff_profiles\|airtable_identities\|syncStaffSupabaseUserId\|findStaffUserByEmail" lib/authz.ts`, then no lines match.
- Given the rewrite, when I `grep -n "isSyncStale\|staleThresholdMs\|STAFF_SYNC_STALE\|STAFF_PROFILE_STALE" lib/authz.ts`, then no lines match.
- Given the rewrite, when `pnpm typecheck` runs, then every workspace project typechecks with no errors.
- Given the rewritten `lib/authz.ts`, when `scripts/verify-monorepo-guardrails.mjs` runs, then no errors and no warnings are reported for `@/lib/authz` server-only, `@/lib/airtable` reachability, or `lib/airtable` cross-package externals.
- Given `StaffContext.airtableUserId` keeps its name, when a route reads `staff.airtableUserId` (e.g. `apps/folk/app/api/sessions/route.ts:57`, `:100`, `:136`; `apps/folk/app/api/contact/route.ts:71`, `:137`; the gita-life twins), then it now compares against the `public.users` UUID stored in `session.created_by` / `session.preacher_ids` — the comparison still resolves true for the calling staff, false otherwise, with no caller code change.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Why a service-role read for `public.users`:** RLS on `users` (story 2) lets a Preacher read only their own row and an Admin read all rows in the program. `getStaffContext` runs in route/page guards where the caller's prior role is unknown until the lookup completes — using the cookie-bound server client would block any Preacher/Volunteer/Assistant from resolving their own context. Service role bypasses RLS and reads exactly the row keyed by `auth.uid()` and the resolved program; RLS still gates every other read in the rest of the app.
- **Why `syncStaffProfileByEmail` survives but loses its Airtable body:** three auth routes (signin/complete-implicit/confirm × 2 apps) still import it; deleting the export breaks `pnpm typecheck`. The body becomes a thin wrapper that resolves the active `public.users` row and returns `StaffContext` — same call signature, zero Airtable traffic, no bridge writes. Story 5 will inline `getStaffContext` at the call sites and remove the function.
- **Why `StaffContext.airtableUserId` keeps its name:** the dispatch contract pins "StaffContext.airtableUserId becomes the public.users UUID — rename downstream semantics accordingly (callers updated in story 5)". The field name is preserved for caller compat; the value space is now UUID. JSDoc on the field documents the rename boundary so future readers see it.
- **Why no `refresh` / staleness machinery:** the bridge tables were a stale cache of Airtable. `public.users` is the source of truth (story 1's intent); staleness is no longer a concept here. The route-level `?refresh=true` callers passed by `auth-context.tsx`'s `refresh()` simply re-runs the same public.users lookup.
- **Why drop the `staff_memberships` / `staff_profiles` / `airtable_identities` SELECTs:** every existing row is bridge-table scaffolding the Airtable sync writes; once `public.users` is authoritative, the bridge rows are orphaned by the schema rename. Stories 8–9 may drop the bridge tables; this story stops reading them.

## Verification

**Commands:**
- `pnpm typecheck` -- expected: every workspace project passes with no errors.
- `node scripts/verify-monorepo-guardrails.mjs` -- expected: no errors; `@/lib/authz` server-only, no `lib/airtable` import in `lib/authz.ts`.
- `grep -n "@/lib/airtable\|staff_memberships\|staff_profiles\|airtable_identities\|syncStaffSupabaseUserId\|isSyncStale\|staleThresholdMs" lib/authz.ts` -- expected: zero matches.
- `node scripts/verify-rls.mjs` -- expected: per-role / per-table JWT visibility still passes (story 2's contract; this story does not alter RLS, only the authz hot path).

**Manual checks (if no CLI):**
- After rewrite, against the hosted project, sign in as a fixture staff user (story 2's fixtures) with `auth.users.id` matching a seeded `public.users (id, program_id, status='Active')` row: `/api/auth/me` returns `200 { staff: { …, airtableUserId: <UUID equals users.id>, assignedPreacherAirtableUserId: <UUID equals users.assigned_preacher_id or undefined>, role, status, locationIds } }`.
- Sign in as a fixture user whose matching `public.users.status = 'Suspended'`: `/api/auth/me` returns `403 { error, code: "staff_inactive" }`.
- Sign in as an auth user with no `public.users` row: `/api/auth/me` returns `403 { error, code: "staff_not_found" }`.
- Sign in as a fixture Admin and confirm `/api/sessions/` GET returns program-wide sessions; as a fixture Preacher confirms only sessions it created (`created_by = user.id`); as a fixture Assistant confirms its assigned preacher's sessions — all unchanged from story 3's behavior because `session.created_by` is now `public.users.id` and `staff.airtableUserId` is the same UUID.

## Auto Run Result

Status: in-progress