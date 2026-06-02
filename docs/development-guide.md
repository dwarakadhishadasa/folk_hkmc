# folk_hkmc - Development Guide

**Date:** 2026-05-19

## Prerequisites

- Node.js 20+
- `pnpm`
- Docker Desktop or Docker Engine for the local Supabase stack
- Airtable API token and table IDs for the operational data tables
- An active Airtable staff user record for staff login testing

## Collaboration Workflow

Repository collaboration rules live in [CONTRIBUTING.md](../CONTRIBUTING.md).

- `main` is the production branch and is owner-controlled by Dwaraka.
- `dev` is the shared development branch.
- `preview` is retired and should not be used for new work.
- Collaborators work from `feature/*` branches and open PRs for review.
- PRs targeting `main` require Dwaraka's `production-review-approved` label.
- Production secrets, production environment access, and production merges stay with Dwaraka.

For GitHub Copilot MCP, use `https://api.githubcopilot.com/mcp/` and follow [`.github/copilot-instructions.md`](../.github/copilot-instructions.md).

## Installation

```bash
pnpm install
```

Create or update `.env.local` from `.env.example`. Keep real secrets out of git.

## Run Locally

```bash
pnpm dev
```

Default Next.js local URL is `http://localhost:3000`.

This is enough for public UI work when `.env.local` already points at usable Airtable and Supabase services. For staff auth, sessions, invites, and local database work, use the local Supabase loop below.

## Run With Local Supabase

Start Supabase locally, copy the generated local credentials into `.env.local`, and run Next.js:

```bash
pnpm supabase:start
pnpm supabase:env
pnpm dev
```

The local Supabase URLs are:

- API: `http://127.0.0.1:54321`
- Studio: `http://127.0.0.1:54323`
- Inbucket email inbox: `http://127.0.0.1:54324`

To rebuild the local database from migrations and `supabase/seed.sql`, run:

```bash
pnpm supabase:reset
```

The current `supabase/seed.sql` is only a stable empty seed hook. It does not create local fixture staff. Staff login still depends on an active Airtable staff user, then syncs that user into local Supabase.

For a one-command loop after Docker is available:

```bash
pnpm dev:local
```

Stop the local stack when finished:

```bash
pnpm supabase:stop
```

## Quality Gates

Use these before handing off changes:

```bash
pnpm exec tsc --noEmit
pnpm build
```

`next.config.mjs` currently sets `typescript.ignoreBuildErrors = true`, so `pnpm build` is not a type-safety gate. Run `tsc` explicitly.

`package.json` also has:

```bash
pnpm lint
```

This script runs through the local ESLint CLI. Treat failures as source cleanup work rather than a missing-tool blocker.

For production-mode smoke testing after a successful build:

```bash
pnpm start
```

## Environment Variables

### Required for Implemented Backend Logic

- `AIRTABLE_API_TOKEN`
- `AIRTABLE_BASE_ID`
- `AIRTABLE_CONTACTS_TABLE_ID`
- `AIRTABLE_ATTENDANCE_TABLE_ID`
- `AIRTABLE_SESSIONS_TABLE_ID`
- `AIRTABLE_USERS_TABLE_ID`
- `AIRTABLE_LOCATIONS_TABLE_ID`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### Optional or Defaulted

- `AIRTABLE_ANALYTICS_RECORD_ID`, defaults to `reca0aQhvHSc5d5A1`
- `AIRTABLE_INTERFACE_DASHBOARD_PAGE_ID`, defaults to `pagc77PtbNsr9ljWu` in `app/manage/page.tsx`
- `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are supported server-side fallbacks

### Important Notes

- `pnpm supabase:env` updates only the local Supabase block in `.env.local` and preserves Airtable variables.
- `NEXT_PUBLIC_SITE_URL` is required when creating attendance-session links and Supabase invite redirects.
- Without the Airtable token, base ID, and table IDs, registration, attendance, sessions, contact creation, staff lookup, and invites will fail.
- The Manage tab redirects to `https://airtable.com/{AIRTABLE_BASE_ID}/{AIRTABLE_INTERFACE_DASHBOARD_PAGE_ID}` and is available to Admin and Preacher staff.

## Staff Auth

Staff auth is Supabase-backed and Airtable-authorized.

1. `/login` accepts an invited staff email.
2. `/api/auth/signin` verifies that the email belongs to an active Airtable staff user.
3. The route creates or reuses a Supabase Auth user and syncs its id back to Airtable when needed.
4. The browser requests a Supabase email OTP.
5. The user enters the emailed OTP on `/login`; this verifies the Supabase session inside the current browser context, then runs `/api/auth/complete-implicit`.
6. `/auth/confirm` remains available for Supabase invite callbacks and legacy email callbacks; it verifies the Airtable staff record and upserts `public.staff_profiles`.
7. Server-side protected routes read the Supabase session and local `staff_profiles` row through `getStaffContext()`.

For local testing, open Inbucket at `http://127.0.0.1:54324`, find the sign-in email, and enter the code from there. There are no hardcoded local username/password credentials in the current auth flow.

The Supabase Magic Link email template is used as an OTP-only email and must include `{{ .Token }}`:

```html
<p>Hare Krishna,</p>

<p>Your FOLK HKMC sign-in code is:</p>

<p style="font-size:24px;font-weight:700;letter-spacing:4px;">{{ .Token }}</p>

<p>Enter this code on the FOLK HKMC login screen.</p>

<p>This code is valid for a limited time and can only be used once.</p>

<p>If you did not request this email, you can safely ignore it.</p>

<p>Thanks,<br/>FOLK HKMC Team</p>
```

## Route Map

### Pages

| Route | Purpose | Access |
| --- | --- | --- |
| `/` | Public homepage | Public |
| `/login` | Staff email sign-in screen | Public |
| `/register` | Participant registration | Public |
| `/attend?session=rec...` | Session-specific attendance entry | Public |
| `/contact` | Staff contact entry | Server-gated staff |
| `/dashboard` | Live attendance dashboard | Server-gated Admin/Preacher |
| `/sessions` | Session creation and QR/link management | Server-gated Admin/Preacher |
| `/volunteers` | Volunteer invitation screen | Server-gated Admin/Preacher |
| `/admin` | Redirects to `/manage` | Server-gated through destination |
| `/admin/invite` | Admin staff invitation screen | Server-gated Admin |
| `/manage` | Airtable management interface redirect | Server-gated Admin/Preacher role |
| `/auth/confirm` | Supabase auth callback | Public callback |
| `/auth/hash-callback` | Browser hash callback bridge | Public callback |
| `/auth/error` | Auth error page | Public |
| `/auth/signout` | Staff sign-out route | Auth-aware |

### API Routes

| Route | Purpose | Access |
| --- | --- | --- |
| `POST /api/registration` | Create participant contact, optionally mark session attendance | Public |
| `POST /attendance` | Mark attendance for an existing contact and session | Public, session-specific |
| `GET /attendance` | Read attendance list, optionally scoped by session | Server-gated Admin/Preacher |
| `POST /api/contact` | Create staff-entered contact | Server-gated staff |
| `GET /api/sessions` | List visible sessions | Server-gated Admin/Preacher |
| `POST /api/sessions` | Create a live attendance session | Server-gated Admin/Preacher |
| `POST /api/auth/signin` | Prepare staff magic-link sign-in | Public, Airtable-authorized |
| `GET /api/auth/me` | Read current staff context | Auth-aware |
| `POST /api/auth/complete-implicit` | Complete implicit auth callback profile sync | Auth-aware |
| `POST /api/volunteers/invite` | Invite a Volunteer | Server-gated Admin/Preacher |
| `POST /api/admin/invite-user` | Invite Admin, Preacher, or Volunteer | Server-gated Admin |

## Manual Verification Checklist

### Public Flows

- Load homepage and confirm brand assets render
- Open `/register` and verify form validation states
- Submit a public registration and confirm a contact is created in Airtable
- Open an active session attendance URL such as `/attend?session=rec...` and verify mobile-number validation
- Open `/attend` without a session and confirm the UI handles the missing session state cleanly

### Auth Flows

- Log in with an active Airtable staff email and complete the email OTP through Inbucket
- Confirm `/api/auth/me` returns the synced staff context after login
- Confirm Volunteer staff can access `/contact` and are blocked from `/dashboard`
- Confirm Preacher staff can access `/contact`, `/dashboard`, `/sessions`, and `/volunteers`
- Confirm Admin staff can access `/admin/invite` and can choose roles/preachers for invites
- Refresh protected pages and confirm the Supabase cookie-backed session remains valid

### Attendance Flow

- Create or identify an active session from `/sessions`
- Submit a known registered mobile number through the session attendance link and confirm success
- Submit the same number again for the same session and confirm duplicate handling
- Submit an unknown number and confirm redirect to `/register?mobile=...&session=...`
- Register from that redirected flow and confirm the response both creates the contact and marks attendance for the session

### Offline/PWA Flow

- Run on localhost or HTTPS so the service worker can register
- Disable network and submit registration or attendance to verify `202 queued` handling
- Re-enable network and verify queued requests sync
- Confirm the offline indicator shows pending work when relevant
- Confirm staff contact writes are not queued offline because they require a live staff session

## Known Development Constraints

- There is no automated test suite
- `next.config.mjs` ignores TypeScript build errors during production build
- `pnpm lint` runs through the local ESLint CLI, but the current codebase still has lint findings to clean up
- Local Supabase seed data is intentionally empty; staff auth depends on real or test Airtable staff records
- Registration and attendance are public write surfaces, but session attendance is constrained by active session windows
- Public offline queueing covers registration and attendance only, not authenticated staff contact creation
- Airtable reference data for locations and active preachers is cached in Next with a 20-minute revalidation window

## Troubleshooting

### Staff login email does not arrive

Check:

- local Supabase is running
- `pnpm supabase:env` has refreshed `.env.local`
- Inbucket is open at `http://127.0.0.1:54324`
- the email exists as an active staff user in Airtable
- `SUPABASE_SERVICE_ROLE_KEY` is present for user provisioning

### Staff sign-in succeeds but redirects to an auth error

Check:

- the Airtable staff record has `Status` set to Active
- the Airtable staff record has a supported role: Admin, Preacher, or Volunteer
- local Supabase migrations have run and `public.staff_profiles` exists
- `AIRTABLE_USERS_TABLE_ID` points to the current staff users table

### Attendance calls fail

Check:

- `AIRTABLE_API_TOKEN` is set
- `AIRTABLE_BASE_ID`, contacts, attendance, and sessions table identifiers resolve to the intended base/tables
- the attendance URL includes a valid `session` id
- the session is active and has not closed
- the participant exists in the Airtable contacts table

### Session creation fails

Check:

- `NEXT_PUBLIC_SITE_URL` is set, usually `http://localhost:3000` for local development
- the signed-in staff user is Admin or Preacher
- Preacher staff have location IDs that include the selected location
- `AIRTABLE_LOCATIONS_TABLE_ID` and `AIRTABLE_SESSIONS_TABLE_ID` are set

### Supabase local stack does not start

Check:

- Docker Desktop or Docker Engine is installed
- the Docker daemon is running
- your user belongs to the `docker` group if `/var/run/docker.sock` is owned by `root:docker`
- ports `54320` through `54324` are available locally

### Typecheck references a removed route under `.next/dev`

Clear stale generated Next dev types and run typecheck again:

```bash
rm -rf .next/dev
pnpm exec tsc --noEmit
```

### Service worker does not register

Check:

- you are using localhost or HTTPS
- the browser supports service workers
- registration failures are not being silently skipped in the console

### Dashboard stays empty

Check:

- an active session exists and is visible to the signed-in staff user
- attendance records exist for the active session or requested date
- `GET /attendance` responds successfully while signed in as Admin or Preacher
- Airtable date fields match the filtering logic in `lib/airtable.ts`

---

Updated from the current Next.js, Supabase, Airtable, and PWA implementation.
