# Preview Environment

The preview environment is the manual replacement for Supabase branching. The
free plan does not create a database per branch, so the `preview` git branch
deploys against a separate Supabase project instead.

## Topology

| Piece | Value |
|---|---|
| Git branch | `preview` (tracks `dev`; deployment-only) |
| Vercel project | `folk-hkmc` — `prj_WznI3QJcjHtFokLejDhIyZ6gj4Uw` |
| Vercel environment | **Preview only** |
| Preview URL | `https://folk-hkmc-preview-dwarakadhishadasa-5018s-projects.vercel.app` |
| Branch URL | `https://folk-hkmc-git-preview-dwarakadhishadasa-5018s-projects.vercel.app` |
| Supabase project | `supabase-byzantium-battery` — `cparpinmalqsimninyfw` (ap-south-1) |
| Production database | `supabase-yellow-mirror` — `etwunirahuucodcxydgs` |

The preview branch is **not** a PR branch. `pr-branch-policy.yml` still rejects
`preview` as a PR source. Merge work through `feature/*` → `dev`, then
fast-forward `preview` to `dev`.

Every Vercel Preview deployment of `folk-hkmc` shares this one database,
including feature-branch deployments. Do not run destructive fixtures or
parallel write tests against it; reseed instead.

## Production boundaries

- `folk-hkmc` **Production** environment stays on `etwunirahuucodcxydgs`.
- `folk-hkmc` **Preview** environment points at `cparpinmalqsimninyfw`.
- `folk-hkmc-bdnv` and the `main` branch are legacy and untouched.
- `scripts/verify-preview-environment.mjs` fails when the served preview bundle
  does not contain `cparpinmalqsimninyfw`, when the project is paused, or when a
  migration is missing.

Never point the Preview environment at `etwunirahuucodcxydgs`. If a preview
deployment serves that ref, stop and fix the environment variables before using
it. Preview deletions are irreversible.

## First-time bootstrap

The project was the pre-cutover archive. Before reusing it, take a logical
backup of the archive tables. `pg_dump` does not reach this project from the
operator host (direct DNS is IPv6-only; the pooler drops the connection), so the
backup goes through the Management API SQL endpoint.

1. Restore the paused project:

   ```bash
   source .env.migration.local
   curl -sS -X POST \
     -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
     https://api.supabase.com/v1/projects/cparpinmalqsimninyfw/restore
   ```

   Poll `GET /v1/projects/cparpinmalqsimninyfw` until `status` is
   `ACTIVE_HEALTHY`.

2. Back up the archive tables to a directory outside the repository, for
   example `/tmp/opencode/backups/byzantium-pre-preview/`. Export at least
   `public.staff_profiles`, `public.staff_memberships`,
   `public.airtable_identities`, `public.airtable_sync_state`,
   `public.invite_log`, `public.audit_events`, `auth.users`,
   `auth.identities`, and `supabase_migrations.schema_migrations`.

   One table at a time, through the Management API:

   ```bash
   query="select coalesce(json_agg(t), '[]'::json) from (select * from public.staff_profiles) t"
   curl -sS -X POST \
     -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     "https://api.supabase.com/v1/projects/cparpinmalqsimninyfw/database/query" \
     -d "$(node -e 'console.log(JSON.stringify({query:process.argv[1]}))' "$query")" \
     > /tmp/opencode/backups/byzantium-pre-preview/public.staff_profiles.json
   ```

   Do not commit the export. It contains `auth.users` and staff data.

3. Apply the committed migrations against the preview ref:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://cparpinmalqsimninyfw.supabase.co \
   SUPABASE_URL=https://cparpinmalqsimninyfw.supabase.co \
   node scripts/apply-migrations.mjs
   ```

   The project had five hand-applied versions with different timestamps; the
   script re-runs them (they are idempotent) and records all 41 committed
   versions.

4. Configure Auth for the preview origin (site URL, allow list, Mailtrap SMTP,
   invite and magic-link templates). The allow list is deliberately narrow:

   - `https://folk-hkmc-preview-dwarakadhishadasa-5018s-projects.vercel.app`
   - the same origin plus `/auth/confirm`
   - `https://folk-hkmc-git-preview-dwarakadhishadasa-5018s-projects.vercel.app`
   - the same origin plus `/auth/confirm`
   - `http://localhost:3000/**`

   Do not add `*.vercel.app` wholesale; feature-branch previews are not part of
   this environment. `scripts/configure-hosted-project.mjs` is not used here:
   it assumes SMTP is already configured and hardcodes the production site URL.
   A preview PATCH must also send `smtp_host`, `smtp_port`, `smtp_user`, and
   `smtp_pass`, which that script deliberately omits.

5. Seed preview fixtures:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://cparpinmalqsimninyfw.supabase.co \
   SUPABASE_URL=https://cparpinmalqsimninyfw.supabase.co \
   SUPABASE_SERVICE_ROLE_KEY="$PREVIEW_SERVICE_ROLE_KEY" \
   node scripts/seed-preview-fixtures.mjs --allow-non-local
   ```

   The seeded staff use `@folk.fixture.test` and `@gita-life.fixture.test`
   addresses. The shared password lives in the gitignored
   `.env.preview-seed.local`; it is never printed or committed.

6. Set the `folk-hkmc` Preview environment variables:

   | Key | Source |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://cparpinmalqsimninyfw.supabase.co` |
   | `SUPABASE_URL` | same |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | byzantium legacy anon key |
   | `SUPABASE_ANON_KEY` | same |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | byzantium publishable key |
   | `SUPABASE_PUBLISHABLE_KEY` | same |
   | `SUPABASE_SERVICE_ROLE_KEY` | byzantium service-role key |
   | `SUPABASE_SECRET_KEY` | byzantium secret key |
   | `NEXT_PUBLIC_SITE_URL` | the preview URL above |

   Use `POST /v10/projects/{id}/env?upsert=true` with `target: ["preview"]`.
   Do not include `production`.

7. Push the branch and assign the stable alias:

   ```bash
   git push origin dev:preview
   ```

   Vercel creates a deployment for the `preview` branch. Assign
   `folk-hkmc-preview-…vercel.app` to that deployment with
   `POST /v2/deployments/{id}/aliases`.

8. Confirm the deployment is reachable without Vercel SSO. Project-level
   `ssoProtection` is disabled for `folk-hkmc`; staff sign in through Supabase
   magic links, not through Vercel. Re-enable SSO only if every preview user is
   also a Vercel team member.

## Verify

```bash
pnpm test:preview-environment
```

The verifier checks the preview URL, the served bundle's Supabase ref, the
migration ledger, and the fixture counts. It needs
`SUPABASE_ACCESS_TOKEN` in `.env.migration.local`.

Manual smoke test:

```bash
BASE=https://folk-hkmc-preview-dwarakadhishadasa-5018s-projects.vercel.app
curl -sS -o /dev/null -w "%{http_code}\n" "$BASE/login"
curl -sS "$BASE/api/auth/me"        # {"staff":null}
```

Sign-in: request a magic link at `/login` for a fixture account. The message is
captured by the configured Mailtrap sandbox; the fixture password in
`.env.preview-seed.local` is only for scripted checks, not for the UI.

## Free-plan pause and restore

Inactive free-plan projects are paused after roughly one week. A paused preview
returns connection errors and the verifier reports the project as not
`ACTIVE_HEALTHY`. Restore it with the `POST /restore` call above, wait for
`ACTIVE_HEALTHY`, then re-run `pnpm test:preview-environment`.

Free plan allows two active projects. `etwunirahuucodcxydgs` must stay active
for production, so restoring `cparpinmalqsimninyfw` requires
`supabase-citron-lamp` (`grppwmlgpwhziclhkxbn`) to remain paused.

## Reseed and reset

- Reseed: `node scripts/seed-preview-fixtures.mjs --allow-non-local` (idempotent).
- Wipe fixtures: `node scripts/seed-preview-fixtures.mjs --wipe --allow-non-local`.
  The wipe is tag-filtered on `preview-fixture-`; it is not a truncate.
- Full schema reset: apply migrations from an empty database, then reseed. Do
  this only after taking a fresh backup.

## Known state

- The migrations replaced the legacy `staff_profiles`, `staff_memberships`, and
  `airtable_identities` tables with the current schema. The pre-migration rows
  exist only in the backup directory, not in the project.
- `auth.users` still contains the pre-cutover staff accounts (25 at bootstrap),
  and `public.invite_log` / `public.audit_events` still contain legacy rows.
  Those users have no `public.users` row, so they cannot enter the app; RLS
  blocks anonymous reads. Remove them only after confirming the backup is
  restorable.
- The Preview environment still carries retired `AIRTABLE_*` variables. The app
  does not read them. Removing them requires editing the shared env entries, so
  it is left as cleanup rather than done in bulk.
