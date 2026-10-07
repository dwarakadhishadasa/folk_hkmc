---
title: 'Cutover — backfill, auth migration, delta sync, go-live'
type: 'feature'
created: '2026-10-07'
status: 'done'
baseline_revision: 74bbe39ae1659683ad81fdc20f61ad891029fbc0
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/specs/spec-airtable-to-supabase/migration-playbook.md'
  - '_bmad-output/specs/spec-airtable-to-supabase/data-model-mapping.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Playbook Phase 5 is the last mile of the Airtable → Supabase migration and
nothing in the repo can perform it: the new project `etwunirahuucodcxydgs` holds only
ad-hoc dev rows and story 7.8's preview fixtures — 0 of the 1,077 Airtable contacts, 156
sessions, 1,343 attendance rows, 39 locations and 28 staff records exist there, no
`auth.users` row from the old project `cparpinmalqsimninyfw` has moved, and the old
project's 86 `audit_events` / 24 `invite_log` rows are absent. Story 7.8 also left two
explicit hand-offs: no committed DDL path that can actually connect, and a service-role
client whose insert payloads are untyped.

**Approach:** Ship four idempotent, reversible, `--dry-run`-first cutover scripts plus the
mapping-table migration they need, run every one of them to completion against the real
sources, verify per-table per-program counts, and leave the human-gated sequence (write
freeze, pre-freeze redeploy, delivering SMTP, link distribution, staff sign-in) enumerated
as operator actions.

## Boundaries & Constraints

**Always:**
- **Ordering is load-bearing:** locations → `auth.users`/`auth.identities` → `public.users`
  → contacts → sessions → attendance → photos. `public.users.id` is an FK to
  `auth.users(id)`, and `attendance.contact_id`/`session_id` are NOT NULL FKs, so an
  out-of-order run fails loudly rather than half-writing.
- **Every write is idempotent and reversible.** Target ids come from the persisted
  `public.airtable_id_map` (keyed `program_id` + `entity` + `airtable_record_id`), so a
  re-run reuses the same ids instead of duplicating, and `--rollback` deletes exactly the
  rows the map recorded. Nothing is written that `--rollback` cannot remove.
- **`--dry-run` is the default mode of every script's first execution**, and a dry run must
  perform no write on either project.
- Secrets are read from `.env.migration.local` / `.env` only and are **never** printed:
  no `encrypted_password` value, no SMTP password, no token, no fixture password.
- The **old project and both Airtable bases are read-only archives.** Only `SELECT` runs
  against them. The one deliberate exception is deleting conflicting *development* auth
  users on the **new** project, which is reported row-by-row and gated behind an explicit
  flag.
- The write-freeze, the production redeploy, the delivering SMTP swap, link distribution
  and per-staff sign-in checks are **operator** actions. This story never stands up
  production traffic and never asserts an operator outcome it did not observe.
- `apps/*/public/sw.js`, every `proxy.ts`, `apps/*/app/attendance/route.ts` and
  `scripts/verify-rls.mjs` stay frozen; `public/sw.js`'s precache defect is not this
  story's to fix.

**Never:**
- Never wipe the new project. The disposable privilege ended at this story.
- Never write to, or delete from, `cparpinmalqsimninyfw` or either Airtable base.
- Never invent a value the source does not carry: a contact whose phone does not normalize
  to 10 digits is quarantined and reported, not coerced; an attendance row with no linked
  contact is quarantined, not attached to a placeholder.
- Never call `supabase config push` (`config.toml`'s `[auth]` is local-mailpit).
- Never run `pg_dump`/`pg_isready` against either project as a *required* path: direct
  Postgres times out from this environment (verified: `pg_isready` exit 124 on the old
  pooler, "no response" on the new one). The Management API `POST
  /v1/projects/{ref}/database/query` endpoint is the documented DDL and cross-project SQL
  channel, and it runs as `postgres`.
- Never relax `scripts/verify-airtable-removal.mjs` beyond the one narrow, counterweighted
  allowance this story's exporter needs.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Mapping table absent | First `migrate:airtable` run | Migration applied via `apply-migrations.mjs`; ledger row written with a populated `name` and `on conflict do nothing` | Any non-2xx from `/database/query` aborts before a single row is written |
| Dry run | `--dry-run` | Full plan printed: per-program per-table source counts, target counts, insert/skip/quarantine split, conflicts, photo plan. Zero writes | Non-zero exit on any source fetch or count mismatch |
| Re-run after a completed load | Map rows already exist | Every id reused; `inserted 0`, `skipped <mapped>`; no duplicate rows | Phone or `(contact_id, session_id)` collision surfaces as a quarantine, never as a silent skip |
| Unusable phone | Airtable contact phone that `normalizeMobile` rejects (4 folk, 1 gita-life — all under 10 digits, one of them an empty record) | Quarantined with `record id`, `program`, `name`, raw phone, reason; not inserted | Counted in the report so source-vs-target accounting stays exact |
| Attendance without a contact link | 62 folk rows | Quarantined with record id and reason `no_contact_link` | `attendance.contact_id` is NOT NULL; inserting would abort the whole batch |
| Duplicate `(contact, session)` | Two Airtable attendance rows for one contact+session (1 gita-life pair; 0 in folk) | First wins (by `createdTime`), later one quarantined as `duplicate_pair` | Pre-flight detects the pair inside the batch **and** against existing target rows |
| Free-text location | `Location_Legacy` non-empty on a contact | Resolved to an existing location UUID by exact name, then case-folded name, then `Code`; otherwise quarantined as `unresolved_location` | Both bases currently have 0 such rows; the path exists and reports zero |
| Stale Airtable `Supabase User ID` | Field blank or disagreeing with the old project's `auth.users` for that email | Resolved by **email** against the source `auth.users`; the field is reported, never trusted | Airtable user with no source auth row → quarantined, no `public.users` row |
| Conflicting target auth user | Target has an auth user with the same email but a different id (4 real staff emails) | Reported; deleted only under `--reconcile-target-users` (cascades its ad-hoc `public.users` rows), then re-inserted with the source id | Without the flag: exit non-zero, nothing deleted |
| Rollback | `--rollback --program folk` | Deletes exactly the rows in `airtable_id_map` for that program plus their storage objects and the map rows | Never touches a row absent from the map |
| Old project unreachable | Management API 401/404/timeout on the old ref | Exit non-zero naming the ref; no partial load reported as success | PostgREST/GoTrue reachability of both projects is probed first |

</intent-contract>

## Code Map

**Verified environment facts (read-only probes run during planning):**
- Both projects answer PostgREST, GoTrue and the Management API; `GET /v1/projects/{ref}`
  returns 200 for **both** `etwunirahuucodcxydgs` and `cparpinmalqsimninyfw` with the token
  in `.env.migration.local`. Direct Postgres is dead (see Never).
- Airtable: `AIRTABLE_API_TOKEN` in `.env` reaches **both** target bases —
  `GET /v0/meta/bases` lists `appqea9DRLOXqErXb` ("FOLK Chennai") and `appzbssqNK53yqjZH`
  ("Gita Life"). Volumes: folk 1,036 contacts / 1,264 attendance / 142 sessions / 24
  locations / 24 users; gita-life 41 / 79 / 14 / 15 / 4. Table ids are identical across
  bases and match
  `_bmad-output/planning-artifacts/prds/prd-gita-life-operations/implementation-decision-gates.md:24-28`
  (`tbltzdtCmCHf6gJKD`, `tblxfB2W2l6OXc2IX`, `tbl9AbwkiIaAwK20X`, `tbl5IOOcS2RUkXzyG`,
  `tbl2aiD2NfvrBMnfI`).
- The two bases are **field-id divergent**: folk's Contacts has no `Year` field at all and
  gita-life's has it unpopulated, so `contacts.year` is null for every row; the loader
  therefore maps by field id with absent-as-null rather than assuming a shared shape.
  Airtable fields with **no target column** (`Branch`, `Interest`, `Interest level`,
  `Status`, `Next Follow-up`, `Current status`, `Occupation`, `Added By`, Sessions/Notes on
  sessions, every rollup/lookup/formula column) are dropped by design — the loader counts
  them per program so the operator can see exactly what is not migrated.
- Old project: 25 `auth.users` (all `email_confirmed_at` set; 24 bcrypt `$2a$10$`
  hashes, `nrkd16@gmail.com` has none — magic-link only); `public` tables are exactly
  `airtable_identities` (19), `airtable_sync_state` (0), `audit_events` (86),
  `invite_log` (24), `programs`, `staff_memberships` (20), `staff_profiles` (25); there is
  **no** `public.users`. `audit_events` columns are `actor_supabase_user_id uuid` +
  `actor_airtable_user_id text`; the new project's are `actor_supabase_user_id uuid` +
  `actor_user_id text` (renamed by `20261007000000`).
- New project today: 8 contacts, 6 locations, 5 sessions, 6 attendance, 11 `public.users`
  (8 `preview-fixture-*` + 3 ad-hoc real staff), 13 `auth.users` (8 fixtures + 4 ad-hoc
  real staff + 1 phone-only), 5 `audit_events`, 1 `invite_log`, 0 storage objects, all 10
  migration versions present. The 3 ad-hoc `public.users` roles **contradict** Airtable
  (e.g. `dwarakadhishadasa@gmail.com` is `Admin` there, `Assistant` in folk Airtable), so
  they must be replaced, not kept.
- **Neither project has the GoTrue `handle_new_user` trigger** (every `pg_trigger` row on
  `auth.*` is an internal RI constraint trigger). Inserting `auth.users` therefore does
  **not** auto-create `auth.identities`; this story inserts identities explicitly.
- Airtable attachment URLs are authenticated and short-lived → photos must be fetched
  during the same run.

**Target schema (frozen contracts):**
- `supabase/migrations/20261004000000_create_core_tables.sql:5-79` — `contacts`
  (`location_ids TEXT[]`, `phone NOT NULL`, `UNIQUE (phone, program_id)` at :29),
  `locations`, `sessions` (`session_date TEXT`, `preacher_id`/`created_by`/`location_id`),
  `attendance` (`contact_id`/`session_id NOT NULL`, `UNIQUE (contact_id, session_id)` at
  :79). `20261006000000_add_users_and_contact_columns.sql:13-30` adds `public.users`
  (`id UUID PK REFERENCES auth.users(id) ON DELETE CASCADE`, `location_ids UUID[]`,
  `UNIQUE (program_id, email)`) plus the five contact columns; `:36-58` adds the five FKs
  (`sessions.location_id` is `ON DELETE RESTRICT`).
- `lib/supabase/data.ts:302-309` `normalizeMobile` — last 10 digits, must be exactly 10 or
  `null`; `:538-553` `findContactByPhone` matches `phone` **after** that normalization, so a
  stored non-10-digit phone is unreachable by the app. `:986-1005` photo path convention
  `${programId}/${contactId}/${uuid}.${jpg|png|webp}`, 5 MB cap. `:1011-1033`
  `getAttendanceByDate` filters `attendance.created_at` between
  `${date} 00:00:00+05:30` and the next day — so a backfilled row's `created_at` must land
  inside its session's **Asia/Kolkata** day or the dashboard loses it.
- `apps/folk/app/api/sessions/route.ts:139-141` — `attendance_url` is
  `${siteUrl}/attend?session=${session.id}`.
- `lib/supabase/manage.ts:48` `CONTACT_PHOTOS_BUCKET = "contact-photos"`.

**Files this story creates or edits:**
- `supabase/migrations/20261008000000_add_airtable_id_map.sql` -- NEW. `public.airtable_id_map`.
- `scripts/apply-migrations.mjs` -- NEW. The committed, re-runnable DDL path 7.8 deferred.
- `scripts/migrate-airtable-data.mjs` -- NEW. The exporter/loader (the only file that may
  name the retired service).
- `scripts/migrate-auth-users.mjs` -- NEW. `auth.users` + `auth.identities` migration.
- `scripts/delta-sync-old-project.mjs` -- NEW. `audit_events` + `invite_log` catch-up.
- `scripts/verify-airtable-removal.mjs` -- EDIT. One `ACCOUNTED_FOR` entry for the
  exporter, plus a new counterweight assertion that no file outside `scripts/` references
  any cutover script.
- `lib/supabase/admin.ts` -- EDIT. `createClient<Database>(…)` so insert payloads are
  type-checked (7.8's second deferred item). Revert if it cascades past this story's files.
- `package.json` -- EDIT. `migrate:apply-ddl`, `migrate:airtable`, `migrate:auth`,
  `migrate:delta` (+ `:dry-run` aliases).
- `_bmad-output/specs/spec-airtable-to-supabase/migration-playbook.md` -- EDIT. Phase 5
  steps 23-28: what ran, the DDL channel, the rollback procedure, the operator checklist.
- This story spec.

**Read-only contracts the scripts assert against:** `lib/supabase/types.ts` (generated);
`scripts/verify-program-readiness.mjs` (asserts five table ids remain in the decisions doc
and the `20260613010000` migration file is untouched); `scripts/verify-rls.mjs` (must stay
green).

## Tasks & Acceptance

**Execution:**
- `supabase/migrations/20261008000000_add_airtable_id_map.sql` -- CREATE, then apply via
  `scripts/apply-migrations.mjs` -- the persisted rec*→UUID map every other script depends
  on; RLS enabled with no policies (service-role only).
- `scripts/apply-migrations.mjs` -- CREATE -- applies one migration file through
  `POST /v1/projects/{ref}/database/query`, then records the version in
  `supabase_migrations.schema_migrations` with a populated `name` and
  `on conflict do nothing`; `--dry-run` prints; refuses a non-target ref without
  `--allow-non-disposable`; never calls the CLI or `config push`.
- `scripts/migrate-auth-users.mjs` -- CREATE -- reads source `auth.users` via the source
  project's query endpoint, computes the shared-column intersection at runtime, reports
  target email conflicts, deletes conflicting dev users only under
  `--reconcile-target-users`, inserts source rows preserving `id`, inserts matching
  `auth.identities` (`identity_data.sub` = the same id), then verifies per email that
  `id` and the **sha256 of `encrypted_password`** match the source. Never prints a hash.
- `scripts/migrate-airtable-data.mjs` -- CREATE -- pages both bases
  (`returnFieldsByFieldId=true`, offset paging, 100/page), verifies each table id against
  the meta endpoint before reading, pre-flights every uniqueness constraint, then loads in
  the order above with `Prefer: resolution=ignore-duplicates,return=minimal` and explicit
  ids from the map. Fetches the 6 folk contact photos, checks content type against
  `MANAGE_PHOTO_CONTENT_TYPES` and the 5 MB cap, uploads them under the `manage.ts`
  path convention, and writes `contacts.photo_path`. `--rollback` deletes map-recorded rows
  and their storage objects. Prints the per-program per-table source/target/quarantine
  matrix and exits non-zero if any count fails to reconcile.
- `scripts/delta-sync-old-project.mjs` -- CREATE -- copies source `audit_events` (mapping
  `actor_airtable_user_id` → `actor_user_id`) and `invite_log` (mapping `airtable_user_id` →
  `user_id`, `inviter_airtable_user_id` → `inviter_user_id`), skipping ids the target
  already holds and de-duplicating on `(program_id, action, actor, created_at)` /
  `(program_id, invitee_email, invited_at)`; lets the target sequences assign ids; reports
  the highest source `created_at` seen as the re-run high-water mark.
- `scripts/verify-airtable-removal.mjs` -- EDIT -- allow the exporter's mentions and add
  the counterweight check described in the Code Map.
- `lib/supabase/admin.ts` -- EDIT -- add the `Database` generic.
- `package.json` -- EDIT -- wire the five scripts.
- `_bmad-output/specs/spec-airtable-to-supabase/migration-playbook.md` -- EDIT -- Phase 5.
- A `node --test` file per script's pure transform layer (`--test` is already available via
  node, so no runner dependency is added) asserting the I/O matrix's transform rows:
  phone normalization, quarantine classification, `created_at` IST re-pinning, free-text
  location resolution, auth column intersection.

**Acceptance Criteria:**
- Given `node scripts/apply-migrations.mjs --dry-run`, when it runs, then it exits 0, names
  the one pending version, and writes nothing; after the real run,
  `supabase_migrations.schema_migrations` holds `20261008000000` with a non-null `name`.
- Given `node scripts/migrate-auth-users.mjs --dry-run`, when it runs, then it reports
  25 source users, the 4 target email conflicts and the rows the reconcile flag would
  delete, and performs no write on either project.
- Given `node scripts/migrate-auth-users.mjs --reconcile-target-users`, when it completes,
  then the target has 25 migrated source rows (ids preserved) plus its fixtures, every
  migrated `id` equals the source `id` for that email, per-email `encrypted_password`
  sha256 matches for all 25, `auth.identities` holds one `email` identity per migrated
  user, and `dharneesh2106@gmail.com` / `dwarakadhishadasa@gmail.com` /
  `gdinesh.8055@gmail.com` / `my.dineshgudi@gmail.com` now carry their source ids.
- Given `node scripts/migrate-airtable-data.mjs --dry-run`, when it runs, then it prints the
  per-program per-table source counts (folk 1,036 / 1,264 / 142 / 24 / 24, gita-life
  41 / 79 / 14 / 15 / 4), the per-program count of Airtable fields dropped for having no
  target column, and exactly 68 quarantine entries — 5 contacts whose phone
  `normalizeMobile` rejects, 62 attendance rows with no linked contact, 1 duplicate
  `(contact, session)` pair — with no write on any project.
- Given `node scripts/migrate-airtable-data.mjs`, when it completes, then per program the
  loaded row count equals source count minus quarantines (folk 1,032 / 1,202 / 142 / 24 /
  24; gita-life 40 / 78 / 14 / 15 / 4), `public.users` holds 28 rows across the two
  programs (27 distinct emails — `my.dineshgudi@gmail.com` is a folk Volunteer and a
  gita-life Preacher), no `contacts` row violates `UNIQUE (phone, program_id)`, no
  `attendance` row violates `UNIQUE (contact_id, session_id)`, every `attendance.created_at`
  falls inside its session's Asia/Kolkata day, every `sessions.attendance_url` is
  `${siteUrl}/attend?session=${id}` with the session's own id, and every `public.users.id`
  exists in `auth.users`.
- Given a second `node scripts/migrate-airtable-data.mjs` run, when it completes, then
  `inserted 0` for every table and the target row counts are unchanged.
- Given the 6 folk contacts with attachments, when the run completes, then each has a
  `photo_path` under `folk/<contact uuid>/<uuid>.<ext>`, the object exists in the private
  `contact-photos` bucket, and `MANAGE_PHOTO_MAX_BYTES` / content-type limits were applied.
- Given `node scripts/migrate-airtable-data.mjs --rollback --program folk --dry-run`, when
  it runs, then it lists exactly the rows and storage objects it would delete and deletes
  none; with `--dry-run` absent, after it runs the folk rows and the folk map rows are gone
  while gita-life rows and the fixtures are untouched.
- Given `node scripts/delta-sync-old-project.mjs`, when it completes, then the target's
  `audit_events` holds the 86 source rows (deduplicated, `actor_user_id` populated) and its
  `invite_log` holds the 24 source rows (deduplicated, `user_id`/`inviter_user_id`
  populated) **plus** the 5 and 1 rows it already had, and a second run inserts 0.
- Given `node scripts/verify-rls.mjs`, `node scripts/verify-program-readiness.mjs` and
  `node scripts/verify-airtable-removal.mjs`, when they run, then all three exit 0 — the
  last one including its new counterweight check.
- Given `pnpm guardrails`, `pnpm typecheck:workspace`, `pnpm build:apps` and `pnpm lint`,
  when they run, then guardrails prints its pass line, typecheck and build succeed, and lint
  reports no new finding in a file this diff touches.
- Given `git diff --name-only`, when I inspect it, then `apps/*/public/sw.js`, every
  `proxy.ts`, `apps/*/app/attendance/route.ts`, `scripts/verify-rls.mjs`, `.env.example` and
  every pre-existing migration file are absent.
- Given the spec's frontmatter, when it is finalized, then it carries
  `status: awaiting-operator` and a non-empty `operator_actions:` list of imperative
  single-instruction strings, and `## Auto Run Result` reports the same status — and
  `sprint-status.yaml` is byte-identical to its pre-run content.

## Spec Change Log

## Review Triage Log

## Design Notes

- **`rec*` → UUID is decided before the first insert, not after.** Ids are generated by the
  loader (`randomUUID()`) and persisted in `airtable_id_map`, so every downstream row
  resolves its FKs from the map instead of waiting for a round-trip. The map is also the
  rollback ledger and the reason a re-run cannot duplicate a row.
- **`created_at` re-pinning, in one rule.** Airtable's `Attendance Date` lookup is the
  session's program day; the record's own `createdTime` is UTC. Keep `createdTime` when its
  Asia/Kolkata date already equals the session day, otherwise re-pin the date to the
  session day while keeping the IST time-of-day. That preserves intra-day ordering, keeps
  every row inside the day `getAttendanceByDate` filters on, and invents no timestamp.
- **Email is the join key, never Airtable's `Supabase User ID` field.** That field is blank
  for `my.dineshgudi@gmail.com` in gita-life while the old project holds that user's auth
  row, so trusting the field would strand a real preacher. The field is still reported
  alongside the resolved id so a divergence is visible.
- **The four target conflicts are removed, not merged.** The target's 4 real-staff auth rows
  were created ad hoc during migration development and their `public.users` rows contradict
  Airtable; the decided contract preserves source UUIDs so links and audit references
  survive. Deleting them cascades exactly those 3 ad-hoc `public.users` rows (FK
  `ON DELETE CASCADE`); the `preview-fixture-*` accounts do not match any source email and
  are never touched.
- **Excluding the exporter from the CAP-7 grep gate is bounded by a new assertion.** The
  gate forbids runtime Airtable dependencies; a one-time exporter is not runtime code, and
  the migration history it already allowlists is the same kind of historical necessity. The
  new check fails if anything outside `scripts/` references any cutover script, so the
  allowance cannot become a door back into the app.
- **Per-program site URLs for regenerated attendance links** default to `PRODUCTION_URL`
  (folk, `https://folk-hkmc-rho.vercel.app`) and
  `https://gitalife.hkmchennai.org` (gita-life, the host its own Airtable session links
  already use), both overridable by env, because no gita-life production URL is recorded in
  this repo.

## Verification

**Commands:**
- `node scripts/apply-migrations.mjs --dry-run` then `node scripts/apply-migrations.mjs` --
  expected: dry run writes nothing; the real run reports the version applied and the ledger
  row.
- `node scripts/migrate-auth-users.mjs --dry-run` then `… --reconcile-target-users` --
  expected: conflicts reported, then 25 ids preserved and hash digests matching.
- `node scripts/migrate-airtable-data.mjs --dry-run` then `node scripts/migrate-airtable-data.mjs` --
  expected: the dry run's plan and the real run's count matrix agree; the real run's second
  invocation reports `inserted 0`.
- `node scripts/delta-sync-old-project.mjs` twice -- expected: first run inserts, second
  inserts 0.
- `node --test scripts/*.test.mjs` -- expected: every transform case passes.
- `node scripts/verify-rls.mjs && node scripts/verify-program-readiness.mjs && node scripts/verify-airtable-removal.mjs` --
  expected: all exit 0.
- `pnpm guardrails && pnpm typecheck:workspace && pnpm build:apps && pnpm lint` -- expected:
  guardrails passes, typecheck/build succeed, no new lint finding.
- `git diff --name-only` -- expected: the frozen files listed in the last AC are absent.

**Manual checks (against the hosted new project):**
- `select count(*) from airtable_id_map group by program_id, entity` -- expected: one row
  per migrated Airtable record.
- `select count(*) from attendance a join sessions s on s.id = a.session_id where
  (a.created_at at time zone 'Asia/Kolkata')::date <> s.session_date::date` -- expected: 0.
- `select email, count(*) from public.users group by email having count(*) > 1` -- expected:
  only emails present in both programs.
- `select u.email from public.users u left join auth.users a on a.id = u.id where a.id is
  null` -- expected: 0 rows (DW-3 alignment).
- `git diff sprint-status.yaml` -- expected: empty; the board is the orchestrator's.