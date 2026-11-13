# Deployment Guide

This is the operating runbook for the FOLK production deployment. It covers the
Vercel project topology, the Supabase target, the Airtable data loader, the
release gates, and the rollback path. Read it before touching production.

Gita Life is not part of the current production cutover. Its app and data are
deliberately left on the earlier baseline; see [Known constraints](#known-constraints).

## Production topology

There are two Vercel projects for FOLK. They are not interchangeable.

| Vercel project | Project ID | Domain | Production branch | Role |
|---|---|---|---|---|
| `folk-hkmc` | `prj_WznI3QJcjHtFokLejDhIyZ6gj4Uw` | `folk-hkmc-rho.vercel.app` | `master` | **Current production** |
| `folk-hkmc-bdnv` | `prj_7PJ9LJdWsXe7lUpLTvg6svaaa6V2` | `folk-hkmc-bdnv.vercel.app` | `main` | Legacy preview; do not change |

`folk-hkmc` builds from the repository root with the project root directory set
to `apps/folk`, build command `pnpm build`, and Node 24.x. It serves the app at
`https://folk-hkmc-rho.vercel.app`.

`folk-hkmc-bdnv` is the earlier preview project. Its `main` branch and its
Production environment are not part of this runbook. Leave both untouched.

The Vercel organization/team is `team_VyUTSoRnf2uz8IBsMVyZhOS4`.

### Branches

| Branch | Use |
|---|---|
| `master` | Vercel production branch for `folk-hkmc`; promoted by fast-forward from `dev` with owner approval |
| `dev` | Shared integration branch; never push directly |
| `main` | Production branch for the legacy `folk-hkmc-bdnv` project; do not modify |
| `feature/*`, `fix/*` | Normal code review branches; PRs target `dev` |

Do not push `main` or `dev`. Do not treat `main` as the current production
branch; the Vercel production branch is `master`. Production promotion is an
owner-approved fast-forward of `master` to the `dev` tip.

### Data stores

| Store | Ref | Role |
|---|---|---|
| `supabase-yellow-mirror` | `etwunirahuucodcxydgs` (ap-south-1) | **Current production database** |
| Old Supabase project | `cparpinmalqsimninyfw` | Archive; read-only |
| Airtable folk base | `appqea9DRLOXqErXb` | Source archive; read-only |
| Airtable Gita Life base | `appzbssqNK53yqjZH` | Source archive; read-only |

The Airtable bases and the old Supabase project are never written to, truncated,
or deleted. The loader only sends `GET` requests to Airtable.

## Preconditions

- Owner approval for any production change, production environment change, or
  branch promotion.
- A gitignored `.env.migration.local` at the repo root containing the target
  project credentials and tooling tokens:
  `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`,
  `SUPABASE_JWT_SECRET`, `SUPABASE_ACCESS_TOKEN`, `POSTGRES_URL_NON_POOLING`,
  `VERCEL_TOKEN`, and `SMTP_*`.
- The Airtable read token in the gitignored `.env`
  (`AIRTABLE_API_TOKEN`). The loader loads `.env.migration.local` first and
  `.env` second, so the target credentials win.
- `psql` and `pg_dump` are available. Direct Postgres works through
  `POSTGRES_URL_NON_POOLING` (port 5432); the transaction pooler on 6543 rejects
  `psql` URI parameters. The pooler can also drop a connection with
  `server closed the connection unexpectedly`; retry, and use the Management API
  `POST /v1/projects/{ref}/database/query` for read-only checks when it stays
  unavailable.
- One e2e runner at a time. Every spec shares one seeded database.
- No local Supabase stack is required for hosted migration work. `supabase db
  push` is not the DDL path for this project; use `scripts/apply-migrations.mjs`
  (Management API) or a direct `psql` connection.

Never print, commit, or paste secrets into a document. The `scripts/` tools
redact known secret values from their own output.

## Pre-deploy gates

Run these before promoting `master` or deploying production:

| Command | Expected |
|---|---|
| `pnpm test:airtable-removal` | `31/31 checks passed` |
| `pnpm typecheck:workspace` | 6 of 6 workspace projects pass |
| `pnpm lint` | 0 errors (warnings are acceptable) |
| `pnpm test:unit` | 211 tests pass (183 root + 24 data-contracts + 4 program-config) |
| `pnpm build:apps` | 2 of 2 app builds pass |
| `node scripts/apply-migrations.mjs --dry-run` | No pending versions for the target, except the documented single-location deferral |
| `pnpm test:e2e` | Run when the local stack is available; CI does not run it |

`pnpm test` is the Vitest unit layer, not the e2e suite. A green CI run covers
guardrails, typecheck, unit tests, build, and lint; it does not cover e2e.

`next.config.mjs` sets `typescript.ignoreBuildErrors: true`, so a green
`pnpm build` is not type-safety. `pnpm typecheck:workspace` is the type gate.

Do not weaken a gate to make it pass. `pnpm test:airtable-removal` is the CAP-7
gate; its allowlist covers the one-time exporter, the `airtable_id_map` ledger
names, and legacy design comments. Runtime imports, service URLs, and env reads
remain forbidden.

**Apply migrations before code.** A deployed route or page must never call an
RPC, view, or column the target does not have. PostgREST returns `PGRST202` for a
missing RPC and `42703` for a missing column; either becomes a 500 on the page.
The dry run is the release gate: if it reports a pending version, apply it and
verify the object exists before promoting the code. Do not deploy first and
migrate after.

## Data migration procedure

The loader is `scripts/migrate-airtable-data.mjs`. It is insert-only and
idempotent: it mints a UUID per Airtable `rec*`, records it in
`public.airtable_id_map` before the first insert, and reuses it on every re-run.
It never updates an existing target row.

### 1. Verify and back up the target

```bash
set -a; . ./.env.migration.local; set +a
psql "$POSTGRES_URL_NON_POOLING" -Atqc "select current_user, now()"
pg_dump "$POSTGRES_URL_NON_POOLING" --no-owner --no-privileges \
  --format=custom --file=/tmp/opencode/backups/yellow-mirror-pre-migration.dump
```

Store the dump outside the repository. It contains operational and auth data.

### 2. Wipe preview fixtures

Preview fixtures are tagged `preview-fixture-` and must not reach production.

```bash
node scripts/seed-preview-fixtures.mjs --wipe --allow-non-local
```

`--allow-non-local` is required because the target is hosted. The wipe is
tag-filtered, not a truncate.

The wipe matches the `.fixture.test` auth domain. Older fixtures use
`preview-fixture-*@example.com`; remove those through the Auth admin API
(`DELETE /auth/v1/admin/users/{id}`) after confirming they are tagged. Deleting
the auth user cascades to `public.users` (`ON DELETE CASCADE`).

### 3. Apply pending migrations

```bash
node scripts/apply-migrations.mjs --dry-run
node scripts/apply-migrations.mjs
```

The script applies every version missing from
`supabase_migrations.schema_migrations` in version order and records the version
with a populated name.

**Defer `20261019000000_contacts_single_location.sql` while Gita Life still has
contacts with more than one location.** The migration refuses rather than
truncating. To apply the rest without it:

```bash
mkdir -p /tmp/opencode/deferred-migrations
mv supabase/migrations/20261019000000_contacts_single_location.sql \
   /tmp/opencode/deferred-migrations/
node scripts/apply-migrations.mjs
mv /tmp/opencode/deferred-migrations/20261019000000_contacts_single_location.sql \
   supabase/migrations/
```

The target then holds every migration except the deferred single-location
CHECK. Record the deferral in the release notes and do not report the schema as
complete.

The date migration (`20261010000000_contacts_date_columns_to_date.sql`) converts
`initial_contact`, `last_contacted_on`, `date_of_birth`, and
`sessions.session_date` to `DATE`. It preserves castable `last_contacted_on`
values; it does not park the column. Do not reintroduce the park block.

The Management API occasionally returns a transient
`PAM authentication failed for user "postgres"`. Retry the command; a retry
against a healthy project succeeds.

### 4. Reconcile the map ledger when Airtable deleted records

The loader's reconciliation compares the map row count to the source count. If
Airtable deleted locations, sessions, or other records after an earlier load,
the map holds stale rows and reconciliation fails even though the target data is
fine.

Delete only the stale **map** rows; keep the target rows (this is the
non-destructive path):

```sql
-- Replace the ids with the records absent from the current Airtable source.
delete from public.airtable_id_map
where program_id = 'folk' and entity = 'locations'
  and airtable_record_id in ('rec...', 'rec...');
```

Use the Airtable meta/table endpoints to compute the current source ids, then
compare them to `airtable_id_map.airtable_record_id` for the program. Do not
delete target rows merely because the source no longer has them.

### 5. Plan and run the delta

```bash
node scripts/migrate-airtable-data.mjs --dry-run --program folk
node scripts/migrate-airtable-data.mjs --program folk
```

Read the dry-run plan before the real run. It prints, per entity, the source
count, insert/skip/quarantine split, dropped fields, photo attachments, and the
quarantine reasons.

The real run:

- writes the map first, then locations → users → contacts → sessions → attendance;
- quarantines unusable phones, duplicate phones, missing contact links, and
  attendance rows whose contact was quarantined;
- re-pins `attendance.created_at` into the session's Asia/Kolkata day;
- fetches Airtable attachments during the run and writes them to the private
  `contact-photos` bucket under `folk/<contact-id>/<uuid>.<ext>`;
- finishes with a reconciliation matrix and exits non-zero on a count mismatch.

The loader is safe to re-run. A second run inserts 0 for rows already present.

If Airtable corrects an existing row, the loader will not update it. Either
update that target row directly after a backup, or roll back the program and
reload.

### 6. Verify the result

The loader's own reconciliation is the authority. It must print
`every count reconciles and every invariant holds.`

Additional checks:

```sql
select program_id, count(*) from public.contacts group by 1 order by 1;
select program_id, count(*) from public.sessions group by 1 order by 1;
select program_id, count(*) from public.attendance group by 1 order by 1;

select count(*) from public.contacts
where program_id = 'folk' and coalesce(cardinality(location_ids), 0) > 1;
-- expected 0 for folk

select count(*) from public.attendance a
left join public.contacts c on c.id = a.contact_id
where c.id is null;
-- expected 0
```

Known quarantine classes are reported, not invented: attendance rows with no
contact link, attendance rows whose contact is quarantined, contacts with
unusable or duplicate phones, and staff users with no email. The Airtable source
still holds them. Do not fabricate placeholder contacts or phones.

Attachments larger than the 5 MB `MANAGE_PHOTO_MAX_BYTES` cap are reported and
skipped; compress the source attachment and re-run if the photo is required.

## Vercel environment

Only the `folk-hkmc` project's **Production** environment changes for this
cutover. `folk-hkmc-bdnv` and `main` stay untouched.

Required production values:

| Key | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://etwunirahuucodcxydgs.supabase.co` |
| `SUPABASE_URL` | same |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | target project legacy anon key |
| `SUPABASE_ANON_KEY` | same |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | target project publishable key |
| `SUPABASE_PUBLISHABLE_KEY` | same |
| `SUPABASE_SERVICE_ROLE_KEY` | target project service-role key |
| `SUPABASE_SECRET_KEY` | target project secret key |
| `SUPABASE_JWT_SECRET` | target project JWT secret |
| `NEXT_PUBLIC_SITE_URL` | `https://folk-hkmc-rho.vercel.app` |

`POSTGRES_*` variables in this project are legacy and no app code reads them.
They may be left in place or removed; do not rely on them for runtime data
access.

Set the values through the Vercel API or CLI. The API upsert is:

```bash
POST /v10/projects/prj_WznI3QJcjHtFokLejDhIyZ6gj4Uw/env?teamId=team_VyUTSoRnf2uz8IBsMVyZhOS4&upsert=true
```

with an array of `{ key, value, type, target: ["production"] }` objects. Use
`type: "sensitive"` for keys and `type: "encrypted"` for URLs. Do not print the
values. Verify with `vercel env pull --environment=production` that
`NEXT_PUBLIC_SUPABASE_URL` resolves the yellow-mirror host; sensitive values may
appear empty in the pull, which is expected.

## Supabase Auth

The hosted project's Auth configuration is patched field-by-field, not pushed
from `supabase/config.toml`. `supabase config push` is forbidden because the
committed `[auth]` section is the discarded local-Mailpit configuration and
would repoint hosted Auth at localhost.

```bash
node scripts/configure-hosted-project.mjs --dry-run
node scripts/configure-hosted-project.mjs
```

The production Auth settings are:

- Site URL: `https://folk-hkmc-rho.vercel.app`
- Redirect allow list: the production origin, its `/auth/confirm` child, and
  `http://localhost:3000/**` for local development.
- SMTP: Mailtrap sandbox. Replace it with a delivering sender before relying on
  staff email.
- Invite and magic-link templates: use the program brand metadata written by the
  app (`{{ .Data.auth_email_brand_name }}`) and the per-invite action URL
  (`{{ .Data.auth_email_invite_action_url }}` with `{{ .RedirectTo }}` fallback).
  Do not use `{{ .SiteURL }}` for shared FOLK/Gita Life links; it follows the
  shared project Site URL rather than the app that sent the invite.

`pnpm test:hosted-project` runs the same script with `--dry-run`.

## Deploy

### Git path (preferred)

Before promoting, confirm the target has every migration the release calls:
`node scripts/apply-migrations.mjs --dry-run` must report no pending versions
other than the documented single-location deferral. If it reports one, apply it
and verify the object exists before the code reaches `master`.

```bash
git checkout master
git merge --ff-only dev
git push origin master
```

The push to `master` triggers the `folk-hkmc` production build. Wait for the
deployment to reach `READY` and for the `folk-hkmc-rho.vercel.app` alias to be
promoted.

Do not push `main` or `dev`. Do not use a PR into `main` as the production
promotion; `main` is the legacy preview branch.

### Manual path (when Git authentication is unavailable)

From the repository root, with the release commit checked out:

```bash
set -a; . ./.env.migration.local; set +a
VERCEL_ORG_ID=team_VyUTSoRnf2uz8IBsMVyZhOS4 \
VERCEL_PROJECT_ID=prj_WznI3QJcjHtFokLejDhIyZ6gj4Uw \
npx --yes vercel@54.14.0 deploy --prod \
  --project prj_WznI3QJcjHtFokLejDhIyZ6gj4Uw \
  --yes --archive=tgz
```

This deploys the local working tree and aliases `folk-hkmc-rho.vercel.app`. It
is the fallback when the GitHub push cannot run; it does not update
`origin/master`.

**Do not use `pnpm deploy:folk:prod` for this production project.**
`scripts/deploy-vercel.mjs` targets `folk-hkmc-bdnv`
(`prj_7PJ9LJdWsXe7lUpLTvg6svaaa6V2`), not `folk-hkmc`. Do not run
`pnpm deploy:prod` or `pnpm deploy:gita-life:prod` without explicit owner
approval.

### Verify

```bash
for path in / /login /attend; do
  curl -sS -o /dev/null -w "$path HTTP %{http_code}\n" \
    "https://folk-hkmc-rho.vercel.app$path"
done

curl -sS "https://folk-hkmc-rho.vercel.app/api/auth/me"
# expected: {"staff":null} for an unauthenticated request
```

Confirm the production alias is `READY` and promoted from the expected `master`
commit, and that a client chunk contains `etwunirahuucodcxydgs`. Then run the
human smoke test with real staff accounts: sign-in, dashboard, contacts,
sessions, attendance, registration, manage, and PWA offline replay.

Contract checks need fixture staff and an open session:

```bash
node scripts/verify-attendance-contract.mjs --base-url <deployment>
node scripts/verify-pwa-offline-queue.mjs --base-url <deployment>
```

Run them against a preview before wiping fixtures, or re-seed temporarily and
wipe again. Do not leave fixtures in production.

## Rollback

**Code:** use Vercel's instant rollback to the previous production deployment.
If the database is the problem, also repoint the Production environment to the
old project (owner action).

**Data:** the loader's rollback deletes exactly the rows named by
`airtable_id_map`, their storage objects, and the map rows. It does not touch
auth users, the old project, or Airtable.

```bash
node scripts/migrate-airtable-data.mjs --rollback --program folk --dry-run
node scripts/migrate-airtable-data.mjs --rollback --program folk
```

**Full restore:** restore the pre-migration dump with `pg_restore`. Keep the old
Supabase project and both Airtable bases as the archive and fallback.

## Known constraints

- **Gita Life is not migrated.** Its target data remains at the earlier baseline
  and the single-location CHECK is deferred. Do not run the loader for
  `gita-life` or apply `20261019000000` until its multi-location contacts are
  resolved.
- **SMTP is Mailtrap sandbox.** Staff sign-in and invite mail lands in a test
  inbox. Replace it with a delivering sender before relying on email in
  production.
- **Airtable is still live.** A delta load is a snapshot. After a write freeze,
  re-run the loader for a final delta; it is idempotent.
- **Stale locations remain.** The target holds location rows that no longer
  exist in Airtable. They are left in place because deleting them would be
  destructive and could break historical references. The app's location picker
  reads all rows, not only `Active` ones.
- **Quarantined source rows remain in Airtable.** Attendance rows with no
  contact link, contacts with unusable or duplicate phones, and staff users with
  no email are not loaded. Correct the source or accept the gap.
- **Oversized attachments are skipped.** The 5 MB cap is enforced by
  `MANAGE_PHOTO_MAX_BYTES`.
- **The fixture wipe's domain filter is narrow.** Older
  `preview-fixture-*@example.com` accounts need the Auth admin API path described
  above.
- **Airtable API calls can time out** from this environment. Retry the loader;
  it is idempotent.
- **The Management API query endpoint can transiently fail** with a PAM
  authentication error. Retry `apply-migrations.mjs`.
- **`POSTGRES_*` in `folk-hkmc` are legacy.** No app code reads them.

## Quick reference

```bash
set -a; . ./.env.migration.local; set +a

# gates
pnpm test:airtable-removal
pnpm typecheck:workspace
pnpm lint
pnpm test:unit
pnpm build:apps

# backup
pg_dump "$POSTGRES_URL_NON_POOLING" --no-owner --no-privileges \
  --format=custom --file=/tmp/opencode/backups/yellow-mirror-pre-migration.dump

# fixtures
node scripts/seed-preview-fixtures.mjs --wipe --allow-non-local

# schema
node scripts/apply-migrations.mjs --dry-run
node scripts/apply-migrations.mjs

# data
node scripts/migrate-airtable-data.mjs --dry-run --program folk
node scripts/migrate-airtable-data.mjs --program folk

# production deploy (Git path)
git checkout master
git merge --ff-only dev
git push origin master

# production deploy (manual path)
VERCEL_ORG_ID=team_VyUTSoRnf2uz8IBsMVyZhOS4 \
VERCEL_PROJECT_ID=prj_WznI3QJcjHtFokLejDhIyZ6gj4Uw \
npx --yes vercel@54.14.0 deploy --prod \
  --project prj_WznI3QJcjHtFokLejDhIyZ6gj4Uw \
  --yes --archive=tgz
```
