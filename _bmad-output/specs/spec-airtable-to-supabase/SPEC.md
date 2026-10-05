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

A pain to solve, with an opportunity attached. Airtable is the system of record for every operational entity — contacts, attendance, sessions, locations, and the staff/preacher users table — reached through REST calls with formula filters and 20-minute reference caches, while Supabase already owns auth and merely caches a staff-authorization bridge synced *from* Airtable (`staff_memberships`, `staff_profiles`, `airtable_identities`). This split-brain costs latency, rate-limit exposure, and a second admin surface. Consolidating all source data into Supabase removes the Airtable dependency entirely and unlocks the thing Airtable could never give us: database-enforced row-level security so each staff user sees only their own data.

## Capabilities

- **CAP-1**
  - **intent:** Contacts, locations, sessions, and attendance are stored in Supabase Postgres, program-scoped, with foreign keys and uniqueness constraints replacing Airtable linked-record behavior (e.g. one attendance row per contact per session, one contact per phone per program).
  - **success:** A migration applies cleanly on a fresh database; uniqueness and FK violations are enforced by Postgres, not by application code.
- **CAP-2**
  - **intent:** Staff and preacher source data (role, status, locations, assigned preacher, Supabase user linkage) is authored and read in Supabase, so staff-context resolution and invite flows never call Airtable.
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
  - **intent:** Offline/PWA behavior is preserved: the localStorage queue replays registration and attendance submissions to `/api/registration` and `/api/attendance`, treats 409 as synced, and the install prompt/service worker are untouched.
  - **success:** With the network offline, a submission queues locally; on reconnect it syncs to the Supabase-backed endpoints and clears from the queue (409 included).
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
- The offline queue endpoints `/api/registration` and `/api/attendance`, and the rule that a 409 response counts as synced, must keep working unchanged.
- The role model Admin/Preacher/Volunteer/Assistant is preserved with its existing scoping semantics: sessions are scoped by creator; the attendance dashboard is Admin-all, Preacher-own-sessions, location-scoped for others, and Assistant-scoped via the assigned preacher.
- Staff auth stays on Supabase Auth with server-side staff-context resolution and `audit_events` logging; `proxy.ts` (Supabase session refresh and its route matcher) is preserved as-is.
- This is a multi-program monorepo (folk, gita-life) sharing `lib/` and `packages/`; every new table carries `program_id` and both programs migrate in the same change.
- Asia/Kolkata timezone semantics for attendance-day filtering and `Initial Contact` / `Last Contacted On` dates are preserved.
- Record IDs become UUIDs; every place that validates Airtable `rec*` IDs (e.g. `parseKnownAttendanceIds` in the attendance route) must accept UUIDs before cutover.
- The migration lands on a **new, separate Supabase project**, already provisioned and Vercel-linked: `etwunirahuucodcxydgs` (region ap-south-1). The app is repointed to it only when verified.
- There is **no local Supabase stack**: development, migration testing, and verification run directly against the hosted new project. `supabase start` / `supabase db reset` local workflows are dropped; local dev points at the hosted project via gitignored `.env` files.
- The new hosted project is disposable **pre-cutover**: full data wipes (reset and re-seed) are permitted and expected during development. This permission never extends to the old project or the Airtable base.
- Supabase secrets (service-role key, JWT secret, DB password) live only in environment variables — synced via the Vercel–Supabase integration and local `.env` files — never committed, hardcoded, or embedded in docs; the current credential set is scheduled for rotation after setup.
- The existing Supabase project (`cparpinmalqsimninyfw`) and the Airtable base (`appqea9DRLOXqErXb`) are preserved untouched — no deletes, no schema changes, no write-backs; they remain as archives and fallback.
- Cutover is still big-bang (no dual-write period), but the flip includes a **one-shot delta sync** of any fresh data created in the old Supabase project during the testing window, plus the one-time Airtable export/import (with `rec*`→UUID mapping table).
- `auth.users` is migrated from the old project to the new one **preserving UUIDs** (decided, OQ-5), so staff links, sessions, and `audit_events` references survive the move.
- The `feature/migrate-airtable-to-supabase` branch serves as the preview deployment, with the new project's env vars scoped to that branch's preview environment; production stays on the old project until cutover.

## Non-goals

- No UI/UX redesign and no new product features beyond CAP-9; existing screens change only where a data call moves. CAP-9 replicates the Airtable Interface's functionality in the app's design language — it does not pixel-copy Airtable's chrome.
- No changes to Supabase Auth sign-in, magic-link, or invite email flows and templates.
- No Airtable-side changes and no old-Supabase changes: nothing is written back to either, and neither the Airtable base nor the existing Supabase project is deleted or restructured as part of this work.
- No migration of the Airtable "Analytics" linked-record table; the linkage is dropped (decided, OQ-3).

## Success signal

On a Supabase-only deployment with no `AIRTABLE_*` env vars set, a volunteer marks attendance offline, reconnects, and the record lands in Postgres; the live dashboard shows it to exactly the roles whose scope covers it and to no one else, and `grep -ri airtable` over runtime code returns nothing.

## Open questions

- **OQ-7:** With the Vercel–Supabase link live, which Vercel environments received the new project's env vars? Production must keep resolving the **old** project's vars until cutover — confirm the integration did not overwrite Production env, since a prod deploy pointing at the empty new project would break the live app.

## Assumptions

- Both programs (folk, gita-life) cut over together, since they share the same `lib/` data layer.
- The bridge tables `staff_memberships` / `staff_profiles` / `airtable_identities` are replaced or repurposed by Supabase-native staff tables; `audit_events` is retained.
- Writes continue through server routes using the service-role key; RLS governs authenticated reads, not direct client writes.
