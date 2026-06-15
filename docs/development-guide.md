# Development Guide

## Prerequisites

- Node.js 20+ recommended
- `pnpm`
- Docker Desktop or Docker Engine for local Supabase
- Airtable API token and table IDs for end-to-end product flows

## Install

```bash
pnpm install
```

## Environment

Start from `.env.example` and place app-specific local values in `apps/folk/.env.local` or `apps/gita-life/.env.local`. Required production-like variables:

```bash
PROGRAM_ID=
NEXT_PUBLIC_PROGRAM_ID=
NEXT_PUBLIC_SITE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
AIRTABLE_API_TOKEN=
AIRTABLE_BASE_ID=
AIRTABLE_CONTACTS_TABLE_ID=
AIRTABLE_ATTENDANCE_TABLE_ID=
AIRTABLE_SESSIONS_TABLE_ID=
AIRTABLE_USERS_TABLE_ID=
AIRTABLE_LOCATIONS_TABLE_ID=
```

Optional:

```bash
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
STAFF_SYNC_STALE_AFTER_MINUTES=
STAFF_PROFILE_STALE_AFTER_MINUTES=
AIRTABLE_ANALYTICS_RECORD_ID=
AIRTABLE_MANAGEMENT_URL=
AIRTABLE_INTERFACE_DASHBOARD_PAGE_ID=
```

Program-scoped Airtable overrides are supported and preferred when FOLK and Gita Life use different bases or credentials:

```bash
FOLK_AIRTABLE_API_TOKEN=
FOLK_AIRTABLE_BASE_ID=
FOLK_AIRTABLE_INTERFACE_DASHBOARD_PAGE_ID=
GITA_LIFE_AIRTABLE_API_TOKEN=
GITA_LIFE_AIRTABLE_BASE_ID=
GITA_LIFE_AIRTABLE_CONTACTS_TABLE_ID=
GITA_LIFE_AIRTABLE_ATTENDANCE_TABLE_ID=
GITA_LIFE_AIRTABLE_SESSIONS_TABLE_ID=
GITA_LIFE_AIRTABLE_USERS_TABLE_ID=
GITA_LIFE_AIRTABLE_LOCATIONS_TABLE_ID=
GITA_LIFE_AIRTABLE_INTERFACE_DASHBOARD_PAGE_ID=
```

Never commit real `.env`, `.env.local`, Airtable tokens, Supabase service-role keys, or Vercel secrets.

## Local Supabase

```bash
pnpm supabase:start
pnpm supabase:push
pnpm supabase:env
```

`pnpm supabase:env` runs `scripts/use-local-supabase-env.sh`, reads local Supabase credentials from `supabase status -o env`, and rewrites only the local Supabase block in `apps/folk/.env.local` and `apps/gita-life/.env.local`.
It writes app-specific callback origins: FOLK uses `http://localhost:3000`, and Gita Life uses `http://localhost:3001`.
`pnpm supabase:push` applies pending migrations to the running local Supabase database. Run it after pulling schema changes; otherwise auth may succeed in Supabase but fail when the app syncs staff authorization tables.
Local Supabase auth email templates live under `supabase/templates/`. The Magic Link/OTP and Invite templates render `{{ .Data.auth_email_brand_name }}` so FOLK emails say FOLK and Gita Life emails say Gita Life; restart local Supabase after changing template files or `supabase/config.toml`.

Useful commands:

```bash
pnpm supabase:status
pnpm supabase:push
pnpm supabase:reset
pnpm supabase:stop
```

`supabase/seed.sql` is intentionally a stable empty seed hook today.

## Run The App

```bash
pnpm dev
```

`pnpm dev` starts the FOLK app. To run Gita Life, use:

```bash
pnpm dev:gita-life
```

Or start local Supabase, update env, and run Next:

```bash
pnpm dev:local
```

`pnpm dev:local` starts the local Supabase stack, writes app-local Supabase env values, and starts the FOLK app.
For a local Gita Life invite-flow smoke test, run `pnpm supabase:env` and then `pnpm dev:gita-life` so invite emails use the Gita Life callback origin.

The app workspace scripts set `PROGRAM_ID` and `NEXT_PUBLIC_PROGRAM_ID`:

- `@hkmc/folk`: `folk`
- `@hkmc/gita-life`: `gita-life`

## Build And Checks

```bash
pnpm guardrails
pnpm typecheck:workspace
pnpm build:apps
pnpm lint
pnpm quality:ci
pnpm test:program-readiness
pnpm build
pnpm start
pnpm start:gita-life
```

Notes:

- `apps/folk/next.config.mjs` and `apps/gita-life/next.config.mjs` import the shared root `next.config.mjs`, which has `typescript.ignoreBuildErrors = true`.
- `pnpm build` runs a prebuild workspace typecheck, but CI should still call `pnpm typecheck:workspace` explicitly before `pnpm build:apps`.
- `pnpm typecheck:workspace` uses recursive pnpm package scripts; broken shared package contracts must block app builds.
- `pnpm guardrails` checks Turborepo/package boundaries, workspace dependency cycles, declared `@hkmc/*` dependencies, and client leakage of server-only services.
- `pnpm lint` uses `eslint.config.mjs` and ignores `.next`, `.agents`, `_bmad-output`, `docs`, generated output, and `next-env.d.ts`.
- `pnpm test:program-readiness` runs the current readiness smoke script for program-scoped setup checks.

## Important Development Rules

- Keep server secrets in server-only modules.
- Keep `@hkmc/airtable`, `@hkmc/authz`, `@hkmc/program-config/server`, `lib/airtable.ts`, `lib/authz.ts`, `lib/invite-log.ts`, and `lib/supabase/*` out of client component runtime graphs.
- Use `lib/authz.ts` for staff server authorization.
- Keep `PROGRAM_ID`/`NEXT_PUBLIC_PROGRAM_ID` aligned with the app workspace and preserve FOLK/Gita Life route parity unless requirements intentionally diverge.
- Use `StaffAuthShell` when a server page has already validated staff and needs to seed client auth state.
- Preserve `/attendance` as the attendance API route.
- Keep public registration, attendance, service worker queue paths, and dashboard polling in sync.
- Use Airtable record IDs for linked records.
- Preserve mobile normalization to the last 10 digits.
- Run `pnpm guardrails`, `pnpm typecheck:workspace`, and manual checks because no product test suite exists.

## Manual Smoke Checks

Use the flows relevant to your change:

- Login with an active Airtable staff email.
- Complete OTP or invite callback.
- Confirm `/api/auth/me` returns staff after sign-in.
- Verify Volunteer redirects/permissions go only to `/contact`.
- Create a staff contact as Admin, Preacher, and Volunteer where applicable.
- Create a session from `/sessions`.
- Open the generated `/attend?session=<id>` URL and mark attendance.
- Confirm unknown attendance mobile redirects to `/register?mobile=...&session=...`.
- Confirm session-backed registration also marks attendance.
- Watch `/dashboard` or active session dashboard refresh attendance.
- Invite a Volunteer from `/volunteers`.
- Invite staff and add locations from `/admin/invite`.
- Test service worker queue behavior if changing PWA/offline paths.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `Supabase URL must contain a valid Supabase URL` | Missing Supabase env vars |
| `SUPABASE_SERVICE_ROLE_KEY is required` | Server/admin auth route missing service-role key |
| `AIRTABLE_* is required` | Airtable token/base/table IDs not configured |
| Attendance links fail to generate | `NEXT_PUBLIC_SITE_URL` missing |
| Staff can sign in but gets authorization error | Airtable User missing/inactive, stale `staff_memberships` row, unsupported `PROGRAM_ID`, or sync failure |
| Preacher cannot create session for location | Location not in staff profile `location_ids` |

## Current Test Status

There is no automated application test suite. Existing validation is guardrails/typecheck/lint/build/manual. Add tests deliberately if a change introduces shared logic or risky behavior.
