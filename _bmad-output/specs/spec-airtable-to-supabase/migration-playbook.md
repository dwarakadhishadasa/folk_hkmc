# Migration Playbook

Ordered procedure for the Airtable → Supabase migration, captured so it can be replayed on main/prod (CAP-8). Steps marked ✅ were already done on `feature/migrate-airtable-to-supabase` when this spec was written (2026-10-05); the rest are pending.

**Strategy (decided 2026-10-05):** the migration targets a **new, separate Supabase project** — already provisioned as `etwunirahuucodcxydgs` (region ap-south-1) and linked to Vercel, which syncs its env vars. The existing project (`cparpinmalqsimninyfw.supabase.co`) and both Airtable bases (folk `appqea9DRLOXqErXb`, gita-life `appzbssqNK53yqjZH` — corrected 2026-10-06: two bases, not one) stay untouched throughout — they are the archive and the fallback. The app flips to the new project only after testing, with a one-shot delta sync at flip time.

**Environment workflow (decided 2026-10-05):** no local Supabase stack. All development, migration testing, and verification run directly against the hosted new project, which is disposable pre-cutover — full wipes and re-seeds are permitted. Local dev points at the hosted project via gitignored `.env` files; secrets live only in env vars (Vercel integration + local `.env`), never in the repo, and the current credential set is scheduled for rotation after setup.

## Phase 0 — Branch & baseline

1. ✅ Cut a feature branch (`feature/migrate-airtable-to-supabase`) off the target base.
2. ~~Confirm Supabase local stack works~~ **Superseded (2026-10-05):** no local stack. Instead: confirm access to the hosted project (`etwunirahuucodcxydgs`), place its env vars in gitignored local `.env` files, and verify connectivity (`supabase link` / a test query). Auth-email testing happens on the hosted project, not Mailpit.
3. Inventory Airtable touchpoints: `lib/airtable.ts` (sole access layer), `packages/airtable`, `packages/program-config/.../shared-airtable.ts`, all routes/pages importing them, and every `AIRTABLE_*` env var per program prefix (`FOLK_`, `GITA_LIFE_`).

## Phase 1 — Schema

4. ✅ Create core tables migration (`20261004000000_create_core_tables.sql`): `contacts`, `locations`, `sessions`, `attendance` — UUID PKs, `program_id`, FKs, unique indexes (`phone+program`, `contact+session`).
5. Create the Supabase-native `public.users` table (all roles: Admin/Preacher/Volunteer/Assistant — generalized 2026-10-06) replacing the Airtable Users source and the `staff_memberships` / `staff_profiles` / `airtable_identities` bridge (keep `audit_events`).
6. Fix schema gaps found during mapping: `contacts.source` column; drop the `Analytics` linkage everywhere (decided 2026-10-05).
7. Replace placeholder RLS with the scoped policies in `rls-policy-matrix.md` (contacts, attendance, sessions, locations; program-scoped; service-role writes only).

## Phase 2 — Data layer swap

8. Write a Supabase data-access module paralleling `lib/airtable.ts`'s exported surface (same function names/return shapes where possible) so route diffs are import-only.
9. Update every consumer: `attendance`, `registration`, `contact`, `sessions`, `admin/locations`, `volunteers/invite`, `admin/invite-user`, `auth/signin` routes; `dashboard`, `manage`, `sessions`, `contact`, `admin/invite` pages — for **both** `apps/folk` and `apps/gita-life`.
10. Rework `lib/authz.ts`: staff context resolves from `public.users`; delete `findStaffUserByEmail` / `syncStaffSupabaseUserId` Airtable sync; keep `audit_events` writes.
11. Update all `rec*` ID validation to UUIDs (`parseKnownAttendanceIds`, any client-side checks).
12. Preserve behavior contracts while swapping: `/attendance` POST/GET semantics (CAP-5), the service-worker offline queue (queued paths, 202-while-offline, 409-as-synced — CAP-6; corrected 2026-10-06: it is `public/sw.js` + IndexedDB, not `lib/offline-sync.ts`), Asia/Kolkata date logic, `unstable_cache` equivalents for locations/preachers if still needed.
13. **Build the `/manage` replacement (CAP-9):** in-app management portal per `manage-interface.md` — dashboard stats/charts, contacts table, sessions view, per-contact attendance history, favorites/contact editing with photo upload to Supabase Storage. Includes the new contact columns (`photo_path`, `rounds`, `books_read`, `is_favorite`) and the computed attendance-count views. `/manage` stops redirecting to Airtable.

## Phase 3 — Cleanup

14. ✅ Delete `lib/airtable.ts`, `packages/airtable`, `shared-airtable.ts`; remove `@hkmc/airtable` from both apps' `package.json`.
15. ✅ Remove `AIRTABLE_*` env vars (both prefixes) from env files, deployment config, and docs.
16. ✅ `grep -ri airtable` over runtime code returns nothing; build, lint, typecheck pass with no Airtable env set. (Schema-side Airtable-named columns and the four bridge tables remain — they need a migration plus regenerated `lib/supabase/types.ts`, handed to the story that owns hosted-project access; see story 7.7 Design Notes.)

## Phase 4 — Verify on the new project

### Hosted-project tooling (story 7.8)

Five `node` scripts, all run from the repo root with credentials read from the
gitignored `.env.migration.local`. None of them is wired into
`.github/workflows/quality-gates.yml` — they need live project credentials, which
CI does not carry — so run them deliberately, not as part of `pnpm quality:ci`.

| npm script | What it does | Writes to the hosted project? |
|---|---|---|
| `pnpm configure:hosted-project` | Patches hosted Auth config field-by-field, then re-reads and asserts each field | **yes** — `site_url`, `uri_allow_list`, `smtp_admin_email`, `smtp_sender_name`, the two mailer templates |
| `pnpm test:hosted-project` | The same, `--dry-run`: prints the intended patch, sends nothing | no |
| `pnpm seed:preview-fixtures` | Per program: locations, Admin/Preacher/Volunteer/Assistant, in/out-of-scope contacts, an open session, an out-of-scope session, attendance rows. `--wipe` removes them by tag | **yes** — data rows |
| `pnpm test:attendance-contract` | CAP-5 over HTTP against a deployment | one attendance row, created and deleted |
| `pnpm test:offline-queue` | CAP-6 in real Chromium: offline queue, replay, 409-as-synced | one attendance row, created and deleted |

Extra environment:

- `PREVIEW_FIXTURE_PASSWORD` — the password every seeded fixture account gets.
  When unset, `seed-preview-fixtures.mjs` generates one and writes it to
  **`.env.preview-seed.local`** (gitignored by the `.env*` rule; the path is
  printed, the value never is). The two verifiers read it back from there.
- `PW_CHROMIUM_PATH` (or `--chromium <path>`) — the Chromium executable
  `test:offline-queue` drives. `playwright-core` is a driver only and downloads
  no browser; with no resolvable executable the script exits non-zero with an
  explicit "environment cannot run this check" message rather than passing.
- `PRODUCTION_URL` / `NEXT_PUBLIC_SITE_URL` — the deployment the verifiers
  target. Both default to `https://folk-hkmc-rho.vercel.app`.

Never run `supabase config push`: `supabase/config.toml`'s `[auth]` section is the
discarded local-Mailpit configuration.


17. ✅ New Supabase project: **created and Vercel-linked by the user (2026-10-05)** — `etwunirahuucodcxydgs` (ap-south-1). Linked (no-op, `supabase/.temp/linked-project.json` already pins the ref). All ten migrations applied and recorded in `supabase_migrations.schema_migrations` — including `20261007000000_retire_airtable_named_columns.sql`, which retired the Airtable-named columns and dropped the four bridge tables; `lib/supabase/types.ts` was regenerated afterwards with `supabase gen types types`. Auth configured field-by-field via `scripts/configure-hosted-project.mjs` (site URL `https://folk-hkmc-rho.vercel.app`, `uri_allow_list` = that origin + its `/auth/confirm` child + `http://localhost:3000/**`, `smtp_admin_email` = `SMTP_SENDER_EMAIL`, invite/magic-link templates from `supabase/templates`). SMTP = Mailtrap sandbox (OQ-9 resolved; creds in `.env.migration.local`; **sandbox does not deliver to real inboxes — swap before go-live**, step 27). **Do NOT `supabase config push` `config.toml` verbatim — its `[auth]` section is local-mailpit.** ⚠️ **`supabase db push` cannot run from this environment**: direct Postgres times out on both `db.…:5432` and `aws-0-ap-south-1.pooler.supabase.com:{5432,6543}`. The DDL was applied through the Management API's `POST /v1/projects/{ref}/database/query` endpoint (runs as `postgres`) and the version row written explicitly, exactly as the CLI would. Story 9's prod replay must pick a DDL path that can actually connect and confirm the ledger afterwards.
18. ✅ Seeded preview fixtures: `scripts/seed-preview-fixtures.mjs` creates, per program (`folk`, `gita-life`), two locations, four staff (Admin/Preacher/Volunteer/Assistant, the latter two routed through the Preacher, each with a confirmed `auth.users` row whose id equals `public.users.id` — DW-3), an in-scope and an out-of-scope contact, one open session (`public_attendance_enabled`, window open) plus one deliberately out-of-scope session, and one attendance row. Every row is tagged `preview-fixture-`; `--wipe` is a filter, not a truncate. Idempotent: a re-run creates 0. The fixture password lives in gitignored `.env.preview-seed.local` and is never printed. Verification ran against the **`feature/migrate-airtable-to-supabase` branch deployment** (`https://folk-hkmc-rho.vercel.app`), whose env resolves the new project. ⚠️ **That deployment is one commit behind** — its `<meta description>` still reads "…and Airtable handoff", which story 7.7 removed; **the redeploy is an operator action** (it publishes to the URL that becomes production).
19. ✅ CAP-3 RLS verification: `node scripts/verify-rls.mjs` → **79/79 passing** in HTTP mode (PostgREST reachable, real per-role user JWTs), proving the retirement migration and the column renames changed no policy.
20. ✅ CAP-5/CAP-6 contract checks: `node scripts/verify-attendance-contract.mjs` → **19/19** (full POST/GET matrix, including 400/404/409/403 scoping and the `knownAttendanceIds` null path), driven through a real Supabase password sign-in replaying the SSR session cookie, which is the only way to exercise `getStaffContext`. `node scripts/verify-pwa-offline-queue.mjs` → **18/18** in real Chromium via `playwright-core` (offline `POST /attendance` → `202 {queued:true}`, one IndexedDB row in `folk-offline-db/pending-requests`, drain on `SYNC_QUEUE`, and drain again on a `409`). Known gap recorded, not worked around: `sw.js`'s `PRECACHE_ASSETS` lists `/manifest.webmanifest`, which the deployment serves as `404`, so `cache.addAll` rejects and **nothing is precached** — offline *navigation* falls through to the synthetic `503` instead of the cached shell. `sw.js` is frozen for story 7.8; fixing the precache list (or serving the asset) is a follow-up.
21. ⏳ **Operator action.** Smoke-test PWA install + offline flow on a real device/emulator against the preview deployment — a desktop Chromium context is not a device install and does not prove the manifest installs. Also still owed to a human: the preview redeploy (see step 18), a Mailtrap inbox check of the invite/magic-link templates, and the pre-go-live SMTP swap (step 27).
22. ✅ Update `docs/data-models.md`, `docs/architecture.md`, `docs/api-contracts.md` to the Supabase-only reality. **Owned by story 7** (decided 2026-10-06).

## Phase 5 — Cutover (when testing passes)

23. Freeze writes briefly (maintenance window) so no new data lands in Airtable or the old Supabase project during the flip.
24. **Initial load:** page the Airtable REST API for **both bases** (folk `appqea9DRLOXqErXb`, gita-life `appzbssqNK53yqjZH`; table IDs in `packages/program-config/src/programs/*.ts`) — "export to CSV" is an Airtable UI feature, an agent pages the API instead (corrected 2026-10-06); tables: contacts, attendance history, sessions, locations, users. Transform IDs (`rec*` → UUID with a persisted mapping table); resolve free-text locations; load into the new project via service role; verify counts per table per program.
25. **Auth users (decided):** migrate `auth.users` from the old project to the new one preserving UUIDs (dump/restore of the auth schema), so staff links, sessions, and `audit_events` references survive; verify each staff member can still sign in before the flip. Old-project access (OQ-8 fully resolved 2026-10-06): service-role key + Postgres URLs in `.env.migration.local` — use `OLD_POSTGRES_URL_NON_POOLING` (5432) for `pg_dump`, not the 6543 transaction-mode pooler.
26. **Delta sync:** copy rows created in the old Supabase project after the testing window opened (`audit_events`, any staff/identity rows, anything else written meanwhile) into the new project.
27. **Go live = distribute the link:** the migration branch's deployment already carries the new project's vars; once verification passes, share `https://folk-hkmc-rho.vercel.app` with users as the new production (corrected 2026-10-06 — the old live deployment was itself a preview, so there is no old production env to flip). **First swap Mailtrap sandbox SMTP for a delivering sender** (OQ-9 caveat) or staff receive no sign-in emails. Confirm `/attendance`, offline replay, dashboard scoping, and sign-in on the new production.
28. Post-cutover: keep the old Supabase project and both Airtable bases **read-only and preserved** (no deletes); monitor for a bake period; only decommission after explicit approval, if ever.
