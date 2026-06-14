# Deployment Guide

## Deployment Shape

Each program app deploys as its own standard Next.js App Router application from `apps/folk` or `apps/gita-life`. There is no separate backend service. Route handlers in each app's `app/api` tree and `app/attendance/route.ts` are the server boundary.

The repo includes `@vercel/speed-insights`, so Vercel is a natural deployment target, but no `vercel.json` is present.

## Required Runtime Services

| Service | Purpose |
| --- | --- |
| Supabase Auth | Staff OTP/invite authentication |
| Supabase Postgres | Programs, staff memberships/profiles, Airtable identities, audit events, invite log |
| Airtable | Operational Contacts, Attendance, Sessions, Users, Locations |
| HTTPS hosting | Required for PWA/service worker outside localhost |

## Required Environment Variables

```bash
PROGRAM_ID=folk
NEXT_PUBLIC_PROGRAM_ID=folk
NEXT_PUBLIC_SITE_URL=https://your-domain.example
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
AIRTABLE_API_TOKEN=...
AIRTABLE_BASE_ID=...
AIRTABLE_CONTACTS_TABLE_ID=...
AIRTABLE_ATTENDANCE_TABLE_ID=...
AIRTABLE_SESSIONS_TABLE_ID=...
AIRTABLE_USERS_TABLE_ID=...
AIRTABLE_LOCATIONS_TABLE_ID=...
```

Optional/fallback variables:

```bash
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_URL=...
SUPABASE_PUBLISHABLE_KEY=...
STAFF_SYNC_STALE_AFTER_MINUTES=15
STAFF_PROFILE_STALE_AFTER_MINUTES=15
AIRTABLE_ANALYTICS_RECORD_ID=...
AIRTABLE_MANAGEMENT_URL=...
AIRTABLE_INTERFACE_DASHBOARD_PAGE_ID=...
```

Use program-prefixed Airtable variables for program-specific bases or credentials, for example `FOLK_AIRTABLE_API_TOKEN`, `FOLK_AIRTABLE_BASE_ID`, `GITA_LIFE_AIRTABLE_API_TOKEN`, and `GITA_LIFE_AIRTABLE_BASE_ID`.

## Supabase Deployment

Apply migrations before using staff auth features:

```bash
pnpm dlx supabase@2.98.2 db push
```

For local reset:

```bash
pnpm supabase:reset
```

Tables expected after migrations:

- `public.programs`
- `public.staff_memberships`
- `public.staff_profiles`
- `public.airtable_identities`
- `public.airtable_sync_state`
- `public.audit_events`
- `public.invite_log`

Supabase Auth redirect URLs must include:

- `https://your-domain.example`
- `https://your-domain.example/auth/confirm`
- Local equivalents for development

## Airtable Deployment

The deployment Airtable base must have compatible tables/fields for:

- Contacts
- Attendance
- Sessions
- Users
- Locations

Airtable Users are the source of staff role/status truth. A staff user must be `Active` and have an email before they can sign in.

## PWA And Offline

Service workers require HTTPS or localhost. `public/sw.js` intentionally treats staff and API paths as network-only for GET requests and queues selected POST requests on network failure.

If any route paths change, update:

- `public/sw.js`
- Client fetch calls
- API contracts
- Manual smoke checks

## Release Checks

Run before deploy or PR merge:

```bash
pnpm typecheck:workspace
pnpm lint
pnpm build
```

Manual checks should cover:

- Staff sign-in and sign-out
- Invite callback
- Program-scoped staff membership sync
- Contact creation
- Session creation and generated QR URL
- Attendance marking and duplicate handling
- Session-backed registration
- Live dashboard polling
- Admin invite/location creation
- PWA install/offline behavior if relevant

## Operational Risks

- Production secrets must remain owner-controlled.
- `SUPABASE_SERVICE_ROLE_KEY` grants privileged access and must never reach client code.
- Wrong `PROGRAM_ID`/`NEXT_PUBLIC_PROGRAM_ID` or missing program-prefixed Airtable env can route a deployment to the wrong program data.
- Airtable schema drift will break runtime operations because field names are referenced directly.
- `next build` ignores TypeScript errors; use explicit workspace type checking.
- No automated product test suite currently guards regressions.
