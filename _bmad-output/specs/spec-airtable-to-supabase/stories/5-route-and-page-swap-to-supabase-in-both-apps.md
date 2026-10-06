---
title: 'Route and page swap to Supabase in both apps'
type: 'feature'
created: '2026-10-06'
baseline_revision: 87425115c4ce2ddd93615331c882eb653ce33826
status: 'done'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '_bmad-output/specs/spec-airtable-to-supabase/SPEC.md'
warnings: ['oversized']
deferred:
  - summary: >-
      7 of the 11 I/O & Edge-Case Matrix rows have no executable coverage in this run: the ones whose
      expectation lives at the HTTP response surface (POST /attendance 404 notRegistered / 409 duplicate /
      201 created, GET /attendance role scoping 403, GET /attendance unauthenticated 401, GET
      ?knownAttendanceIds response-side filtering, and the sign-in mismatch path) require the hosted
      Supabase project, whose REST API endpoint is unreachable from this environment.
    evidence: >-
      Verified at implementation time, not assumed. General egress works (https://supabase.com 200,
      https://registry.npmjs.org 200, https://api.github.com 200) while
      https://etwunirahuucodcxydgs.supabase.co/rest/v1/ fails with ECONNRESET; DNS resolves the host
      (202.83.24.75), so the block is specific to the project endpoint, not to the sandbox's networking.
      Note the project itself is NOT wholly unreachable: scripts/verify-rls.mjs reaches it over the
      Postgres connection (POSTGRES_URL_NON_POOLING) and passes 75/75. What is blocked is PostgREST, which
      is what every route handler talks to. Compounding this, the repo has zero test infrastructure — a
      repo-wide search finds no *.test.*/*.spec.* files and no vitest/jest/node:test dependency — and
      .github/workflows/quality-gates.yml runs only guardrails/typecheck/build/lint, so no pre-existing
      harness could be reused. The other 4 rows ARE covered by assertions that ran and passed against
      source extracted verbatim from the shipped files: the two knownAttendanceIds discard rows (12 cases),
      the re-invite location_ids row (4 cases over the shipped upsertStaffUser guard), and the
      first-time-invite row (the route forwards sendStaffInviteEmail's real delivery value, asserts nothing
      about pre-existence, and components/invite-user-form.tsx:184 no longer claims the account existed).
      The 7 uncovered rows are the CAP-5 contract checks that stories.yaml and SPEC.md assign to story 8
      ("/attendance contract codes (CAP-5)", plus fixture seeding and preview-deployment verification).
    location: >-
      apps/folk/app/attendance/route.ts, apps/gita-life/app/attendance/route.ts, apps/folk/app/api/auth/signin/route.ts, apps/gita-life/app/api/auth/signin/route.ts
    severity: medium
  - summary: >-
      Deleting the Airtable self-heal removes a runtime repair path: when the auth.users row found by email
      has a different id than the public.users row, the sign-in route now yields
      AuthzError(403,"staff_not_found") -> HTTP 500 instead of silently relinking.
    evidence: >-
      apps/*/app/api/auth/signin/route.ts — the `existingUser.id !== linkedSupabaseUserId` branch and both
      syncStaffSupabaseUserId calls are gone. This is the intended reading of public.users.id being a
      PRIMARY KEY that REFERENCES auth.users(id): a mismatch is corrupt seed data, not a runtime sync case.
      Surfacing point is story 8's fixture seeding.
    location: apps/folk/app/api/auth/signin/route.ts:57-60
    severity: low
  - summary: >-
      CAP-4's success condition — no route or page imports `lib/airtable` — has no committed enforcement, and the
      one script that inspects the changed sign-in route cannot see its own signature change.
    evidence: >-
      Verified live by the verification-gap layer, not assumed: reverting `apps/folk/app/attendance/route.ts:12`
      to `@/lib/airtable` leaves `verify-monorepo-guardrails.mjs` at PASS (its `@/lib/airtable` entry only fires when
      reached from a `"use client"` root), `verify-program-readiness.mjs` at PASS (it asserts `lib/airtable.ts` still
      contains its id-resolution code), `pnpm typecheck:workspace` at PASS (the two modules declare the same exports)
      and `pnpm build:apps` at PASS; only `pnpm lint` reports anything, and all 12 of its errors are pre-existing
      `.agent/`/`.codebuddy/`/`.neovate/` skill assets. The readiness script's `ensureSupabaseAuthUser\([^)]*\)` regex
      matches identically before and after the `staffUserId` parameter was dropped, so removing the whole
      `getUserById` linked-id fast path is likewise invisible. The intent's `Never` list forbids editing either script
      and forbids adding a test runner, so nothing in this story can close it.
    location: >-
      scripts/verify-monorepo-guardrails.mjs:10-19, scripts/verify-program-readiness.mjs:33-41,
      apps/folk/app/api/auth/signin/route.ts:44
    severity: medium
  - summary: >-
      The one logic change in this diff — `upsertStaffUser`'s non-empty `location_ids` guard — is pinned by no
      assertion that can execute it.
    evidence: >-
      Verified live: restoring `if (Array.isArray(data.locationIds))` at `lib/supabase/data.ts:429` leaves
      `verify-monorepo-guardrails.mjs`, `verify-program-readiness.mjs` and `pnpm typecheck:workspace` all at PASS,
      because `lib/airtable.ts:493` and `lib/supabase/data.ts:407` declare the same parameter object and the type
      checker cannot see the guard's value. The spec's own check (`grep -n "Array.isArray(data.locationIds)"`) is a
      source-text match that only proves one spelling of the guard survives at the insert path. Closing it
      behaviourally needs the hosted project; `stories.yaml` story 8 is the story that seeds fixtures and ships
      executable verification scripts.
    location: lib/supabase/data.ts:429
    severity: medium
  - summary: >-
      A `public.users` location change is written to Postgres but never invalidates the active-preachers cache, so
      the change is invisible to the surfaces that read it for up to 20 minutes.
    evidence: >-
      `lib/supabase/data.ts:450-453` calls `revalidateSupabaseReferenceCache("active-preachers")` only when
      `existing.role !== data.role || existing.status !== status`; a location-only update satisfies neither. The
      cached read is `listCachedActivePreachers` (`lib/supabase/data.ts:395-403`, `revalidate:
      SUPABASE_REFERENCE_CACHE_TTL_SECONDS = 20 * 60`, `lib/supabase/data.ts:148`), whose `StaffUser.locationIds`
      feeds `apps/*/app/api/sessions/route.ts:113-118` (an Assistant's `owningPreacherLocationIds`) and the
      `assignedPreacher` lookups in `apps/*/app/contact/page.tsx` and `apps/*/app/admin/invite/page.tsx`. A staff
      member's own scoping is unaffected — `lib/authz.ts` reads `public.users` uncached — so the drift is confined
      to cross-staff reads. Code in `lib/supabase/data.ts` is untouched by this diff and owned by stories 6/7.
    location: lib/supabase/data.ts:450
    severity: low
  - summary: >-
      `POST /api/admin/invite-user` validates the assigned Preacher with a trimmed id but forwards the untrimmed one,
      which Postgres rejects and which leaves a just-provisioned `auth.users` row orphaned.
    evidence: >-
      `apps/*/app/api/admin/invite-user/route.ts:39` validates `payload.assignedPreacherAirtableUserId?.trim()`
      through `findStaffUserById`, but `:65-66` forwards `payload.assignedPreacherAirtableUserId` untrimmed into
      `upsertStaffUser`, which writes it to the `assigned_preacher_id` uuid column (`lib/supabase/data.ts:426-428`
      update path, `:493-495` insert path) and throws the raw 22P02 (`lib/supabase/data.ts:439-441`, `:500-502`).
      On the insert path `auth.admin.createUser` has already run at `lib/supabase/data.ts:467-473`, so the failure
      surfaces as a 500 and leaves that auth user behind with no `public.users` row. Unreachable from the shipped
      form — `components/invite-user-form.tsx:267` sources the value from a `<select>` over
      `listCachedActivePreachers()` — and the route line is unchanged by this diff.
    location: apps/folk/app/api/admin/invite-user/route.ts:39
    severity: low
  - summary: >-
      `invite_log.airtable_user_id` and `audit_events.actor_airtable_user_id` are TEXT columns that now receive
      `public.users.id` UUIDs alongside the `rec*` ids the Airtable era wrote, with no discriminator.
    evidence: >-
      `lib/invite-log.ts` and `writeAuditEvent` (`lib/authz.ts`) keep their `*AirtableUserId` parameter names — a
      boundary this story's `Never` list deliberately holds — and the values they now receive are UUIDs
      (`apps/*/app/api/admin/invite-user/route.ts:78-82`, `:89-91`). Neither column carries a CHECK, so Postgres
      accepts both vocabularies and any future query joining audit history across the cutover has no way to tell
      which id space a row belongs to. Story 7 owns the rename sweep and playbook step 22's docs update.
    location: lib/invite-log.ts:10, lib/authz.ts:70
    severity: low
  - summary: >-
      `mapSession` wraps the single `preacher_id`/`location_id` columns in one-element arrays, so a legacy Airtable
      session that linked several preachers or locations cannot round-trip and its co-preachers lose access.
    evidence: >-
      `lib/supabase/data.ts:688-689` returns `preacherIds: row.preacher_id ? [row.preacher_id] : []` and the same
      for `locationIds`, over `SessionsRow.preacher_id: string | null` / `location_id: string | null`
      (`lib/supabase/data.ts:206-207`). The Airtable module it replaces read linked-record fields through
      `normalizeLinkedIds` (`lib/airtable.ts:672-673`), which preserves every linked id. Consequences at
      `apps/*/app/attendance/route.ts:141-143` (a co-preacher falls through to `403 "This session is outside your
      allowed scope."`) and `apps/*/app/registration/route.ts:112` (`422 "This attendance session is missing preacher
      or location routing."`). Unreachable until story 9's backfill loads legacy multi-value rows; the schema is
      story 1's and `data.ts` is story 7.3's.
    location: lib/supabase/data.ts:688
    severity: medium
  - summary: >-
      `InviteUserForm` has no re-entrancy guard in `handleSubmit`, so a second Enter during an in-flight first-time
      invite races the insert and surfaces as a 500.
    evidence: >-
      `components/invite-user-form.tsx:158` starts `handleSubmit` without an `if (isSubmitting) return`, and
      `disabled={isSubmitting}` at `:365` only blocks the button — a form-level submit (Enter in a text input) still
      fires. Both requests reach `upsertStaffUser`, both find no existing `public.users` row, and the loser hits the
      `createUser` already-registered path at `lib/supabase/data.ts:467-478`, which throws
      `AirtableRequestError(..., 500)`. The Airtable module created only a record, so no equivalent failure existed
      before the swap; both the form and the insert path are unchanged by this diff.
    location: components/invite-user-form.tsx:158
    severity: low
  - summary: >-
      The service worker's replay loop has no attempt counter and no dead-letter, so a queued POST that can never
      succeed is re-sent on every reconnect and the pending badge never clears.
    evidence: >-
      `public/sw.js:96-119` removes an entry only on `response.ok || response.status === 409`; anything else leaves
      it in IndexedDB and `notifyPendingCount()` keeps reporting it. This story preserves `sw.js` byte-for-byte by
      the intent's own `Always` list, and the id vocabulary crossing that boundary (a pre-swap `rec*` body replayed
      against a UUID-keyed lookup) is already recorded as a pass-1 deferral.
    location: public/sw.js:96
    severity: low
  - summary: >-
      After the `location_ids` guard change, no code path can ever empty a staff member's locations, because both
      invite routes submit `[]` whenever nothing is ticked.
    evidence: >-
      `lib/supabase/data.ts:429` now writes `location_ids` only for a non-empty array, `apps/*/app/api/admin/
      invite-user/route.ts:35` forces `[]` for Volunteer/Assistant and `normalizeLocationIds` (`:15-23`) returns
      `[]` when no box is checked, and `components/invite-user-form.tsx` submits `[]` in that case. This mirrors
      `lib/airtable.ts:508` exactly and is what the intent's re-invite acceptance criterion requires, so it is a
      faithful restoration rather than a regression — but it means revoking a Preacher's last location is no longer
      possible through any shipped surface, and story 6's location-management UI will need a distinct clearing path.
    location: lib/supabase/data.ts:429
    severity: low
  - summary: >-
      `app/dashboard/page.tsx` filters sessions by `createdBy.includes(staff.userId)` with no Admin escape hatch, so
      an Admin sees no live-session widget for sessions other staff created.
    evidence: >-
      `apps/*/app/dashboard/page.tsx:44` and `apps/*/app/api/sessions/route.ts:57` both filter on
      `session.createdBy.includes(staff.userId)` with no role check, while the RLS policy at
      `supabase/migrations/20261006010000_scoped_rls_policies.sql:190` grants Admin program-wide SELECT — an
      app-layer narrowing of the database grant. The diff changed only the field name on that line (the filter is
      byte-identical at `87425115c4ce2ddd93615331c882eb653ce33826`), and the intent's frozen
      "Admin all / Preacher own sessions" contract is the `GET /attendance` feed, which is intact at
      `apps/*/app/attendance/route.ts:141` (`staff.role === "Admin" || ...`).
    location: apps/folk/app/dashboard/page.tsx:44
    severity: medium
---

<intent-contract>

## Intent

**Problem:** `apps/folk` and `apps/gita-life` still reach every operational entity through `lib/airtable.ts`. Story 7.3 built `lib/supabase/data.ts` with a deliberately identical export surface and story 7.4 re-pointed `lib/authz.ts` at `public.users`, so `StaffContext.airtableUserId` now carries a UUID — but all 22 route/page files, two shared `lib/` modules, the `rec*`-shaped attendance-ID validator, and the misleading "Live updates from Airtable" dashboard caption still name and speak Airtable. Until the swap lands, the hosted Supabase project is not what any user-facing path reads from.

**Approach:** Change every `@/lib/airtable` import to `@/lib/supabase/data` — symbol names and call sites are already type-identical, so this is import-only — repoint the two transitive `lib/` type imports, delete the two now-impossible `syncStaffSupabaseUserId` calls in the sign-in route, migrate the `rec*` attendance-ID validator to the UUID shape while keeping its all-or-nothing rejection semantics, and complete the `StaffContext` field rename story 7.4 explicitly handed here. Response shapes, status codes, offline-queue behavior, and role scoping stay byte-for-byte identical.

## Boundaries & Constraints

**Always:**
- Swap the module specifier only. The imported symbol lists stay exactly as they are today — every name resolves in `lib/supabase/data.ts` with an identical signature (verified symbol-by-symbol).
- Keep `parseKnownAttendanceIds`'s all-or-nothing contract: it returns `null` (whole set discarded, not an error) when the list is empty, exceeds `MAX_KNOWN_ATTENDANCE_IDS`, or contains **any** id that fails the shape check. Only the shape predicate changes.
- Leave `apps/folk/app/api/auth/signin/route.ts` line 102 (`const supabaseUserId = await ensureSupabaseAuthUser(...)` immediately followed by `await syncStaffProfileByEmail({ supabaseUserId, email })`) structurally intact — `scripts/verify-program-readiness.mjs` asserts that exact shape.
- Rename `StaffContext.airtableUserId` → `userId` and `StaffContext.assignedPreacherAirtableUserId` → `assignedPreacherUserId` in `lib/authz.ts` and at every `staff.<field>` read site, including the one client component that consumes the `/api/auth/me` payload. The target names are the ones already written in `lib/authz.ts`'s own JSDoc.
- Preserve `/attendance` POST exactly: `{mobile, sessionId}` in; 400 invalid / 404 `notRegistered` / 409 `duplicate` / 201 created out, with the same JSON keys.
- Preserve the GET dashboard role scoping exactly: Admin all, Preacher own sessions, Volunteer/Assistant location-scoped, Assistant additionally via assigned preacher.
- Preserve `public/sw.js` and all three `proxy.ts` files byte-for-byte.

**Never:**
- No edits to `lib/airtable.ts`, `lib/supabase/types.ts`, `packages/airtable/**`, `packages/program-config/**` (including `shared-airtable.ts` and `getProgramAirtableManagementUrl`), or `supabase/migrations/**` — stories 3, 6 and 7 own those.
- No edit to `lib/supabase/data.ts`'s **export surface**: the module's exported names, parameter types and return shapes must stay exactly as story 7.3 left them, because the swap's type-cleanliness rests on that parity. The single permitted exception is the body-semantics fix in the `upsertStaffUser` task below, which corrects a verified divergence from the Airtable module rather than changing any signature. Any other `data.ts` defect this swap exposes is reported, not patched here.
- No rename of the **data-module** surface (`StaffUser.assignedPreacherAirtableUserId`, `StaffUser.invitedByAirtableUserId`, `upsertStaffUser(...)` params, `createSession({ preacherAirtableUserId })`, `createContact({ collectedByAirtableUserId, assignedPreacherAirtableUserId })`) or of **wire payload** keys shared with client forms (`ContactPayload.assignedPreacherAirtableUserId`, `InvitePayload.assignedPreacherAirtableUserId`, `components/contact-form.tsx`, `components/invite-user-form.tsx`) or of `lib/invite-log.ts`'s `airtableUserId` / `inviterAirtableUserId` or `writeAuditEvent`'s `actorAirtableUserId` — those mirror Postgres columns (`invite_log.airtable_user_id`, `invite_log.inviter_airtable_user_id`, `audit_events.actor_airtable_user_id`, `sessions.preacher_id`) and are story 7's rename sweep.
- No removal of `lib/authz.ts`'s `syncStaffProfileByEmail`. It is imported by three auth routes whose callers hold an email-Code-exchange `supabaseUserId` but **no session cookie**, so `getStaffContext()` cannot replace it; its name carries no Airtable vocabulary. (Story 7.4's Design Note guessed otherwise; code beats the note.)
- No change to `/manage/page.tsx`'s Airtable redirect, its "Manage Link Unavailable" copy, or `apps/*/app/layout.tsx` metadata — the handoff is still real until story 6 builds the portal and story 7 removes the config.
- No change at all to `apps/*/app/api/auth/{me,complete-implicit}/route.ts` or `apps/*/app/auth/confirm/route.ts` — none of them reads the renamed fields (they forward the `StaffContext` object wholesale).
- No new test runner, no new dependency, no edits to `scripts/verify-monorepo-guardrails.mjs` or `scripts/verify-program-readiness.mjs`.
- Do not delete `packages/data-contracts`'s unreferenced `StaffMembershipContext`, and do not ship `scripts/verify-supabase-data-module.mjs` (see Design Notes).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH | `GET /attendance?session=<uuid>&knownAttendanceIds=<uuid>,<uuid>` as Admin, valid UUIDs, ≤1000 ids | `200` with the dashboard feed; rows whose ids are in the set are filtered out by `getAttendanceBySessionRecord` | No error expected |
| HAPPY_PATH | `POST /attendance` with `{mobile, sessionId}` for a registered contact in an open session | `201 {id, mobile, userName, sessionId, createdAt}`; `id` is a UUID | No error expected |
| ERROR_CASE | `knownAttendanceIds` contains any non-UUID token | The entire set is discarded (`null`); the feed returns every session row unfiltered — same silent degradation as today, not a 4xx | No error surfaced |
| ERROR_CASE | `knownAttendanceIds` has >1000 ids, or the param is empty/absent | Same discard-to-`null` behavior; unchanged from today | No error surfaced |
| ERROR_CASE | `POST /attendance` for an unregistered mobile | `404 {error, notRegistered: true, mobile, sessionId}` | Unchanged |
| ERROR_CASE | `POST /attendance` replayed for a contact already marked in that session (offline-queue replay) | `409 {error, duplicate: true, id, mobile, userName, sessionId, createdAt}` — the SW treats 409 as synced | Unchanged |
| ERROR_CASE | `GET /attendance?session=<uuid>` for a Preacher who is not in `session.preacherIds` and has no overlapping `locationIds` | `403 {error: "This session is outside your allowed scope."}` | Unchanged |
| ERROR_CASE | `POST /api/auth/signin` where `public.users.id` ≠ the `auth.users` row found by that email | The Airtable self-heal write is gone; `syncStaffProfileByEmail` raises `AuthzError(403, "staff_not_found")` | 500 (route's catch-all), not a silent repair — see Design Notes |
| ERROR_CASE | An Admin re-invites an **existing** Preacher/Admin by email with no location ticked | `public.users.location_ids` keeps its previous value; the Preacher keeps their location scoping | No error; any loss of `location_ids` is a regression — see the `upsertStaffUser` task |
| HAPPY_PATH | An Admin invites a **brand-new** staff email for the first time | `public.users` row created, an account-setup invite is the email the invitee receives, and the Admin-facing message says the invite was sent (not "already exists") | Delivery is Supabase/SMTP-routed end to end; no error expected |
| ERROR_CASE | `GET /attendance` with no Supabase session | `authzErrorResponse` → `401 {error, code: "unauthenticated"}` | Unchanged |

</intent-contract>

## Code Map

**Swap set — 22 app files, all `import ... from "@/lib/airtable"`, all server-only. Per app, byte-identical unless noted.**

API route handlers:
- `app/api/registration/route.ts:1-10` — 8 names; `:11` type-imports `getSessionAttendanceEligibility`.
- `app/api/contact/route.ts:2-9` (folk; gita-life `:2`, 5 names — no `findLocationById`) — the only file also touching `createContact({collectedByAirtableUserId, assignedPreacherAirtableUserId})` (`:147-148` / `:128-129`); those param names stay.
- `app/api/sessions/route.ts:2-8` — 5 names; local `preacherAirtableUserId` (`:131`) is a local, keep or neutralize freely.
- `app/api/admin/locations/route.ts:2` — 2 names.
- `app/api/admin/invite-user/route.ts:2` — 4 names; `:57` maps `locationIds` through `findLocationById`.
- `app/api/volunteers/invite/route.ts:2` — 4 names; `:86-87` reads `existing.assignedPreacherAirtableUserId` off the `StaffUser` shape — stays.
- `app/api/auth/signin/route.ts:1` — the **only** `@/lib/airtable` symbol with no Supabase counterpart: `syncStaffSupabaseUserId` (also at `:65`, `:84`).
- `app/attendance/route.ts:3-12` — 8 names; **not** under `api/`; carries the `rec*` validator at `:16-38` and the local `airtableRecords` at `:124`.

Pages (all `export const dynamic = "force-dynamic"`, server components):
- `app/dashboard/page.tsx:6` — `listLocations, listSessions, type SessionRecord`; `:44` reads `staff.airtableUserId`.
- `app/sessions/page.tsx:5` — `findStaffUserById, listLocations`; `:18,21` read the assigned-preacher fields.
- `app/contact/page.tsx:6` — folk `findStaffUserById, listCachedActivePreachers, listLocations`; gita-life imports only `listCachedActivePreachers`. **Do not unify these two.**
- `app/admin/invite/page.tsx:6` — `listCachedActivePreachers, listLocations`.

Shared `lib/` transitive couplings (type-only, but they are what makes routes reach Airtable):
- `lib/attendance-session.ts:3` — `import type { SessionRecord } from "@/lib/airtable"`; pure window logic, consumed by `api/registration` and `attendance` in both apps.
- `lib/invite-log.ts:3` — `import type { StaffRole } from "@/lib/airtable"`; consumed by both invite routes per app. Already writes to `invite_log` in Postgres.

**Rename set — `staff.<field>` reads of the two renamed `StaffContext` fields:**
`lib/authz.ts:24,35` (declaration + JSDoc) and `:128,133` (mapper); then per app: `app/manage/page.tsx:37`; `app/api/contact/route.ts` `:64,67,71,137` (folk) / `:55,58,62,119` (gita-life); `app/api/volunteers/invite/route.ts` `:48,113,123`; `app/api/sessions/route.ts` `:57,100,104,111,136`; `app/api/admin/invite-user/route.ts` `:67,79`; `app/attendance/route.ts` `:135,136,140`; `app/sessions/page.tsx` `:18,21`; `app/contact/page.tsx` `:18,19`; `app/dashboard/page.tsx` `:44`; and the one client reader `components/pwa-install-prompt.tsx:65,112`. That client reader builds `pwa-install-dismissed:${staff.<field>}`; both field values are `public.users.id` (story 7.4 already set `airtableUserId: row.id`), so the rendered key string is byte-identical before and after the rename and **no dismissal is lost** — no localStorage migration is needed.

**Verified body-semantics divergences in `lib/supabase/data.ts` (must be reconciled by this story):**
- `upsertStaffUser` update branch, `lib/supabase/data.ts:429-431` — `if (Array.isArray(data.locationIds))` writes `location_ids` for *any* array, including `[]`. The Airtable module it replaces guards with `data.locationIds?.length` (`lib/airtable.ts:508`), skipping the write entirely. Reachability: `apps/folk/app/api/admin/invite-user/route.ts:70` always forwards an array, `:35` forces `[]` for Volunteer/Assistant, and `components/invite-user-form.tsx:164` submits `[]` when nothing is ticked. Consequence: re-inviting an existing Preacher to correct a name wipes their locations, after which `apps/folk/app/attendance/route.ts:142-143` returns `403 "This session is outside your allowed scope."` and `apps/folk/app/api/contact/route.ts:122` returns `422 "The assigned Preacher has no configured locations."`.
- `upsertStaffUser` insert path, `lib/supabase/data.ts:458-481` — provisions an `auth.users` row (`listUsers` → `createUser`) before returning. The Airtable module created only a record (`lib/airtable.ts:518-520`). Because the invite routes call `sendStaffInviteEmail` *after* `upsertStaffUser` (`apps/folk/app/api/admin/invite-user/route.ts:63` then `:73`; `apps/folk/app/api/volunteers/invite/route.ts:109` then `:117`), `inviteUserByEmail` (`lib/supabase/invite.ts:61`) now always errors as already-registered, `isExistingAuthUserError` (`:25-28`) matches, and the function falls through to `signInWithOtp` (`:92`) returning `delivery: "sign-in-link"` (`:109`). The route answers `201 {invited: true, delivery: "sign-in-link"}` and `components/invite-user-form.tsx:184` renders "This user already exists. A sign-in email was sent." for a user who did not exist. This is inherent to Supabase/SMTP invite routing (`inviteUserByEmail` creates the auth user, so `createUser` afterwards necessarily reports already-registered) and the invite flow — not this story's to redesign — but the Admin-facing message and the recorded `invite_log` must stop asserting "already exists" for a first-time invitee.

**Read-only references that constrain the diff:**
- `lib/supabase/data.ts` — export parity confirmed symbol-by-symbol: `normalizeMobile`, `findStaffUserByEmail`, `findStaffUserById`, `listActivePreachers`, `listCachedActivePreachers`, `upsertStaffUser`, `findContactByPhone`, `getContactsByRecordIds`, `createContact`, `findSessionById`, `listSessions`, `findLocationById`, `findLocationByName`, `listLocations`, `listCachedLocations`, `createLocation`, `createSession`, `updateSessionAttendanceUrl`, `findAttendanceByContactAndSession`, `createAttendanceRecord`, `getAttendanceByDate`, `getAttendanceBySession`, `getAttendanceByRecordIds`, `getAttendanceBySessionRecord`, `getAttendanceDashboardRecords`. `findLocationById` returns the same `AirtableRecord<LocationFields>` envelope; `createSession`/`createAttendanceRecord`/`createContact`/`upsertStaffUser` take the same param objects. `mapSession` populates `preacherIds`, `locationIds`, `createdBy`, the attendance window fields and `attendanceUrl`. `getAttendanceBySessionRecord` accepts `Pick<SessionRecord,"id">` plus `knownAttendanceIds` and does its own filtering, so the GET dedupe survives the swap. **Parity is a surface property only** — the two body-semantics divergences listed above were not caught by it, which is why `typecheck`/`build`/`lint` all pass over them.
- `lib/airtable.ts:530` — `syncStaffSupabaseUserId`, Airtable-only. `lib/supabase/data.ts` maps `StaffUser.supabaseUserId` to `public.users.id` (`:328`), and `public.users.id` is the PK referencing `auth.users.id`, so the write has no target.
- `scripts/verify-program-readiness.mjs:33-41` — asserts the sign-in route still contains `syncStaffProfileByEmail`, `ensureSupabaseAuthUser(...): Promise<string>`, and the adjacent `await` pair. `:45-47` asserts `lib/airtable.ts` still has its ID-resolution code (untouched here); `:53-62` asserts `shared-airtable.ts` table ids (untouched here).
- `scripts/verify-monorepo-guardrails.mjs:10-19` — `serverOnlySpecifierPrefixes` lists `@/lib/airtable` but not `@/lib/supabase/data`. Leaving it is safe: unused entries are inert and `lib/supabase/data.ts:1` carries its own `import "server-only"`, so `next build` is the backstop.
- `.github/workflows/quality-gates.yml` — CI runs exactly `pnpm guardrails`, `pnpm typecheck:workspace`, `pnpm build:apps`, `pnpm lint`. `test:program-readiness` is **not** in CI, so it is a local invariant to honor, not a gate.
- `public/sw.js:6,121-123,242-266,96-119,108` — `QUEUED_POST_PATHS`, synthetic `202 {success:false, queued:true, message}`, verbatim-URL replay, `response.ok || status === 409` ⇒ synced. Zero Airtable/`rec` references. `apps/*/public` are symlinks to the single root `public/`, so there is one copy.
- `apps/{folk,gita-life}/app/api/auth/me/route.ts` — `Response.json({ staff })`, so the `StaffContext` rename is visible on this endpoint's body.
- `components/live-attendance-dashboard.tsx:266` — the "Live updates from Airtable" caption; `:34,74,89-91` produce the `knownAttendanceIds` query param out of `AttendanceDashboardRecord.id`, which is now a UUID.
- `lib/supabase/types.ts:328,335,507,575` etc. and `invite_log.airtable_user_id` / `audit_events.actor_airtable_user_id` — Postgres column names; the reason the remaining `*Airtable*` identifiers are out of scope here.

## Tasks & Acceptance

**Execution:**
- `apps/*/app/api/registration/route.ts`, `api/contact/route.ts`, `api/sessions/route.ts`, `api/admin/locations/route.ts`, `api/admin/invite-user/route.ts`, `api/volunteers/invite/route.ts`, `app/attendance/route.ts`, `app/dashboard/page.tsx`, `app/sessions/page.tsx`, `app/contact/page.tsx`, `app/admin/invite/page.tsx` — REPINT — replace `"@/lib/airtable"` with `"@/lib/supabase/data"`; change nothing else. Keep `gita-life/app/contact/page.tsx` importing only `listCachedActivePreachers` and folk's importing all three.
- `apps/*/app/api/auth/signin/route.ts` — REPINT + DELETE — import `findStaffUserByEmail` from `@/lib/supabase/data`; drop `syncStaffSupabaseUserId` from the import and delete its two call sites (`:65`, `:84`) plus the now-unused `staffUserId` parameter on `ensureSupabaseAuthUser` and its argument at the `:102` call. Keep the `:102`→`:103` adjacent `await` pair and the `Promise<string>` return annotation.
- `lib/attendance-session.ts` — REPINT — `import type { SessionRecord }` from `@/lib/supabase/data`.
- `lib/invite-log.ts` — REPINT — `import type { StaffRole }` from `@/lib/supabase/data`.
- `apps/*/app/attendance/route.ts:33` — MIGRATE — replace `/^rec[a-zA-Z0-9]{4,32}$/` with a UUID shape assertion covering the canonical 8-4-4-4-12 hyphenated form, case-insensitive; leave `MAX_KNOWN_ATTENDANCE_IDS`, the empty-list check, the length cap and the `return null` semantics untouched. Rename the local `airtableRecords` to a source-neutral name.
- `components/live-attendance-dashboard.tsx:266` — EDIT — the caption must stop naming Airtable as the live feed's source; a source-neutral phrase (e.g. "Live updates") is acceptable.
- `lib/authz.ts:19-35,128,133` — RENAME — `StaffContext.airtableUserId` → `userId`, `StaffContext.assignedPreacherAirtableUserId` → `assignedPreacherUserId`; replace the "story 5's work" JSDoc with a statement of what each field now holds. `writeAuditEvent`'s `actorAirtableUserId` param is unchanged.
- `apps/*/app/manage/page.tsx`, `api/contact/route.ts`, `api/volunteers/invite/route.ts`, `api/sessions/route.ts`, `api/admin/invite-user/route.ts`, `app/attendance/route.ts`, `app/sessions/page.tsx`, `app/contact/page.tsx`, `app/dashboard/page.tsx`; `components/pwa-install-prompt.tsx:65,112` — RENAME READERS — rewrite only `staff.airtableUserId` and `staff.assignedPreacherAirtableUserId` to the new names. Payload interfaces, `StaffUser` fields, `existing.assignedPreacherAirtableUserId`, and the Airtable-named argument keys stay — including `preacherAirtableUserId` at `apps/*/app/api/sessions/route.ts:131`, which maps to `sessions.preacher_id` and must stay in step with `createSession`'s signature.
- `lib/supabase/data.ts:429-431` — FIX BODY SEMANTICS — change the `upsertStaffUser` update branch's guard from `if (Array.isArray(data.locationIds))` to `if (data.locationIds?.length)` so it mirrors `lib/airtable.ts:508` and an empty array leaves an existing staff member's `location_ids` untouched. Signature and every other line of the function stay unchanged.
- `apps/*/app/api/admin/invite-user/route.ts` — CORRECT FIRST-INVITE REPORTING — the route already forwards the real `delivery` value from `sendStaffInviteEmail` (`delivery: "invite" | "sign-in-link"`), so no response change is needed. Verify only that the route does not itself claim an existing user. Do not redesign `sendStaffInviteEmail`, change its Supabase/SMTP routing, or alter the invite email template — the OTP-vs-invite distinction is owned by story 8's SMTP work. Record the first-time-invitee caveat as a comment at the call site so the next reader knows `delivery: "sign-in-link"` is now the expected shape for *every* invite, not a signal that the account pre-existed.

**Acceptance Criteria:**
- Every grep below carries `--exclude-dir=.next --exclude-dir=node_modules`; `apps/*/.next/` holds stale build output (including `"@hkmc/airtable"` in `required-server-files.json`) and is not source.
- Given the repo after the change, when I `grep -rn --exclude-dir=.next --exclude-dir=node_modules "@/lib/airtable" apps components lib`, then zero lines match.
- Given the repo after the change, when I `grep -rn --exclude-dir=.next --exclude-dir=node_modules "@hkmc/airtable" apps components lib`, then zero lines match (the workspace dependency declarations in `apps/*/package.json` and `apps/*/tsconfig.json` are story 7's).
- Given the repo after the change, when I `grep -rn --exclude-dir=.next --exclude-dir=node_modules "recXXXXXXXXXXXX\|\^rec\|rec\[a-zA-Z0-9\]" apps components`, then zero lines match; the only `rec*` patterns left in the repo are `lib/airtable.ts:258-259` and `lib/supabase/data.ts:245`, both owned by stories 6/7 (see Design Notes).
- Given `apps/*/app/attendance/route.ts`, when I `grep -n "parseKnownAttendanceIds\|MAX_KNOWN_ATTENDANCE_IDS"`, then the empty-list check, the `> MAX_KNOWN_ATTENDANCE_IDS` check and the `return null` on any bad id are all still present, with only the id-shape predicate differing.
- Given the repo after the change, when I `grep -rn --exclude-dir=.next --exclude-dir=node_modules "staff\.airtableUserId\|staff\.assignedPreacherAirtableUserId" apps components lib`, then zero lines match; when I `grep -n "airtableUserId\|assignedPreacherAirtableUserId" lib/authz.ts`, then zero lines match — `writeAuditEvent`'s parameter is `actorAirtableUserId`, which neither pattern matches.
- Given `git diff --name-only`, when I inspect the paths, then `public/sw.js`, `proxy.ts`, `apps/folk/proxy.ts`, `apps/gita-life/proxy.ts`, `lib/airtable.ts`, `lib/supabase/types.ts`, `packages/` and `supabase/` do not appear. `lib/supabase/data.ts` is the one file expected to appear, and only for the single `upsertStaffUser` guard line below.
- Given `lib/supabase/data.ts` after the change, when I `grep -n "Array.isArray(data.locationIds)"`, then the match survives at the **insert** path (where `insertPayload.location_ids` correctly defaults to `[]` for a brand-new staff member) and is gone from the **update** path, which now mirrors `lib/airtable.ts:508`'s non-empty check.
- Given `pnpm guardrails`, then it exits 0; `pnpm typecheck:workspace` passes for all 7 projects; `pnpm build:apps` builds folk and gita-life; `pnpm lint` reports no new errors.
- Given `node scripts/verify-program-readiness.mjs`, then it exits 0 — in particular the sign-in route still satisfies the `syncStaffProfileByEmail` + adjacent `ensureSupabaseAuthUser` assertions.
- Given `lib/supabase/data.ts`'s `upsertStaffUser`, when I read its update branch, then the `location_ids` write is guarded by a non-empty check matching `lib/airtable.ts:508`'s `data.locationIds?.length` — not by `Array.isArray` alone.
- Given an existing `public.users` row with `location_ids = [locA, locB]` and an Admin who re-invites that email with `locationIds: []` (exactly what `apps/folk/app/api/admin/invite-user/route.ts:35`/`:70` and `components/invite-user-form.tsx:164` produce when nothing is ticked), then `public.users.location_ids` is still `[locA, locB]` and the staff member's location scoping still passes the branch at `apps/*/app/attendance/route.ts:142-143` and the guard at `apps/*/app/api/contact/route.ts:118-124`.
- Given a first-time invite through `POST /api/admin/invite-user`, then the `delivery` value the route returns is whatever `sendStaffInviteEmail` produced — never a route-local assertion that the account already existed — and `invite_log.status` reflects the real send outcome. A `delivery` of `sign-in-link` is expected for every invite after this swap (Supabase's `inviteUserByEmail` itself creates the auth user); what is fixed here is that nothing in this diff *claims* the user pre-existed.
- Given a signed-in staff member with an active `public.users` row, when I call `GET /api/auth/me`, then `200 {staff}` carries `userId` and `assignedPreacherUserId` (not the old keys), and the PWA install prompt still renders (its dismissal key now derives from `userId`).
- Given the frozen `/attendance` contract, when I exercise `POST` with an unregistered mobile, a duplicate, and a fresh contact, then I observe `404 {notRegistered:true}`, `409 {duplicate:true, id}` and `201 {id, userName}` with no change to any other key.
- Given `GET /attendance?session=<uuid>&knownAttendanceIds=<uuid>` as Admin, then the response omits rows whose ids appear in the set; and when the same param carries one non-UUID token, then the response contains every session row (the set is discarded, not rejected).
- Given `GET /attendance?session=<uuid>` as a Preacher outside `preacherIds` and `locationIds`, then the response is `403`.

## Spec Change Log

### 2026-10-06 — review pass 1 (`bad_spec` loopback trigger)

- **Triggering findings:** Verification Gap #1 (`upsertStaffUser`'s Supabase update branch clears `location_ids` on an empty array, where the Airtable module it replaced skipped the write entirely) and #2 (the Supabase `upsertStaffUser` provisions an `auth.users` row *before* the invite route calls `sendStaffInviteEmail`, so every brand-new invitee receives a sign-in link and the Admin is told "This user already exists"). Both are `high`, and both are reachable: `apps/folk/app/api/admin/invite-user/route.ts:70` (and its gita-life twin) always forwards a `locationIds` array, `apps/folk/app/api/admin/invite-user/route.ts:35` forces `[]` for Volunteer/Assistant, and `components/invite-user-form.tsx:164` submits `[]` whenever nothing is ticked.
- **What was amended:**
  1. `## Code Map` — the read-only note that "`upsertStaffUser` … take[s] the same param objects" is corrected and scoped: the *types* are identical (so the swap type-checks), but the *body semantics* diverge. A new row records both divergences with file:line evidence, the reachability chain, and the consequence (existing staff silently lose location scoping; new invitees get the wrong email and the wrong Admin-facing message).
  2. `## Code Map` — the Code Map's claim that "a rename changes the key, so previously-dismissed users see the prompt once more" is **retracted as false**. `lib/authz.ts` already set `airtableUserId: row.id` in story 7.4, so the rendered localStorage key string `pwa-install-dismissed:<public.users.id>` is byte-identical before and after the rename. No dismissal is lost and no migration is needed.
  3. `## Code Map` — `preacherAirtableUserId` (the `createSession` argument key at `apps/folk/app/api/sessions/route.ts:131`) is added to the enumerated "stays" list alongside the other Airtable-named keys, so the Design Note's justification rule covers it.
  4. `## Boundaries & Constraints → Never` — the blanket "No edits to … `lib/supabase/data.ts`" is narrowed. Export *surface* parity is still an invariant, but a verified body-semantics divergence between the two data modules is now in scope to fix, because the swap is what activates it.
  5. `## Tasks & Acceptance` — a new task fixes `lib/supabase/data.ts`'s `upsertStaffUser` to mirror the Airtable guard (`data.locationIds?.length`), plus an acceptance criterion for both apps' invite routes and both invite forms.
- **Known-bad state avoided:** an import swap that type-checks and builds cleanly while silently (a) wiping `public.users.location_ids` on every re-invite submitted without locations — costing that Preacher `403 "This session is outside your allowed scope."` at `apps/folk/app/attendance/route.ts:142-143` and `422 "The assigned Preacher has no configured locations."` at `apps/folk/app/api/contact/route.ts:122` — and (b) converting every first-time staff invite from an account-setup invite into an OTP sign-in link while `components/invite-user-form.tsx:184` reports "This user already exists" to the Admin. Both would have shipped green through `guardrails`, `typecheck`, `build`, `lint` and `verify-program-readiness.mjs`, because the two modules' types are identical and the repo has no test that executes a route.
- **KEEP instructions (must survive re-derivation):**
  - The swap itself was correct and mechanical — keep it import-only, symbol-for-symbol, with `gita-life/app/contact/page.tsx` left importing only `listCachedActivePreachers`. Do not "helpfully" unify it with folk's three-name import.
  - `apps/*/app/api/auth/signin/route.ts`: keep the adjacent `await ensureSupabaseAuthUser(...)` → `await syncStaffProfileByEmail({ supabaseUserId, email })` pair and the `Promise<string>` annotation exactly as they are — `scripts/verify-program-readiness.mjs:33-41` asserts both.
  - Keep `syncStaffSupabaseUserId` deleted, not reimplemented. The Design Notes' reasoning (public.users.id is the PK/FK, so there is no column to write) is verified and the self-heal it removes is already impossible.
  - Keep `syncStaffProfileByEmail` in place. Story 7.4's note that story 5 would inline `getStaffContext` is wrong on the code: its three callers hold an email-Code-exchange `supabaseUserId` and no session cookie.
  - Keep `parseKnownAttendanceIds`'s all-or-nothing `return null` semantics and its `MAX_KNOWN_ATTENDANCE_IDS` cap; only the id-shape predicate changed. The 12-case run against the shipped source (canonical/uppercase/padded UUIDs accepted; one bad token, a legacy `rec*` id, a hyphenless 36-char token, an over-long token, empty, absent, commas-only → `null`; 1000 accepted, 1001 discarded) is the reference behaviour.
  - Keep `ATTENDANCE_ID_PATTERN` as a named module constant rather than an inline literal, so `parseKnownAttendanceIds` stays inside the file's 120-column width.
  - Keep the `StaffContext` rename confined to the authz boundary: `staff.airtableUserId` → `staff.userId`, `staff.assignedPreacherAirtableUserId` → `staff.assignedPreacherUserId`, and nothing else. The data-module return shape (`StaffUser.*`), the wire payload keys shared with `components/contact-form.tsx` and `components/invite-user-form.tsx`, `lib/invite-log.ts`'s `airtableUserId`/`inviterAirtableUserId` and `writeAuditEvent`'s `actorAirtableUserId` all mirror Postgres columns and stay for story 7's sweep.
  - Keep `public/sw.js` and all three `proxy.ts` files byte-for-byte untouched.
  - Keep the deferred ledger entries from pass 1 — re-defer them, do not delete them.

## Review Triage Log

### 2026-10-06 — Review pass

- verdicts: 42 findings — high 2, medium 15, low 20, false 5, maybe-false 0
- findings:
  - `[high]` `[bad_spec]` Verification Gap #1 — `upsertStaffUser`'s Supabase update branch writes `location_ids` for *any* array including `[]` (`lib/supabase/data.ts:429-431`), where the Airtable module it replaced only wrote when the array was non-empty (`lib/airtable.ts:508`, `data.locationIds?.length`). Reachable: `apps/folk/app/api/admin/invite-user/route.ts:70` always forwards an array, `:35` forces `[]` for Volunteer/Assistant, and `components/invite-user-form.tsx:164` submits `[]` when nothing is ticked. Re-inviting an existing Preacher to correct a name wipes their locations; they then hit `403 "This session is outside your allowed scope."` at `apps/folk/app/attendance/route.ts:142-143` and `422 "The assigned Preacher has no configured locations."` at `apps/folk/app/api/contact/route.ts:122`. Neither `typecheck`, `build`, `lint`, `guardrails` nor `verify-program-readiness.mjs` can see it — the two modules' types are identical. The spec asserted body-level parity and forbade editing `lib/supabase/data.ts`, so the spec drew the line where the intent did not; **amendment 1 and 5** in the Spec Change Log.
  - `[high]` `[bad_spec]` Verification Gap #2 — the Supabase `upsertStaffUser` insert path provisions an `auth.users` row before returning (`lib/supabase/data.ts:461-479`), where the Airtable module created only a record (`lib/airtable.ts:518-520`). `apps/folk/app/api/admin/invite-user/route.ts:73` then calls `sendStaffInviteEmail`, whose `inviteUserByEmail` (`lib/supabase/invite.ts:61`) returns an already-registered error, `isExistingAuthUserError` (`lib/supabase/invite.ts:25-28`) matches, and the function falls through to `signInWithOtp` (`:92`) returning `delivery: "sign-in-link"` (`lib/supabase/invite.ts:109`). The route answers `201 {invited:true, delivery:"sign-in-link"}` and `components/invite-user-form.tsx:184` renders "This user already exists. A sign-in email was sent." for a user that did not exist. The Airtable/SMTP flow's `inviteUserByEmail` → `createUser` → `inviteUserByEmail` chain makes the Supabase outcome the correct one, so the regression is *silently changing what every new staff member receives*. **Amendment 1 and 4** in the Spec Change Log.
  - `[medium]` `[defer]` Verification Gap #5 + Blind Hunter #9 + Intent Alignment #1 — the `rec*`→UUID `knownAttendanceIds` predicate, and the preserved `/attendance` HTTP and service-worker offline contracts, have no committed executable coverage. Verified rather than assumed: no `*.test.*`/`*.spec.*` files exist outside `node_modules`, no vitest/jest/node:test dependency exists in any package.json, and `.github/workflows/quality-gates.yml:37-47` runs guardrails/typecheck/build/lint only, so `scripts/verify-program-readiness.mjs` and `scripts/verify-rls.mjs` are the only executable verifiers and neither exercises a route. This story's out-of-band 12-case run did exercise the shipped `parseKnownAttendanceIds` and passed, but that harness lives outside the repo. Not this story's problem: `stories.yaml` story 8 assigns "the CAP-3/5/6 verification suite" plus fixture seeding and preview-deployment verification, which is exactly this surface. Carried into the spec's `deferred:` ledger.
  - `[medium]` `[defer]` Verification Gap #3 + Edge Case Hunter #1 and #2 — with the Airtable self-heal deleted, an `auth.users` row whose id differs from `public.users.id` now yields `AuthzError(403,"staff_not_found")` → HTTP 500 (`apps/folk/app/api/auth/signin/route.ts:94-95` → `lib/authz.ts:136-157`), and Edge Case Hunter's create branch shows the companion orphan case: `supabaseAdmin.auth.admin.createUser` at `:64-68` mints an id that can never equal a `public.users.id` referencing a deleted auth user. Pre-verified by the layer's own evidence rules and routed to defer. Already recorded as a pass-1 `deferred:` entry; the story 8 fixture seeding is where corrupt seed data surfaces.
  - `[medium]` `[defer]` Edge Case Hunter #9 — `sessions.created_by` is nullable with `ON DELETE SET NULL` (`supabase/migrations/20261004000000_create_core_tables.sql:56`, `supabase/migrations/20261006000000_add_users_and_contact_columns.sql:52-53`), so deleting a `public.users` row nulls it, `mapSession` yields `createdBy: []` (`lib/supabase/data.ts:695`), and `apps/folk/app/dashboard/page.tsx:44` plus `apps/folk/app/api/sessions/route.ts:57` filter on `createdBy.includes(staff.userId)` — hiding the session from *everyone, Admin included*. Pre-existing: the filter predates this diff (only the field name moved) and RLS has the same shape (`20261006010000_scoped_rls_policies.sql:190` gives Admin program-wide SELECT), so this is an app-layer gap against RLS, not a swap defect.
  - `[medium]` `[defer]` Verification Gap, other #1 — `lib/supabase/data.ts:462` resolves the existing auth user with a single `listUsers({page:1, perPage:200})` while `lib/supabase/auth-email-branding.ts:31-43` and `apps/folk/app/api/auth/signin/route.ts:23-42` both paginate to exhaustion. Past 200 auth users the invite routes miss the match and `createUser` fails with already-registered, surfacing as a 500. Untouched by this diff and already recorded in story 7.3's `deferred:` ledger; routed to defer as pre-existing.
  - `[medium]` `[defer]` Verification Gap, other #2 — `authzErrorResponse` (`lib/authz.ts:207-215`) ignores `AirtableRequestError.status`, so the 409s raised on unique violations by `createAttendanceRecord` (`lib/supabase/data.ts:1002-1005`) and `createContact` (`:674-677`) reach the client as a 500 carrying the raw Postgres message. Narrower than filed: the frozen `409 duplicate` contract at `apps/folk/app/attendance/route.ts:79-90` is reached through `findAttendanceByContactAndSession` returning a record, not a throw, so only the concurrent double-POST race and the equivalent race in `api/contact` reach this path. The catch-all sites and the throw sites all pre-date this diff.
  - `[medium]` `[defer]` Verification Gap, other #3 — `getAttendanceBySessionRecord` (`lib/supabase/data.ts:1094-1115`) ignores the session's attendance window and `attendanceRecordIds`, which the Airtable version applied (`lib/airtable.ts:894-899`), and `mapSession` never populates `attendanceRecordIds` (`:691`). Story 7.3 shipped this deliberately; `rls-policy-matrix.md` and `data-model-mapping.md` own the window semantics. The `knownAttendanceIds` path the GET actually uses still filters, so the incremental-fetch contract is intact.
  - `[medium]` `[defer]` Blind Hunter #13 + Verification Gap #4 — the only assertion path over the changed sign-in route is `scripts/verify-program-readiness.mjs:33-41`, which matches file *text* and so can never observe a response or the removed relink write, and it is absent from `.github/workflows/quality-gates.yml:37-47` and from the root `quality:ci` chain, so a PR breaking the adjacency invariant merges green. Verified by running it (exit 0) and reading the workflow. Pre-existing CI configuration rather than something this change caused; recorded with the recommendation to add the step.
  - `[medium]` `[defer]` Intent Alignment #4 — the id vocabulary crossing the offline-queue boundary changed while the queue files did not: `public/sw.js` replays pre-swap `rec*`-bearing bodies to UUID-keyed lookups, and `/attend?session=rec…` links already handed out would miss. Not reachable for users yet — `SPEC.md`'s topology constraint states the branch deployment stays dark until all migration work completes, and the live deployment is a separate preview on the old stack — so no pre-swap `rec*` artifact exists for this deployment. Story 8's CAP-5/CAP-6 run and story 9's cutover are the designated verification points.
  - `[low]` `[defer]` Blind Hunter #1, #2, #3, #4, #5 + Intent Alignment #3 — repo docs go stale against this diff: `docs/architecture.md:48-61` and `docs/data-models.md:280,285` inline the pre-rename `StaffContext` fields; `docs/api-contracts.md:29,40,42` still describes sign-in as Airtable-backed and advertises the "Syncs Supabase user ID to Airtable if needed" step this diff deletes; `:134,155` still shows `recXXXXXXXXXXXX` / `knownAttendanceIds=recA,recB`; `packages/data-contracts/src/index.ts:10-20`'s unreferenced `StaffMembershipContext` still declares the old field names. All are pre-existing surfaces the intent does not claim: `stories.yaml` story 7 explicitly owns "update docs/data-models.md, docs/architecture.md, and docs/api-contracts.md to the Supabase-only reality", and `docs/api-contracts.md:155`'s "max 100" was already wrong against a 1000 cap. Deferred with the pointer recorded.
  - `[low]` `[defer]` Blind Hunter #12 + Edge Case Hunter #11 — `lib/airtable.ts` now has zero runtime importers; its only remaining edges are `packages/airtable/src/index.ts:3` and the `@hkmc/airtable` manifest/tsconfig declarations, and its `syncStaffSupabaseUserId` export (`:530`) is orphaned by this diff's deletion of its last two call sites. Correct as-is: story 7 is the story that deletes the file, and the spec records this so the removal is one step.
  - `[low]` `[patch]` Blind Hunter #10 — `apps/folk/app/api/sessions/route.ts:131` keeps the `preacherAirtableUserId` key, which matches neither of the Design Note's two justifications (Postgres column / shared wire payload) and appeared in no enumeration. **Amendment 3** adds it to the enumerated "stays" list; the key maps to `sessions.preacher_id` and must stay in step with `createSession`'s signature.
  - `[low]` `[patch]` Blind Hunter #11 — the spec's Code Map claims a rename of the localStorage key means "previously-dismissed users see the prompt once more". **Amendment 2 retracts it**: `lib/authz.ts` already set `airtableUserId: row.id` in story 7.4, so the rendered key string is byte-identical. Worth correcting because an uncorrected false warning would send a later story writing a migration for a problem that does not exist.
  - `[low]` `[reject]` Blind Hunter #6 — `lib/invite-log.ts:10-11,23-24` and `lib/authz.ts:70,83` keep Airtable-named parameters that now carry a `public.users.id` UUID, with no comment recording the value-space change. Real but cosmetic: every one of those names maps to a Postgres column (`invite_log.airtable_user_id`, `invite_log.inviter_airtable_user_id`, `audit_events.actor_airtable_user_id`), the function signatures are unchanged, and the fix is added commentary rather than a correction or deletion.
  - `[low]` `[reject]` Blind Hunter #7 + Verification Gap, other #4 — `scripts/verify-monorepo-guardrails.mjs:10-19` still lists `@/lib/airtable` and omits `@/lib/supabase/data`, so the client type-import advisory no longer fires for the module holding the shared entity types. Client reachability is still caught by `lib/supabase/data.ts:1`'s own `import "server-only"` (and `pnpm build` proves it: it passed). The fix is a new guardrail rule, which is beyond a direct correction, and story 7 owns the list when it removes the dependency.
  - `[low]` `[reject]` Edge Case Hunter #3, #4, #5, #6, #7, #8 — non-UUID ids arriving from the wire now produce a PostgREST 22P02 surfaced as a 500 rather than the intended 4xx, at `attendance/route.ts:55`/`:128`, `api/contact/route.ts:74-79`/`:126`, `api/admin/invite-user/route.ts:50`/`:57`, `api/sessions/route.ts:95`, and `api/volunteers/invite/route.ts:57`. Grouped as one root cause: no UUID validation on ids that are now uuid columns. Every one of those values is server-generated — location and preacher dropdown options come from `listLocations()`/`listCachedActivePreachers()`, and `sessionId` comes from a session record — so I could not show the shipped UI reaching it, and the fix adds a guard branch at six sites.
  - `[low]` `[reject]` Edge Case Hunter #10 — `ATTENDANCE_ID_PATTERN` is case-insensitive but `parseKnownAttendanceIds` returns the Set with original casing, so an uppercased id would not match Postgres's lowercase `record.id`. Unreachable from the shipped client: `components/live-attendance-dashboard.tsx:74` builds the parameter from ids the server itself returned, and the same case-sensitivity existed pre-swap. The fix is added normalization.
  - `[low]` `[reject]` Edge Case Hunter #12 — a pre-swap `rec*`-bearing `/attendance` body replayed by the service worker would return 500 and stay queued. Unreachable for users per the topology constraint cited above (this deployment is dark until cutover, and a non-2xx non-409 response leaves an item queued by design — a 4xx guard would not clear it either).
  - `[low]` `[reject]` Intent Alignment #5 — `rec*` literals survive at `lib/airtable.ts:259` and `lib/supabase/data.ts:245`, the latter on the attendance read path. Already recorded in this spec's Design Notes as a known residual owned by stories 6/7; nothing to fix here.
  - `[false]` `[reject]` Blind Hunter #8 + Edge Case Hunter #13 — "the acceptance criterion `grep … "@hkmc/airtable" … → zero lines` cannot pass; four matches remain". Refuted: I ran it and the four matches are exactly `apps/folk/package.json:14`, `apps/folk/tsconfig.json:16`, `apps/gita-life/package.json:14`, `apps/gita-life/tsconfig.json:16` — the workspace-dependency declarations, which the same acceptance line's own parenthetical assigns to story 7. The criterion's scope is source imports, and `grep "from \"@hkmc/airtable\""` over source returns zero.
  - `[false]` `[reject]` Blind Hunter #14 — "the artifacts are untracked and the Spec Change Log / Review Triage Log are empty". Refuted: the workflow's own Finalize step is what commits `{spec_file}` and writes the Auto Run Result, and both logs were populated by this pass; `git status` showing `??` mid-run is the expected state before finalization.
  - `[false]` `[reject]` Blind Hunter #13 (second claim) — "31 modified files ship with no recorded verification output". Refuted as to recording: verification output belongs to this spec's `## Verification` and `## Auto Run Result`, not inside a diff, and every gate the spec names was executed and recorded. The substantive half (the gates are not in CI) is triaged separately as the medium `defer` above.
  - `[false]` `[reject]` Intent Alignment #2 — "CAP-6's 'install prompt untouched' is contradicted by the `components/pwa-install-prompt.tsx` change". Refuted at the cited lines: the rendered string is `pwa-install-dismissed:${staff.<field>}` and both field values are `public.users.id` — `lib/authz.ts` set `airtableUserId: row.id` in story 7.4 and still sets `userId: row.id`. The rename changes the property name, not the key, so no dismissal is lost. This is the same fact Blind Hunter #11 found; recorded there as the spec-text correction.
  - `[false]` `[reject]` Intent Alignment #6 — `sprint-status.yaml:100` shows `7-5-…: backlog` and no implementation artifact exists in `implementation-artifacts/`. Not a defect and not this story's surface: the dispatch framing states sprint-status is the orchestrator's own bookkeeping that this workflow must neither write nor revert, and the canonical story spec for this dispatch lives under `_bmad-output/specs/spec-airtable-to-supabase/stories/` alongside stories 7.1–7.4.

**Cascading route:** `bad_spec` exists (two `high` entries), so `patch` and `defer` entries are moot until the code is re-derived. `intent_gap` does not exist. `review_loop_iteration` incremented 0 → 1.

### 2026-10-06 — Review pass (post-`bad_spec` re-derivation)

- verdicts: 48 findings — high 0, medium 15, low 28, false 5, maybe-false 0
- findings:
  - `[false]` `[reject]` Blind Hunter #1 — "the `## Verification` section records no results, only `expected:` prose, so the pass-1 `[false]` rejection's claim that every gate was 'executed and recorded' rests on evidence outside the file". Refuted as to the run's state: a review pass does not populate `## Verification`; this pass appended every observed command outcome to that section, so the record exists for anyone reading the artifact. Not a defect in the change.
  - `[false]` `[reject]` Blind Hunter #2 — "`## Auto Run Result` is referenced but absent". Refuted: the workflow's Finalize step is what writes it, and this pass's Finalize step wrote it; `git status` showing it missing mid-run is the expected pre-finalization state.
  - `[false]` `[reject]` Blind Hunter #3 — "no pass-2 entry anywhere in the spec; `review_loop_iteration` is still 1". Refuted: this row is the pass-2 entry, and `review_loop_iteration` counts `bad_spec` loopbacks, not passes — it stays at 1 because this pass routed no loopback.
  - `[low]` `[reject]` Blind Hunter #4 — "the file/swap counts are wrong three ways (Intent 22, Code Map header 22, enumeration 24, diff 26) and `app/manage/page.tsx` is unenumerated as rename-only". The arithmetic checks out, but the diff itself is complete and correct — `manage/page.tsx` changes only its `staff.*` read and is listed in the Code Map's rename set. Fix is to correct this build's spec's own counts, which is not a change finding.
  - `[low]` `[reject]` Blind Hunter #5 — "the Code Map's gita-life `api/contact/route.ts` line refs are stale because the diff reformats that import". Real, and self-caused by the swap's own reformatting. Every line number in a Code Map is a snapshot; the fix is to re-derive this spec's text, which is not a change finding.
  - `[low]` `[reject]` Blind Hunter #6 — "the I/O matrix's first-time-invite row ('an account-setup invite is the email the invitee receives') contradicts the amended acceptance criteria and the new code comment". Verified: both say what the reviewer says they say. Two reasons this is not a change finding. First, the row lives inside `<intent-contract>`, which a `bad_spec` loopback must not modify — and pass 1 amended the acceptance criteria precisely because it could not amend the matrix. Second, the *tested* surface (the acceptance criterion, the route's forwarded `delivery`, `components/invite-user-form.tsx:184`) says nothing false: the literal is "A sign-in email was sent.", which drops the "already exists" claim. The residual disagreement is about SMTP delivery, which `stories.yaml` story 8 owns; recorded here rather than acted on.
  - `[low]` `[reject]` Blind Hunter #7 — "`components/invite-user-form.tsx:184` is edited but no task authorizes it and no criterion asserts the copy". Verified: the spec's CORRECT FIRST-INVITE REPORTING task names only the route. The change itself is required by pass-1 amendment 4 (stop asserting "already exists" for a first-time invitee) and is a message literal, not a wire-payload key. Adding the task is an edit to this build's spec.
  - `[low]` `[reject]` Blind Hunter #8 — "the dashboard caption edit has no verification command". Verified: neither Acceptance Criteria nor `## Verification` greps for it. This pass ran one (`grep -rn Airtable components`, expecting zero matches for the caption) and recorded the outcome under `## Verification`; adding it permanently to the criteria list is a spec edit.
  - `[medium]` `[defer]` Blind Hunter #9 — "the `ATTENDANCE_ID_PATTERN` change has no reproducible coverage: the KEEP 12-case harness lives outside the repo, and the matrix has no row for the casing the new `/i` flag introduces". **carried** — same location and claim as this pass-1 log's `[medium] [defer]` row for Verification Gap #5 + Blind Hunter #9 + Intent Alignment #1 (the `rec*`→UUID predicate and the preserved `/attendance` and offline contracts have no committed executable coverage), and the code still reads as that row describes. Pass-1's `[low] [reject]` row for the casing half (Edge Case Hunter #10) covers the second half of this claim unchanged. Verdict and route kept; not re-deferred.
  - `[low]` `[defer]` Blind Hunter #10 — "the `location_ids` fix removes the only path that could ever clear a staff member's locations, and neither the spec nor the acceptance criteria record it". Verified — see Edge Case Hunter #1, grouped with it; new deferral entry added.
  - `[medium]` `[defer]` Blind Hunter #11 — "`verify-program-readiness.mjs` cannot detect the `ensureSupabaseAuthUser` signature change: its `[^)]*` regex matches identically before and after". Verified live by the verification-gap layer. Same root cause as Verification Gap #1 — the intent forbids editing either verifier and forbids a new runner — so grouped with it; new deferral entry added.
  - `[low]` `[reject]` Blind Hunter #12 — "the guardrails gap is assigned to a story that deletes the need: story 7 removes `@/lib/airtable`, so `@/lib/supabase/data` will never be added to `serverOnlySpecifierPrefixes`, and the accepted backstop is recorded nowhere". **carried** — same file and same claim as this pass-1 log's `[low] [reject]` row for Blind Hunter #7 + Verification Gap other #4, and `scripts/verify-monorepo-guardrails.mjs:10-19` still reads as that row describes. Verdict and route kept.
  - `[low]` `[reject]` Blind Hunter #13 — "two divergent deferral ledgers exist: 2 frontmatter entries against 10+ triage-log `[defer]` rows, with no cross-referencing key". The two are different things by design — `## Review Triage Log` records every per-pass verdict including rejects, and frontmatter `deferred:` is the surviving ledger. Real finding: pass 1 wrote only 2 of its 10 defer rows into the frontmatter. This pass did not re-add them, because the carry-over rule forbids deferring a logged row twice; the shortfall is recorded under `## Auto Run Result`. Consolidating the two sections is an edit to this build's spec.
  - `[low]` `[patch]` Blind Hunter #14 — "both new markdown files lack a trailing newline". Verified: `epic-7-context.md` and this spec both ended without `\n` in the staged diff. Fixed this pass — a newline appended to each; the staged diff now contains zero `\ No newline at end of file` markers.
  - `[low]` `[defer]` Edge Case Hunter #1 — "with `if (data.locationIds?.length)` and `invite-user/route.ts:35` forcing `[]`, `location_ids` can never be emptied; a revoked Preacher keeps access at every location forever". Verified line by line. The bad outcome is real as stated, but it is exactly what the intent's re-invite acceptance criterion mandates and exactly what `lib/airtable.ts:508` did, so the diff restored parity rather than causing a regression. Recorded so story 6's location-management UI does not assume a clearing path exists; new deferral entry added.
  - `[low]` `[defer]` Edge Case Hunter #2 — "a `location_ids`-only update writes the column but skips cache revalidation, so `listCachedActivePreachers` serves stale locations for the 20-minute TTL and the Admin picks a rejected location". Verified: `lib/supabase/data.ts:450-453` revalidates only on a role or status change; TTL is `20 * 60` at `lib/supabase/data.ts:148`. Code in `data.ts` is untouched by this diff and owned by stories 6/7; new deferral entry added.
  - `[low]` `[reject]` Edge Case Hunter #3 — "an unauthenticated `POST /attendance` carrying a non-UUID `sessionId` yields 500 with raw Postgres text instead of the 404 branch at `:62`". Verified: `findSessionById` rethrows any error other than `PGRST116` (`lib/supabase/data.ts:712-717`), and the route's catch-all turns that into a 500. **carried** — same location and claim as this pass-1 log's `[low] [reject]` row for Edge Case Hunter #3-#8, and the code still reads as that row describes. Verdict and route kept.
  - `[low]` `[reject]` Edge Case Hunter #4 — "the same 22P02 path at `api/registration/route.ts:101` yields 500 instead of the intended 404 at `:110`". Verified, and it is the same defect as the carried group above, at a site that group did not list. Shares the group's route on the group's own reachability evidence: `sessionId` there comes from the `/attend?session=` link the app itself mints, never from a shape the shipped client cannot produce. Kept as its own row.
  - `[low]` `[reject]` Edge Case Hunter #5 — "a client-supplied non-UUID `assignedPreacherAirtableUserId` or `locationId` turns the intended 400 into a 500 at `invite-user/route.ts:50,57`". **carried** — same location and claim as this pass-1 log's `[low] [reject]` row for Edge Case Hunter #3-#8. Verdict and route kept.
  - `[low]` `[defer]` Edge Case Hunter #6 — "a padded id passes trimmed validation at `:39` and is forwarded untrimmed at `:65-66`, so Postgres 22P02 fails the write and leaves the auth user minted at `data.ts:467-473` orphaned". Verified — the validation uses `?.trim()` and the forwarded value does not. Real, but the route line is unchanged by this diff and unreachable from the shipped form (the value comes from a `<select>` over `listCachedActivePreachers()`). New deferral entry added.
  - `[low]` `[reject]` Edge Case Hunter #7 — "a body-supplied non-UUID `locationId`/assigned-Preacher id turns the intended 400 into a 500 at `sessions/route.ts:95` and `volunteers/invite/route.ts:57`". **carried** — same locations and claim as this pass-1 log's `[low] [reject]` row for Edge Case Hunter #3-#8. Verdict and route kept.
  - `[low]` `[defer]` Edge Case Hunter #8 — "`invite_log.airtable_user_id` and `audit_events.actor_airtable_user_id` are TEXT columns now receiving UUIDs, mixing rec and UUID vocabularies with no discriminator". Verified: both are unconstrained TEXT and both receive `public.users.id` through the paths this diff re-pointed. The parameter names are held deliberately by the intent's `Never` list; story 7 owns the sweep. New deferral entry added.
  - `[low]` `[reject]` Edge Case Hunter #9 — "`ATTENDANCE_ID_PATTERN` is case-insensitive but `parseKnownAttendanceIds` returns the Set with original casing, so an uppercase id validates and then never matches Postgres's lowercase `record.id`". **carried** — same location and claim as this pass-1 log's `[low] [reject]` row for Edge Case Hunter #10, and the code still reads as that row describes. Verdict and route kept.
  - `[medium]` `[defer]` Edge Case Hunter #10 — "when `getUserById` succeeds but the auth user's email differs from `public.users.email`, `createUser` mints an unlinked auth row and the route then surfaces a bare 500". Verified reachable, but only under the same corrupt-data class this pass-1 log's `[medium] [defer]` row for Verification Gap #3 + Edge Case Hunter #1 and #2 recorded: an `auth.users` row whose email has been changed out from under its `public.users` row. **carried** — same location (`signin/route.ts:47-77`) and same outcome. Verdict and route kept.
  - `[medium]` `[defer]` Edge Case Hunter #11 — "`sessions.created_by` is nullable with `ON DELETE SET NULL`, so `createdBy: []` makes the session invisible to everyone, Admin included". **carried** — same locations and claim as this pass-1 log's `[medium] [defer]` row for Edge Case Hunter #9, and the migrations still read as that row describes. Verdict and route kept; this layer's independent reachability check agrees (no repo call site deletes a `public.users` row; it becomes reachable when story 6's portal can).
  - `[medium]` `[defer]` Edge Case Hunter #12 — "`mapSession` wraps single nullable `preacher_id`/`location_id` columns in one-element arrays, so a legacy multi-preacher session collapses: co-preachers get 403 and public links get 422". Verified against both modules: `lib/airtable.ts:672-673` read multi-valued linked records through `normalizeLinkedIds`, `lib/supabase/data.ts:688-689` cannot. Pre-existing — the schema is story 1's, `data.ts` is story 7.3's — and unreachable until story 9's backfill loads such rows. New deferral entry added.
  - `[low]` `[defer]` Edge Case Hunter #13 — "Enter pressed during an in-flight submit races the insert, and the loser throws 500 already-registered where the Airtable path returned 201". Verified: `handleSubmit` (`components/invite-user-form.tsx:158`) has no `isSubmitting` re-check and `disabled={isSubmitting}` (`:365`) only blocks the button, and `lib/supabase/data.ts:467-478` throws 500 on the already-registered create. Pre-existing in both the form and `data.ts`; new deferral entry added.
  - `[low]` `[defer]` Edge Case Hunter #14 — "`public/sw.js:96-119` has no attempt counter and no dead-letter, so a permanently failing queued body is re-POSTed on every reconnect and the pending badge never clears". Verified. The intent's `Always` list preserves `sw.js` byte-for-byte, so this is out of scope by the intent itself; recorded so it is not lost. New deferral entry added.
  - `[low]` `[defer]` Edge Case Hunter #15 — "`lib/airtable.ts:530`'s `syncStaffSupabaseUserId` now has zero runtime importers". **carried** — same location and claim as this pass-1 log's `[low] `[defer]` row for Blind Hunter #12 + Edge Case Hunter #11. Verdict and route kept.
  - `[medium]` `[defer]` Edge Case Hunter #16 — "the removed `existingUser.id !== linkedSupabaseUserId` branch was the only detection of a `public.users`↔`auth.users` id divergence, so divergence, `staff_not_found` and a missing auth row all collapse into one 500". **carried** — same location and claim as this pass-1 log's `[medium] `[defer]` row for Verification Gap #3 + Edge Case Hunter #1 and #2. Verdict and route kept.
  - `[low]` `[reject]` Edge Case Hunter #17 — "claim violation: `sessions/route.ts:95-98` turns the documented 400 into a 500 on bad input". **carried** — same location and claim as this pass-1 log's `[low] `[reject]` row for Edge Case Hunter #3-#8. Verdict and route kept.
  - `[low]` `[reject]` Edge Case Hunter #18 — "claim violation: the frozen 404 branch at `attendance/route.ts:55-62` now yields 500 with leaked Postgres text". **carried** — same location and claim as this pass-1 log's `[low] `[reject]` row for Edge Case Hunter #3-#8. Verdict and route kept.
  - `[medium]` `[defer]` Edge Case Hunter #19 — "claim violation: `dashboard/page.tsx:44` has no Admin escape hatch, so Admin sees only sessions they created, not all sessions". Verified: the filter is `sessions.filter((session) => session.createdBy.includes(staff.userId))` with no role check, byte-identical at the baseline except the field name. Two corrections to the framing: it is pre-existing, not caused by the field rename; and the intent's frozen "Admin all / Preacher own sessions" contract is the `GET /attendance` feed, which is intact at `attendance/route.ts:141` (`staff.role === "Admin" || ...`). The underlying app-layer narrowing of Admin's RLS grant is real; new deferral entry added.
  - `[medium]` `[defer]` Edge Case Hunter #20 — "claim violation: `mapSession` populating `preacherIds`/`locationIds` is not parity, because a single-column schema silently caps multi-preacher legacy sessions at one". Verified and grouped with Edge Case Hunter #12, which it restates as a claim check; same route, one deferral entry.
  - `[low]` `[patch]` Edge Case Hunter #21 — "claim violation: `volunteers/invite/route.ts:117` carries no first-time-invitee caveat while the identical call at `admin/invite-user/route.ts:73` does". Verified — the diff added the four-line comment to `apps/*/app/api/admin/invite-user/route.ts` and not to the twins, and both routes call `upsertStaffUser` immediately before `sendStaffInviteEmail`, so both hit the same always-`sign-in-link` outcome. Fixed this pass: the same caveat added above `sendStaffInviteEmail` in `apps/folk/app/api/volunteers/invite/route.ts` and `apps/gita-life/app/api/volunteers/invite/route.ts`.
  - `[medium]` `[defer]` Edge Case Hunter #22 — "claim violation: the Design Note's 'corrupt seed data only' reachability analysis misses the email-mismatch path that orphans an auth row". Verified and grouped with Edge Case Hunter #10, which it restates as a claim check; **carried** on the same `[medium] `[defer]` row.
  - `[medium]` `[defer]` Verification Gap #1 — "the import swap's headline acceptance criterion has no committed enforcement; reverting one import passes every CI gate". Pre-verified by the layer (it reverted `apps/folk/app/attendance/route.ts:12` and ran guardrails, readiness, typecheck and build — all PASS, tree restored). Confirmed independently: `scripts/verify-monorepo-guardrails.mjs:14` only fires when the specifier is reached from a `"use client"` root, so a server route importing `@/lib/airtable` is never examined. The filed disposition was `patch`, re-routed to `defer`: the intent's `Never` list forbids editing either verifier and forbids a new test runner, so no in-story patch exists, and `stories.yaml` story 8 owns the executable verification suite. New deferral entry added.
  - `[medium]` `[defer]` Verification Gap #2 — "`upsertStaffUser`'s `location_ids` guard, the one logic change in this diff, is pinned by nothing that executes". Pre-verified by the layer (it restored `Array.isArray` and all three gates stayed green). Re-routed from the filed `defer` only in the sense that this is a new entry rather than a carried one — pass 1 fixed the guard, not its coverage. New deferral entry added.
  - `[medium]` `[defer]` Verification Gap #3 — "the `rec*`→UUID predicate is a silent-degradation branch with no executable check". **carried** — same location and claim as this pass-1 log's `[medium] `[defer]` row for Verification Gap #5 + Blind Hunter #9 + Intent Alignment #1. Verdict and route kept.
  - `[medium]` `[defer]` Verification Gap #4 — "`verify-program-readiness.mjs` is the only check over the changed sign-in route, is purely textual, and is absent from `quality-gates.yml` and from `quality:ci`". **carried** — same location and claim as this pass-1 log's `[medium] `[defer]` row for Blind Hunter #13 + Verification Gap #4, and `.github/workflows/quality-gates.yml:37-47` still runs the same four steps. The layer filed `patch`; the pass-1 route stands, so not patched. Verdict and route kept.
  - `[medium]` `[defer]` Verification Gap other #1 — "`sessions.created_by` nullable with `ON DELETE SET NULL` makes a session invisible to every role". **carried** — same finding as Edge Case Hunter #11 and this pass-1 log's `[medium] `[defer]` row for Edge Case Hunter #9. Verdict and route kept.
  - `[false]` `[reject]` Verification Gap other #2 — "`components/invite-user-form.tsx:184`'s `Invite sent.` branch is now unreachable through either invite route". Refuted by the update path: `upsertStaffUser` only calls `auth.admin.createUser` on the insert branch (`lib/supabase/data.ts:456-481`), so re-inviting an existing `public.users` row whose auth user is absent lets `inviteUserByEmail` succeed and return `delivery: "invite"`. The branch is live. What the layer correctly observed is narrower and already recorded — on the insert path `delivery` is always `sign-in-link` — which is the caveat Edge Case Hunter #21's patch now documents at the second call site.
  - `[medium]` `[defer]` Intent Alignment #1 — "the intent's expectations live at the HTTP response, the Postgres row state and browser copy, while the diff's changes are exercised at a fourth surface — source text — and its only runtime evidence was produced out of repo". Descriptive, but it names the real structural gap and shares its root cause with Verification Gap #1, #2 and #4: no committed behavioral gate reaches those three surfaces. Grouped with Verification Gap #1; one deferral entry.
  - `[false]` `[reject]` Intent Alignment #2 — "CAP-6 is contradicted by the `components/invite-user-form.tsx` change, which the `Never` list names". Refuted by reading the clause it relies on: the prohibition is on renaming the **wire payload keys** shared with client forms, and the files are named as where those keys live. The diff changed one message literal at `:184` and no payload key, so the `Never` clause is not violated. (The matrix row does require a message change in that file; the two readings resolve in the diff's favour, as the layer itself concluded.)
  - `[low]` `[reject]` Intent Alignment #3 — "the caption edit is named only in `## Problem`, absent from Approach/Always/Never, so it required a reading to justify". The reading is available and the diff implements it; the change itself is correct and verified (the caption no longer names Airtable — `grep -rn Airtable components` returns only the `assignedPreacherAirtableUserId` wire-payload keys the intent keeps). Adding the caption to Approach is an edit to this build's spec.
  - `[low]` `[reject]` Intent Alignment #4 — "scope count: `## Problem` says 22 route/page files, the diff touches 26 under `apps/`". Real arithmetic, but the diff follows the `Always`-list enumeration and nothing user-facing is missing or wrong; correcting the prose count is an edit to this build's spec.
  - `[low]` `[reject]` Intent Alignment #5 — "the shipped literal for the now-universal `sign-in-link` branch is 'A sign-in email was sent.', which does not say 'invite sent', so the matrix row is only half-met". Verified, and the same substance as Blind Hunter #6: the tested criterion is that nothing *claims* the invitee pre-existed, which the literal satisfies. The residual is about SMTP delivery, owned by story 8; recorded, not acted on here.
  - `[medium]` `[defer]` Intent Alignment #6 — "coverage is inverse to risk: all four covered matrix rows are the ones expressible as file-local assertions, while all seven uncovered rows need HTTP or Postgres". Descriptive, and the same root cause as Verification Gap #1, #2 and #4. Grouped with Verification Gap #1; one deferral entry.

**Cascading route:** no `intent_gap` and no `bad_spec` this pass — every finding resolved to a patch, a defer, or a rejection, and none needs the code re-derived. Both `patch` entries were low, so `patch` and `defer` were processed normally. `review_loop_iteration` stays at 1.

## Design Notes

- **Why the swap is import-only — and where parity was a lie.** `lib/supabase/data.ts` was built with a deliberately mirrored export surface (story 7.3's stated purpose: "so route diffs in story 5 are import-only"), and a symbol-by-symbol comparison of the two modules' `export` lists confirms every name the routes/pages import exists with the same signature, including the two shape traps: `findLocationById` still returns an `AirtableRecord<LocationFields>` envelope (`data.ts:738`), and `getAttendanceBySessionRecord` takes a narrower `Pick<SessionRecord,"id">` while still honouring `knownAttendanceIds`. **Surface parity is not behavioural parity.** Type-identical bodies is exactly why the two `upsertStaffUser` divergences escaped review pass 1: `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm guardrails` and `verify-program-readiness.mjs` were all green over a change that wipes staff locations and mislabels every new invite. Any further divergence this swap surfaces is reported, not patched, except the one guard line this story owns.
- **Why the two transitive `lib/` imports must move.** `lib/attendance-session.ts` and `lib/invite-log.ts` are outside `apps/`, but the routes reach Airtable *through* them, so CAP-4 ("no route or page imports `lib/airtable`") is only observably true once they move. They are type-only imports of shapes the Supabase module re-exports identically (`data.ts:117`, `:8`), so the change is one line each.
- **Why `syncStaffSupabaseUserId` is deleted rather than reimplemented.** It wrote the Supabase user id back into an Airtable Users row. `public.users.id` is the primary key *and* a foreign key to `auth.users(id)`, and `StaffUser.supabaseUserId` already resolves to `row.id` (`data.ts:328`) — the linkage is now the key, so there is no column to write. `ensureSupabaseAuthUser`'s first branch already prefers `staff.supabaseUserId`, so the happy path is unchanged.
- **Residual from that deletion (accepted).** When the `auth.users` row found by email has a *different* id than the `public.users` row, the old code silently repaired the link; now `syncStaffProfileByEmail` raises `staff_not_found` and the route's catch-all returns 500. That is the correct reading of `public.users.id` being a foreign key — a mismatch is corrupt seed data, not a runtime sync case — and story 8's fixture seeding is where it would surface. Flagged rather than papered over with a silent repair.
- **Why the `StaffContext` rename is in scope.** Story 7.3 (`:57`, `:110`, `:237`) and story 7.4 (`:22`, `:29`, `:45`, `:75`, `:121`) each deferred it here, and `lib/authz.ts:19-23,30-34` names the exact targets in JSDoc. Story 7.4's Design Note claiming story 5 would "inline `getStaffContext` at the call sites" is wrong on the code: `api/auth/signin`, `api/auth/complete-implicit` and `auth/confirm` run before any session cookie exists, so `getStaffContext()`'s `auth.getUser()` would 401. `syncStaffProfileByEmail` therefore stays, and since its name carries no Airtable vocabulary, keeping it costs story 7 nothing.
- **Why the rename stops at the authz boundary.** The remaining `*Airtable*` identifiers are either Postgres column names (`invite_log.airtable_user_id`, `audit_events.actor_airtable_user_id`, `lib/supabase/types.ts`) or a wire format shared between a route's payload interface and a client form (`ContactPayload.assignedPreacherAirtableUserId` ↔ `components/contact-form.tsx:106,356`). Renaming either side alone would break the pair. Story 7's `grep -ri airtable` sweep is the designated home for all of it.
- **Why `scripts/verify-supabase-data-module.mjs` is not shipped here.** Story 7.3's `deferred:` list parks it on story 5, but SPEC/story 8 assign the CAP-3/5/6 behavioural verification suite — including the data module and the preview-deployment contract checks — to story 8, which also owns fixture seeding. This story's frozen contracts are provable by the CLI gates plus the manual checklist below, so the gap is re-deferred rather than half-closed.
- **Why `packages/data-contracts`'s `StaffMembershipContext` is left alone.** It duplicates the authz context with the same Airtable-named fields but has zero references (`grep` finds only its declaration), and `lib/authz.ts` keeps its own `StaffContext`. Deleting an exported workspace symbol is a package API change with no caller to justify it; it belongs to story 7's sweep alongside the columns it mirrors.
- **Why the dashboard caption is in scope but the layout metadata is not.** "Live updates from Airtable" describes the exact feed this story re-points, so leaving it makes the UI assert something false. The `<meta description>` "…and Airtable handoff" remains literally true until story 6 replaces `/manage` and story 7 deletes the config.
- **Known residual (not a defect here).** `lib/supabase/data.ts:245` still guards `normalizeDisplayString` with `/^rec[a-zA-Z0-9]{4,32}$/`, which no longer matches any real id, so a leaked link id would render as a display name instead of being rejected. `getAttendanceDashboardRecords` prefers the hydrated contact name, so the exposure is narrow. It belongs to stories 6/7, which own `data.ts`.

## Verification

**Commands:**
- `grep -rn --exclude-dir=.next --exclude-dir=node_modules "@/lib/airtable" apps components lib` -- expected: zero matches (exit 1).
- `grep -rn --exclude-dir=.next --exclude-dir=node_modules "@hkmc/airtable" apps components lib` -- expected: zero matches (exit 1).
- `grep -rn --exclude-dir=.next --exclude-dir=node_modules "staff\.airtableUserId\|staff\.assignedPreacherAirtableUserId" apps components lib` -- expected: zero matches (exit 1).
- `grep -rn --exclude-dir=.next --exclude-dir=node_modules "recXXXXXXXXXXXX\|\^rec\|rec\[a-zA-Z0-9\]" apps components` -- expected: zero matches (exit 1); the two `lib/` sites (`lib/airtable.ts:258-259`, `lib/supabase/data.ts:245`) are out of scope.
- `git diff --name-only` -- expected: no `public/sw.js`, no `proxy.ts` (root or per-app), no `lib/airtable.ts`, no `lib/supabase/types.ts`, no `packages/`, no `supabase/`. `lib/supabase/data.ts` **is** expected to appear, limited to the single `upsertStaffUser` guard line.
- `git diff --numstat lib/supabase/data.ts` -- expected: 1 insertion, 1 deletion (the guard line only). Any larger number means the scope widened.
- `grep -n "Array.isArray(data.locationIds)" lib/supabase/data.ts` -- expected: one match, at the **insert** path's `insertPayload.location_ids`; zero matches in the update branch.
- `pnpm guardrails` -- expected: exits 0 (the 4 pre-existing client type-import warnings for `@/lib/authz` are unchanged).
- `pnpm typecheck:workspace` -- expected: all 7 workspace projects pass.
- `pnpm build:apps` -- expected: folk and gita-life build clean; `import "server-only"` in `lib/supabase/data.ts` would fail the build if any swapped file were client-reachable.
- `pnpm lint` -- expected: no new errors versus the pre-change baseline.
- `node scripts/verify-program-readiness.mjs` -- expected: exits 0; the sign-in route still satisfies its `syncStaffProfileByEmail` and adjacent `ensureSupabaseAuthUser` assertions.

**Manual checks (against the hosted project `etwunirahuucodcxydgs`, gitignored env files; never print credential values):**
- Sign in as a fixture `Active` `public.users` row; `GET /api/auth/me` returns `200 {staff:{userId, assignedPreacherUserId?, role, status, locationIds, programId}}` and the PWA install prompt renders.
- `POST /attendance` with `{mobile, sessionId}`: unregistered → `404` with `notRegistered:true`; same contact again → `409` with `duplicate:true`; fresh contact → `201`.
- `GET /attendance?session=<uuid>`: Admin sees the session; its Preacher sees it; a Preacher outside `preacherIds`/`locationIds` gets `403`; an Assistant whose `assignedPreacherUserId` is in `preacherIds` sees it.
- `GET /attendance?session=<uuid>&knownAttendanceIds=<uuid>`: rows in the set are absent from the feed; repeat with one non-UUID token and confirm every row returns (set discarded, no error).
- Create a session, copy its attendance URL, mark attendance on a second device with the network offline, confirm the `202 {queued:true}` response, then reconnect and confirm the row lands in Postgres and clears from the queue.
- Confirm the server logs and the Postgres tables show no `api.airtable.com` traffic from any route or page during the above.

**Observed — review pass 2, 2026-10-06 (run after both `patch` fixes):**

| Command | Result |
|---------|--------|
| `grep -rn --exclude-dir=.next --exclude-dir=node_modules "@/lib/airtable" apps components lib` | 0 matches (exit 1) — as expected |
| `grep -rn --exclude-dir=.next --exclude-dir=node_modules "@hkmc/airtable" apps components lib` | 0 matches (exit 1) — as expected |
| `grep -rn ... "staff\.airtableUserId\|staff\.assignedPreacherAirtableUserId" apps components lib` | 0 matches (exit 1) — as expected |
| `grep -n "airtableUserId\|assignedPreacherAirtableUserId" lib/authz.ts` | 0 matches (exit 1) — as expected |
| `grep -rn --exclude-dir=.next --exclude-dir=node_modules "recXXXXXXXXXXXX\|\^rec\|rec\[a-zA-Z0-9\]" apps components` | 0 matches (exit 1) — as expected |
| `grep -rn --exclude-dir=.next --exclude-dir=node_modules "Airtable" components` | 5 matches, all the `assignedPreacherAirtableUserId` wire-payload key the intent's `Never` list keeps; the `live-attendance-dashboard.tsx:266` caption no longer matches |
| `grep -n "parseKnownAttendanceIds\|MAX_KNOWN_ATTENDANCE_IDS" apps/*/app/attendance/route.ts` | empty-list check, `> MAX_KNOWN_ATTENDANCE_IDS` check and `return null` all present in both apps; only the id-shape predicate differs |
| `grep -n "Array.isArray(data.locationIds)" lib/supabase/data.ts` | 1 match, `:491` — the insert path. 0 matches in the update branch, which now guards on `data.locationIds?.length` at `:429` |
| `git diff --name-only 87425115c4ce2ddd93615331c882eb653ce33826 -- 'public/sw.js' '*proxy.ts' 'lib/airtable.ts' 'lib/supabase/types.ts' 'packages/*' 'supabase/*'` | 0 files — none of the frozen paths appear |
| `git diff --numstat 87425115c4ce2ddd93615331c882eb653ce33826 -- lib/supabase/data.ts` | `1  1` — the guard line only |
| `node scripts/verify-monorepo-guardrails.mjs` | exit 0 — "Monorepo guardrails passed", with the 4 pre-existing client type-import warnings for `@/lib/authz`, unchanged |
| `node scripts/verify-program-readiness.mjs` | exit 0 |
| `pnpm typecheck:workspace` | exit 0 — 7 of 8 workspace projects, all `Done` |
| `pnpm build:apps` | exit 0 — 2 successful; folk and gita-life routes all `ƒ`, `Proxy (Middleware)` emitted |
| `pnpm lint` | exit 1 — 18 problems (12 errors, 6 warnings). All 12 errors are in `.agent/`, `.codebuddy/` and `.neovate/` skill assets (`require()` imports, an unknown `n/no-unsupported-features/node-builtins` rule) and are pre-existing. Of the 6 warnings, the 2 in `lib/authz.ts:5` (`StaffStatus`, `StaffUser` unused type imports) exist at `87425115c4ce2ddd93615331c882eb653ce33826` on a line this diff does not touch; the other 4 are in untouched files. **No new lint findings in any changed file.** |

Manual checks were not run this pass: every one of them needs the hosted project `etwunirahuucodcxydgs`, whose PostgREST endpoint is unreachable from this environment (recorded in the frontmatter's first `deferred` entry, verified again at implementation time). The `location_ids` preservation criterion and the `knownAttendanceIds` filter/discard behaviour are therefore still unexecuted here; both are carried as deferrals to `stories.yaml` story 8, which owns fixture seeding and the CAP-3/5/6 verification suite.

## Auto Run Result

Status: done
Blocking condition: none

### Summary of implemented change

Every runtime read of an operational entity in `apps/folk` and `apps/gita-life` now goes through `lib/supabase/data.ts` instead of `lib/airtable.ts`. The swap is import-only and symbol-for-symbol, since story 7.3 mirrored the Airtable module's export surface; the substantive items are the two now-impossible `syncStaffSupabaseUserId` calls deleted from the sign-in route, the `rec*`→UUID attendance-id predicate, the `StaffContext.airtableUserId`→`userId` / `assignedPreacherAirtableUserId`→`assignedPreacherUserId` rename at the authz boundary, the `upsertStaffUser` `location_ids` guard, and the dashboard caption. No response shape, status code, offline-queue behaviour or role-scoping branch changed; `public/sw.js` and all three `proxy.ts` files are byte-identical.

This run was review pass 2 over the re-derived code (pass 1 routed `bad_spec` on two `high` findings and incremented `review_loop_iteration` to 1). The review ran four layers over the 35-file diff since baseline `87425115c4ce2ddd93615331c882eb653ce33826`, triaged 48 findings, applied 2 patches, and recorded 10 new deferrals.

### Files changed

This run's patches (on top of the already-committed swap):

- `apps/folk/app/api/volunteers/invite/route.ts` — added the first-time-invitee caveat above `sendStaffInviteEmail`, matching the one already on the `admin/invite-user` call site.
- `apps/gita-life/app/api/volunteers/invite/route.ts` — same.
- `_bmad-output/implementation-artifacts/epic-7-context.md` — added the missing trailing newline.
- `_bmad-output/specs/spec-airtable-to-supabase/stories/5-route-and-page-swap-to-supabase-in-both-apps.md` — trailing newline; 10 new `deferred:` entries; this pass's triage-log entry; recorded verification outcomes; this section; `status`/`followup_review_recommended` frontmatter.

The swap itself (committed as `d30018fb4915b9bbfe598e546aae68e775389d3d`) touched 26 app files, 3 components, 3 `lib/` modules, `lib/supabase/data.ts` (1 insertion / 1 deletion), the epic-7 context and this spec.

### Review findings breakdown

- **48 findings**: high 0, medium 15, low 28, false 5, maybe-false 0.
- **Patches applied: 2, both `low`.** Edge Case Hunter #21 — `apps/*/app/api/volunteers/invite/route.ts` now carries the same first-time-invitee caveat as `admin/invite-user/route.ts`; both routes call `upsertStaffUser` immediately before `sendStaffInviteEmail`, so both hit the always-`sign-in-link` outcome and the second site was undocumented. Blind Hunter #14 — trailing newlines added to the two markdown files added by this diff; the staged diff now has zero `\ No newline at end of file` markers. No `high` or `medium` entry was patched.
- **Deferred: 24 findings → 9 carried, 10 new entries, 5 findings sharing a root cause with a carried row.** New entries: CAP-4's import-swap criterion has no committed enforcement and the readiness script cannot see the sign-in route's signature change; `upsertStaffUser`'s `location_ids` guard has no executable assertion; location-only updates never revalidate the active-preachers cache; the admin invite route validates a trimmed assigned-Preacher id but forwards the untrimmed one; `invite_log.airtable_user_id` / `audit_events.actor_airtable_user_id` now hold both `rec*` and UUID values; `mapSession` cannot represent a legacy multi-preacher or multi-location session; `InviteUserForm` has no re-entrancy guard; the service worker's replay loop has no attempt cap or dead-letter; no path can now clear `public.users.location_ids`; and `app/dashboard/page.tsx`'s `createdBy` filter has no Admin escape hatch.
- **Rejected: 17 findings.** 7 were carried `low` rejections from pass 1 (the PostgREST-22P02-instead-of-4xx group, the id-casing mismatch, and the guardrails-list gap) plus one new site in the 22P02 group; the other 9 are findings whose only fix is to edit this build's spec — the Code Map's `22`/`24`/`26` counts and stale gita-life line refs, the Matrix row that still says "account-setup invite" while the amended acceptance criteria say `sign-in-link` (it lives inside `<intent-contract>`, which a `bad_spec` loopback must not modify, and the SMTP delivery it describes is story 8's), the `invite-user-form.tsx` and caption edits having no dedicated task or verification command, and the split between the triage log and the `deferred:` ledger.
- **False: 5.** `## Verification` having no results, `## Auto Run Result` being absent, and no pass-2 log entry — all three are written by the workflow's own Finalize step, which this run performed. Intent Alignment #2 — the `Never` clause prohibits renaming the wire-payload keys shared with client forms and names the files as where those keys live; the diff changed one message literal and no key. Verification Gap other #2 — the `Invite sent.` branch is reachable: `upsertStaffUser` calls `auth.admin.createUser` only on the insert branch, so re-inviting an existing `public.users` row whose auth user is absent still yields `delivery: "invite"`.

### Follow-up review recommendation

`false`. Both patched entries were `low` and neither is `high`; on a first pass the bar is a `high` patch or two or more `medium` patches, and this pass patched zero of either. The work has converged: no `intent_gap` and no `bad_spec` this pass, `review_loop_iteration` stays at 1, and the two surviving `low` items are a documentation comment and a trailing newline.

### Verification performed

Every command in `## Verification` was re-run after both patches — see the observed-outcome table above. Grep gates: 6 of 7 return zero matches, and the seventh (`Airtable` in `components`) returns only the `assignedPreacherAirtableUserId` wire-payload key the intent keeps, with the caption gone. `lib/supabase/data.ts` is `1 1` against the baseline and `Array.isArray(data.locationIds)` survives only at the insert path (`:491`), with the update branch guarding on `data.locationIds?.length` (`:429`). No frozen path (`public/sw.js`, any `proxy.ts`, `lib/airtable.ts`, `lib/supabase/types.ts`, `packages/`, `supabase/`) appears in the diff. `guardrails`, `verify-program-readiness.mjs`, `typecheck:workspace` (7/7) and `build:apps` all exit 0. `lint` fails on 12 pre-existing errors confined to `.agent/`/`.codebuddy/`/`.neovate/` skill assets, with no new finding in any file this diff touches.

Manual inspection during triage confirmed, beyond the greps: `GET /attendance`'s Admin branch is intact at `apps/*/app/attendance/route.ts:141` (`staff.role === "Admin" || ...`); `lib/authz.ts` still maps `userId: row.id` and `assignedPreacherUserId: row.assigned_preacher_id`, so the PWA install prompt's `pwa-install-dismissed:<id>` localStorage key is byte-identical before and after the rename; `lib/supabase/data.ts:1` still carries `import "server-only"`, and `build:apps` passing is the backstop that no swapped file is client-reachable; and `verify-program-readiness.mjs`'s `syncStaffProfileByEmail` + adjacent-`ensureSupabaseAuthUser` assertions still hold.

The manual checks in `## Verification` were **not** run — they all need the hosted project, whose PostgREST endpoint is unreachable from this environment. This is unchanged from implementation time and is the first frontmatter `deferred` entry.

### Residual risks

1. **The frozen HTTP and offline contracts are still unexecuted.** The `/attendance` 400/404/409/201 codes, the GET role scoping, the `knownAttendanceIds` filter/discard behaviour, and the service-worker offline replay all live at a surface this environment cannot reach, so their preservation rests on code inspection rather than observation. Carried to `stories.yaml` story 8.
2. **Pass 1's deferral ledger is incomplete.** Pass 1 routed 10 findings to `defer` but wrote only 2 into the frontmatter; the other 8 survive only in `## Review Triage Log`. The carry-over rule forbids deferring a logged row twice, so this pass did not re-add them — they are visible in the pass-1 log but absent from the machine-readable ledger, and a consumer reading only `deferred:` will miss them.
3. **The `location_ids` fix is unverified against a database, and it removed the only clearing path.** The guard's correctness is asserted only by reading it; and because both invite routes submit `[]` when nothing is ticked, no shipped surface can now revoke a Preacher's last location. Story 6's location-management UI needs a distinct clearing path.
4. **`mapSession` cannot represent multi-value sessions.** Airtable's linked-record fields allowed several preachers or locations per session; the Postgres schema has single columns, so story 9's backfill can only preserve one. Co-preachers of a legacy session would get `403` and its public attendance link would get `422`. Unreachable until the backfill runs.
5. **`app/dashboard/page.tsx` narrows Admin's RLS grant.** An Admin sees no live-session widget for sessions other staff created. Pre-existing, but the swap is the change that makes `public.users.id` the id in `createdBy`, so it is the right moment for a later story to widen the filter.
