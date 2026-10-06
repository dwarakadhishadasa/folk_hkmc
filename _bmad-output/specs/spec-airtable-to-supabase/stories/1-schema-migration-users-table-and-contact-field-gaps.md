---
title: 'Schema migration — users table and contact field gaps'
type: 'feature'
created: '2026-10-06'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** The hosted Supabase project `etwunirahuucodcxydgs` lacks the native `public.users` table that the cover-link gap analysis in `data-model-mapping.md` and `SPEC.md` (CAP-1, CAP-2, CAP-9 schema) requires for staff context, and the contact table is missing five Airtable-mirrored columns. Several FK constraints the core-tables migration left as plain UUIDs need to be enforced by Postgres, and the per-contact attendance rollups the `/manage` portal (story 6) needs are not yet exposed as a query surface. CAP-1, CAP-2, and CAP-9 schema are all blocked on this.

**Approach:** One new migration (additive, no edits to `20261004000000_create_core_tables.sql`) creates `public.users` (all-roles, distinct from `auth.users`), backfills the FK constraints the core-tables migration left as plain UUIDs, adds the five contact columns, exposes per-contact attendance-counts as a SQL view computed against Asia/Kolkata with a 60-day rolling window, and provisions a private `contact-photos` Storage bucket. `lib/supabase/types.ts` is regenerated against the linked hosted project. The existing bridge tables (`staff_memberships`, `staff_profiles`, `airtable_identities`) and `audit_events` are deliberately untouched so existing authz keeps working mid-migration.

## Boundaries & Constraints

**Always:**
- Migration is additive — never alters `20261004000000_create_core_tables.sql`.
- `public.users.id` is `UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`.
- `public.users.role` and `status` are TEXT (not pg enums), with CHECK IN clauses per SPEC.md assumption.
- `public.users.location_ids` is `UUID[]` (no join table, per SPEC.md assumption).
- `public.users.UNIQUE(program_id, email)` per SPEC.md assumption.
- `public.users.assigned_preacher_id` is `UUID REFERENCES public.users(id)` (self-FK resolves Assistant → Preacher).
- New FK constraints use `ON DELETE SET NULL` for `assigned_preacher_id` / `collected_by_id` / `preacher_id` / `created_by` so removing a user doesn't nuke operational history.
- `sessions.location_id` FK uses `ON DELETE RESTRICT` so a location with sessions can't be deleted silently.
- `past_60_day_attendance_count` is computed against `now() AT TIME ZONE 'Asia/Kolkata' - INTERVAL '60 days'`.
- `contact-photos` bucket is private; only the service role mints signed URLs (story 6).
- All Supabase access from app/server code goes through `lib/supabase/{client,server,admin}.ts`; never read env vars directly.
- Hosted project link: `etwunirahuucodcxydgs` (ap-south-1). CLI credentials live in gitignored `.env.migration.local` (read values, never copy them). Migrations apply via `supabase db push`; fallback is `--db-url $POSTGRES_URL_NON_POOLING`.
- The hosted project is disposable pre-cutover: wipe/re-seed freely.
- `audit_events`, `staff_memberships`, `staff_profiles`, `airtable_identities` are not modified by this migration; the bridge tables stay until the cleanup story.
- The old Supabase project `cparpinmalqsimninyfw` and both Airtable bases are read-only archives — never touch them.

**Never:**
- No RLS policies are added, dropped, or changed — that is story 2's job.
- No pg enums for `role` / `status` (TEXT + CHECK only).
- No join table for `users.location_ids` (use the array column).
- No `public.users` RLS in this story (deferred to story 2).
- No drop of bridge tables (`staff_memberships` / `staff_profiles` / `airtable_identities`) in this story — they stay so existing authz keeps working.
- No code changes to `lib/authz.ts`, `lib/airtable.ts`, route handlers, or pages in this story — that is stories 3–6.
- No client-side ID validation updates (rec* regex → UUID); that is story 5.
- No photo upload wiring or signed-URL helpers; this story only creates the bucket.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH | Apply migration on a fresh hosted project, then `INSERT INTO public.users (id, program_id, email, role, status) VALUES (auth.users.id, 'folk', 'a@b', 'Preacher', 'Active')` with a valid `auth.users.id` | Row inserted; FK satisfied | No error expected |
| ERROR_CASE | `INSERT INTO public.users` with `assigned_preacher_id` = random non-existent UUID | INSERT rejected with Postgres FK violation (SQLSTATE 23503) | Application maps 23503 → validation error |
| ERROR_CASE | `UPDATE contacts SET assigned_preacher_id = '<random-uuid>'` where the UUID has no matching row | UPDATE rejected with FK violation (SQLSTATE 23503) | Map to validation error |
| ERROR_CASE | `UPDATE sessions SET location_id = '<random-uuid>'` | UPDATE rejected with FK violation (SQLSTATE 23503) | Map to validation error |
| HAPPY_PATH | `SELECT * FROM contact_attendance_counts WHERE contact_id = '<id>'` | Returns one row with `total_attendance_count` (count of all attendance rows) and `past_60_day_attendance_count` (count where created_at ≥ now() AT TIME ZONE 'Asia/Kolkata' − INTERVAL '60 days') | No error expected |
| HAPPY_PATH | `SELECT * FROM storage.buckets WHERE name = 'contact-photos'` | Bucket row present with `public = false` | No error expected |
| ERROR_CASE | Anon client (anon key) tries to `SELECT` from `storage.objects` where bucket_id = 'contact-photos' | SELECT blocked by storage RLS (anon has no access to private bucket) | Server-side signed URL mint is the documented flow |

</intent-contract>

## Code Map

- `supabase/migrations/20261004000000_create_core_tables.sql` — baseline to NOT edit; contains `contacts` (no source/photo_path/rounds/books_read/is_favorite), `locations`, `sessions` (preacher_id/location_id plain UUIDs), `attendance`. Also defines RLS-placeholder policies to be left in place this story (story 2 replaces them).
- `supabase/migrations/20260613010000_add_program_scoped_staff_memberships.sql` — defines `public.programs`, `public.staff_memberships`, `public.airtable_identities`, `public.airtable_sync_state`, `public.audit_events` (line 81). Untouched this story.
- `supabase/migrations/20260504100000_create_staff_identity_bridge.sql` — `staff_profiles` table origin. Untouched this story.
- `supabase/migrations/20261002041000_allow_assistant_role.sql` — already extends `staff_profiles.role` CHECK to allow `'Assistant'`. Reference for the new `public.users.role` CHECK semantics.
- `supabase/migrations/20261006000000_add_users_and_contact_columns.sql` — NEW. The single deliverable of this story.
- `lib/supabase/env.ts` — env resolution contract; never read `process.env` outside this module.
- `lib/supabase/server.ts` — `createSupabaseServerClient()` (cookie-bound, for authenticated reads under RLS).
- `lib/supabase/admin.ts` — `createSupabaseAdminClient()` (service-role, bypasses RLS, used for all writes from server routes; also for story 1's `supabase db push` and `supabase gen types` operations).
- `lib/supabase/client.ts` — `createSupabaseBrowserClient()` for client components.
- `lib/supabase/types.ts` — regenerated at the end of this story by `supabase gen types typescript --linked`.
- `supabase/config.toml` — local-only config (used by `supabase link`); the `[auth]` section is local-mailpit and is NOT pushed (`supabase config push` is forbidden by story 8).
- `supabase/templates/invite.html`, `supabase/templates/magic-link.html` — only email templates that exist; not touched this story.
- `.env.migration.local` (gitignored) — supplies `SUPABASE_ACCESS_TOKEN`, `POSTGRES_URL_NON_POOLING`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, anon/publishable keys. Read values from here for CLI/Postgres; never copy them into code, docs, spec artifacts, commits, or chat.

## Tasks & Acceptance

**Execution:**
- `supabase/migrations/20261006000000_add_users_and_contact_columns.sql` -- CREATE (single new file, additive) -- One migration that introduces `public.users` with all required columns/CHECKs/UNIQUE/self-FK, back-fills the four FK constraints on `sessions` / `contacts`, adds the five contact columns, creates `contact_attendance_counts` view (Asia/Kolkata 60-day window), provisions the private `contact-photos` Storage bucket. Migrations are timestamp-prefixed; 20261006000000 is the next slot after the 2026-10-04 core-tables migration.
- `lib/supabase/types.ts` -- REGENERATE via `supabase gen types typescript --linked` -- Replaces hand-maintained types with the live schema; needed by stories 3–6 which import `Database` types.
- Run after writing: `supabase link --project-ref etwunirahuucodcxydgs` (uses SUPABASE_ACCESS_TOKEN from `.env.migration.local`), `supabase db push` to apply; if push fails on the pooler, retry with `--db-url $POSTGRES_URL_NON_POOLING`. Verify with `supabase db diff --linked` returning no drift.

**Acceptance Criteria:**
- Given a fresh `etwunirahuucodcxydgs` project, when I run `supabase link` and `supabase db push`, then the migration applies cleanly and `audit_events`, `staff_memberships`, `staff_profiles`, `airtable_identities` are still present and unchanged (row counts in each bridge table are zero, but their schemas are intact).
- Given `public.users` exists, when I query `information_schema.columns` on `public.users`, then I see exactly: `id UUID PK`, `program_id TEXT NOT NULL`, `email TEXT NOT NULL`, `name TEXT`, `role TEXT` with CHECK allowing the four values, `status TEXT` with CHECK allowing the four values, `location_ids UUID[]`, `assigned_preacher_id UUID`, `invited_by UUID`, `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`, plus a `UNIQUE (program_id, email)` constraint.
- Given the FK constraints are added, when I `UPDATE contacts SET assigned_preacher_id = '00000000-0000-0000-0000-000000000000'` (no matching users row), then the UPDATE is rejected with Postgres FK violation.
- Given the contact columns added, when I query `information_schema.columns` on `contacts`, then `source TEXT`, `photo_path TEXT`, `rounds TEXT`, `books_read TEXT[]`, `is_favorite BOOLEAN DEFAULT false` are present and the existing columns are unchanged.
- Given the `contact_attendance_counts` view, when I insert attendance rows for a contact and `SELECT * FROM contact_attendance_counts WHERE contact_id = '<id>'`, then `total_attendance_count` equals the total and `past_60_day_attendance_count` correctly counts only rows where `created_at >= (now() AT TIME ZONE 'Asia/Kolkata') - INTERVAL '60 days'` (verify by inserting one row older than 60 days and one newer).
- Given the `contact-photos` bucket, when I query `storage.buckets WHERE name = 'contact-photos'`, then one row exists with `public = false` (and `id = 'contact-photos'`).
- Given `lib/supabase/types.ts` regenerated, when I inspect `Database['public']['Tables']`, then a `users` entry exists with `Row`, `Insert`, `Update` shapes; `contacts` has the five new columns; the `Database['public']['Views']` has a `contact_attendance_counts` entry.
- Given the regenerated types compile, when I run `pnpm typecheck`, then no type errors reference the missing `public.users` table or the new contact columns.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Why TEXT + CHECK rather than pg enums:** per the SPEC.md assumption (story 1), role/status stay TEXT so values can be added without an `ALTER TYPE ... ADD VALUE` migration. The CHECK clause still enforces the four-value contract.
- **Why `location_ids` is `UUID[]` rather than a join table:** per the SPEC.md assumption. The volunteer/assistant RLS scoping resolves through `users.location_ids`; a join table would add an extra hop with no functional gain for an array scoped to a single user's permissions.
- **Why `assigned_preacher_id` uses `ON DELETE SET NULL`:** removing a user must not cascade-delete operational rows. Sessions, contacts, and audit events are tied to who created/owns them; the link can be nulled but the row stays.
- **Why the 60-day window uses `AT TIME ZONE 'Asia/Kolkata'`:** attendance-day boundaries are program-day semantics in Asia/Kolkata. A naive `now() - interval '60 days'` would mix UTC and local-day cutoffs and miscount rows near midnight IST.
- **Why the view is named `contact_attendance_counts` (singular for both fields):** the contacts table is the implicit parent; per-row the view returns one tuple with both counts side-by-side, which matches how `/manage` reads them.
- **Why a Storage bucket via SQL (not the dashboard):** the migration story must be replayable — provisioning the bucket via SQL makes the migration self-contained.

## Verification

**Commands:**
- `supabase link --project-ref etwunirahuucodcxydgs` -- expected: project linked, `.supabase/` written.
- `supabase db push` -- expected: migration `20261006000000_add_users_and_contact_columns` applies; `audit_events`, `staff_memberships`, `staff_profiles`, `airtable_identities` still present.
- `supabase gen types typescript --linked > lib/supabase/types.ts` -- expected: `Database['public']['Tables']['users']`, `Database['public']['Views']['contact_attendance_counts']`, and updated `contacts` columns appear.
- `pnpm typecheck` -- expected: no type errors.

**Manual checks (if no CLI):**
- After push, run in psql or the Supabase SQL editor:
  - `\d public.users` shows the column list per the spec.
  - `SELECT conname, conrelid::regclass, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid IN ('public.contacts'::regclass, 'public.sessions'::regclass) AND contype = 'f';` shows four new FKs (contacts × 2, sessions × 2).
  - `SELECT * FROM contact_attendance_counts;` returns rows for seeded attendance.
  - `SELECT id, name, public FROM storage.buckets WHERE name = 'contact-photos';` returns `public = false`.
- FK-violation probes (each should fail with 23503):
  - `INSERT INTO public.users (id, program_id, email, role, status, assigned_preacher_id) VALUES (gen_random_uuid(), 'folk', 'x@y', 'Volunteer', 'Active', '00000000-0000-0000-0000-000000000000');`
  - `UPDATE public.contacts SET assigned_preacher_id = '00000000-0000-0000-0000-000000000000' WHERE id = (SELECT id FROM public.contacts LIMIT 1);`
  - `UPDATE public.sessions SET location_id = '00000000-0000-0000-0000-000000000000' WHERE id = (SELECT id FROM public.sessions LIMIT 1);`
- Confirm untouched tables:
  - `\d public.audit_events`, `\d public.staff_memberships`, `\d public.staff_profiles`, `\d public.airtable_identities` -- expected: schemas unchanged from `20260613010000_add_program_scoped_staff_memberships.sql` and `20260504100000_create_staff_identity_bridge.sql`.

## Auto Run Result

Status: ready-for-dev
Blocking condition: invocation prompt explicitly directs `Halt after planning.`