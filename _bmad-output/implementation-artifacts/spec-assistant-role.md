---
title: 'Assistant Staff Role'
type: 'feature'
created: '2026-10-02'
status: 'done'
baseline_revision: '0df37c88006e02eaf22480eac8f7b89c30152c49'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Staff roles are fixed to Admin/Preacher/Volunteer, so a Preacher cannot delegate session creation and attendance taking — only contact collection (Volunteer) or nothing.

**Approach:** Add a fourth staff role `Assistant`, invitable by a Preacher (and Admin). An Assistant collects contacts like a Volunteer and can additionally create sessions and view/take live attendance on behalf of their assigned Preacher (records attributed to the preacher). Inviting an email that is already an active Volunteer upgrades that person to Assistant.

## Boundaries & Constraints

**Always:** Extend the role taxonomy in every layer together: `STAFF_ROLES` (packages/data-contracts), the `StaffRole` union and parse whitelist in `lib/airtable.ts`, and a new Supabase migration widening the `role`/`invitee_role` CHECK constraints — a partial rollout locks users out with `unsupported_role`. Keep Program context server-side; both `apps/folk` and `apps/gita-life` route copies must change identically (monorepo guardrail). Assistant is assigned-preacher-scoped like Volunteer: no own locations, sessions/contacts attributed to the assigned preacher, `Collected By` = the assistant. Sessions/attendance access is limited to the assigned preacher's sessions and locations. Keep error responses safe (`{ error, code? }`). Airtable `Role` single-select gains `Assistant` via existing `typecast: true` writes.

**Never:** Never let an Assistant invite anyone, open `/manage`, `/admin/*`, `/volunteers`, or `/dashboard`, or see sessions/contacts outside their assigned preacher's scope. Never downgrade an existing Admin/Preacher via the preacher invite surface. Never create a duplicate Airtable user or Supabase identity for an existing email. No client-side role trusting; no new auth patterns.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Preacher invites new Assistant | POST `/api/volunteers/invite` `{name, email, role:"Assistant"}` | Airtable user upserted Role=Assistant, Assigned Preacher=inviter; invite email sent; invite_log row invitee_role=Assistant; 201 | 502 with safe message if email send fails |
| Upgrade existing Volunteer | Same POST, email belongs to active Volunteer | Existing Airtable row PATCHed Role=Assistant (no duplicate); existing Supabase identity gets sign-in link; response/UI indicates upgrade | No error expected |
| Invitee is Admin/Preacher | Same POST, email belongs to Admin or Preacher | Rejected before any Airtable/Supabase mutation | 400/403 safe error, no role change |
| Preacher picks Admin/Preacher role | POST with `role:"Admin"` or `"Preacher"` | Rejected (existing guard extended) | 403, nothing created |
| Assistant creates session | POST `/api/sessions` as Assistant | Session created with Preacher = assigned preacher's Airtable id; appears in preacher's session list; attendance URL/QR issued | 403 if location outside preacher's locations |
| Assistant without assigned preacher | Session/contact POST, membership missing assigned preacher | Rejected before mutation | 400/403 safe error |
| Assistant lists sessions / live attendance | GET `/api/sessions`, GET `/attendance?session=` | Only sessions whose preacher is the assigned preacher; live view allowed for those | 403 for other sessions |
| Assistant captures contact | POST `/api/contact` as Assistant | Assigned Preacher = assistant's preacher; Collected By = assistant; preacher location rules apply | Existing validation errors unchanged |
| Assistant hits admin surfaces | `/admin/invite`, `/volunteers`, `/manage`, `/dashboard` | Denied/redirected; nav shows only Contact + Sessions | 403/redirect as today |

</intent-contract>

## Code Map

- `packages/data-contracts/src/index.ts:4` -- canonical `STAFF_ROLES` const + `isStaffRole` (L37); add `"Assistant"`.
- `lib/airtable.ts:11,430` -- parallel `StaffRole` union and `mapStaffUser` whitelist; `upsertStaffUser` (L487-526) already PATCHes Role on existing emails (the upgrade primitive).
- `supabase/migrations/20260504100000_create_staff_identity_bridge.sql:6,24` + `20260613010000_add_program_scoped_staff_memberships.sql:23` -- role CHECK constraints; add a new migration widening all three (do not edit old migrations).
- `lib/authz.ts` -- `requireRole` L41, `getStaffContext` L241; `StaffContext.assignedPreacherAirtableUserId` already populated for any role (L21,155,194). Read-only.
- `apps/folk/app/api/volunteers/invite/route.ts` + identical `apps/gita-life/...` -- L18 guard `["Admin","Preacher"]`, L28-30 blocks non-Volunteer roles (allow "Assistant"), L44-50 hardcodes `role:"Volunteer"` (pass through), L60 log role; add upgrade detection via `findStaffUserByEmail` before upsert.
- `apps/*/app/api/admin/invite-user/route.ts:8,35,41` -- roles whitelist, Volunteer-only location stripping and assigned-preacher requirement; extend Volunteer branches to include Assistant.
- `components/invite-user-form.tsx:66,158-168,223-257` -- volunteer mode forces role; add Volunteer/Assistant choice on preacher surface and Assistant option in admin select; preacher picker + no locations for Assistant.
- `apps/*/app/api/sessions/route.ts:53,86,101,113-122` -- guards; POST attributes `preacherAirtableUserId: staff.airtableUserId` (Assistant must use `assignedPreacherAirtableUserId`); GET scoping L56-63; location check L101 (validate against preacher's locations for Assistant).
- `apps/*/app/attendance/route.ts:118,133-140` -- live-attendance GET guard + `canReadSession` scope; add Assistant via assigned preacher.
- `apps/*/app/sessions/page.tsx:13,15-18` -- page guard; locations filtered to `staff.locationIds` (empty for Assistant → resolve assigned preacher's locations).
- `apps/*/app/api/contact/route.ts:59-80,136` -- `resolveAssignedPreacher`: treat Assistant like Volunteer; `collectorId` = assistant's own id.
- `apps/folk/app/contact/page.tsx:14-26` -- Volunteer scoping branches include Assistant (check gita-life copy).
- `components/contact-form.tsx:72,217-219` -- widen `staffRole` union; Assistant help text.
- `lib/auth-context.tsx:196-198` + `components/header.tsx:210-221` -- add `isAssistant`; nav: Contact + Sessions for Assistant, never Invite/Manage.
- Landing helpers (Volunteer→`/contact`): `apps/*/app/login/login-page-client.tsx:13-31`, `apps/*/app/auth/confirm/route.ts:8-21`, `components/auth-hash-callback.tsx:14-16`, `components/auth-error-content.tsx:13-16` -- route Assistant to `/contact` too.
- `lib/invite-log.ts` / `lib/supabase/invite.ts` -- logging + existing-user OTP fallback; read-only (reuse as-is).

## Tasks & Acceptance

**Execution:**
- [x] `packages/data-contracts/src/index.ts` + `lib/airtable.ts` -- add `Assistant` to `STAFF_ROLES`, the `StaffRole` union, and the `mapStaffUser` whitelist -- single taxonomy, all layers move together.
- [x] `supabase/migrations/<new>_allow_assistant_role.sql` -- widen `staff_profiles.role`, `staff_memberships.role`, `invite_log.invitee_role` CHECKs to include `Assistant` -- DB must accept what the app writes.
- [x] `apps/folk/app/api/volunteers/invite/route.ts` + `apps/gita-life/app/api/volunteers/invite/route.ts` -- accept `role:"Assistant"`; require/force assigned preacher = inviter; detect existing user: Volunteer→upgrade to Assistant (flag in response), Admin/Preacher→reject; pass role into upsert + invite log -- the core invite/upgrade behavior.
- [x] `apps/*/app/api/admin/invite-user/route.ts` -- whitelist Assistant; Assistant gets assigned-preacher requirement and empty locations like Volunteer -- admin parity for the new role.
- [x] `components/invite-user-form.tsx` -- preacher surface offers Volunteer/Assistant choice; admin select gains Assistant; preacher picker shown and locations hidden for Assistant; upgrade-aware success message -- UI for both invite surfaces.
- [x] `apps/*/app/api/sessions/route.ts` -- allow Assistant in GET/POST guards; POST attributes session to assigned preacher and validates location against the preacher's locations; GET scopes Assistant to preacher's sessions -- sessions on behalf of the preacher.
- [x] `apps/*/app/attendance/route.ts` -- allow Assistant in GET guard; extend `canReadSession` with assigned-preacher match -- live attendance for preacher's sessions only.
- [x] `apps/*/app/sessions/page.tsx` -- allow Assistant; filter locations via assigned preacher for Assistant -- page parity with API.
- [x] `apps/*/app/api/contact/route.ts` + `apps/folk/app/contact/page.tsx` (+ gita-life copy if it branches on role) -- Assistant follows the Volunteer ownership path; `Collected By` = assistant -- contacts stay preacher-owned. (gita-life's contact page does not branch on Volunteer/Assistant, so no edit required.)
- [x] `components/contact-form.tsx` -- widen `staffRole` union and per-role copy for Assistant -- type-safe UI.
- [x] `lib/auth-context.tsx` + `components/header.tsx` -- add `isAssistant`; nav shows Contact + Sessions for Assistant only -- least-privilege navigation.
- [x] `apps/*/app/login/login-page-client.tsx`, `apps/*/app/auth/confirm/route.ts`, `components/auth-hash-callback.tsx`, `components/auth-error-content.tsx` -- land Assistant on `/contact` like Volunteer -- consistent post-auth routing.

**Acceptance Criteria:**
- Given an active Preacher submits an Assistant invite, when the API validates it, then the Airtable user has Role `Assistant` with the inviter as Assigned Preacher, the invite email is sent, and the invite log records role `Assistant`.
- Given the invitee email is an active Volunteer, when invited as Assistant, then the existing Airtable row is upgraded to `Assistant` (no duplicate user or auth identity) and the inviter sees an upgrade confirmation.
- Given the invitee email is an Admin or Preacher, when a Preacher invites them as Assistant, then the request is rejected and no Airtable or Supabase mutation occurs.
- Given an authenticated Assistant, when they create a session, then the session is attributed to their assigned preacher and listed for that preacher, and locations are limited to that preacher's scope.
- Given an authenticated Assistant, when they open live attendance or session lists, then only the assigned preacher's sessions are readable; other sessions return 403.
- Given an authenticated Assistant, when they capture a contact, then the contact's Assigned Preacher is their preacher and Collected By is the assistant.
- Given an authenticated Assistant, when they navigate, then they reach Contact and Sessions but are denied `/admin/*`, `/volunteers`, `/manage`, and `/dashboard`.
- Given an Airtable user with Role `Assistant`, when they sign in, then `getStaffContext` resolves role `Assistant` (constraints, constants, and parsers all accept it) and they land on `/contact`.

## Design Notes

The upgrade path reuses the existing `upsertStaffUser` PATCH-on-existing-email primitive; the new behavior is detecting `existing.role === "Volunteer"` first so the response/UI can say "upgraded" and Admin/Preacher invitees are rejected instead of silently overwritten. An upgraded user's Supabase `staff_memberships.role` refreshes on next sign-in or staleness re-sync (Airtable is source of truth) — acceptable lag, matching how all Airtable role changes propagate today.

Assistant has no own `locationIds` (like Volunteer); every location/session scope check resolves the assigned preacher's locations server-side. This keeps one scoping model instead of two.

## Review Triage Log

**Layer: blind-hunter (12) + edge-case-hunter (6) + verification-gap (0).**

| # | Layer | Finding | Verdict | Evidence | Route |
|---|-------|---------|---------|----------|-------|
| 1 | edge | `volunteers/invite/route.ts:63` lets an Inactive Admin/Preacher be silently PATCHed to Assistant (status check excludes Inactive from the rejection) | high | `existing && existing.status !== "Inactive" && (existing.role === "Admin" \|\| existing.role === "Preacher")` — when status is Inactive the guard falls through to `upsertStaffUser`, which `updateRecord`s the row. Directly violates the AC "Given the invitee email is an Admin or Preacher, when a Preacher invites them as Assistant, then the request is rejected and no Airtable or Supabase mutation occurs." | patch |
| 2 | edge | `volunteers/invite/route.ts:62-78` allows an active Assistant to be silently demoted to Volunteer when invited as Volunteer | medium | Same guard pattern, no Assistant branch. Spec boundary "Never downgrade an existing Admin/Preacher" + the upgrade design ("An upgraded user's role refreshes on next sign-in") implies the same protection for Assistant. | patch |
| 3 | edge | `volunteers/invite/route.ts:62-78` allows a Preacher to reassign an existing Assistant assigned to a different Preacher | medium | `upsertStaffUser` is called with the new inviter's `assignedPreacherAirtableUserId`; the existing assigned-preacher is silently overwritten. Spec boundary "Never let an Assistant be self-managed" and the "no Admin action required" warning imply a single-preacher ownership invariant. | patch |
| 4 | edge | `volunteers/invite/route.ts:70` `upgraded` flag fires for Inactive Volunteer, mis-labeling the UI | low | `upgraded = Boolean(existing && existing.role === "Volunteer" && inviteRole === "Assistant")` — no status check. UI says "upgraded" while the user was not Active. | patch |
| 5 | blind | `volunteers/invite/route.ts` re-activation of an Inactive Assistant via a fresh invite does not set `upgraded` | low | Reactivation of a previously-Active user should arguably share the "upgraded" success message; minor UX nuance, no AC covers it. | patch |
| 6 | edge | `sessions/page.tsx:21-22` (and gita-life mirror) shows locations from an Inactive or non-Preacher `assignedPreacher`, but POST `/api/sessions` then 403s | medium | Page uses `assignedPreacher?.locationIds \|\| []` with no role/status check, while the API POST validates `assignedPreacher.role === "Preacher" && status === "Active"`. Page allows the user to fill a form that the server will reject. | patch |
| 7 | blind | `components/contact-form.tsx:72` hand-types the role union instead of importing `StaffRole` from `@hkmc/data-contracts` | low | Stylistic drift-prevention; using the canonical type would prevent the same drift a future fifth role would re-introduce. Fix is a type-only import. | reject (low, fix > direct correction — replaces the type with an import + a downstream test would be required) |
| 8 | blind | `apps/folk/app/api/contact/route.ts:63` interpolates the raw enum into a user-facing error message | low | `${staff.role} contact routing is not configured.` shows "Assistant"/"Volunteer" to end-users. Cosmetic UX. | reject (low; fix is more than a direct correction) |
| 9 | blind | The `role === "Volunteer" \|\| role === "Assistant"` predicate is repeated at 10+ sites without a shared helper | low | Refactor: extract `isPreacherScopedRole(role)` into a shared lib and reuse. Already exists locally in `components/invite-user-form.tsx`. | reject (low, refactor adds new public surface) |
| 10 | blind | gita-life counterpart of `apps/folk/app/contact/page.tsx` is not in the diff | false | Verified: `apps/gita-life/app/contact/page.tsx` does not branch on `role === "Volunteer" \|\| role === "Assistant"` — it has no role-based scoping branches at all. The spec's "check gita-life copy" instruction correctly concluded no edit is needed. | reject (false) |
| 11 | blind | Migration `20261002041000_allow_assistant_role.sql` only widens CHECK constraints, no RLS update | false | `grep "create policy" supabase/migrations/*.sql` returns zero hits. No RLS policies exist on these tables; nothing to update. | reject (false) |
| 12 | blind | `session.preacherIds.includes(staff.assignedPreacherAirtableUserId \|\| "")` uses a `\|\| ""` fallback | low | TypeScript narrowing trick; functionally correct given the `Boolean(...)` guard immediately above. | reject (low; fix is stylistic, not a defect) |
| 13 | blind | `components/header.tsx:213-220` repeats `Sessions` nav item across the `isAssistant`/`isPreacher` branches | low | Hoist the `Sessions` item out of the conditional. Stylistic. | reject (low, refactor) |
| 14 | blind | Landing-path helpers (`landingPathForRole` / `safeRedirectPath` / `safeLandingPath` / `safeNextPath`) are copy-pasted across 6 files | low | Spec's monorepo guardrail forces identical copies — extracting would diverge from the guardrail's "route copies must change identically" requirement. | reject (low, refactor; conflicts with spec's monorepo guardrail) |
| 15 | blind | `findStaffUserById(assignedPreacher)` is called per-request without caching | low | Performance optimization, not a correctness defect. | reject (low; performance, not user-visible defect) |
| 16 | blind | No RLS or Airtable `Role` single-select test/verification step | low | Spec's Verification section already calls for these as manual checks; the test infrastructure does not exist in this repo. Coverage observation, not a code defect. | reject (low, coverage only) |
| 17 | verification-gap | No verification gaps found (no behavioral tests in repo) | n/a | Reviewer correctly excluded blanket "no tests" findings per instruction. | n/a |

**Routes used:** `patch` (6), `reject` (10 false/low/refactor), `n/a` (1).

**Patch applied (re-verified):**
- `apps/folk/app/api/volunteers/invite/route.ts:62-78` + `apps/gita-life/...` — `existing.status !== "Inactive"` clause removed; new `existing.role === "Assistant" && existing.status === "Active" && inviteRole === "Volunteer"` rejection; new `existing.role === "Assistant" && existing.status === "Active" && existing.assignedPreacherAirtableUserId !== assignedPreacherId` rejection; `upgraded` flag now `Boolean(...status==="Active" && role==="Volunteer" && inviteRole==="Assistant") || Boolean(...role==="Assistant" && status==="Inactive" && inviteRole==="Assistant")`.
- `apps/folk/app/sessions/page.tsx:21-22` + `apps/gita-life/...` — Assistant branch now validates `assignedPreacher.role === "Preacher" && assignedPreacher.status === "Active"` (same predicate POST `/api/sessions` uses), with `scopedLocationIds = []` fallback for missing/ineligible assignments.

**Post-patch verification:**
- `pnpm exec tsc --noEmit` — 52 errors (identical to baseline; no new diagnostics).
- `pnpm build:apps` — both `@hkmc/folk` and `@hkmc/gita-life` build successfully (2 successful, 2 total).
- `pnpm test:program-readiness` — passes (exit 0).
- `git diff --stat 0df37c8` — 25 files modified, 1 new migration, +367/-93 lines.





**Commands:**
- `pnpm exec tsc --noEmit` -- expected: no type errors (build ignores TS errors).
- `pnpm lint` -- expected: no new findings beyond pre-existing warnings.
- `pnpm typecheck:workspace` -- expected: all workspace packages pass.
- `pnpm build:apps` -- expected: `@hkmc/folk` and `@hkmc/gita-life` build; monorepo parity guardrails green.
- `pnpm test:program-readiness` -- expected: pass.

**Manual checks (if no CLI):**
- Supabase migration applies cleanly (constraint widen) against a local/staging DB.
- Airtable Users `Role` single-select accepts `Assistant` (typecast auto-creates on first write; add the option deliberately in the base).
