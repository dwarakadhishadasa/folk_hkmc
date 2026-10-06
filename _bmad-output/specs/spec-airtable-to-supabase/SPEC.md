---
id: SPEC-airtable-to-supabase
companions:
  - rls-policy-matrix.md
  - data-model-mapping.md
  - migration-playbook.md
  - manage-interface.md
  - ../../docs/data-models.md
  - ../../docs/api-contracts.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Migrate Backend from Airtable to Supabase

## Why

A pain to solve, with an opportunity attached. Airtable is the system of record for every operational entity — contacts, attendance, sessions, locations, and the users table covering all staff roles — reached through REST calls with formula filters and 20-minute reference caches, while Supabase already owns auth and merely caches a staff-authorization bridge synced *from* Airtable (`staff_memberships`, `staff_profiles`, `airtable_identities`). This split-brain costs latency, rate-limit exposure, and a second admin surface. Consolidating all source data into Supabase removes the Airtable dependency entirely and unlocks the thing Airtable could never give us: database-enforced row-level security so each staff user sees only their own data.

## Capabilities

- **CAP-1**
  - **intent:** Contacts, locations, sessions, and attendance are stored in Supabase Postgres, program-scoped, with foreign keys and uniqueness constraints replacing Airtable linked-record behavior (e.g. one attendance row per contact per session, one contact per phone per program).
  - **success:** A migration applies cleanly on a fresh database; uniqueness and FK violations are enforced by Postgres, not by application code.
- **CAP-2**
  - **intent:** All user source data — every role: Admin, Preacher, Volunteer, Assistant (role, status, locations, assigned preacher, Supabase user linkage) — is authored and read in a Supabase-native `public.users` table, so staff-context resolution and invite flows never call Airtable.
  - **success:** `getStaffContext` and every invite/admin route complete with zero network calls to api.airtable.com; the Airtable→Supabase sync path (`syncStaffProfileByEmail` reading Airtable Users) is gone.
- **CAP-3**
  - **intent:** Row-level security on contacts, attendance, sessions, and locations restricts each authenticated user to their own scoped rows per the role matrix in `rls-policy-matrix.md`.
  - **success:** With RLS enabled, a non-admin authenticated user querying with their own JWT cannot read rows outside their scope (demonstrated per-role, per-table); service-role server writes are unaffected.
- **CAP-4**
  - **intent:** Every API route and page — registration, contact, sessions, attendance, admin/locations, invites, dashboard, manage, signin — reads and writes Supabase instead of Airtable.
  - **success:** No route or page imports `lib/airtable` or `@hkmc/airtable`; each endpoint's existing response contract still holds.
- **CAP-5**
  - **intent:** The public `/attendance` flow keeps its exact contract: POST with mobile + sessionId, `notRegistered` 404, `duplicate` 409, 201 on create, session-window eligibility checks, and the role-scoped GET dashboard feed.
  - **success:** Contract tests (or manual runs) against the Supabase-backed route reproduce each status code and response shape documented in `docs/api-contracts.md`.
- **CAP-6**
  - **intent:** Offline/PWA behavior is preserved: the service worker (`public/sw.js`) intercepts offline POSTs to `/api/contact`, `/api/registration`, `/registration`, and `/attendance`, queues them in IndexedDB, returns a synthetic `202 {queued: true}`, and replays to the original URL on reconnect/background-sync, treating 409 as synced; the install prompt and caching behavior are untouched. (Corrected 2026-10-06: the queue is the service worker, not `lib/offline-sync.ts`, which is dead code.)
  - **success:** With the network offline, a submission to any queued path returns 202 and is stored; on reconnect it replays to the Supabase-backed endpoint and clears from the queue (409 included).
- **CAP-7**
  - **intent:** All Airtable dependencies are removed: `lib/airtable.ts`, `packages/airtable`, `shared-airtable.ts` table-ID config, `AIRTABLE_*` env vars, and `@hkmc/airtable` workspace dependencies.
  - **success:** Repo-wide search finds no runtime Airtable reference outside docs/specs; build, lint, and typecheck pass without the Airtable env vars set.
- **CAP-8**
  - **intent:** The migration procedure is captured as an ordered, reusable playbook so the same migration can be replayed later on main/prod.
  - **success:** `migration-playbook.md` lists every step actually performed on this branch, and a reviewer can follow it to plan the prod cutover without interviewing the author.
- **CAP-9**
  - **intent:** Admin and Preacher staff get an in-app management portal at `/manage` replacing the Airtable Interface: dashboard statistics and charts, a contacts table with attendance counts, a location-grouped sessions view, per-contact attendance history, and favorites/contact-detail editing — per `manage-interface.md`.
  - **success:** Every screen in `manage-interface.md` has an in-app equivalent fed by Supabase; an Admin sees program-wide aggregates (and can switch to their own preacher-scoped view), a Preacher sees only their own data, and `/manage` no longer references any Airtable URL.

## Constraints

- The `/attendance` route path, request payload (`mobile`, `sessionId`), and response shapes/status codes must not change; installed PWAs and shared attendance links depend on them.
- The service worker's offline queue — queued paths `/api/contact`, `/api/registration`, `/registration`, `/attendance`, replay to the original URL, 409 counts as synced, synthetic `202 {queued: true}` while offline — must keep working unchanged.
- The role model Admin/Preacher/Volunteer/Assistant is preserved with its existing scoping semantics: sessions are scoped by creator; the attendance dashboard is Admin-all, Preacher-own-sessions, location-scoped for others, and Assistant-scoped via the assigned preacher.
- Staff auth stays on Supabase Auth with server-side staff-context resolution and `audit_events` logging; `proxy.ts` (Supabase session refresh and its route matcher) is preserved as-is.
- This is a multi-program monorepo (folk, gita-life) sharing `lib/` and `packages/`; every new table carries `program_id` and both programs migrate in the same change.
- Asia/Kolkata timezone semantics for attendance-day filtering and `Initial Contact` / `Last Contacted On` dates are preserved.
- Record IDs become UUIDs; every place that validates Airtable `rec*` IDs (e.g. `parseKnownAttendanceIds` in the attendance route) must accept UUIDs before cutover.
- The migration lands on a **new, separate Supabase project**, already provisioned and Vercel-linked: `etwunirahuucodcxydgs` (region ap-south-1). The app is repointed to it only when verified.
- There is **no local Supabase stack**: development, migration testing, and verification run directly against the hosted new project. `supabase start` / `supabase db reset` local workflows are dropped; local dev points at the hosted project via gitignored `.env` files.
- The new hosted project is disposable **pre-cutover**: full data wipes (reset and re-seed) are permitted and expected during development. This permission never extends to the old project or the Airtable base.
- Supabase secrets (service-role key, JWT secret, DB password) live only in environment variables — synced via the Vercel–Supabase integration and local `.env` files — never committed, hardcoded, or embedded in docs; the current credential set is scheduled for rotation after setup.
- Deployment topology (corrected 2026-10-06): the deployment users currently use is itself a **preview** Vercel deployment on the old stack. The migration branch's Vercel deployment — new project's vars, Production-scoped — **is the future production**: it stays dark until all migration work completes, then its link is distributed to users. There is no old-stack production deployment to protect; "cutover" means distributing the new link after the data migration.
- The existing Supabase project (`cparpinmalqsimninyfw`) and both Airtable bases (folk `appqea9DRLOXqErXb`, gita-life `appzbssqNK53yqjZH`) are preserved untouched — no deletes, no schema changes, no write-backs; they remain as archives and fallback.
- Cutover is still big-bang (no dual-write period), but the flip includes a **one-shot delta sync** of any fresh data created in the old Supabase project during the testing window, plus the one-time Airtable export/import (with `rec*`→UUID mapping table).
- `auth.users` is migrated from the old project to the new one **preserving UUIDs** (decided, OQ-5), so staff links, sessions, and `audit_events` references survive the move.
- The `feature/migrate-airtable-to-supabase` branch's deployment serves as the verification environment throughout, and becomes the production deployment at cutover; the old stack's preview deployment keeps serving users until the new link is distributed.
- The future-production URL is `https://folk-hkmc-rho.vercel.app` (decided, OQ-10) — auth site/redirect URLs and the distributed go-live link use it.
- Email on the new project uses **Mailtrap sandbox SMTP** during testing (decided, OQ-9): mail lands in a test inbox, **not** real staff inboxes. Before go-live it must be swapped for a delivering sender (real SMTP or Supabase default) or no one receives sign-in/invite emails.
- Cutover's `auth.users` dump/restore and delta sync use old-project credentials (service-role key + Postgres URLs) from the gitignored `.env.migration.local` (OQ-8 fully resolved 2026-10-06).

## Non-goals

- No UI/UX redesign and no new product features beyond CAP-9; existing screens change only where a data call moves. CAP-9 replicates the Airtable Interface's functionality in the app's design language — it does not pixel-copy Airtable's chrome.
- No changes to Supabase Auth sign-in, magic-link, or invite email flows and templates.
- No Airtable-side changes and no old-Supabase changes: nothing is written back to either, and neither the Airtable bases nor the existing Supabase project is deleted or restructured as part of this work.
- No migration of the Airtable "Analytics" linked-record table; the linkage is dropped (decided, OQ-3).

## Success signal

On a Supabase-only deployment with no `AIRTABLE_*` env vars set, a volunteer marks attendance offline, reconnects, and the record lands in Postgres; the live dashboard shows it to exactly the roles whose scope covers it and to no one else, and `grep -ri airtable` over runtime code returns nothing.

## Assumptions

- Both programs (folk, gita-life) cut over together, since they share the same `lib/` data layer.
- The bridge tables `staff_memberships` / `staff_profiles` / `airtable_identities` are replaced by the Supabase-native `public.users` table covering all roles; `audit_events` is retained.
- Writes continue through server routes using the service-role key; RLS governs authenticated reads, not direct client writes.
- `public.users` specifics (story 1): `id UUID PK REFERENCES auth.users(id)`; `role`/`status` are TEXT + CHECK (`Admin|Preacher|Volunteer|Assistant`, `Active|Inactive|Suspended|Revoked`), not pg enums; `UNIQUE(program_id, email)`; `location_ids UUID[]` (no join table).
- `public.users` RLS: authenticated SELECT of own row, or all rows in own program for Admin; picker lists (preachers/locations) stay server-mediated via service role, as today; no authenticated writes.
- The `contact-photos` bucket is **private**; photos render via signed URLs from server code (a public bucket would expose contact photos unauthenticated).
- The interface's "past 2 months" counts are implemented as a rolling 60-day window (`past_60_day_attendance_count`) — the interface itself labels the contacts column `Past60DayAttendanceCount`.
