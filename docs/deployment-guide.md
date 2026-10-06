# Deployment Guide

## Deployment Shape

Each program app deploys as its own standard Next.js App Router application from `apps/folk` or `apps/gita-life`. There is no separate backend service. Route handlers in each app's `app/api` tree and `app/attendance/route.ts` are the server boundary.

The repo includes `@vercel/speed-insights`, so Vercel is a natural deployment target, but no `vercel.json` is present.

## Required Runtime Services

| Service | Purpose |
| --- | --- |
| Supabase Auth | Staff OTP/invite authentication |
| Supabase Postgres | All operational records: users, contacts, attendance, sessions, locations; plus programs, audit events, invite log |
| Supabase Storage | Private `contact-photos` bucket for contact photos, read via server-minted signed URLs |
| HTTPS hosting | Required for PWA/service worker outside localhost |

## Required Environment Variables

```bash
PROGRAM_ID=folk
NEXT_PUBLIC_PROGRAM_ID=folk
NEXT_PUBLIC_SITE_URL=https://your-domain.example
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Optional/fallback variables:

```bash
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_URL=...
SUPABASE_PUBLISHABLE_KEY=...
STAFF_SYNC_STALE_AFTER_MINUTES=15
STAFF_PROFILE_STALE_AFTER_MINUTES=15
```

Both programs share one Supabase project and are separated by the `program_id` column, so no per-program variables are needed. No Airtable variable is read by any route or page.

## Supabase Deployment

Apply migrations before using staff auth features:

```bash
pnpm dlx supabase@2.98.2 db push
```

For local reset:

```bash
pnpm supabase:reset
```

Tables and views expected after migrations:

- `public.users`
- `public.contacts`
- `public.attendance`
- `public.sessions`
- `public.locations`
- `public.programs`
- `public.audit_events`
- `public.invite_log`
- `public.contact_attendance_counts` (view)

`public.staff_memberships`, `public.staff_profiles`, `public.airtable_identities`, and `public.airtable_sync_state` are historical bridge tables with no runtime readers; they are still created by the already-applied migrations and are pending removal by a later schema-cleanup story.

Supabase Auth redirect URLs must include:

- Each deployed app origin, for example `https://folk.example.org` and `https://gita-life.example.org`
- Each deployed invite callback, for example `https://folk.example.org/auth/confirm` and `https://gita-life.example.org/auth/confirm`
- Local equivalents for development

For invite emails in a shared Supabase project, use the program-scoped invite action URL metadata written by the app before each invite email is sent:

```html
<h2>You have been invited to {{ if .Data.auth_email_brand_name }}{{ .Data.auth_email_brand_name }}{{ else }}FOLK{{ end }}</h2>
<a href="{{ if .Data.auth_email_invite_action_url }}{{ .Data.auth_email_invite_action_url }}{{ else }}{{ .RedirectTo }}{{ end }}?token_hash={{ .TokenHash }}&type=invite">Accept invite</a>
```

Each Vercel app must set its own `NEXT_PUBLIC_SITE_URL` to the matching deployed origin so invite APIs pass the correct `/auth/confirm` callback to Supabase.
Invite APIs also prefer the current request origin when constructing `redirectTo`; if an email still shows the wrong app domain, update the hosted Supabase invite template to use `{{ .Data.auth_email_invite_action_url }}` with `{{ .RedirectTo }}` fallback. Do not use `{{ .SiteURL }}` for shared FOLK/Gita Life invite links because it follows the shared Supabase project Site URL rather than the app that sent the invite.

For passwordless staff sign-in emails, the hosted Supabase Magic Link/OTP template must use the program brand metadata written by the app before each email is sent:

```html
<p>Your {{ if .Data.auth_email_brand_name }}{{ .Data.auth_email_brand_name }}{{ else }}FOLK{{ end }} sign-in code is:</p>
<p>{{ .Token }}</p>
```

The same `{{ if .Data.auth_email_brand_name }}{{ .Data.auth_email_brand_name }}{{ else }}FOLK{{ end }}` expression should replace hardcoded program names in both Magic Link/OTP and Invite templates. Fresh invites receive this metadata through `inviteUserByEmail`; existing-user invite fallbacks and staff sign-in OTPs update the existing Supabase Auth user's metadata before sending the email. Fresh invites and existing-user invite fallbacks also carry `auth_email_invite_action_url` so the visible invite link stays scoped to the app that sent it.

## Staff Deployment

`public.users` is the source of staff role/status truth for Admin, Preacher, Volunteer, and Assistant. A staff member must have an `Active` row with an email in the program's scope before they can sign in; `role` and `status` are `TEXT` columns with `CHECK` constraints, and `id` references `auth.users(id)` so no separate identity sync is needed.

Seeded or invited rows are scoped by `program_id`, so one person must have one row per program in which they work.

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

## Vercel Deploy Shortcuts

Use the repo-local shortcuts from the monorepo root:

```bash
pnpm deploy:folk:preview
pnpm deploy:gita-life:preview
pnpm deploy:preview

pnpm deploy:folk:prod
pnpm deploy:gita-life:prod
pnpm deploy:prod
```

The `deploy:preview` and `deploy:prod` shortcuts deploy both program apps sequentially.

The shortcuts validate required Vercel environment variable names, then deploy with a remote Vercel build. Production
and preview secrets may be sensitive/encrypted; do not rely on `.vercel/.env.*.local` containing secret values after
`vercel pull`.

For each Vercel project and environment, set non-empty values for:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL`

Manual checks should cover:

- Staff sign-in and sign-out
- Invite callback
- Program-scoped staff context resolution from `public.users`
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
- Wrong `PROGRAM_ID`/`NEXT_PUBLIC_PROGRAM_ID` can route a deployment to the wrong program scope, since program separation is a `program_id` filter rather than a separate project.
- Schema drift in `public.*` breaks runtime operations because column names are referenced directly in `lib/supabase/data.ts` and the RLS policies.
- `next build` ignores TypeScript errors; use explicit workspace type checking.
- No automated product test suite currently guards regressions.
