# Architecture

## Executive Summary

`folk_hkmc` is a pnpm/Turborepo monorepo with two program-scoped Next.js App Router apps: `@hkmc/folk` and `@hkmc/gita-life`. Each app has a client-heavy UI and its own route handlers, while shared server logic, program metadata, auth contracts, Airtable helpers, and UI primitives live in root `lib/`, `components/`, and `packages/*`. The current architecture is best described as:

```text
Browser / PWA for one program deployment
  -> apps/{folk,gita-life}/app pages and client components
  -> apps/{folk,gita-life}/app route handlers
  -> shared server-only lib/ services and @hkmc/* packages
  -> Supabase Auth + Supabase Postgres program membership cache
  -> program-scoped Airtable REST API operational tables
```

The repository does not have a separate backend service. Server-only modules in `lib/` and server-only package exports are the backend boundary.

## Runtime Layers

| Layer | Files | Responsibilities |
| --- | --- | --- |
| App shell | `apps/*/app/layout.tsx`, `components/providers.tsx` | Program metadata, fonts, global providers, Speed Insights, service worker registration |
| Public pages | `apps/*/app/page.tsx`, `apps/*/app/register/page.tsx`, `apps/*/app/attend/page.tsx` | Program landing, registration, attendance |
| Staff pages | `apps/*/app/contact/page.tsx`, `apps/*/app/sessions/page.tsx`, `apps/*/app/dashboard/page.tsx`, `apps/*/app/volunteers/page.tsx`, `apps/*/app/admin/invite/page.tsx`, `apps/*/app/manage/page.tsx` | Server-side staff context checks and staff workflows |
| Client state | `lib/auth-context.tsx`, `components/navigation-feedback-provider.tsx` | Auth hydration, OTP flow, navigation feedback |
| Route handlers | `apps/*/app/api/**/route.ts`, `apps/*/app/attendance/route.ts`, `apps/*/app/auth/**/route.ts` | Program-local API contracts, auth callbacks, staff mutations, attendance |
| Authorization | `lib/authz.ts`, root `proxy.ts`, `apps/*/proxy.ts`, `lib/supabase/*` | Supabase cookies, staff membership reads/sync, role checks |
| Program config | `packages/program-config`, `lib/current-program.ts` | Public branding, module flags, server Airtable mappings, program-scoped env |
| Airtable data | `lib/airtable.ts`, `@hkmc/airtable` | Operational records and Airtable REST helpers |
| PWA/offline | `public/sw.js`, `components/offline-indicator.tsx`, `public/manifest.json` | Asset caching and selected offline POST queueing |

## Authentication And Authorization

### Sign-In Flow

1. Staff enters email on `/login`.
2. `POST /api/auth/signin` verifies the email against active Airtable Users.
3. The route ensures a Supabase Auth user exists and syncs its ID back to Airtable.
4. Browser calls `supabase.auth.signInWithOtp`.
5. Staff enters email OTP, or follows an invite/callback link.
6. `POST /api/auth/complete-implicit` or `GET /auth/confirm` syncs Airtable staff data into Supabase `staff_profiles`, `staff_memberships`, and `airtable_identities`.
7. Client stores no custom local session. Supabase cookies represent the session.
8. `GET /api/auth/me` returns the current `StaffContext`.

### Staff Context

`getStaffContext()` in `lib/authz.ts` is the protected server boundary. It reads the Supabase user from cookies, resolves the current program from `PROGRAM_ID`/`NEXT_PUBLIC_PROGRAM_ID`, prefers `staff_memberships`, falls back to compatible `staff_profiles`, refreshes stale membership data from Airtable when allowed, validates active status and role, and returns:

```ts
interface StaffContext {
  programId: "folk" | "gita-life"
  supabaseUserId: string
  email: string
  airtableUserId: string
  name: string
  role: "Admin" | "Preacher" | "Volunteer"
  status: "Active" | "Inactive" | "Suspended" | "Revoked"
  locationIds: string[]
  assignedPreacherAirtableUserId?: string
  lastSyncedAt: string
}
```

### Role Matrix

| Surface | Public | Volunteer | Preacher | Admin |
| --- | --- | --- | --- | --- |
| `/` | Yes | Yes | Yes | Yes |
| `/register` | Yes | Yes | Yes | Yes |
| `/attend` | Yes | Yes | Yes | Yes |
| `/contact` | No | Yes | Yes | Yes |
| `/sessions` | No | No | Yes | Yes |
| `/dashboard` | No | No | Yes | Yes |
| `/volunteers` | No | No | Yes | Yes |
| `/admin/invite` | No | No | No | Yes |
| `/manage` | No | No | Yes | Yes |

## Data Architecture

### Airtable

Airtable is the main operational data store. `lib/airtable.ts` resolves the active program profile and accepts either generic variables or program-prefixed overrides:

- `AIRTABLE_API_TOKEN`
- `AIRTABLE_BASE_ID`
- `AIRTABLE_CONTACTS_TABLE_ID`
- `AIRTABLE_ATTENDANCE_TABLE_ID`
- `AIRTABLE_SESSIONS_TABLE_ID`
- `AIRTABLE_USERS_TABLE_ID`
- `AIRTABLE_LOCATIONS_TABLE_ID`
- Optional `AIRTABLE_ANALYTICS_RECORD_ID`
- Optional `AIRTABLE_MANAGEMENT_URL`
- Optional `AIRTABLE_INTERFACE_DASHBOARD_PAGE_ID`

Program-specific variants use the active profile prefix, for example `FOLK_AIRTABLE_API_TOKEN` or `GITA_LIFE_AIRTABLE_BASE_ID`. Table IDs default to `packages/program-config/src/programs/shared-airtable.ts` if not overridden. The apps store Contacts, Attendance, Sessions, Users, and Locations in Airtable. All Airtable calls are server-only and `cache: "no-store"` except cached reference lists using Next `unstable_cache`.

### Supabase

Supabase has the staff-auth and audit tables defined by the migrations:

- `programs`: known program IDs, currently `folk` and `gita-life`
- `staff_memberships`: primary program-scoped authorization cache
- `staff_profiles`: legacy-compatible authorization cache keyed by Supabase Auth user ID
- `airtable_identities`: mapping between Supabase users and program Airtable users
- `airtable_sync_state`: sync health/status by program and source
- `audit_events`: authorization/audit events for denied, stale, and missing membership states
- `invite_log`: invite audit log, now carrying `program_id`

Supabase migrations live under `supabase/migrations/`. The service-role key is used only server-side.

## Key Flows

### Public Registration Without Session

`apps/*/app/register/page.tsx` posts to `POST /api/registration` in the current program app. The route validates name/mobile, rejects duplicates, creates an Airtable Contact, and returns `201`.

### Session-Backed Registration

When `/register?session=<id>` is used, `POST /api/registration` validates session eligibility, creates or reuses the contact, then creates attendance for the same session. Duplicate attendance returns a completed success response rather than requiring a second call.

### Attendance

`/attend?session=<id>` posts mobile/session to `POST /attendance`. The route validates the session window, looks up the contact, prevents duplicate attendance, and creates an Airtable Attendance record.

### Live Dashboard

`LiveAttendanceDashboard` polls `GET /attendance?session=<id>` every 20 seconds while visible. It sends up to 100 known attendance IDs so the server can return only new records from the Airtable-linked session record.

### Staff Contact Creation

`POST /api/contact` requires staff context. Routing differs by role:

- Volunteer: contact is assigned to the volunteer's configured Preacher.
- Preacher: contact is assigned to that Preacher.
- Admin: request must include `assignedPreacherAirtableUserId`.

### Session Creation

`POST /api/sessions` requires Admin or Preacher. The route validates program membership and location scope, creates an Airtable Session, generates `/attend?session=<id>` using the app's `NEXT_PUBLIC_SITE_URL`, and writes the attendance URL back to Airtable.

### Staff Invites

Admin invite and volunteer invite routes upsert Airtable Users, send Supabase invite email, and write `invite_log`. Admins can create Admin, Preacher, and Volunteer users. Preachers can invite Volunteers assigned to themselves.

## Offline/PWA Architecture

`public/sw.js` precaches the landing page, `/attend`, offline shell, manifest, icons, and logo. It queues selected same-origin POST requests when fetch fails:

- `/api/contact`
- `/api/registration`
- `/registration` legacy path
- `/attendance`

The active UI listens for service worker pending-count messages through `components/offline-indicator.tsx`. `components/offline-sync-provider.tsx` and `lib/offline-sync.ts` are present but not currently mounted.

## Caching

- Airtable request helpers default to `cache: "no-store"`.
- `listCachedLocations()` and `listCachedActivePreachers()` use `unstable_cache` with a 20-minute TTL and tags.
- `createLocation()` revalidates the locations cache.
- Auth-related routes set no-store behavior where needed.

## Important Constraints

- Keep secrets server-only. Never move Airtable tokens or Supabase service-role keys into client code.
- Keep `PROGRAM_ID` and `NEXT_PUBLIC_PROGRAM_ID` aligned with the deployed app.
- Keep program app parity intentionally: duplicated app route files under `apps/folk` and `apps/gita-life` should remain behaviorally aligned unless a requirement says otherwise.
- Do not restore the old localStorage demo auth model; current auth is Supabase-backed.
- Preserve the `/attendance` route path. It is intentionally not under `/api`.
- Preserve 10-digit mobile normalization on both client and server.
- Any session attendance changes must keep registration, attendance, dashboard polling, Airtable session fields, and service worker queue paths aligned.
- Run `pnpm guardrails` and `pnpm typecheck:workspace` because Next build ignores TypeScript errors and package boundaries are enforced by local guardrails.
