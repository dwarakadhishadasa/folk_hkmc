---
title: 'Configure and verify the hosted Supabase project and preview deployment'
type: 'feature'
created: '2026-10-07'
status: 'awaiting-operator'
baseline_revision: 173191ff53c8a88d59817865a165578588c4fdc2
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/specs/spec-airtable-to-supabase/migration-playbook.md'
  - '_bmad-output/specs/spec-airtable-to-supabase/rls-policy-matrix.md'
warnings: ['oversized']
operator_actions:
- 'Redeploy the `feature/migrate-airtable-to-supabase` branch to Vercel so `https://folk-hkmc-rho.vercel.app` carries this story''s code, then confirm the page''s <meta description> no longer says "Airtable handoff".'
- 'Re-run `pnpm test:attendance-contract` against the redeployed build and confirm it reports 21/21 with no ''deployed build predates this branch'' warning.'
- 'Open `.env.preview-seed.local` and sign in at `https://folk-hkmc-rho.vercel.app` as `preview-fixture-admin-folk@example.com`, then as `preview-fixture-preacher-folk@example.com`, `preview-fixture-volunteer-folk@example.com` and `preview-fixture-assistant-folk@example.com`, and confirm each reaches the screens that role is entitled to.'
- 'Sign in as the seeded folk Admin and confirm `/manage` renders all five tabs from Supabase with program-wide totals.'
- 'Sign in as the seeded folk Preacher and confirm the Contacts and Attendance screens show only that preacher''s data, with no other preacher''s contact identities anywhere in the portal.'
- 'Install the PWA on a real phone or emulator from `https://folk-hkmc-rho.vercel.app`, confirm the install prompt appears, and confirm the app launches standalone.'
- 'Put that phone in airplane mode, open the folk open-session attendance link the seeder printed (`https://folk-hkmc-rho.vercel.app/attend?session=<session id>`), submit attendance, and confirm the app reports the submission as queued.'
- 'Restore connectivity on the phone and confirm the queued submission replays, clears from the pending badge, and appears on the dashboard.'
- 'Confirm whether the offline *shell* renders the precached page or the ''Offline'' fallback, and record the result: `sw.js` precaches `/manifest.webmanifest`, which the deployment serves as 404, so nothing is cached today.'
- 'Open the Mailtrap sandbox inbox and confirm the invite and magic-link emails arrive using the templates from `supabase/templates/`, and that the invite link returns to `https://folk-hkmc-rho.vercel.app/auth/confirm` instead of being rejected as a disallowed redirect.'
- 'Set the real Mailtrap sandbox sender address and name in `SMTP_SENDER_EMAIL` and `SMTP_SENDER_NAME` in `.env.migration.local` (both currently hold placeholders, `from@example.com` and `sandbox.smtp.mailtrap.io`), then re-run `pnpm configure:hosted-project`.'
- 'Before go-live, replace the Mailtrap sandbox SMTP with a delivering sender, because sandbox mail never reaches a staff inbox and without the swap nobody receives sign-in or invite mail.'
- 'Delete the stale `AIRTABLE_*` and `GITA_LIFE_AIRTABLE_API_TOKEN` variables from the Vercel project''s preview and production environments, since no code reads them any more.'
- 'Confirm the old Supabase project `cparpinmalqsimninyfw` and both Airtable bases were never written to or deleted during this story.'
deferred:
  - summary: >-
      `sw.js`'s PRECACHE_ASSETS lists `/manifest.webmanifest`, which the deployment serves as
      404; `cache.addAll` is all-or-nothing, so no asset is ever precached and offline
      *navigation* falls through to the synthetic 503 instead of the cached offline shell.
    evidence: >-
      Verified live by `node scripts/verify-pwa-offline-queue.mjs` against
      https://folk-hkmc-rho.vercel.app: the offline-queue assertions pass (18/18) and the
      script then WARNs that `offline navigation to /attend returned 503, not the cached
      shell`. Confirmed independently: `curl /manifest.webmanifest` -> 404 while
      `curl /manifest.json` -> 200, and `apps/folk/public/` ships only `manifest.json`.
      CAP-6's queue half therefore holds, but the offline *shell* half of the PWA does not.
      `public/sw.js` is frozen by this story's Boundaries, so the fix (drop
      `/manifest.webmanifest` from PRECACHE_ASSETS, or serve it) belongs to a follow-up that
      is allowed to edit `sw.js`. Offline HTTP submissions still queue and replay correctly,
      which is why this is medium and not high.
    location: >-
      apps/folk/public/sw.js:20-35, apps/gita-life/public/sw.js:20-35
    severity: medium
  - summary: >-
      The Auth sender identity on the hosted project is the placeholder pair carried in
      `.env.migration.local` (`SMTP_SENDER_EMAIL=from@example.com`,
      `SMTP_SENDER_NAME=sandbox.smtp.mailtrap.io` — the name was copied from SMTP_HOST), so
      invite and magic-link mail goes out under a From address Mailtrap will not honour.
    evidence: >-
      `node scripts/configure-hosted-project.mjs` asserts `smtp_admin_email` and
      `smtp_sender_name` faithfully against a fresh `GET /config/auth`, and both currently
      read `from@example.com` / `sandbox.smtp.mailtrap.io`. The correct Mailtrap sandbox
      sender address lives in the operator's Mailtrap account, which is not in the repo, so
      this cannot be derived by an agent. The configurer already re-applies both fields on
      every run, so fixing the two env values and re-running is the whole remedy.
    location: >-
      .env.migration.local, scripts/configure-hosted-project.mjs:173-174
    severity: medium
  - summary: >-
      The migration ledger row for 20261007000000 was written by hand through the Management
      API's /database/query endpoint, and the story records that procedure only as prose --
      so nothing in the repo can replay it, and the recorded row leaves Supabase's own
      name/statements columns null.
    evidence: |-
      Filed by two review layers and verified. `supabase db push` cannot run from this
      environment (direct Postgres times out on db.*:5432 and on
      aws-0-ap-south-1.pooler.supabase.com:{5432,6543}), so the DDL went through
      POST /v1/projects/{ref}/database/query as `postgres`, followed by an
      INSERT into supabase_migrations.schema_migrations. That endpoint executes a
      multi-statement query atomically -- probed with a `create table` followed by a
      statement that fails, after which the table does not exist -- so the apply
      itself is safe. What is missing is the artifact: no
      scripts/apply-migrations*.mjs exists, and playbook step 17 tells story 9 to
      "pick a DDL path that can actually connect". Story 9's prod cutover needs a
      committed, re-runnable procedure, and it should write the ledger row with
      `on conflict do nothing` and a populated `name`.
    location: >-
      _bmad-output/specs/spec-airtable-to-supabase/migration-playbook.md (Phase 4 step 17)
    severity: medium
  - summary: >-
      None of the five new verification scripts runs in CI, so CAP-3/5/6 coverage depends
      on a human remembering to run them; the repo's only automated gate is
      guardrails/typecheck/build/lint.
    evidence: |-
      Verified: .github/workflows/quality-gates.yml still executes exactly
      `pnpm guardrails`, `pnpm typecheck:workspace`, `pnpm build:apps`, `pnpm lint`, and
      references none of `configure:hosted-project`, `seed:preview-fixtures`,
      `test:hosted-project`, `test:attendance-contract` or `test:offline-queue`. The
      scripts need live hosted-project credentials (SUPABASE_ACCESS_TOKEN, service-role
      key) and a Chromium executable, none of which CI carries, so wiring them up is a
      decision about CI secrets and runner images rather than a code change. The two
      scripts that could run without secrets -- verify-program-readiness.mjs and
      verify-airtable-removal.mjs -- are also ungated, which is the pre-existing shape of
      this repo's CI.
    location: >-
      .github/workflows/quality-gates.yml:37-47, package.json:33-38
    severity: low
---

<intent-contract>

## Intent

**Problem:** Playbook Phase 4 is the first story that touches the hosted project as configuration rather than DDL, and nothing in the repo can do it today: the project's Auth settings are still the provisioning defaults (`site_url = http://localhost:3000`, empty redirect allow-list, no invite/magic-link templates), the preview deployment at `https://folk-hkmc-rho.vercel.app` still serves a pre-7.7 build, there is no durable fixture set an operator can sign in with, and the CAP-3/5/6 verification suite that DW-1, DW-2 and DW-5 all hand to "story 8" does not exist as executable code. Story 7.7 additionally handed its schema half here: the Airtable-named columns and the four bridge tables are still live in Postgres.

**Approach:** Ship four focused scripts — an idempotent hosted-project configurer, a durable preview fixture seeder, a CAP-5 attendance-contract verifier, and a CAP-6 browser-driven offline-queue verifier — plus the one migration that retires the Airtable-named schema, then run every script that the environment allows and record the rest as operator actions.

## Boundaries & Constraints

**Always:**
- The hosted project `etwunirahuucodcxydgs` (ap-south-1) is **disposable pre-cutover**: wipe and re-seed freely. The old project `cparpinmalqsimninyfw` and both Airtable bases are read-only archives — never write to or delete them.
- Credentials are read from the gitignored `.env.migration.local` and from `--project-id`/env only. **No secret value may reach a file, a spec, a commit, or chat output** — every script redacts `smtp_pass`, `smtp_user`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`, and fixture passwords from its own output.
- `supabase config push` is **forbidden**: `supabase/config.toml`'s `[auth]` section is the discarded local-mailpit configuration. Auth site URL, redirect URLs, SMTP and templates are set field-by-field through the Management API.
- The retirement migration is applied in the order the DDL requires: migration → `lib/supabase/types.ts` regeneration → column-key renames. Doing the TypeScript side first breaks every service-role insert with a PostgREST `42703`.
- `supabase db push` cannot run here — direct Postgres (`:5432` and the `:6543` pooler on `aws-0-ap-south-1.pooler.supabase.com`) times out from this environment, so the migration is applied through the Management API's `/database/query` endpoint (which runs as `postgres`, verified) and its version recorded in `supabase_migrations.schema_migrations`, exactly as the CLI would.
- `public/sw.js`, every `proxy.ts`, the `/attendance` payload/status contract, and the existing `scripts/verify-rls.mjs` assertions are **frozen**. Story 8 observes them; it never edits them to make a check pass.
- The new scripts are tooling, not app code: `node`-run ESM under `scripts/`, credentials via `process.loadEnvFile`, no `server-only` import, no app dependency.

**Never:**
- Never fabricate a verification pass. Every AC that the sandbox cannot execute is recorded as an operator action, not as a green check.
- Never seed `public.users` rows whose `id` differs from the `auth.users` row they name — the sign-in route's Airtable-era self-heal is gone, so a mismatch is unfixable corrupt data (DW-3).
- Never widen the redirect allow-list to `*.vercel.app`; only the go-live URL, its `/auth/confirm` child, and the localhost dev origin.
- Never delete `supabase/migrations/2026*.sql`. The history is what story 9's delta sync and `scripts/verify-program-readiness.mjs:49` assert against.
- Do not add a test runner, a bundler, or a browser-download step to the repo. `playwright-core` only (no bundled browsers), resolved from an env-supplied executable path.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Configurer idempotent re-run | Auth settings already at the desired values | Zero-value PATCH; every re-read field equals the desired value; exit 0 | Any re-read mismatch lists the field name and exits 1 — never prints the secret |
| Configurer dry run | `--dry-run` | Prints the intended patch with `smtp_pass`/`smtp_user` redacted; performs no PATCH | Missing `SUPABASE_ACCESS_TOKEN` → exit 1 naming the variable, never its value |
| Seeder fresh vs re-run | No fixtures vs existing `preview-*` rows | Creates exactly one Admin/Preacher/Volunteer/Assistant per program with an open session; a re-run updates in place and creates nothing new | A `public.users.id !== auth.users.id` mismatch → exit 1 (DW-3) |
| Seeder password absent | `PREVIEW_FIXTURE_PASSWORD` unset | Generates a password, writes it to gitignored `.env.preview-seed.local`, prints only the path | Never prints the generated value |
| CAP-5 unknown session | `POST /attendance` with a well-formed but nonexistent `sessionId` | `404 {"error":"Invalid attendance session."}` | No DB write |
| CAP-5 unregistered contact | Valid open session, mobile not in `contacts` | `404` with `notRegistered: true` | No DB write |
| CAP-5 create then duplicate | Registered contact, open session, twice | First `201` with an `id`; second `409` with `duplicate: true` | UNIQUE(contact_id, session_id) maps 23505 → 409 |
| CAP-5 out-of-scope GET | Preacher JWT, `?session=` of another preacher's session | `403 {"error":"This session is outside your allowed scope."}` | No attendance rows returned |
| CAP-6 offline queue | Chromium context offline, `POST /attendance` | Service worker answers `202 {queued:true}`; one row lands in IndexedDB `folk-offline-db/pending-requests` with the original URL | Network error → queued, not thrown |
| CAP-6 replay | Context back online, `SYNC_QUEUE` message to the worker | Row replays to the original URL and is removed from the queue | A `409` replay response also removes the row (409-counts-as-synced) |
| CAP-6 no browser | Either `PW_CHROMIUM_PATH` unset with nothing on the probe list, or `--chromium <path>` naming a file that does not exist — both reach the one `refuse()` builder | Exit non-zero with an explicit "cannot run the CAP-6 check … NOT a pass" message and the paths tried | Must never be reported as a pass |

</intent-contract>

## Code Map

**Environment facts, all verified in this run (read-only evidence):**
- `supabase/.temp/linked-project.json` — the project is **already linked** (`ref etwunirahuucodcxydgs`, org `vercel_icfg_…`). `supabase link` is a no-op here.
- `GET /v1/projects/etwunirahuucodcxydgs/database/migrations` returns all nine repo migration versions; `supabase_migrations.schema_migrations` holds the same nine. No migration is pending.
- `POST /v1/projects/etwunirahuucodcxydgs/database/query` executes arbitrary SQL as `postgres` (a `create temp table` probe succeeded). This is the only working DDL path — direct Postgres times out on both `db.…supabase.co:5432` and `aws-0-ap-south-1.pooler.supabase.com:{5432,6543}`.
- `GET …/config/auth` before this story: `site_url = "http://localhost:3000"`, `uri_allow_list = ""`, `mailer_templates_invite_content`/`mailer_templates_magic_link_content` both `null`, `smtp_host = "sandbox.smtp.mailtrap.io"` (Mailtrap already configured), `smtp_admin_email = "from@example.com"`, `smtp_sender_name = "Dinesh"`. `PATCH …/config/auth` with `{"site_url": …}` returned 200.
- PostgREST **is** reachable (`https://etwunirahuucodcxydgs.supabase.co/rest/v1/` → 401 unauthenticated, 200 with a key), so `scripts/verify-rls.mjs` HTTP mode works: it ran clean at **79/79 passing** during this investigation.
- `supabase gen types types --lang typescript --project-id etwunirahuucodcxydgs` **works** (the `sbp_` rejection recorded in story 7.7's Design Notes is gone) and reproduces the committed `lib/supabase/types.ts` byte-for-byte in shape.
- Live Postgres state: `contacts` 4 rows / `sessions` 1 / `users` 3, all `program_id = 'folk'` — ad-hoc test rows, no fixtures. `public` tables include the four bridge tables (`staff_memberships`, `staff_profiles`, `airtable_identities`, `airtable_sync_state`). `storage.buckets` has exactly `contact-photos`, `public = false`.
- `invite_log` columns: no `user_id`; `audit_events` columns: no `actor_user_id`. Both rename targets are free.
- Repo-wide grep for the four bridge tables over `apps components lib packages hooks scripts` matches only gitignored stale build output (`apps/folk/.next/dev/**`) and `scripts/verify-program-readiness.mjs:49`, which asserts against the **migration file's** text and stays valid because no migration file is deleted.

**Files this story creates or edits:**
- `supabase/migrations/20261007000000_retire_airtable_named_columns.sql` -- NEW. Exactly the DDL drafted in story 7.7's Design Notes: rename `invite_log.airtable_user_id` → `user_id`, `invite_log.inviter_airtable_user_id` → `inviter_user_id`, `audit_events.actor_airtable_user_id` → `actor_user_id`; drop `airtable_identities`, `airtable_sync_state`, `staff_profiles`, `staff_memberships`. Wrapped in `if exists` guards so a re-apply is a no-op.
- `lib/invite-log.ts:23-24` -- EDIT the insert keys `airtable_user_id`/`inviter_airtable_user_id` → `user_id`/`inviter_user_id`. Parameter names already migrated by story 7.7; only the column keys remain.
- `lib/authz.ts:82` -- EDIT `actor_airtable_user_id` → `actor_user_id` in `writeAuditEvent`'s insert.
- `lib/supabase/types.ts` -- REGENERATE via `supabase gen types`. The four dropped tables and three renamed columns disappear; the file stays generated, never hand-edited.
- `scripts/configure-hosted-project.mjs` -- NEW. See Tasks.
- `scripts/seed-preview-fixtures.mjs` -- NEW. See Tasks.
- `scripts/verify-attendance-contract.mjs` -- NEW. See Tasks.
- `scripts/verify-pwa-offline-queue.mjs` -- NEW. See Tasks.
- `package.json` -- EDIT: add `playwright-core` to root `devDependencies`; add `test:hosted-project`, `test:attendance-contract`, `test:offline-queue` scripts alongside the existing `test:program-readiness` / `test:airtable-removal`.
- `_bmad-output/specs/spec-airtable-to-supabase/migration-playbook.md` -- EDIT Phase 4 steps 17–21: tick what was actually done, and record that the Management API query endpoint replaced `supabase db push` on this branch, so story 9's prod replay knows which path was used.

**Read-only contracts the new verifiers assert against (do not edit):**
- `apps/folk/app/attendance/route.ts:41-114` (POST), `:116-168` (GET), `:17` `ATTENDANCE_ID_PATTERN` (UUID), `:24-39` `parseKnownAttendanceIds`. `apps/gita-life/app/attendance/route.ts` is byte-identical.
- `lib/attendance-session.ts:17-37` `getSessionAttendanceEligibility` — the `403` window rules a seeded session must satisfy for a `201`.
- `apps/folk/public/sw.js` (328 lines, byte-identical to `apps/gita-life/public/sw.js`): `:6` `QUEUED_POST_PATHS`, `:37-69` IndexedDB helpers, `:96-119` `syncQueuedRequests` with `:108` `response.ok || response.status === 409`, `:242-266` the offline-queue `fetch` handler returning the synthetic `202 {queued:true}`, `:315-323` the `SYNC_QUEUE` message the verifier drives. `DB_NAME = "folk-offline-db"`, `STORE_NAME = "pending-requests"` — in **both** apps.
- `scripts/verify-rls.mjs` — story 7.7's AC depends on it staying at all-pass; this story only runs it.
- `apps/*/app/auth/confirm/route.ts` + `lib/site-url.ts:62` `getAuthConfirmRedirectUrl` — the redirect target the allow-list must admit.
- `lib/supabase/templates/` → `supabase/templates/invite.html` (551 B), `magic-link.html` (188 B) — the only two templates; both are pushed verbatim.

**Verification surfaces and their constraints:**
- `https://folk-hkmc-rho.vercel.app` is live and resolves the **new** project (a seeded session's `attendance_url` in Postgres is already `https://folk-hkmc-rho.vercel.app/attend?session=…`, i.e. `NEXT_PUBLIC_SITE_URL` is correct). But it serves a **stale** build: `GET /` still returns `…and Airtable handoff.` in `<meta description>`, a string story 7.7 deleted. Routes observed: `/login` 200, `/attend` 200, `/sw.js` 200, `/manifest.json` 200, `/offline.html` 200, `/manage` 307 → `/login?redirect=/manage`, `/dashboard` 307, `/api/auth/me` 200 `{"staff":null}`, `POST /attendance {}` → 400 `Invalid mobile number`, `POST /attendance {mobile, random-uuid}` → 404 `Invalid attendance session.`, `GET /attendance` → 401.
- `.vercel/.env.production.local` still carries `GITA_LIFE_AIRTABLE_API_TOKEN` and `.vercel/.env.preview.local` the full `AIRTABLE_*` block — now unread by any code (story 7.7), so harmless, but they are stale and worth an operator prune.
- `~/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome` drives `https://folk-hkmc-rho.vercel.app` successfully via `playwright-core` with `--no-sandbox`; `navigator.serviceWorker` is present. No `playwright` (full) package and no browser download are needed or wanted.
- `.gitignore:23-24` ignores `.env*` (except `.env.example`), so `.env.preview-seed.local` is gitignored without a new rule; `:28` ignores `.vercel`; `supabase/.gitignore:3` ignores `.temp`.

## Tasks & Acceptance

**Execution:**
- `supabase/migrations/20261007000000_retire_airtable_named_columns.sql` -- CREATE + APPLY -- story 7.7's explicit schema hand-off; apply through `/database/query`, then `insert into supabase_migrations.schema_migrations(version) values ('20261007000000')` so a later `supabase db push` does not re-run it. Verify by re-reading `information_schema.columns` for `invite_log`/`audit_events` and `information_schema.tables` for the four drops.
- `lib/supabase/types.ts` -- REGENERATE -- `supabase gen types types --lang typescript --project-id etwunirahuucodcxydgs` after the migration; never hand-edited.
- `lib/invite-log.ts`, `lib/authz.ts` -- EDIT the three column keys listed in the Code Map -- run only after the migration lands, or every service-role insert fails with `42703`.
- `scripts/configure-hosted-project.mjs` -- CREATE -- reads `.env.migration.local`, derives the project ref from `NEXT_PUBLIC_SUPABASE_URL`, and PATCHes `…/config/auth` with `site_url`, `uri_allow_list` (`https://folk-hkmc-rho.vercel.app`, `https://folk-hkmc-rho.vercel.app/auth/confirm`, `http://localhost:3000/**`), `smtp_admin_email` from `SMTP_SENDER_EMAIL`, `smtp_sender_name` from `SMTP_SENDER_NAME`, and the two `mailer_templates_*_content` values read from `supabase/templates/`. Then GETs and asserts each field equals the desired value. `--dry-run` prints the patch with secrets redacted. Never invokes `supabase config push`.
- `scripts/seed-preview-fixtures.mjs` -- CREATE -- per program (`folk`, `gita-life`) upserts two locations, four staff (Admin, Preacher, Volunteer, Assistant assigned to that Preacher) with `email_confirm: true`, an in-scope and an out-of-scope contact, one session with `public_attendance_enabled = true` and `attendance_opens_at ≤ now ≤ attendance_closes_at`, and one attendance row. Tag every row with a `preview-fixture-` prefix so `--wipe` is a filter. Assert `public.users.id == auth.users.id` for every seeded user. `--wipe` deletes tagged rows and the tagged auth users. Prints emails, roles, session id and attendance URL; never a password.
- `scripts/verify-attendance-contract.mjs` -- CREATE -- CAP-5. `--base-url` (default the go-live URL), `--program`. Signs the seeded Preacher and Volunteer in through Supabase Auth for a real user JWT, then asserts: `POST {}` → 400; `POST {mobile:"abc"}` → 400; `POST` with an empty `sessionId` → 400; `POST` with a nonexistent UUID `sessionId` → 404 `Invalid attendance session.`; `POST` unregistered mobile against the seeded open session → 404 `notRegistered: true`; `POST` registered mobile → 201 with `id`; repeat → 409 `duplicate: true`; `GET` unauthenticated → 401; `GET` as the seeded Preacher with another preacher's session → 403 `This session is outside your allowed scope.`; `GET` as the owning Preacher → 200 array; `GET ?knownAttendanceIds=<created uuid>` excludes that id while a comma list containing a non-UUID is ignored (the `parseKnownAttendanceIds` null path). Prints a pass/fail matrix; exits non-zero on any failure.
- `scripts/verify-pwa-offline-queue.mjs` -- CREATE -- CAP-6 in real Chromium via `playwright-core` (`PW_CHROMIUM_PATH`, else the ms-playwright cache, else `/usr/bin/chromium`, `/usr/bin/google-chrome`; `--no-sandbox`). Registers `/sw.js`, waits for activation, then: offline `POST /attendance` → 202 with `queued: true` and exactly one IndexedDB row in `folk-offline-db/pending-requests` carrying the original URL; back online, send the `SYNC_QUEUE` message → queue drains and the replayed attendance is visible server-side; queue the same mobile+session again and replay → the queue still drains on a `409` response. Also asserts `/manifest.json` and `/sw.js` are served and the manifest declares a name and icons. Exits non-zero — with an explicit environment message — when no browser is resolvable.
- `package.json` -- EDIT -- `playwright-core` in `devDependencies`; `test:hosted-project`, `test:attendance-contract`, `test:offline-queue` scripts.
- `_bmad-output/specs/spec-airtable-to-supabase/migration-playbook.md` -- EDIT Phase 4 steps 17–21 to record what ran, including the Management-API DDL path and the Mailtrap go-live swap still owed.

**Acceptance Criteria:**
- Given `node scripts/configure-hosted-project.mjs --dry-run`, when it runs, then it exits 0 and its output contains no value of `smtp_pass`, `smtp_user`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, or any Postgres password.
- Given `node scripts/configure-hosted-project.mjs`, when it completes, then a follow-up `GET …/config/auth` shows `site_url = https://folk-hkmc-rho.vercel.app`, a non-empty `uri_allow_list` containing that origin and its `/auth/confirm` child, `mailer_templates_invite_content` and `mailer_templates_magic_link_content` non-null and equal to `supabase/templates/*.html`, and `smtp_admin_email` equal to `SMTP_SENDER_EMAIL`; the script exits 0 having asserted each field by re-reading.
- Given the retirement migration was applied, when I query `information_schema.columns` for `invite_log` and `audit_events`, then `user_id`, `inviter_user_id` and `actor_user_id` exist, no `*airtable_user_id` column remains, and `information_schema.tables` for `table_schema='public'` lists none of `staff_memberships`, `staff_profiles`, `airtable_identities`, `airtable_sync_state`.
- Given `supabase_migrations.schema_migrations`, when I read its versions, then `20261007000000` is present alongside the nine pre-existing versions, so a future `supabase db push` treats the new migration as applied.
- Given `lib/supabase/types.ts`, when I `grep -c "airtable_user_id\|staff_memberships\|staff_profiles\|airtable_identities\|airtable_sync_state"`, then the count is 0 and no hand edit is present in the diff (every changed line is a removal or a generated reordering).
- Given the seeded preview fixtures, when `node scripts/seed-preview-fixtures.mjs --wipe` then `node scripts/seed-preview-fixtures.mjs` runs, then the second run creates nothing new, exits 0, and prints one Admin/Preacher/Volunteer/Assistant per program plus the open session id and its attendance URL — and prints no password.
- Given the seeded fixtures, when I read `public.users` for the fixture emails, then each row's `id` equals the `auth.users` row with the same email (DW-3), the Assistant and Volunteer rows carry `assigned_preacher_id` pointing at the program's Preacher, and every row has `status = 'Active'`.
- Given `node scripts/verify-rls.mjs`, when it runs, then it exits 0 with every assertion passing — proving story 7.7 changed no RLS policy. The count is not pinned (79 at plan time).
- Given `node scripts/verify-attendance-contract.mjs`, when it runs against a base URL whose routes are the current branch build, then every CAP-5 assertion passes and the script exits 0. If the deployed build is stale in a way that changes a status code, the failure is recorded, not worked around.
- Given `node scripts/verify-pwa-offline-queue.mjs`, when Chromium is resolvable, then the offline `POST` returns 202 `queued: true`, the IndexedDB row appears and later drains, and the `409`-replay case still drains — and the script exits 0. Without a browser it exits non-zero with an environment message; it never exits 0 without having run the checks.
- Given `pnpm guardrails`, `pnpm typecheck:workspace`, `pnpm build:apps` and `pnpm lint`, when they run, then guardrails prints "Monorepo guardrails passed.", typecheck and build succeed, and lint reports no new error in any file this diff touches.
- Given `node scripts/verify-program-readiness.mjs` and `node scripts/verify-airtable-removal.mjs`, when they run, then both still exit 0 — the first because no migration file was deleted, the second because no runtime Airtable reference was reintroduced.
- Given `git diff --name-only`, when I inspect it, then `apps/*/public/sw.js`, every `proxy.ts`, `apps/*/app/attendance/route.ts`, and `scripts/verify-rls.mjs` are **absent**.

## Auto Run Result

Status: awaiting-operator
Blocking condition: none — the story is finished as far as an agent can take it. What
remains is enumerated under `operator_actions:` above, and every one of it needs a human
outside this repository.

### Summary of the implemented change

The hosted Supabase project `etwunirahuucodcxydgs` was configured, its schema brought to
the post-Airtable state, and the CAP-3/5/6 verification suite written as executable code
and actually run against the live project rather than narrated. Five operational scripts
shipped, one migration was authored and applied, the generated types were regenerated, two
service-role inserts were repointed at the renamed columns, one verification gate was
repointed and two new ones added, the playbook records the DDL path that actually works
here, and the docs that this migration falsified were corrected.

### Files changed

- `supabase/migrations/20261007000000_retire_airtable_named_columns.sql` — NEW. Renames
  `invite_log.airtable_user_id`/`inviter_airtable_user_id` and
  `audit_events.actor_airtable_user_id`, and drops the four Airtable bridge tables. Guarded
  so a re-apply is a no-op. Applied through the Management API and recorded in
  `supabase_migrations.schema_migrations`.
- `lib/supabase/types.ts` — regenerated against the live project; the four dropped tables
  and three renamed columns are gone. Generated, never hand-edited.
- `lib/invite-log.ts`, `lib/authz.ts` — the three insert keys repointed at the renamed
  columns (post-migration, or every service-role insert fails with a PostgREST `42703`).
- `scripts/configure-hosted-project.mjs` — NEW. Field-by-field Auth PATCH, re-read and
  assert, secrets redacted, `--dry-run`, refuses a non-disposable project ref.
- `scripts/seed-preview-fixtures.mjs` — NEW. Durable per-program fixtures, tagged and
  wipe-able, with the DW-3 id alignment checked *before* the write.
- `scripts/verify-attendance-contract.mjs` — NEW. CAP-5 over HTTP, 21 assertions,
  including live-schema column probes and a 403 assertion that reads the withheld rows.
- `scripts/verify-pwa-offline-queue.mjs` — NEW. CAP-6 in real Chromium via
  `playwright-core`, 19 assertions including reload persistence and 409-as-synced.
- `scripts/verify-airtable-removal.mjs` — the column-write gate flipped to the
  post-migration names (anchors restored), dead constants dropped, a real
  `lib/supabase/types.ts` gate added, and a narrow allowance added for the CAP-5
  verifier's explanatory comments and staleness marker.
- `package.json` / `pnpm-lock.yaml` — `playwright-core` added (caret range, driver only, no
  browser download) and five npm scripts; `configure:hosted-project` mutates, while
  `test:hosted-project` is the dry run.
- `_bmad-output/specs/spec-airtable-to-supabase/migration-playbook.md` — Phase 4 steps
  17–21 record what ran, that `supabase db push` cannot connect from this environment, and
  a table of the five scripts plus the three new environment inputs.
- `docs/architecture.md`, `docs/data-models.md`, `docs/deployment-guide.md`,
  `docs/index.md` — the lines that described the bridge tables as live and the rename as
  deferred were corrected.

### Review findings breakdown

80 findings across four layers: 0 high, 18 medium, 56 low, 6 false. **24 patch groups
applied** (52 rows, many sharing a root cause) — full accounting, including every rejected
finding and its reason, is in `## Review Triage Log`. **7 rows deferred**, of which 4 became
new frontmatter `deferred:` entries and 3 were already recorded. Nothing was left unlogged.

Two claims were disproved by probe rather than accepted: the migration needs no explicit
transaction (the Management API executes a multi-statement query atomically, verified), and
a generated fixture password containing `#` is not truncated on read back.

### Follow-up review recommendation

`false`. This pass patched 0 `high` and 18 `medium` entries — converged. The residual risk
is not in the patch volume but in the surface the patches could not reach: the CAP-5 and
CAP-6 results characterise the **deployed** build, which predates story 7.7, and the
offline *shell* half of CAP-6 is broken by a `sw.js` precache list this story is forbidden
to edit. Both are recorded as operator actions and as `deferred:` entries, and neither is
a defect in this diff.

### Verification performed

See `## Verification Results` above for the full table. Summary: CAP-3 `79/79`, CAP-5
`21/21`, CAP-6 `19/19`, `verify-airtable-removal` `30/30`, `verify-program-readiness` exit
0, guardrails pass, typecheck and build clean, lint byte-identical to the pre-story
baseline, and a secret scan across every script's combined output found zero leaks.

### Residual risks

- The branch is unverified at its own surfaces until it is redeployed; every HTTP
  assertion so far ran against a build one story behind.
- `sw.js` precaches a 404, so the installed PWA has no offline shell. Queued submissions
  still replay correctly.
- The Auth sender identity on the project is a placeholder pair until an operator supplies
  the Mailtrap sandbox values.
- The migration ledger row was written by hand; story 9's prod replay needs a committed,
  re-runnable DDL procedure and a `Database` generic on the service-role client so the
  column names are type-checked rather than matched as text.

## Spec Change Log

## Review Triage Log

### 2026-10-07 — Review pass 1
- verdicts: 80 findings — high 0, medium 18, low 56, false 6, maybe-false 0
- layers: blind-hunter (37), edge-case-hunter (36), verification-gap (4 filed gaps + 1 other), intent-alignment (1 descriptive)
- patches applied: 24 (all `patch` rows below). Root-cause groups:
  - **G1 `--project-ref`/`--project-id` mis-parse** — `configure-hosted-project.mjs:110-112`. One index was computed and a *different* one used to read the value, so the `--project-id` branch read `argv[-1+1] = argv[0]`, i.e. the flag name itself, as the project ref. Verified by reproducing: `override "--project-id"`. Fixed by resolving both spellings to one index, reading the value with that index, and refusing a flag with no value.
  - **G2 hosted Auth allow-list verified by containment, not equality** — the patch step compared the whole joined string, the verification step only checked membership plus one literal `*.vercel.app` refusal, so a stale preview host or a `*` wildcard would have passed while "All fields verified" printed. (verification-gap, filed with its demonstration.) Fixed with an exact-set comparison after normalizing the `/**` suffix, plus a host-wildcard refusal.
  - **G3 no live-schema assertion for the renamed columns** — (verification-gap, filed with its demonstration: reverting the two column keys leaves typecheck at exit 0 because `createSupabaseAdminClient()` passes no `Database` generic, so the insert payload is untyped.) Fixed by selecting `user_id`/`inviter_user_id`/`actor_user_id` in `verify-attendance-contract.mjs`, which makes PostgREST validate them against the live schema.
  - **G4 DW-3 guard could never fire** — `seed-preview-fixtures.mjs:362-369` compared the row the *upsert returned*, which by construction carries the id just written, so the pre-existing-mismatch case it exists to stop was silently repointed instead of refused. Fixed by reading the row before the write and refusing there, with both ids named.
  - **G5 `redact()` could throw, and missed escaped secrets** — a registered secret containing `"` or `\` was never matched inside `JSON.stringify`, and the re-parse then threw inside `log()`. Fixed by matching both spellings and falling back to the redacted text instead of throwing.
  - **G6 `#` in a generated password** — reported by the edge-case layer as dotenv truncation. **Disproved**: Node's `loadEnvFile` reads `abc#def123456` intact, and this repo reads the value back with `/^PREVIEW_FIXTURE_PASSWORD=(.*)$/m`, which also captures it whole. No change.
  - **G7 fixture password unregistered in the seeder** — the seeder scrubbed only the *generated* password, so the env- and file-sourced ones were not registered, unlike both verifiers. Fixed by registering all three sources.
  - **G8 `--wipe` minted a credential** — `resolvePassword()` ran before the wipe branch, so a wipe on a machine with no seed file created `.env.preview-seed.local` holding a password no auth user had. Fixed by moving the wipe branch first.
  - **G9 per-program mobile hardcoded to folk** — `verify-pwa-offline-queue.mjs` advertised `--program folk | gita-life` but posted folk's `9000000002`; a gita-life run would get 404 from the route, and `sw.js` removes a queued row only on ok-or-409, so the queue would never drain. Fixed by reading the out-of-scope contact's phone per program.
  - **G10 `--keep-queue` made the run always fail, and suppressed server cleanup** — the "queue starts empty" check could not hold under the flag, and the attendance-row cleanup was gated on the same flag plus on a fixture password, so a run without one leaked a real row that broke the next run's assertions. Fixed by skipping the emptiness assertion under the flag, decoupling cleanup behind a new `--keep-attendance`, and failing when the delete errors.
  - **G11 throws aborted runs with no recorded check** — `register()` and both `SYNC_QUEUE` evaluates rejected out of `page.evaluate`; `apiFetch`'s `fetch` rejected out of `main()`; and the early `report()` called `process.exit` inside a `try`, orphaning Chromium. Fixed by catching each into a recorded check, failing with a message on a transport fault, and closing the browser before the early exit.
  - **G12 vacuous 403 assertion** — `!Array.isArray(body) || body.length === 0` is always true for a `{error}` body, yet the I/O matrix row promises "no attendance rows returned". Fixed by reading the session's rows with the service role and asserting the caller's 403 withheld them — which also required the seeder to seed a row in the out-of-scope session, since otherwise there was nothing to withhold.
  - **G13 create/cleanup could leak** — no `try/finally`, so any throw between the 201 and the delete left a real attendance row. Fixed with a `finally` that closes after the `knownAttendanceIds` filter (the filter needs the created row to still exist to distinguish "excluded" from "all filtered").
  - **G14 gate regressions in `verify-airtable-removal.mjs`** — the flipped column assertions lost their `^\s*` anchors; the `legacy*` constants were dead with a comment claiming otherwise; and removing the `lib/supabase/types.ts` allowance left a comment promising a check that did not exist. Fixed: anchors restored with the `m` flag, constants dropped and the naming un-inverted (`currentColumn` / `removedColumn`), and a real `generated Supabase types carry no Airtable mention` gate added — negative-tested by appending a comment line to `types.ts` and watching 2/30 fail, then restoring to 30/30.
  - **G15 script-level ergonomics and truthfulness** — `test:hosted-project` mutated live infra (now `configure:hosted-project`, with `test:hosted-project` running `--dry-run`); `PRODUCTION_URL` was an undocumented second name for `NEXT_PUBLIC_SITE_URL` (now falls back to the documented var, then the constant); `playwright-core` was the only exact-pinned dependency and `tw-animate-css` had been reordered for no stated reason (now `^1.63.0`, original order restored, lockfile regenerated); six new files lacked a trailing newline; the new env surface (`PREVIEW_FIXTURE_PASSWORD`, `PW_CHROMIUM_PATH`, `.env.preview-seed.local`, the five npm scripts) was documented nowhere readable — now a table in the playbook's Phase 4.
  - **G16 docs falsified by this migration** — `docs/architecture.md:114`, `docs/data-models.md:174/183/194/195/207`, `docs/deployment-guide.md:67` and `docs/index.md:79` all described the four bridge tables as live and the rename as deferred to "the schema-cleanup story", which is this story. Corrected to the post-migration reality.
  - **G17 CAP-5 ran against a stale build with no way to tell** — the AC scoped the run to "a base URL whose routes are the current branch build", the deployment predates story 7.7, and nothing in the script could distinguish the two. Fixed with a freshness probe that emits a loud WARN naming the stale `<meta description>` marker; the 21/21 result is now reported together with that warning rather than as bare branch verification.
  - **G18 no persistence check for the offline queue** — queue → sync ran inside one document lifetime. Added a `page.reload()` between them, asserting the row survives.
  - **G19 chromium probe accepted a non-file path** — `existsSync` alone would admit a directory and then fail with a raw Playwright error instead of the script's environment message. Now `statSync(...).isFile()`.

- findings:
  - blind-hunter:
    - `[medium]` `patch` G1 `--project-id` alias resolves to the wrong argv slot.
    - `[low]` `patch` G5 `redact()` re-parse could throw on a quote/backslash secret.
    - `[medium]` `patch` G2 allow-list checked for containment only.
    - `[low]` `patch` G15 `smtp_sender_name` placeholder certified as verified → the *value* is an operator input; recorded as a deferred item rather than code.
    - `[medium]` `defer` no assertion that `smtp_host`/`smtp_user`/`smtp_pass` authenticate — the only real proof is a Mailtrap inbox check, which needs the human. Recorded as an operator action.
    - `[medium]` `patch` G1b no guard that an explicit ref override targets the disposable project → `--allow-non-disposable` added.
    - `[low]` `patch` G15 `PRODUCTION_URL` undocumented; `NEXT_PUBLIC_SITE_URL` ignored.
    - `[low]` `patch` G15 `test:hosted-project` mutated hosted infrastructure.
    - `[medium]` `defer` the five verifiers are wired into nothing — CI cannot reach the project, so gating them is an operator/CI-credentials decision, recorded as a deferred item.
    - `[low]` `reject` seeder keys `contacts` on `phone` alone while the index is `(phone, program_id)` — the fixture phones are distinct per program by construction, so `maybeSingle()` cannot throw; the fix would add a program-scoped key for an unreachable case.
    - `[low]` `reject` seeder's `attendance` upsert keys on `contact_id` alone — only the seeder writes those fixture contacts, so a second session cannot arise.
    - `[low]` `reject` wipe's attendance predicate substitutes a sentinel when `contactIds` is empty — the fixture contact's attendance cascades with the contact, so no orphan can reach the session delete.
    - `[low]` `reject` `generatePassword` modulo bias — negligible for a disposable fixture password; rejection sampling adds complexity.
    - `[low]` `patch` G9 hardcoded folk mobile vs the advertised `--program`.
    - `[low]` `patch` G10 `--keep-queue` guarantees a FAIL and suppresses server cleanup.
    - `[medium]` `patch` G10 run without a fixture password leaks the replayed attendance row.
    - `[medium]` `patch` G18 no reload/persistence check for the queue.
    - `[medium]` `patch` G12 the "403 returned no attendance rows" check cannot fail.
    - `[medium]` `patch` G13 no `try/finally` around create/cleanup.
    - `[low]` `patch` G4 DW-3 mismatch recorded non-fatally and with no id detail.
    - `[false]` `reject` the Volunteer-403 assertion "encodes a route role list the matrix does not list" — `apps/folk/app/attendance/route.ts:119` really does `requireRole(staff, ["Admin","Preacher","Assistant"])`, so the assertion states actual behaviour of a frozen route.
    - `[low]` `reject` the redaction block is duplicated across four scripts with divergent semantics — the divergent *behaviour* instances are patched (G7, G5); extracting a shared module adds structure for no behavioural gain.
    - `[low]` `reject` `registerSecret` skips values under 8 characters — real but negligible against the secrets actually registered.
    - `[false]` `reject` the migration is not wrapped in a transaction — **disproved by probe**: `POST /database/query` executes a multi-statement query atomically (a `create table` preceding a failing statement left nothing behind), and the Supabase CLI wraps each migration file in a transaction too.
    - `[medium]` `defer` the hand-written ledger insert is not idempotent and leaves `name`/`statements` null — recorded as a deferred item; the applied row is already correct, and story 9's replay must choose a DDL path.
    - `[medium]` `defer` no repo artifact captures the Management-API DDL procedure — story 9's playbook step already says to pick a path that connects; a new script is that story's deliverable, not this one.
    - `[medium]` `defer` the four `drop table`s have no recorded pre-drop row inventory — the data is gone from this project; it survives in the read-only archive, and the spec's Code Map records the live state it did capture.
    - `[low]` `patch` G16 docs now contradict the applied schema.
    - `[low]` `patch` G14 the flipped assertions lost their `^\s*` anchors.
    - `[low]` `patch` G14 dead `legacy*` constants with a comment that misstates what the gate verifies.
    - `[low]` `patch` G14 a comment promised a `types.ts` gate that did not exist.
    - `[low]` `patch` G14 `retiredColumn` labelled the live name and `legacyColumn` the removed one.
    - `[medium]` `patch` G17 the verifier cannot tell a current build from a stale one.
    - `[low]` `patch` G15 six new files lacked a trailing newline.
    - `[low]` `patch` G15 `playwright-core` exact-pinned; `tw-animate-css` reordered without mention.
    - `[low]` `patch` G15 the new env surface was undocumented.
    - `[low]` `patch` (spec text, outside the intent contract) the Verification Results said "six registered secrets" where the code registers nine.
    - `[false]` `reject` the I/O matrix lists 3 CAP-5 rows against 21 assertions — a matrix names contractual behaviours, and every matrix row has a covering assertion.
    - `[false]` `followup_review_recommended: false` is inconsistent with two deferred items — the flag is computed from this pass's patched entries, and is set from that computation in the Finalize step.
    - `[false]` `reject` Spec Change Log / Review Triage Log empty despite schema and gate changes — the Change Log is reserved for bad-spec loopbacks, which did not occur; this Review Triage Log is the record of this pass.
  - edge-case-hunter:
    - `[medium]` `patch` G1 `--project-id` indexes argv with `-1`.
    - `[low]` `patch` G1 a trailing ref flag with no value silently used the derived ref.
    - `[low]` `patch` G15 the site URL is now validated as a bare http(s) origin.
    - `[low]` `patch` G2 the wildcard refusal now covers any host wildcard, not only `*.vercel.app`.
    - `[low]` `patch` G5 escaped-secret matching.
    - `[low]` `patch` G11 `apiFetch` transport faults now fail with a message.
    - `[low]` `reject` TOCTOU between the GET and the PATCH — inherent to a read-diff-write against an operator-editable field; closing it adds a conditional-patch protocol the API does not offer.
    - `[medium]` `patch` G4 the DW-3 guard was unreachable.
    - `[low]` `reject` a fixture phone present in another program would make `maybeSingle()` throw — the phones are program-distinct constants.
    - `[low]` `reject` the fixture contact holding attendance in two sessions — only this seeder writes those contacts.
    - `[low]` `reject` an orphan tagged attendance row blocking the wipe — deleting the contact cascades its attendance.
    - `[false]` `reject` a generated password containing `#` is truncated when read back — **disproved**: `process.loadEnvFile` reads it whole, and the repo's `/^PREVIEW_FIXTURE_PASSWORD=(.*)$/m` regex captures it whole.
    - `[low]` `patch` G7 the env/file-sourced password was never registered for redaction.
    - `[low]` `patch` G8 `--wipe` minted a credential.
    - `[low]` `patch` G11 `post()` follows redirects by default — not changed; the base URL is https and stable, and adding `redirect: "manual"` without handling 307 would trade a loud failure for a different loud failure.
    - `[low]` `reject` a network fault in `post()`/`get()` rejects unhandled — the script is run deliberately by a human; the assertion count would be partial, which the exit code already reflects.
    - `[low]` `reject` fixture contacts are selected by `assigned_preacher_id` rather than exact phone — the seeder creates exactly two tagged contacts per program and `--wipe` removes both.
    - `[low]` `reject` `PLAYWRIGHT_BROWSERS_PATH` as a colon-separated list is not scanned — a Playwright-specific convention this script does not otherwise follow.
    - `[low]` `patch` G19 the chromium probe accepted a non-file path.
    - `[low]` `patch` G11 `register()` rejection now records a reason.
    - `[low]` `patch` G11 `SYNC_QUEUE` timeout now records a failure instead of aborting.
    - `[low]` `patch` G9 hardcoded mobile vs `--program`.
    - `[low]` `reject` the in-page helper hardcodes IndexedDB version 1 while `sw.js` declares `DB_VERSION = 1` — they agree; a future bump would break loudly, and the script already asserts the DB/store names it depends on.
    - `[low]` `patch` G10 the cleanup delete discarded its error.
    - `[low]` `patch` G10 `--keep-queue` also suppressed the attendance cleanup.
    - `[low]` `patch` G11 the early `report()` orphaned Chromium.
    - `[false]` `reject` the migration leaves a half-migrated database if a later drop fails — **disproved by probe**: `/database/query` is atomic across statements (verified with a `create table` + failing statement + a fresh existence read), and the CLI wraps each file in a transaction.
    - `[low]` `reject` a dependent view would make `drop table` fail on story 9's replay — this project's drops succeeded, so there are no dependents here; story 9 audits its own target.
    - `[medium]` `defer` `writeInviteLog`/`writeAuditEvent` never inspect `error`, so a schema mismatch loses the row silently — pre-existing behaviour, unchanged by this story; G3 now detects the mismatch instead.
    - `[low]` `patch` G14 lost line anchors.
    - `[low]` `patch` G14 dead constants.
    - `[low]` `patch` G14 the missing `types.ts` gate.
    - `[low]` `patch` G4/G7/G14 claim-vs-code mismatches in the seeder and the gate.
  - verification-gap (gap findings arrive pre-verified; triage trusts the filed evidence):
    - `[medium]` `patch` G3 the renamed `invite_log` columns are verified only as source text, and `lib/invite-log.ts:20` neither inspects `error` nor catches, so a migration that did not take effect loses every invite row with a 201 response and a green suite. Filed evidence: reverting the keys leaves typecheck at exit 0 (untyped payload), and only the text-matching gate fails.
    - `[medium]` `patch` G2 the allow-list is checked for containment while the patch treats it as an exact value.
    - `[low]` `patch` G1 the `--project-id` alias.
    - `[low]` `patch` G9 the hardcoded mobile.
    - `[low]` `defer` `writeAuditEvent`'s `actorUserId` is passed by neither call site (`lib/supabase/manage.ts:947,1032`), so `actor_user_id` is always undefined — verified, and pre-existing: the old column was equally unwritten, and `docs/data-models.md` already said "not written by current code". The doc now states it alongside the rename.
    - `[low]` `patch` G16 `docs/architecture.md` and friends describe the dropped tables as live.
    - `[low]` `patch` G14 the flipped assertion lost its anchor (redundancy, not a hole — filed as such).
  - intent-alignment (descriptive; no defect):
    - `[low]` `patch` the spec carried no `operator_actions:` key and no `awaiting-operator` status while documenting four owed human items — which is precisely the Finalize step this pass feeds; the frontmatter and `## Auto Run Result` now carry both, and `sprint-status.yaml` was left untouched as the intent requires.

## Design Notes

**Implementation outcome (2026-10-07).** Everything in Tasks & Acceptance was executed. The migration was already applied and recorded when this run started, so the work here was: confirm the hosted DB state (`information_schema` shows the three renamed columns and none of the four bridge tables; `supabase_migrations.schema_migrations` holds all ten versions); regenerate `lib/supabase/types.ts` and confirm it is byte-identical to a fresh `supabase gen types types --lang typescript` against the live project; create the two remaining verifiers; wire `package.json`; and record Phase 4 in the playbook.

**`verify-attendance-contract.mjs` signs in with the cookie, not a bearer token.** The GET scoping in `apps/<program>/app/attendance/route.ts:139-148` runs inside `getStaffContext`, which resolves the session from the Supabase session cookie via `createServerClient`. An `Authorization: Bearer` header proves nothing about that path. The script therefore signs in through Supabase Auth with the seeded fixture password and replays the cookies the server client would set — serialized with `@supabase/ssr`'s own `serializeCookieHeader` rather than hand-assembled, so the header format is the one the server actually parses.

**CAP-6 needed the queue helpers installed on the page, not passed per `page.evaluate`.** Two failures cost real time and both are worth recording. First, `page.evaluate` resolves its result on the microtask queue, so an IndexedDB promise that settles in a later task surfaces as `Resulting promise was garbage collected` — an error that reads like a Playwright bug but is a lifetime problem. The helpers are now installed once with `addInitScript` as `window.__readQueue` / `window.__clearQueue`. Second, opening `folk-offline-db` with a bare name pins version 1 with **no object store**; the service worker's later `openDB()` at the same version never fires `onupgradeneeded`, so the store never exists and every transaction throws `NotFoundError`. The helpers mirror the worker's open exactly — same name, same version, same create-on-upgrade. Opening the DB is also not the same as taking control of the document: `navigator.serviceWorker.ready` resolves when the worker is *active*, which leaves `navigator.serviceWorker.controller` null on first install, so the script waits for `controllerchange` and reloads as a fallback.

**One CAP-6 assertion was downgraded to a warning, deliberately.** `sw.js`'s `PRECACHE_ASSETS` includes `/manifest.webmanifest`, which the deployment serves as `404`. `cache.addAll` is all-or-nothing, so the install handler's catch swallows the rejection and **nothing at all is precached** — offline *navigation* therefore falls through to the synthetic `503 Offline` instead of the cached shell. This is a real defect, but it lives in the frozen `public/sw.js` and in a missing static asset, not in CAP-6's queue contract, and this story does not edit `sw.js`. The script reports it as a `WARN` with the cause rather than passing silently or working around it. Fixing the precache list (drop the entry, or serve the asset) is the follow-up.

**The `knownAttendanceIds` assertions needed two rows to mean anything.** Filtering by every id in the session returns an empty list, where "the filter excluded everything" and "the filter never ran" are indistinguishable. The script filters by the single row it just created and asserts the count drops by exactly one, then repeats with a non-UUID entry prefixed and asserts the count does *not* drop — the `parseKnownAttendanceIds` null path.

**`verify-airtable-removal.mjs` had one gate flipped, not deleted.** Its check `renamed columns keep their historical names until the schema migration lands` asserted `lib/invite-log.ts` and `lib/authz.ts` still wrote `*airtable_user_id`. That gate existed to hold the TypeScript keys in lockstep with the un-migrated database; the migration landed, so the check now asserts the post-migration names (`user_id` / `inviter_user_id` / `actor_user_id`) and its two `ACCOUNTED_FOR` allowances are gone. Deleting it instead would have left the insert keys unpinned. One comment in `seed-preview-fixtures.mjs` also had to stop naming the retired service, since the gate scans every file.

**`uri_allow_list` goes over the wire as a comma-separated string.** The Management API rejects an array (`expected string, received array`) and echoes the same shape back, so the script normalizes either form on read and asserts against the parsed list. The re-read also refuses to accept a wildcard: a `*.vercel.app` entry is a hard failure, not a warning.

## Design Notes (plan-time reasoning, retained)

**Why a Management-API DDL path instead of `supabase db push`.** Both Postgres endpoints time out from this sandbox while PostgREST, GoTrue and the Management API all answer, so `supabase db push --linked` cannot connect. `POST /v1/projects/{ref}/database/query` runs as `postgres` (a `create temp table` probe succeeded) and is the only DDL channel that works. The CLI's own bookkeeping — a row in `supabase_migrations.schema_migrations` — is written explicitly so the migration ledger stays truthful and story 9's prod replay can use either path. This substitution is recorded in the playbook, not hidden.

**Why `playwright-core` and not `playwright`.** CAP-6 is a service-worker behaviour, so only a real browser observes it. The full `playwright` package downloads ~150 MB of browsers on install and would make CI's `pnpm install --frozen-lockfile` depend on that download for a check CI does not run. `playwright-core` is the driver only; the script resolves an executable from `PW_CHROMIUM_PATH` or a short probe list and exits non-zero with an environment message when none is found, so a missing browser can never be mistaken for a pass.

**Why the configurer re-reads instead of trusting the PATCH.** A `200` from the Management API does not prove the field was accepted — Supabase silently drops unknown keys, which is exactly how `redirect_urls = null` survived in the first place. Asserting each field against a fresh `GET` is what makes the script's exit code mean something.

**Why the seeder writes its generated password to a file instead of stdout.** The operator has to sign in on the preview, so the credential must reach them; stdout and chat are both places a secret must not go. `.env.preview-seed.local` is already covered by `.gitignore:23` (`.env*`), so no new ignore rule is needed and the value cannot be committed by accident.

**Why the contract verifier signs in through Supabase Auth rather than minting a JWT.** The GET scoping rules in `apps/*/app/attendance/route.ts:139-148` run inside the server's own `getStaffContext`, which reads the Supabase session cookie; a hand-signed JWT proves nothing about that path. A real password sign-in for a real `public.users` row exercises the same chain a staff member does.

**What is deliberately left to the operator.** The preview deployment is one commit behind (its `<meta description>` still says "Airtable handoff"), and redeploying publishes to the URL that becomes production — the branch's own spec marks it dark-until-cutover, but story 7.7's park record already reserved "deploy the branch preview" for a human, so this story verifies against the deployed build it finds and leaves the redeploy, the on-device PWA install, the Mailtrap inbox check and the pre-go-live SMTP swap as operator actions.

## Verification Results (2026-10-07, after review pass 1)

Every command below was run in this environment after the review patches landed.
Results are as observed, not as intended.

| Command | Result |
|---|---|
| `pnpm test:hosted-project` (`--dry-run`) | exit 0; the printed patch carries no value of any of the nine registered secrets (scanned the combined output of every script against all eleven secret values, including the fixture password) |
| `pnpm configure:hosted-project` | exit 0; zero-value PATCH (the project already matched), and each field re-read and asserted — including the new exact-set comparison on `uri_allow_list`, which reports `exact set = match` |
| `configure-hosted-project.mjs --project-id someotherproject` | exit 1 — refuses a ref other than the app's own project without `--allow-non-disposable` |
| `configure-hosted-project.mjs --project-ref` (no value) | exit 1 — "requires a value" |
| `GET …/config/auth` (independent of the script) | `site_url` = go-live URL; `uri_allow_list` = exactly the 3 intended entries; both `mailer_templates_*_content` non-null and equal to `supabase/templates/*.html`; `smtp_admin_email` = `SMTP_SENDER_EMAIL` |
| `information_schema.columns` for `invite_log` / `audit_events` | `user_id`, `inviter_user_id`, `actor_user_id` present; zero `*airtable*` columns anywhere in `public` |
| `information_schema.tables` | none of the four bridge tables remain |
| `supabase_migrations.schema_migrations` | all ten versions, `20261007000000` alongside the nine pre-existing |
| `lib/supabase/types.ts` vs `supabase gen types types --lang typescript --project-id …` | `grep -c` for the retired tokens = `0`; the file matches a fresh regeneration |
| `pnpm seed:preview-fixtures` after `--wipe` | exit 0, `Total created: 24`; the next run reports `Total created: 0` |
| `seed-preview-fixtures.mjs --wipe` with no `.env.preview-seed.local` | exit 0 and **does not** create one (the regression the review caught) |
| `public.users` read-back for the fixture emails | every `id` equals its `auth.users.id`; Volunteer and Assistant carry `assigned_preacher_id` = the program's Preacher; all rows `status = 'Active'` |
| `node scripts/verify-rls.mjs` (CAP-3) | exit 0, **79/79** |
| `pnpm test:attendance-contract` (CAP-5) | exit 0, **21/21** — now including the two live-schema column probes, a fatal DW-3 check, and a 403 assertion that reads the withheld rows with the service role. **1 warning: the deployed build predates this branch** |
| `pnpm test:offline-queue` (CAP-6) | exit 0, **19/19** — now including the reload-persistence check — plus the recorded precache warning |
| `test:offline-queue --chromium /nonexistent/chrome` | exit 1 with the shared "environment cannot run the CAP-6 check / NOT a pass" message and the paths tried |
| `pnpm guardrails` | "Monorepo guardrails passed." |
| `pnpm typecheck:workspace` | exit 0 |
| `pnpm build:apps` | exit 0, both apps |
| `pnpm lint` | 12 errors / 7 warnings — the **file set is identical to the pre-story baseline** (re-confirmed by stashing this diff and re-running); every one is in `.agent/`/`.codebuddy/`/`.neovate/` skill templates this diff does not touch |
| `node scripts/verify-program-readiness.mjs` | exit 0 |
| `node scripts/verify-airtable-removal.mjs` | exit 0, **30/30** — including the new `generated Supabase types carry no Airtable mention` gate, negative-tested by appending one comment line to `types.ts` (2/30 failed) and then restoring 30/30 |
| `git diff --name-only` | `apps/*/public/sw.js`, every `proxy.ts`, `apps/*/app/attendance/route.ts` and `scripts/verify-rls.mjs` are all absent |

**Two claims that were disproved by probe rather than accepted:** the migration needs no
explicit transaction (the Management API's `/database/query` executes a multi-statement
query atomically — a `create table` preceding a failing statement left nothing behind —
and the Supabase CLI wraps each migration file in a transaction too); and a generated
fixture password containing `#` is not truncated on read back (`process.loadEnvFile`
returns it whole, and this repo reads the value with `/^PREVIEW_FIXTURE_PASSWORD=(.*)$/m`).

**One acceptance criterion is NOT met, and is parked rather than reported green.** This
story's AC scoped the CAP-5 run to "a base URL whose routes are the current branch
build". `https://folk-hkmc-rho.vercel.app` predates story 7.7 — its `<meta description>`
still reads "…and Airtable handoff", a string story 7.7 deleted — so 21/21 characterises
the route *as deployed*, not the branch in this diff. The verifier now emits that warning
itself rather than letting a green matrix imply otherwise. The redeploy is an operator
action.

## Verification

**Commands:**
- `node scripts/configure-hosted-project.mjs --dry-run` -- expected: exit 0, no secret value in the output.
- `node scripts/configure-hosted-project.mjs` -- expected: exit 0, "verified" line per field.
- `curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" https://api.supabase.com/v1/projects/etwunirahuucodcxydgs/config/auth` -- expected: `site_url` = the go-live URL; `uri_allow_list` non-empty and containing it; both `mailer_templates_*_content` non-null; `smtp_admin_email` = the sender address. **Do not echo the whole body** — it carries `smtp_pass`.
- `node scripts/seed-preview-fixtures.mjs --wipe && node scripts/seed-preview-fixtures.mjs` -- expected: both exit 0; the second run reports "created 0".
- `node scripts/verify-rls.mjs` -- expected: exit 0, every assertion passing.
- `node scripts/verify-attendance-contract.mjs` -- expected: exit 0 with the full CAP-5 matrix green.
- `node scripts/verify-pwa-offline-queue.mjs` -- expected: exit 0 with the offline-queue assertions green, or a non-zero environment message when no browser is resolvable.
- `pnpm guardrails && pnpm typecheck:workspace && pnpm build:apps && pnpm lint` -- expected: guardrails passes; typecheck and build succeed; no new lint finding.
- `node scripts/verify-program-readiness.mjs && node scripts/verify-airtable-removal.mjs` -- expected: both exit 0.
- `git diff --name-only` -- expected: `apps/*/public/sw.js`, `*proxy.ts`, `apps/*/app/attendance/route.ts`, `scripts/verify-rls.mjs` absent.

**Manual checks (against `https://folk-hkmc-rho.vercel.app`):**
- `POST /attendance` with `{}` → 400 `Invalid mobile number`; with a valid mobile and a random UUID → 404 `Invalid attendance session.`; `GET /attendance` unauthenticated → 401; `/manage` → 307 to `/login?redirect=/manage`; `/sw.js`, `/manifest.json`, `/offline.html` → 200.
- Confirm the `<meta description>` on the deployed build still says "Airtable handoff" — that is the evidence the deployment predates story 7.7, and it is the redeploy's acceptance criterion, not a defect in this story.
