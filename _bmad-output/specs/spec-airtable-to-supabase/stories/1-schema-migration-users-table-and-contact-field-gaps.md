---
title: 'Schema migration — users table and contact field gaps'
type: 'feature'
created: '2026-10-06'
status: 'done'
baseline_revision: 2fe056069f4b707d53a38878caffe10599d0b2c3
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      No automated verification applies migrations or asserts the contact_attendance_counts rollup; CI runs guardrails/typecheck/build/lint only and the repo has zero test files.
    evidence: |-
      Pre-verified by the verification-gap review layer: .github/workflows/quality-gates.yml has no step that starts Supabase or applies migrations; a repo-wide search finds no *.test.*/*.spec.* files and no pgTAP/supabase-test configuration. Pre-existing gap, not caused by this story; stories.yaml assigns the verification suite to story 8. This run executed every acceptance probe manually against the hosted project (see Verification). The intent-alignment layer's surface-mismatch observation (the diff encodes no executable evidence for the hosted-state I/O matrix) shares this root cause.
    location: >-
      .github/workflows/quality-gates.yml
    severity: medium
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

### 2026-10-06 — Review pass
- verdicts: 28 findings — high 0, medium 2, low 13, false 13, maybe-false 0
- findings:
  - `[low]` `[reject]` 60-day window formula coerced via session tz, boundary off ~5.5h from Kolkata wall clock — behavior is verbatim contract-mandated (Boundaries Always clause, matrix row, AC) and AC-verified with 70d/5d probe; deterministic under hosted UTC session tz; hour-level precision is negligible for a 60-day rolling count, and changing the formula would deviate from the pinned contract
  - `[false]` `[reject]` FK constraints without NOT VALID fail on populated DB — hosted contacts/sessions/attendance/locations/users all verified 0 rows; AC targets a fresh project; story 9 loads data only after schema per playbook order
  - `[low]` `[reject]` ADD CONSTRAINT lacks idempotency guard unlike IF NOT EXISTS neighbors — applied cleanly; supabase migration tracking is run-once; guards would add DO-block complexity for a partial-failure retry outside the tooling contract; editing the already-applied file would itself create remote drift
  - `[false]` `[reject]` users.invited_by lacks FK — contract's AC column list specifies plain `invited_by UUID` with no reference; informational audit pointer; no harm demonstrated
  - `[false]` `[reject]` users.program_id has no FK to programs, "odd one out" — refuted: core operational tables (contacts/sessions/locations/attendance) all carry `program_id TEXT` with no programs FK; users matches that family; bridge tables are the different family
  - `[low]` `[reject]` UNIQUE(program_id,email) + auth-shared PK blocks multi-program membership — the intent itself pins both constraints (contract Always list, all-roles generalization 2026-10-06); changing it edits the captured intent, which this pass cannot do
  - `[false]` `[reject]` no updated_at trigger on public.users — no core operational table has an updated_at trigger (only programs has one); contract requires only "timestamps"
  - `[false]` `[reject]` is_favorite nullable three-state — contract and AC pin `is_favorite BOOLEAN DEFAULT false` exactly; no consumers exist yet; no demonstrated harm
  - `[false]` `[reject]` rounds TEXT typing possibly wrong — data-model-mapping.md:32 (contract companion) specifies `rounds TEXT`
  - `[low]` `[reject]` view counts by attendance.created_at not session_date — contract, matrix, and AC explicitly define the metric on created_at; the intent excludes session_date semantics
  - `[low]` `[reject]` bucket lacks file_size_limit/allowed_mime_types — contract requires only a private bucket with service-role writes; story 6 owns upload policy; harm not demonstrated
  - `[false]` `[reject]` frontmatter review_loop_iteration/baseline_revision inconsistency — iteration increments only on bad_spec loopbacks per workflow; baseline is HEAD-before-changes per step-03; both correct
  - `[false]` `[reject]` (edge-case) FK NOT VALID concern — same refutation as the blind-hunter row above: all tables empty at apply time, fresh-project AC, data load follows schema
  - `[low]` `[reject]` (edge-case) 60-day window timezone claim — same disposition as the blind-hunter row above: contract-mandated formula, AC-verified
  - `[low]` `[reject]` UNIQUE(program_id, email) bypassed by case-variant emails — contract pins the constraint verbatim; the bridge-table lower(email) pattern is noted, but replacing the constraint with a functional index requires a second migration (more than a direct correction), and emails sourced from Supabase Auth are lowercase in practice
  - `[false]` `[reject]` ON CONFLICT DO NOTHING leaves a pre-existing public bucket public — condition never holds: this migration created the bucket (verified `public = false` on hosted); prod replay targets a fresh project with no pre-existing bucket
  - `[low]` `[reject]` no indexes on contacts/sessions FK referencing columns — user deletion is rare and these tables are tiny (0 rows now); scan cost trivial; fix requires a second migration file
  - `[false]` `[reject]` types.ts users.Insert optional timestamps "suggests hand-edited types" — independently re-ran `supabase gen types typescript --linked`; output byte-identical to the committed file; the generator emits optional for defaulted columns
  - `[low]` `[reject]` spec Verification text says "four new FKs" while migration adds five — the Boundaries and AC mandate the fifth (sessions.location_id RESTRICT); the only fix edits this build's spec, which is rejected by rule; code matches the AC
  - `[medium]` `[defer]` no automated verification applies migrations or asserts the view rollup — pre-verified by the layer: CI runs guardrails/typecheck/build/lint only, zero test files, no pgTAP; pre-existing gap not caused by this story; stories.yaml assigns the verification suite to story 8; every AC probe was executed manually against the hosted project this run
  - `[low]` `[reject]` (verification-gap other) 60-day window timezone — same disposition as above
  - `[false]` `[reject]` (verification-gap other) FK fails on populated DB — same refutation as above
  - `[low]` `[reject]` (verification-gap other) mixed idempotency — same disposition as the ADD CONSTRAINT row above
  - `[medium]` `[defer]` (intent-alignment) diff carries no executable evidence for the hosted-state I/O matrix — same root cause as the verification-gap entry: no automated verification infrastructure exists in the repo; the probes were executed this run and their outcomes are recorded under Verification below
  - `[low]` `[reject]` (intent-alignment) timezone clause divergence between formula and design-note rationale — same disposition as above; the contract pins the formula
  - `[false]` `[reject]` (intent-alignment) invited_by/program_id carry no FK — contract permits by silence; consistent with the operational-table family; no harm demonstrated
  - `[low]` `[reject]` (intent-alignment) ADD CONSTRAINT not idempotent — same disposition as above
  - `[false]` `[reject]` (intent-alignment) anon storage denial relies on platform default RLS rather than this migration — verified directly: RLS enabled on storage.objects/buckets, zero policies exist, `SET ROLE anon` sees 0 rows in both (probes M1–M4 below)

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

Status: done

**Summary of implemented change:** One additive migration (`supabase/migrations/20261006000000_add_users_and_contact_columns.sql`) created `public.users` (all roles, `id UUID PK REFERENCES auth.users(id) ON DELETE CASCADE`, TEXT+CHECK role/status, `location_ids UUID[]`, self-FK `assigned_preacher_id ON DELETE SET NULL`, `UNIQUE(program_id, email)`), backfilled five FK constraints (`contacts.assigned_preacher_id`, `contacts.collected_by_id`, `sessions.preacher_id`, `sessions.created_by` → `public.users(id) ON DELETE SET NULL`; `sessions.location_id` → `locations(id) ON DELETE RESTRICT`), added the five contact columns (`source`, `photo_path`, `rounds`, `books_read`, `is_favorite DEFAULT false`), created the `contact_attendance_counts` view with the contract-mandated Asia/Kolkata 60-day window formula, and provisioned the private `contact-photos` Storage bucket. The migration was applied to the hosted project `etwunirahuucodcxydgs` via `supabase link` + `supabase db push`, and `lib/supabase/types.ts` was regenerated with `supabase gen types typescript --linked`. Bridge tables and `audit_events` are untouched; no RLS, app-code, or route changes.

**Files changed:**
- `supabase/migrations/20261006000000_add_users_and_contact_columns.sql` — NEW; the story's single deliverable migration (91 lines).
- `lib/supabase/types.ts` — REGENERATED from the live linked schema; adds `Tables.users` (Row/Insert/Update), `Views.contact_attendance_counts`, the five new `contacts` columns, and named FK relationships.
- This story spec — status/frontmatter, triage log, deferred item, this result.

**Review findings breakdown:** 28 findings across four layers — 0 high, 2 medium, 13 low, 13 false, 0 maybe-false. Patches applied: 0. Deferred: 1 entry (2 grouped findings) — no automated migration verification exists in CI (pre-existing; story 8 owns the verification suite). Rejected: 26 — 13 false (claim disproven at the cited location, e.g. "odd one out" program_id FK claim refuted by the core-tables family pattern; "hand-edited types" refuted by byte-identical regeneration; populated-DB FK failure refuted by verified empty tables and schema-before-data pipeline order), 13 low (contract-mandated shapes the intent pins verbatim — the 60-day window formula, `UNIQUE(program_id, email)`, created_at-based rollup, plain `invited_by`/`is_favorite` shapes — plus negligible-impact items whose fixes would require a second migration or edits to this build's spec).

**Follow-up review recommendation:** false — no entries were patched this pass (patched counts by verdict: high 0, medium 0, low 0), so there is no unverified patch risk to name.

**Verification performed (all against hosted project etwunirahuucodcxydgs unless noted):**
- `supabase link --project-ref etwunirahuucodcxydgs` — linked; `supabase db push` — all 8 migrations applied; re-run reports "Remote database is up to date."
- `supabase db diff --linked` — no drift except a known no-op `drop extension if exists "pg_net"` shadow-baseline artifact (pg_net is not installed remotely).
- `supabase gen types typescript --linked` re-run — output byte-identical to committed `lib/supabase/types.ts` (TYPES_IDEMPOTENT).
- `pnpm typecheck` — all 7 workspace projects pass.
- SQL probes (psql, `$POSTGRES_URL_NON_POOLING`): users columns/constraints match the AC list (A/B); five new FKs present with correct delete actions (C); five contact columns present with `is_favorite` default false (D); bucket `contact-photos` present with `public = false` (E); bridge tables present with 0 rows, schemas intact (F).
- Matrix probes, all executed and passing: ROW 1 happy-path users insert with a real auth.users id → INSERT 0 1, row returned (K); ROW 2 dangling `assigned_preacher_id` → 23503 on `users_assigned_preacher_id_fkey` (G2); ROW 3 dangling `contacts.assigned_preacher_id` → 23503 (H); ROW 4 dangling `sessions.location_id` → 23503 (I); ROW 5 view window → total=2, past_60_day=1 for 70-day-old + 5-day-old rows (J); ROW 6 bucket row public=false (E); ROW 7 anon-key denial — the HTTP storage-API probe was impossible from this network (TLS reset to the project host), so it was verified at the RLS layer: RLS enabled on storage.objects/buckets, zero policies exist, `SET ROLE anon` sees 0 objects in `contact-photos` and 0 bucket rows (M1–M4). All mutating probes ran inside rolled-back transactions; no test data persists.

**Residual risks:** (1) The 60-day window formula is contract-pinned verbatim; its effective boundary is offset ~5.5h from a true Kolkata-midnight reading — negligible for a 60-day rolling count, but story 6 should be aware when surfacing the metric. (2) The migration's `ADD CONSTRAINT` statements are not idempotent — irrelevant under run-once migration tracking, but a manual partial-failure replay would need cleanup first. (3) `users.invited_by` and `users.program_id` are plain UUID/TEXT by contract silence — consistent with the operational-table family. (4) Automated migration verification in CI remains deferred (see `deferred`).