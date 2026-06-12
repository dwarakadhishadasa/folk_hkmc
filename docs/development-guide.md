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

Start from `.env.example`. Required production-like variables:

```bash
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
AIRTABLE_ANALYTICS_RECORD_ID=
AIRTABLE_INTERFACE_DASHBOARD_PAGE_ID=
```

Never commit real `.env`, `.env.local`, Airtable tokens, Supabase service-role keys, or Vercel secrets.

## Local Supabase

```bash
pnpm supabase:start
pnpm supabase:env
```

`pnpm supabase:env` runs `scripts/use-local-supabase-env.sh`, reads local Supabase credentials from `supabase status -o env`, and rewrites only the local Supabase block in `.env.local`.

Useful commands:

```bash
pnpm supabase:status
pnpm supabase:reset
pnpm supabase:stop
```

`supabase/seed.sql` is intentionally a stable empty seed hook today.

## Run The App

```bash
pnpm dev
```

Or start local Supabase, update env, and run Next:

```bash
pnpm dev:local
```

## Build And Checks

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm build
pnpm start
```

Notes:

- `next.config.mjs` has `typescript.ignoreBuildErrors = true`.
- `pnpm build` is not enough for TypeScript safety.
- `pnpm lint` uses `eslint.config.mjs` and ignores `.next`, `.agents`, `_bmad-output`, `docs`, generated output, and `next-env.d.ts`.

## Important Development Rules

- Keep server secrets in server-only modules.
- Use `lib/authz.ts` for staff server authorization.
- Use `StaffAuthShell` when a server page has already validated staff and needs to seed client auth state.
- Preserve `/attendance` as the attendance API route.
- Keep public registration, attendance, service worker queue paths, and dashboard polling in sync.
- Use Airtable record IDs for linked records.
- Preserve mobile normalization to the last 10 digits.
- Run manual checks because no product test suite exists.

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
| Staff can sign in but gets authorization error | Airtable User missing/inactive or `staff_profiles` sync failed |
| Preacher cannot create session for location | Location not in staff profile `location_ids` |

## Current Test Status

There is no automated application test suite. Existing validation is lint/build/manual. Add tests deliberately if a change introduces shared logic or risky behavior.
