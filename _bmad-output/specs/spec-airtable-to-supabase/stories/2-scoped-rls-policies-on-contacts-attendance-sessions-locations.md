---
title: 'Scoped RLS policies on contacts, attendance, sessions, locations'
type: 'feature'
created: '2026-10-06'
status: 'in-review'
baseline_revision: 4e3dd47cbf52f6914688b49e75c8f16a88052866
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/specs/spec-airtable-to-supabase/rls-policy-matrix.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** The core-tables migration shipped placeholder RLS (`authenticated USING (true)` read-all on contacts, locations, sessions, attendance) and story 1's new `public.users` table has no RLS at all, so any authenticated JWT can read every row of every program — CAP-3's per-role, program-scoped visibility contract is unenforced at the database.

**Approach:** One new additive migration replaces the four placeholder SELECT policies with the exact scoping in `rls-policy-matrix.md`, backed by SECURITY DEFINER helper functions that resolve the caller's `public.users` row (program, role, assigned preacher, effective locations) from `auth.uid()`, and enables RLS on `public.users` with own-row / Admin-in-program policies. A shipped verification script seeds fixture staff and rows per program and proves, per role per table, that out-of-scope rows are unreadable with a real user JWT.

## Boundaries & Constraints

**Always:**
- `rls-policy-matrix.md` is the exact contract — reproduce its read-scope table cell-for-cell; do not invent new scoping.
- Every policy is constrained by `program_id` equal to the caller's program; a folk JWT must never resolve gita-life rows and vice versa.
- Helpers resolve through the caller's `public.users` row keyed by `auth.uid()`, and only when that row has `status = 'Active'`; a missing or non-Active row yields NULL/empty scope (zero visible rows).
- Assistant/Volunteer location and contact scope resolves through `assigned_preacher_id`, and only when the assigned preacher's row is `Active` (matrix: "empty set when no active assigned preacher").
- Sessions read scope is creator-based (`sessions.created_by`), per the matrix's decided-scoping notes; attendance read scope is via the parent session's `preacher_id`, NOT `created_by` — the matrix gives Preachers "attendance of sessions where they are the preacher".
- Contacts scope key is `assigned_preacher_id` only; `collected_by_id` is never an RLS scope key.
- Helper functions are `SECURITY DEFINER` + `STABLE`, with a pinned `search_path`, owned by the table owner so RLS does not recurse into `public.users`; `REVOKE`/`GRANT EXECUTE` so only `authenticated` (and service role) can call them.
- Attendance's session lookup must run inside a SECURITY DEFINER helper — a plain subquery on `sessions` inside the attendance policy would inherit sessions' creator-scoped RLS and wrongly hide rows where `preacher_id` matches but `created_by` does not.
- No authenticated INSERT/UPDATE/DELETE policies on any of the five tables — writes stay service-role only (service role bypasses RLS).
- Drop exactly the four placeholder policies (`"… viewable by authenticated users"` SELECT `USING (true)` on contacts, locations, sessions, attendance). Leave the existing `service_role` INSERT/UPDATE policies untouched.
- Enable RLS on `public.users` (story 1 deliberately left it off) with: SELECT of own row (`id = auth.uid()`), or all rows in own program for Admin. No authenticated writes.
- Verification uses seeded fixture auth users created via the service-role admin API: per program (`folk`, `gita-life`) 1 Admin, 1 Preacher, 1 Volunteer + 1 Assistant assigned to that preacher, plus in-scope and out-of-scope contacts/locations/sessions/attendance rows. Fixtures are clearly tagged (e.g. `rls-fixture-*@example.com`) and removable; the hosted project is disposable pre-cutover.
- Supabase connection contract: migrations applied with `supabase db push` against the linked hosted project `etwunirahuucodcxydgs` (fallback `--db-url $POSTGRES_URL_NON_POOLING`); CLI/Postgres credentials read from gitignored `.env.migration.local` — never copy values into code, docs, commits, or chat. App/server code uses only `lib/supabase/{client,server,admin}.ts` accessors.

**Never:**
- No edits to `20261004000000_create_core_tables.sql` or `20261006000000_add_users_and_contact_columns.sql` — this story is one new migration file.
- No changes to `lib/authz.ts`, routes, pages, or any app code — that is stories 3–5. App-layer scoping stays as-is in parallel.
- No authenticated write policies, and no use of `collected_by_id`, session `location_id`, or role+location session scoping as RLS keys.
- No pg enums; role/status stay TEXT + CHECK as created in story 1.
- No writes to the old Supabase project (`cparpinmalqsimninyfw`) or the Airtable bases — read-only archives.
- No `supabase config push` (config.toml's `[auth]` is local-mailpit; story 8 owns auth config).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH | Admin JWT selects `contacts`/`sessions`/`attendance`/`locations` | All rows in the caller's program | No error expected |
| HAPPY_PATH | Preacher JWT selects `contacts` | Only rows with `assigned_preacher_id` = their `users.id`, in their program | No error expected |
| HAPPY_PATH | Preacher JWT selects `sessions` | Only sessions they created (`created_by` = their id) | No error expected |
| HAPPY_PATH | Preacher JWT selects `attendance` | Only attendance whose parent session has `preacher_id` = their id (including sessions created by someone else) | No error expected |
| HAPPY_PATH | Assistant JWT (Active assigned preacher) selects `contacts`/`attendance`/`sessions`/`locations` | Contacts of the assigned preacher; attendance of the preacher's sessions; own + preacher's created sessions; preacher's `location_ids` | No error expected |
| HAPPY_PATH | Preacher/Admin JWT selects `public.users` | Preacher: own row only. Admin: all rows in own program | No error expected |
| ERROR_CASE | Volunteer JWT selects `contacts`/`sessions`/`attendance` | Zero rows (RLS invisibility, not an error) | Silent empty result — correct |
| ERROR_CASE | Volunteer JWT selects `locations` with Active assigned preacher | Only the preacher's `location_ids`; preacher Inactive/missing → zero rows | Silent empty result — correct |
| ERROR_CASE | Folk Admin JWT queries `gita-life` rows on any table | Zero rows | Silent empty result — correct |
| ERROR_CASE | JWT for a `users` row with `status = 'Suspended'` (or no users row) selects any table | Zero rows | Silent empty result — correct |
| ERROR_CASE | Authenticated role attempts INSERT/UPDATE/DELETE on any of the five tables | Rejected — no such policies exist | Postgres RLS violation |
| HAPPY_PATH | Service-role client writes/reads any table | Unaffected (service role bypasses RLS) | No error expected |

</intent-contract>

## Code Map

- `supabase/migrations/20261004000000_create_core_tables.sql` — READ-ONLY reference. Lines 88–125 hold the four placeholder SELECT policies to drop (exact names: `"Contacts are viewable by authenticated users"`, `"Locations are viewable by authenticated users"`, `"Sessions are viewable by authenticated users"`, `"Attendance is viewable by authenticated users"`) and the service-role INSERT/UPDATE policies to keep. Table columns: `contacts.assigned_preacher_id`, `sessions.preacher_id`/`created_by`/`location_id`, `attendance.session_id`, all with `program_id`.
- `supabase/migrations/20261006000000_add_users_and_contact_columns.sql` — READ-ONLY reference. `public.users` shape: `id UUID PK REFERENCES auth.users(id)`, `program_id`, `role`/`status` TEXT+CHECK, `location_ids UUID[]`, `assigned_preacher_id` self-FK. No RLS enabled on it yet — this story enables it.
- `supabase/migrations/20261006010000_scoped_rls_policies.sql` — NEW. The single migration deliverable: helpers, `ALTER TABLE public.users ENABLE ROW LEVEL SECURITY`, drops + scoped policies.
- `_bmad-output/specs/spec-airtable-to-supabase/rls-policy-matrix.md` — the exact read-scope contract (in `context:`); scoping semantics were lifted from `lib/authz.ts`, `apps/folk/app/attendance/route.ts`, `apps/folk/app/api/sessions/route.ts` — consult only if a matrix cell seems ambiguous.
- `scripts/verify-rls.mjs` — NEW. Fixture seeding + per-role/per-table JWT verification (and fixture cleanup). Runs with `node scripts/verify-rls.mjs` against the hosted project, reading credentials from `.env.migration.local` via `lib/supabase/env.ts` conventions (or direct `process.env` in the script — it is tooling, not app code; still never print secret values).
- `supabase/seed.sql` — empty stub kept for `supabase db reset` compatibility; leave it as-is (fixtures live in the script since there is no local stack).
- `lib/supabase/types.ts` — REGENERATE with `supabase gen types typescript --linked` so the new helper functions appear under `Database['public']['Functions']`.
- `lib/supabase/admin.ts` — `createSupabaseAdminClient()` pattern to mirror for service-role fixture writes in the verification script.
- `.env.migration.local` (gitignored) — `SUPABASE_ACCESS_TOKEN`, `POSTGRES_URL_NON_POOLING`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, anon/publishable keys. Read values; never copy them anywhere.

## Tasks & Acceptance

**Execution:**
- `supabase/migrations/20261006010000_scoped_rls_policies.sql` -- CREATE (single additive migration) -- SECURITY DEFINER helpers over `public.users` (caller role, caller program, caller's active assigned preacher id, caller effective location ids, attendance-session visibility check); enable RLS on `public.users`; drop the four placeholder SELECT policies; create the scoped SELECT policies on `users`, `contacts`, `sessions`, `attendance`, `locations` exactly per `rls-policy-matrix.md`; EXECUTE grants to `authenticated`.
- `scripts/verify-rls.mjs` -- CREATE -- Seeds fixture auth users (admin API, `email_confirm: true`, fixture password) + `public.users` rows + in/out-of-scope operational rows per program via service role; signs in as each fixture user to obtain a real user JWT; asserts every I/O-matrix row per role per table (visible-row and zero-row expectations, cross-program denial, suspended-user denial, authenticated-write rejection, service-role unaffected); prints a pass/fail matrix; supports fixture cleanup. If HTTP to the project host is blocked from the run environment, fall back to equivalent SQL probes via psql (`SET ROLE authenticated` + `SET LOCAL request.jwt.claims` with the fixture `sub`) and record the substitution in the run report.
- `lib/supabase/types.ts` -- REGENERATE via `supabase gen types typescript --linked` -- Picks up the new helper functions; no manual edits.
- Run after writing the migration: `supabase db push` (linked project; fallback `--db-url $POSTGRES_URL_NON_POOLING`), then `supabase db diff --linked` to confirm no drift beyond the known `pg_net` shadow-baseline artifact seen in story 1.

**Acceptance Criteria:**
- Given the hosted project at story 1's state, when `supabase db push` runs, then the migration applies cleanly and `supabase db diff --linked` shows no drift (except the known no-op `pg_net` artifact).
- Given the migration is applied, when I query `pg_policies` for `contacts`, `locations`, `sessions`, `attendance`, then no policy with `qual = 'true'` for the `authenticated` SELECT remains, and the service-role INSERT/UPDATE policies are still present.
- Given the migration is applied, when I inspect `pg_proc`/`information_schema.routines`, then each helper exists with `SECURITY DEFINER`, and `public.users` has `rowsecurity = true` in `pg_class`.
- Given fixtures are seeded, when the verification script runs, then every I/O-matrix row passes: per role per table, in-scope rows are readable and out-of-scope rows (wrong preacher, wrong program, Volunteer reads, suspended caller, inactive assigned preacher) return zero rows with a real user JWT (or the documented SQL fallback).
- Given the policies, when an authenticated fixture user attempts an INSERT, UPDATE, or DELETE on any of the five tables, then it is rejected with an RLS violation, while the same write via the service-role key succeeds.
- Given the regenerated types, when `pnpm typecheck` runs, then all workspace projects pass.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Why SECURITY DEFINER helpers:** policies on `users` must read `users` to resolve the caller's role/program — a plain subquery recurses into the same RLS policy. Helpers owned by the table owner (postgres) bypass RLS inside the function (no `FORCE ROW LEVEL SECURITY` anywhere), which is the standard Supabase pattern. The same trick is required for attendance→sessions so attendance scope (`sessions.preacher_id`) is not wrongly intersected with sessions' own creator-scoped policy.
- **Why helpers return NULL/empty for non-Active callers:** the app already refuses sign-in for non-Active staff (`lib/authz.ts`); mirroring that in scope resolution means a JWT that outlives a suspension immediately sees zero rows instead of stale access.
- **Policy shapes (per matrix):** sessions `USING (program_id = caller_program() AND (caller_role() = 'Admin' OR created_by = auth.uid() OR created_by = caller_assigned_preacher_id()))`; contacts `... (Admin OR assigned_preacher_id = auth.uid() OR assigned_preacher_id = caller_assigned_preacher_id())`; locations `... (Admin OR id = ANY(caller_effective_location_ids()))`; attendance `... (Admin OR caller_can_read_attendance_session(session_id))`; users `USING (id = auth.uid() OR (caller_role() = 'Admin' AND program_id = caller_program()))`. Role-agnostic `auth.uid()` terms cover Preacher and Assistant own-created sessions; Volunteer falls through to zero rows everywhere except locations.
- **Why fixtures come from the admin API, not SQL inserts into `auth.users`:** `auth.users` has many NOT NULL internal columns; `admin.createUser` with `email_confirm: true` is the supported path and doubles as a sign-in smoke test. Fixture emails are tagged (`rls-fixture-<role>-<program>@example.com`) so cleanup is a filter, not a wipe.

## Verification

**Commands:**
- `supabase db push` -- expected: migration `20261006010000_scoped_rls_policies` applies; re-run reports remote up to date.
- `supabase db diff --linked` -- expected: no drift besides the known `pg_net` shadow-baseline artifact.
- `supabase gen types typescript --linked > lib/supabase/types.ts` -- expected: new functions under `Database['public']['Functions']`; re-run byte-identical.
- `node scripts/verify-rls.mjs` -- expected: full pass/fail matrix green (or documented SQL-fallback probes all passing).
- `pnpm typecheck` -- expected: all workspace projects pass.

**Manual checks (if no CLI):**
- `SELECT tablename, policyname, qual FROM pg_policies WHERE tablename IN ('contacts','locations','sessions','attendance','users') ORDER BY 1,2;` — no `USING (true)` authenticated SELECT; scoped quals present; service-role write policies intact.
- `SELECT proname, prosecdef FROM pg_proc WHERE proname LIKE 'caller\_%';` — every helper `prosecdef = true`.
- `SELECT relrowsecurity FROM pg_class WHERE relname = 'users' AND relnamespace = 'public'::regnamespace;` — `true`.
