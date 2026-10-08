# Deferred Work

- 2026-05-20: ESLint is installed and `pnpm lint` now runs, but the codebase is not lint-clean yet. Current failures are pre-existing Next/React lint findings such as JSX returned inside `try/catch`, synchronous state updates inside effects, and impure render-time calls.
- 2026-06-02: Collaborator policy files document local checks and secret handling, but PR quality/security enforcement still relies on owner-side GitHub settings. Consider adding required CI for `pnpm exec tsc --noEmit`, `pnpm build`, `pnpm lint`, and GitHub secret scanning/push protection where available.
- 2026-06-14: Mobile bottom navigation still uses its own hard-coded program colors. Consider tokenizing it separately if future program theming needs parity with desktop header controls.
- 2026-06-14: Program header states do not have automated visual regression coverage across unauthenticated/authenticated, active/pending, desktop/mobile, and hydration-placeholder states.
- 2026-07-20: FOLK contact and registration Airtable payload mapping still lacks automated route/service regression coverage. Add tests for Working Professional company submission without `Year`, student college submission, and public vs attendance registration sources when a product test harness exists.
- 2026-07-20: FOLK contact and registration routes duplicate occupation-to-contact-field mapping. Consider centralizing a shared mapper so College/Company/occupation semantics cannot drift across entry points.
- 2026-07-20: Working Professional contact capture currently preserves Company when provided but does not require it. Decide whether blank company should remain allowed or become a server-side validation error.
- 2026-07-20: `createContact` still supports writing `Year` when callers pass `data.year`. If active Airtable schemas no longer include Year, update the shared contract/configuration or add a field allow-list before new callers rely on it.

### DW-1: No automated verification applies migrations or asserts the contact_attendance_counts rollup; CI runs guardrails/typecheck/build/lint only and the repo has zero test files.
origin: spec-deferred 948d3b2695da
location: .github/workflows/quality-gates.yml
source_spec: `7-1-schema-migration-users-table-and-contact-field-gaps.md`
severity: medium
reason: Pre-verified by the verification-gap review layer: .github/workflows/quality-gates.yml has no step that starts Supabase or applies migrations; a repo-wide search finds no *.test.*/*.spec.* files and no pgTAP/supabase-test configuration. Pre-existing gap, not caused by this story; stories.yaml assigns the verification suite to story 8. This run executed every acceptance probe manually against the hosted project (see Verification). The intent-alignment layer's surface-mismatch observation (the diff encodes no executable evidence for the hosted-state I/O matrix) shares this root cause.
status: open

### DW-2: 7 of the 11 I/O & Edge-Case Matrix rows have no executable coverage in this run: the ones whose expectation lives at the HTTP response surface (POST /attendance 404 notRegistered / 409 duplicate / 201
origin: spec-deferred 245304f61152
location: apps/folk/app/attendance/route.ts, apps/gita-life/app/attendance/route.ts, apps/folk/app/api/auth/signin/route.ts, apps/gita-life/app/api/auth/signin/route.ts
source_spec: `5-route-and-page-swap-to-supabase-in-both-apps.md`
severity: medium
reason: Verified at implementation time, not assumed. General egress works (https://supabase.com 200, https://registry.npmjs.org 200, https://api.github.com 200) while https://etwunirahuucodcxydgs.supabase.co/rest/v1/ fails with ECONNRESET; DNS resolves the host (202.83.24.75), so the block is specific to the project endpoint, not to the sandbox's networking. Note the project itself is NOT wholly unreachable: scripts/verify-rls.mjs reaches it over the Postgres connection (POSTGRES_URL_NON_POOLING) and passes 75/75. What is blocked is PostgREST, which is what every route handler talks to. Compounding this, the repo has zero test infrastructure — a repo-wide search finds no *.test.*/*.spec.* files and no vitest/jest/node:test dependency — and .github/workflows/quality-gates.yml runs only guardrails/typecheck/build/lint, so no pre-existing harness could be reused. The other 4 rows ARE covered by assertions that ran and passed against source extracted verbatim from the shipped files: the two
status: open

### DW-3: Deleting the Airtable self-heal removes a runtime repair path: when the auth.users row found by email has a different id than the public.users row, the sign-in route now yields
origin: spec-deferred 8156e1b5f5cf
location: apps/folk/app/api/auth/signin/route.ts:57-60
source_spec: `5-route-and-page-swap-to-supabase-in-both-apps.md`
severity: low
reason: apps/*/app/api/auth/signin/route.ts — the `existingUser.id !== linkedSupabaseUserId` branch and both syncStaffSupabaseUserId calls are gone. This is the intended reading of public.users.id being a PRIMARY KEY that REFERENCES auth.users(id): a mismatch is corrupt seed data, not a runtime sync case. Surfacing point is story 8's fixture seeding.
status: open

### DW-4: CAP-4's success condition — no route or page imports `lib/airtable` — has no committed enforcement, and the one script that inspects the changed sign-in route cannot see its own signature change.
origin: spec-deferred d5e836a29da0
location: scripts/verify-monorepo-guardrails.mjs:10-19, scripts/verify-program-readiness.mjs:33-41, apps/folk/app/api/auth/signin/route.ts:44
source_spec: `5-route-and-page-swap-to-supabase-in-both-apps.md`
severity: medium
reason: Verified live by the verification-gap layer, not assumed: reverting `apps/folk/app/attendance/route.ts:12` to `@/lib/airtable` leaves `verify-monorepo-guardrails.mjs` at PASS (its `@/lib/airtable` entry only fires when reached from a `"use client"` root), `verify-program-readiness.mjs` at PASS (it asserts `lib/airtable.ts` still contains its id-resolution code), `pnpm typecheck:workspace` at PASS (the two modules declare the same exports) and `pnpm build:apps` at PASS; only `pnpm lint` reports anything, and all 12 of its errors are pre-existing `.agent/`/`.codebuddy/`/`.neovate/` skill assets. The readiness script's `ensureSupabaseAuthUser\([^)]*\)` regex matches identically before and after the `staffUserId` parameter was dropped, so removing the whole `getUserById` linked-id fast path is likewise invisible. The intent's `Never` list forbids editing either script and forbids adding a test runner, so nothing in this story can close it.
status: open

### DW-5: The one logic change in this diff — `upsertStaffUser`'s non-empty `location_ids` guard — is pinned by no assertion that can execute it.
origin: spec-deferred dcac7b0e8b65
location: lib/supabase/data.ts:429
source_spec: `5-route-and-page-swap-to-supabase-in-both-apps.md`
severity: medium
reason: Verified live: restoring `if (Array.isArray(data.locationIds))` at `lib/supabase/data.ts:429` leaves `verify-monorepo-guardrails.mjs`, `verify-program-readiness.mjs` and `pnpm typecheck:workspace` all at PASS, because `lib/airtable.ts:493` and `lib/supabase/data.ts:407` declare the same parameter object and the type checker cannot see the guard's value. The spec's own check (`grep -n "Array.isArray(data.locationIds)"`) is a source-text match that only proves one spelling of the guard survives at the insert path. Closing it behaviourally needs the hosted project; `stories.yaml` story 8 is the story that seeds fixtures and ships executable verification scripts.
status: open

### DW-6: A `public.users` location change is written to Postgres but never invalidates the active-preachers cache, so the change is invisible to the surfaces that read it for up to 20 minutes.
origin: spec-deferred a2da46f2925d
location: lib/supabase/data.ts:450
source_spec: `5-route-and-page-swap-to-supabase-in-both-apps.md`
severity: low
reason: `lib/supabase/data.ts:450-453` calls `revalidateSupabaseReferenceCache("active-preachers")` only when `existing.role !== data.role || existing.status !== status`; a location-only update satisfies neither. The cached read is `listCachedActivePreachers` (`lib/supabase/data.ts:395-403`, `revalidate: SUPABASE_REFERENCE_CACHE_TTL_SECONDS = 20 * 60`, `lib/supabase/data.ts:148`), whose `StaffUser.locationIds` feeds `apps/*/app/api/sessions/route.ts:113-118` (an Assistant's `owningPreacherLocationIds`) and the `assignedPreacher` lookups in `apps/*/app/contact/page.tsx` and `apps/*/app/admin/invite/page.tsx`. A staff member's own scoping is unaffected — `lib/authz.ts` reads `public.users` uncached — so the drift is confined to cross-staff reads. Code in `lib/supabase/data.ts` is untouched by this diff and owned by stories 6/7.
status: open

### DW-7: `POST /api/admin/invite-user` validates the assigned Preacher with a trimmed id but forwards the untrimmed one, which Postgres rejects and which leaves a just-provisioned `auth.users` row orphaned.
origin: spec-deferred 17245e1a1814
location: apps/folk/app/api/admin/invite-user/route.ts:39
source_spec: `5-route-and-page-swap-to-supabase-in-both-apps.md`
severity: low
reason: `apps/*/app/api/admin/invite-user/route.ts:39` validates `payload.assignedPreacherAirtableUserId?.trim()` through `findStaffUserById`, but `:65-66` forwards `payload.assignedPreacherAirtableUserId` untrimmed into `upsertStaffUser`, which writes it to the `assigned_preacher_id` uuid column (`lib/supabase/data.ts:426-428` update path, `:493-495` insert path) and throws the raw 22P02 (`lib/supabase/data.ts:439-441`, `:500-502`). On the insert path `auth.admin.createUser` has already run at `lib/supabase/data.ts:467-473`, so the failure surfaces as a 500 and leaves that auth user behind with no `public.users` row. Unreachable from the shipped form — `components/invite-user-form.tsx:267` sources the value from a `<select>` over `listCachedActivePreachers()` — and the route line is unchanged by this diff.
status: open

### DW-8: `invite_log.airtable_user_id` and `audit_events.actor_airtable_user_id` are TEXT columns that now receive `public.users.id` UUIDs alongside the `rec*` ids the Airtable era wrote, with no
origin: spec-deferred fa958c801fb9
location: lib/invite-log.ts:10, lib/authz.ts:70
source_spec: `5-route-and-page-swap-to-supabase-in-both-apps.md`
severity: low
reason: `lib/invite-log.ts` and `writeAuditEvent` (`lib/authz.ts`) keep their `*AirtableUserId` parameter names — a boundary this story's `Never` list deliberately holds — and the values they now receive are UUIDs (`apps/*/app/api/admin/invite-user/route.ts:78-82`, `:89-91`). Neither column carries a CHECK, so Postgres accepts both vocabularies and any future query joining audit history across the cutover has no way to tell which id space a row belongs to. Story 7 owns the rename sweep and playbook step 22's docs update.
status: open

### DW-9: `mapSession` wraps the single `preacher_id`/`location_id` columns in one-element arrays, so a legacy Airtable session that linked several preachers or locations cannot round-trip and its co-preachers
origin: spec-deferred d7f116f0970d
location: lib/supabase/data.ts:688
source_spec: `5-route-and-page-swap-to-supabase-in-both-apps.md`
severity: medium
reason: `lib/supabase/data.ts:688-689` returns `preacherIds: row.preacher_id ? [row.preacher_id] : []` and the same for `locationIds`, over `SessionsRow.preacher_id: string | null` / `location_id: string | null` (`lib/supabase/data.ts:206-207`). The Airtable module it replaces read linked-record fields through `normalizeLinkedIds` (`lib/airtable.ts:672-673`), which preserves every linked id. Consequences at `apps/*/app/attendance/route.ts:141-143` (a co-preacher falls through to `403 "This session is outside your allowed scope."`) and `apps/*/app/registration/route.ts:112` (`422 "This attendance session is missing preacher or location routing."`). Unreachable until story 9's backfill loads legacy multi-value rows; the schema is story 1's and `data.ts` is story 7.3's.
status: open

### DW-10: `InviteUserForm` has no re-entrancy guard in `handleSubmit`, so a second Enter during an in-flight first-time invite races the insert and surfaces as a 500.
origin: spec-deferred 65f4c819741b
location: components/invite-user-form.tsx:158
source_spec: `5-route-and-page-swap-to-supabase-in-both-apps.md`
severity: low
reason: `components/invite-user-form.tsx:158` starts `handleSubmit` without an `if (isSubmitting) return`, and `disabled={isSubmitting}` at `:365` only blocks the button — a form-level submit (Enter in a text input) still fires. Both requests reach `upsertStaffUser`, both find no existing `public.users` row, and the loser hits the `createUser` already-registered path at `lib/supabase/data.ts:467-478`, which throws `AirtableRequestError(..., 500)`. The Airtable module created only a record, so no equivalent failure existed before the swap; both the form and the insert path are unchanged by this diff.
status: open

### DW-11: The service worker's replay loop has no attempt counter and no dead-letter, so a queued POST that can never succeed is re-sent on every reconnect and the pending badge never clears.
origin: spec-deferred 7030698b8685
location: public/sw.js:96
source_spec: `5-route-and-page-swap-to-supabase-in-both-apps.md`
severity: low
reason: `public/sw.js:96-119` removes an entry only on `response.ok || response.status === 409`; anything else leaves it in IndexedDB and `notifyPendingCount()` keeps reporting it. This story preserves `sw.js` byte-for-byte by the intent's own `Always` list, and the id vocabulary crossing that boundary (a pre-swap `rec*` body replayed against a UUID-keyed lookup) is already recorded as a pass-1 deferral.
status: open

### DW-12: After the `location_ids` guard change, no code path can ever empty a staff member's locations, because both invite routes submit `[]` whenever nothing is ticked.
origin: spec-deferred 11dae2c000bf
location: lib/supabase/data.ts:429
source_spec: `5-route-and-page-swap-to-supabase-in-both-apps.md`
severity: low
reason: `lib/supabase/data.ts:429` now writes `location_ids` only for a non-empty array, `apps/*/app/api/admin/ invite-user/route.ts:35` forces `[]` for Volunteer/Assistant and `normalizeLocationIds` (`:15-23`) returns `[]` when no box is checked, and `components/invite-user-form.tsx` submits `[]` in that case. This mirrors `lib/airtable.ts:508` exactly and is what the intent's re-invite acceptance criterion requires, so it is a faithful restoration rather than a regression — but it means revoking a Preacher's last location is no longer possible through any shipped surface, and story 6's location-management UI will need a distinct clearing path.
status: open
seen-again: 2026-10-06 (story 7-3 data-module harvest saw the same location_ids truthy-guard defect before 7-5 moved it to :429; filed as DW-22, which also covers the assignedPreacherAirtableUserId null-to-unassign half DW-12 does not)

### DW-13: `app/dashboard/page.tsx` filters sessions by `createdBy.includes(staff.userId)` with no Admin escape hatch, so an Admin sees no live-session widget for sessions other staff created.
origin: spec-deferred 8b2ffa8d45c9
location: apps/folk/app/dashboard/page.tsx:44
source_spec: `5-route-and-page-swap-to-supabase-in-both-apps.md`
severity: medium
reason: `apps/*/app/dashboard/page.tsx:44` and `apps/*/app/api/sessions/route.ts:57` both filter on `session.createdBy.includes(staff.userId)` with no role check, while the RLS policy at `supabase/migrations/20261006010000_scoped_rls_policies.sql:190` grants Admin program-wide SELECT — an app-layer narrowing of the database grant. The diff changed only the field name on that line (the filter is byte-identical at `87425115c4ce2ddd93615331c882eb653ce33826`), and the intent's frozen "Admin all / Preacher own sessions" contract is the `GET /attendance` feed, which is intact at `apps/*/app/attendance/route.ts:141` (`staff.role === "Admin" || ...`).
status: open

### DW-14: upsertStaffUser only scans first page (200) of auth.admin.listUsers and does not paginate when matching by email; an auth roster beyond 200 will silently miss and create a duplicate auth user.
origin: spec-deferred 95cbca6785e2
location: lib/supabase/data.ts:452
source_spec: `3-supabase-data-access-module-mirroring-lib-airtable-ts.md`
severity: low
reason: data.ts:452 — `perPage: 200`. Single-program system is far below 200 staff at this stage; story 4 owns the authz rework that will centralize auth-user provisioning.
status: open

### DW-15: TOCTOU race in upsertStaffUser — findStaffUserByEmail and the subsequent update are not transactional; concurrent invites for the same email can race and one caller receives an opaque 23505.
origin: spec-deferred 5e86579b77d0
location: lib/supabase/data.ts:413-444
source_spec: `3-supabase-data-access-module-mirroring-lib-airtable-ts.md`
severity: low
reason: data.ts:413 (findStaffUserByEmail) and the update at data.ts:434 are not wrapped in a transaction.
status: open

### DW-16: getContactsByRecordIds and getAttendanceByRecordIds do not chunk large `recordIds` arrays for PostgREST URL/IN-clause limits.
origin: spec-deferred 8e554fa65b32
location: lib/supabase/data.ts:564,1056
source_spec: `3-supabase-data-access-module-mirroring-lib-airtable-ts.md`
severity: low
reason: data.ts:557-564 (contacts) and data.ts:1055-1056 (attendance) pass the full uniqueIds array to `.in(...)`; large arrays hit the PostgREST URL-length ceiling.
status: open

### DW-17: Hand-rolled `UsersRow`/`ContactRow`/`SessionsRow`/`LocationsRow`/`AttendanceRow` types cast via `as` instead of using the generated `Database['public']['Tables'][...]['Row']`; the local types can
origin: spec-deferred 6f40d8d48c64
location: lib/supabase/data.ts:170-231
source_spec: `3-supabase-data-access-module-mirroring-lib-airtable-ts.md`
severity: low
reason: data.ts:170-231 declares local row types and then casts Supabase responses to them at the call sites.
status: open

### DW-18: Contracts documented in the spec's acceptance criteria (normalizeMobile, 23505→409, 404→null on single-row GETs, Asia/Kolkata day window, currentAirtableDate, cache keys/TTL) are not observed by any
origin: spec-deferred 91c31bfe87ce
location: scripts/verify-supabase-data-module.mjs (missing)
source_spec: `3-supabase-data-access-module-mirroring-lib-airtable-ts.md`
severity: medium
reason: No `*.test.ts`/`*.spec.ts` files anywhere in source; no vitest/jest/node:test in any package.json; `scripts/verify-rls.mjs` uses raw `@supabase/supabase-js` and does not exercise the data module. Story 5 is the load-bearing test surface (its import swap will exercise every public symbol); a `scripts/verify-supabase-data-module.mjs` belongs to story 5, not this story.
status: open

### DW-19: mapContact, mapSession always populate `analyticsIds: []` and SessionRecord.attendanceRecordIds is always `[]`; the public types still declare these fields, so a caller that iterated them
origin: spec-deferred 2013a2ac5147
location: lib/supabase/data.ts:524,676,677
source_spec: `3-supabase-data-access-module-mirroring-lib-airtable-ts.md`
severity: low
reason: data.ts:524 (analyticsIds on ContactRecord), data.ts:676-677 (analyticsIds + attendanceRecordIds on SessionRecord). Intentional per Design Notes "internal row mappers suffice"; story 5 callers should not depend on these.
status: open

### DW-20: StaffUser.supabaseUserId now returns the public.users UUID (where Airtable returned `undefined` for legacy rows). Story 4 will rename the field on StaffContext; the data module's return shape stays
origin: spec-deferred cded85ff68db
location: lib/supabase/data.ts:328
source_spec: `3-supabase-data-access-module-mirroring-lib-airtable-ts.md`
severity: low
reason: data.ts:328 sets `supabaseUserId: row.id`. Intentional per Design Notes; story 4 owns the field rename.
status: open

### DW-21: ContactRecord.location value space is `string[]` of location UUIDs (was `string | string[] | undefined` of Airtable record IDs). Intentional narrowing per data-model-mapping.md; story 5 will handle
origin: spec-deferred deb6743091df
location: lib/supabase/data.ts:521
source_spec: `3-supabase-data-access-module-mirroring-lib-airtable-ts.md`
severity: low
reason: data.ts:521 returns `Array.isArray(row.location_ids) ? row.location_ids : []`.
status: open

### DW-22: upsertStaffUser update branch truthy-guards `data.locationIds` and `data.assignedPreacherAirtableUserId`, so a caller passing `locationIds: []` to wipe or `null` to unassign is silently ignored.
origin: spec-deferred c3cd610e1552
location: lib/supabase/data.ts:421,424
source_spec: `3-supabase-data-access-module-mirroring-lib-airtable-ts.md`
severity: low
reason: data.ts:421 (truthy guard on assignedPreacherAirtableUserId), data.ts:424 (`if (Array.isArray(data.locationIds))`).
status: open

### DW-23: auth.admin.listUsers error is not surfaced — `.error` is not checked at data.ts:452; admin API errors propagate via `throw` at a higher level rather than being caught and re-thrown as
origin: spec-deferred 3337336cbb11
location: lib/supabase/data.ts:452
source_spec: `3-supabase-data-access-module-mirroring-lib-airtable-ts.md`
severity: low
reason: data.ts:452 — `const listResult = await supabaseAdmin.auth.admin.listUsers(...)` does not check `listResult.error`. Pre-existing issue; would require restructuring the auth-user provisioning path.
status: open

### DW-24: docs/development-guide.md still states that no product test suite exists and the "Current Test Status" section has no automated suite, which now understates the repo — `test:seed-local-guard` and
origin: spec-deferred 1bc6a38e991a
location: docs/development-guide.md:140
source_spec: `1-migrated-baseline-and-populated-local-schema.md`
severity: low
reason: docs/development-guide.md still carries the stale sentence, and matrix-coverage-map.md assigns the update to the story that builds the Playwright suite. This story adds harness scripts, not a product test suite, so amending that section here would overstate what exists.
status: open

### DW-25: Nothing automated runs the suite — `.github/workflows/quality-gates.yml` executes guardrails, typecheck, build, and lint only — so a break in the `/login` -> Mailpit OTP -> `verifyOtp` path is
origin: spec-deferred f57c9d95a1a3
location: .github/workflows/quality-gates.yml
source_spec: `2-playwright-harness-and-deterministic-staff-authentication.md`
severity: medium
reason: The gap layer verified this by reading the workflow in full and listing its steps; neither `pnpm test:e2e` nor `pnpm test` appears. The demonstration: breaking the `Send Code` submit path in `apps/folk/app/login/login-page-client.tsx` leaves `quality-gates.yml` green, because `pnpm lint` and `pnpm typecheck:workspace` do not exercise the runtime path. The suite would catch it, if run. Deferred rather than patched because the intent excludes it: SPEC.md's non-goals state "No CI workflow changes. Wiring `pnpm test:e2e` into `.github/workflows` is a follow-up once the suite is green and not flake-prone", and doing it properly needs Supabase and Mailpit as CI services — a substantially larger change than this story.
status: open
