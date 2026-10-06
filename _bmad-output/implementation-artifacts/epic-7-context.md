# Epic 7 Context: Airtable to Supabase Migration

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Airtable is currently the system of record for every operational entity — contacts, attendance, sessions, locations, and the all-roles users table — reached through formula-filtered REST calls with reference-data caches, while Supabase owns only auth and caches a staff bridge synced *from* Airtable. This epic consolidates all source data into Supabase Postgres on a new hosted project, replaces the split-brain with a Supabase-native `public.users` table and database-enforced row-level security, swaps every route and page to the new data layer, replaces the Airtable admin interface with an in-app `/manage` portal, deletes the Airtable dependency entirely, verifies on the hosted project, and cuts over with UUID-preserving backfill and auth migration. The payoff is per-role data isolation that Airtable could never enforce, plus removal of the second admin surface.

## Stories

- Story 7.1: Schema Migration — Users Table And Contact Field Gaps
- Story 7.2: Scoped RLS Policies On Contacts Attendance Sessions Locations
- Story 7.3: Supabase Data-Access Module Mirroring the Airtable Access Layer
- Story 7.4: Authz Rework — Staff Context Resolves From Supabase
- Story 7.5: Route And Page Swap To Supabase In Both Apps
- Story 7.6: In-App /manage Portal Replacing The Airtable Interface
- Story 7.7: Airtable Removal And Dependency Cleanup
- Story 7.8: Configure And Verify The Hosted Supabase Project And Preview Deployment
- Story 7.9: Cutover — Backfill, Auth Migration, Delta Sync, Go-Live

## Requirements & Constraints

- Postgres, not application code, must enforce uniqueness and integrity: one contact per normalized phone per program, one attendance row per contact per session, foreign keys in place of Airtable linked records.
- Record IDs become UUIDs. Every place that validates Airtable `rec*` IDs (including attendance ID parsing on the public route) must accept UUIDs before cutover.
- The public attendance contract is frozen: POST accepts `mobile` + `sessionId`; unknown contact returns 404 `notRegistered`; duplicate returns 409; create returns 201; session-window eligibility checks hold; the GET dashboard feed stays role-scoped. Installed PWAs and shared attendance links depend on this.
- The service-worker offline queue is frozen: intercepts offline POSTs to `/api/contact`, `/api/registration`, `/registration`, `/attendance`, stores them in IndexedDB, returns a synthetic `202 {queued: true}`, replays to the *original* URL on reconnect/background sync, and treats 409 as synced. Install prompt and caching are untouched.
- The four-role model (Admin, Preacher, Volunteer, Assistant) and its scoping semantics are preserved exactly: sessions scoped by creator, attendance dashboard Admin-all / Preacher-own-sessions / location-scoped / Assistant-via-assigned-preacher.
- Staff auth stays on Supabase Auth with server-side staff-context resolution and `audit_events` logging. The session-refresh proxy and its route matcher are preserved as-is. Sign-in, magic-link, and invite email flows and templates are unchanged.
- This is a multi-program monorepo (folk, gita-life) sharing `lib/` and `packages/`. Every table carries `program_id`, both programs migrate in the same change, and no policy ever resolves a folk JWT to gita-life rows or vice versa.
- Asia/Kolkata semantics for attendance-day filtering and the initial-contact / last-contacted-on dates are preserved.
- No local Supabase stack: dev, migration testing, and verification run directly against the hosted new project via gitignored `.env` files. That project is disposable pre-cutover — wipes and re-seeds are expected.
- Secrets (service-role key, JWT secret, DB password, SMTP creds) live only in env vars — Vercel–Supabase integration plus local env files. Never commit, hardcode, or paste into docs. The current credential set is scheduled for rotation after setup. Cutover's auth dump/restore and delta sync read old-project access from `.env.migration.local` and use the non-pooling Postgres URL, not the transaction-mode pooler.
- The existing Supabase project and both Airtable bases are read-only archives: no deletes, no schema changes, no write-backs. Nothing is written to them except the deliberate one-time read export.
- Cutover is big-bang — no dual-write period — but includes a one-shot delta sync of rows created during the testing window.
- Email during testing uses a sandbox SMTP sender, which does not deliver to real inboxes. A delivering sender must be swapped in before go-live or nobody receives sign-in/invite mail.
- Verification must be demonstrated per role and per table (out-of-scope rows unreadable with that user's own JWT), plus contract checks and a PWA offline smoke test.
- End state: no runtime Airtable reference anywhere outside docs/specs, and build, lint, and typecheck pass with no `AIRTABLE_*` env vars set.
- Non-goals: no UI redesign or new product features beyond the `/manage` portal; no Airtable-side or old-Supabase changes; the Airtable Analytics linked-record linkage is dropped rather than migrated.

## Technical Decisions

- The migration targets a **new, separate hosted Supabase project** (`etwunirahuucodcxydgs`, ap-south-1), already Vercel-linked. The migration branch's deployment is both the verification environment and the future production: it stays dark until the work completes, then goes live by distributing its link. There is no old production env to flip.
- `public.users` replaces both the Airtable Users table and the bridge tables (`staff_memberships`, `staff_profiles`, `airtable_identities`); `audit_events` is retained. Shape: `id UUID PK` referencing `auth.users(id)`; `role` and `status` as TEXT + CHECK (not pg enums); `UNIQUE(program_id, email)`; `location_ids UUID[]` array column rather than a join table; plus `invited_by` and `assigned_preacher_id`. The bridge direction inverts — Supabase becomes the source.
- RLS is scoped read-only. No authenticated INSERT/UPDATE/DELETE policies are granted on contacts, attendance, sessions, locations, or users; all mutations go through server routes with the service-role key, which bypasses RLS. Public unauthenticated attendance marking is a service-role server insert, not an RLS path.
- Scope keys: sessions by `created_by` (creator scoping replaced role+location); contacts by `assigned_preacher_id`; locations per-user via `location_ids`, resolving through the assigned preacher for Volunteer/Assistant (empty set when there is no active assigned preacher); users own row only, with Admin able to read all rows in program. Helper functions are SECURITY DEFINER.
- Picker lists (preachers, locations) stay server-mediated through the service role, as today, so non-admin roles need no cross-row `users` reads.
- The new data-access module exports the same function names and return shapes as the old Airtable access layer so consumer diffs stay import-only.
- The authz rework deletes the Airtable staff-sync path (the email lookup and Supabase-ID sync functions); staff context resolves from `public.users` and `audit_events` writes stay.
- Total and past-60-day attendance counts are computed as SQL views/queries over attendance, never stored columns. The interface's "past 2 months" label is a rolling 60-day window.
- Contact schema gaps to close: `source`, `photo_path`, `rounds`, `books_read TEXT[]`, `is_favorite`. Contact locations normalize to UUID foreign keys, so free-text Airtable location values need resolution during backfill.
- Photos live in a **private** `contact-photos` Storage bucket, rendered via signed URLs issued by server code. Backfill fetches the Airtable attachment URLs and uploads the files.
- Denormalized `phone`/`name` stay on attendance for the dashboard feed; the processed flag is dropped; attendance date falls back to `created_at`. Sessions keep server-generated attendance URLs from `NEXT_PUBLIC_SITE_URL`, and the eligibility logic in the shared attendance-session helper is unchanged.
- Backfill pages the Airtable REST API directly for both bases (CSV export is a UI-only feature), persists a `rec*`→UUID mapping table, loads via service role, and verifies per-table per-program counts. `auth.users` moves via dump/restore of the auth schema with UUIDs preserved so staff links, sessions, and audit references survive.
- Do not push the repo's `config.toml` verbatim — its auth section is configured for the discarded local mailpit workflow; configure the hosted project's site/redirect URLs and templates explicitly.
- Repo docs (data models, architecture, API contracts) are updated to the Supabase-only reality as part of this epic.

## UX & Interaction Patterns

- `/manage` is Admin- and Preacher-only and must cover five screens: a dashboard (total contacts, new-contacts-per-quarter line chart, past-60-day session-attendance status pie, and sessions/attendance bar charts stacked by location with Month + Year filters and Reset), a contacts table (group, filter, sort, search) with total and past-60-day attendance counts plus collected-by, a sessions list grouped by location with attendee name chips and a count column sum, an attendance screen with location multi-select plus a per-contact panel listing sessions attended in the last 60 days and a records table, and a favorites screen with a searchable, location-filtered contact list and an editable contact detail form (photo upload, name, phone, college, rounds, books read multi-select, company, date of birth, notes, initial contact, location, plus computed total and last-60-days sessions attended).
- Admin's dual mode — program-wide across all preachers versus own data as a preacher — is an app-layer filter on top of program-wide RLS scope, not a separate policy.
- The portal uses the app's existing design language. Feature parity means the data and views, not Airtable's chrome: no interface navigation, record coloring, "Go to interface" buttons, description placeholders, or Airtable filter-builder UI. `/manage` must stop redirecting to Airtable.
- Elsewhere, screens change only where a data call moves. Mobile normalization and the queued-vs-synced feedback states stay consistent.

## Cross-Story Dependencies

- 7.1 precedes 7.2 and 7.4: the scoped policies and the reworked staff context both resolve scope through `public.users`.
- 7.3 precedes 7.5: the import-only swap requires the new module's exported surface to match the old one first.
- 7.6 depends on 7.1's contact columns, computed attendance views, and photo bucket, plus 7.3's data access.
- 7.7 can only run after 7.5; 7.8 verifies the result of 7.1–7.6 and gates 7.9, which additionally consumes the documented playbook procedure.
- The epic builds on earlier epics' staff auth and role model, attendance capture and offline queue, admin invite and location management, and the `/manage` entry point that currently redirects to Airtable.
- Go-live is blocked on a delivering SMTP sender and on passing per-role RLS, attendance-contract, offline-replay, and PWA verification.
