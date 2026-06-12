# Architecture

## Executive Summary

`folk_hkmc` is a Next.js App Router monolith with a client-heavy UI, server route handlers for mutations and protected reads, Supabase for staff authentication, and Airtable as the operational data backend. The current architecture is best described as:

```text
Browser / PWA
  -> Next.js App Router pages and client components
  -> Next.js route handlers
  -> Supabase Auth + Supabase Postgres staff bridge
  -> Airtable REST API operational tables
```

The application does not have a separate backend service. Server-only modules in `lib/` are the backend boundary.

## Runtime Layers

| Layer | Files | Responsibilities |
| --- | --- | --- |
| App shell | `app/layout.tsx`, `components/providers.tsx` | Fonts, metadata, global providers, Speed Insights, service worker registration |
| Public pages | `app/page.tsx`, `app/register/page.tsx`, `app/attend/page.tsx` | Program landing, registration, attendance |
| Staff pages | `app/contact/page.tsx`, `app/sessions/page.tsx`, `app/dashboard/page.tsx`, `app/volunteers/page.tsx`, `app/admin/invite/page.tsx`, `app/manage/page.tsx` | Server-side staff context checks and staff workflows |
| Client state | `lib/auth-context.tsx`, `components/navigation-feedback-provider.tsx` | Auth hydration, OTP flow, navigation feedback |
| Route handlers | `app/api/**/route.ts`, `app/attendance/route.ts`, `app/auth/**/route.ts` | API contracts, auth callbacks, staff mutations, attendance |
| Authorization | `lib/authz.ts`, `proxy.ts`, `lib/supabase/*` | Supabase cookies, local profile reads, role checks |
| Airtable data | `lib/airtable.ts` | Operational records and Airtable REST helpers |
| PWA/offline | `public/sw.js`, `components/offline-indicator.tsx`, `public/manifest.json` | Asset caching and selected offline POST queueing |

## Authentication And Authorization

### Sign-In Flow

1. Staff enters email on `/login`.
2. `POST /api/auth/signin` verifies the email against active Airtable Users.
3. The route ensures a Supabase Auth user exists and syncs its ID back to Airtable.
4. Browser calls `supabase.auth.signInWithOtp`.
5. Staff enters email OTP, or follows an invite/callback link.
6. `POST /api/auth/complete-implicit` or `GET /auth/confirm` syncs Airtable staff data into Supabase `staff_profiles`.
7. Client stores no custom local session. Supabase cookies represent the session.
8. `GET /api/auth/me` returns the current `StaffContext`.

### Staff Context

`getStaffContext()` in `lib/authz.ts` is the protected server boundary. It reads the Supabase user from cookies, loads `staff_profiles` with the service-role client, validates active status and role, and returns:

```ts
interface StaffContext {
  supabaseUserId: string
  email: string
  airtableUserId: string
  name: string
  role: "Admin" | "Preacher" | "Volunteer"
  locationIds: string[]
  assignedPreacherAirtableUserId?: string
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

Airtable is the main operational data store. `lib/airtable.ts` requires:

- `AIRTABLE_API_TOKEN`
- `AIRTABLE_BASE_ID`
- `AIRTABLE_CONTACTS_TABLE_ID`
- `AIRTABLE_ATTENDANCE_TABLE_ID`
- `AIRTABLE_SESSIONS_TABLE_ID`
- `AIRTABLE_USERS_TABLE_ID`
- `AIRTABLE_LOCATIONS_TABLE_ID`
- Optional `AIRTABLE_ANALYTICS_RECORD_ID`
- Optional `AIRTABLE_INTERFACE_DASHBOARD_PAGE_ID`

The app stores Contacts, Attendance, Sessions, Users, and Locations in Airtable. All Airtable calls are server-only and `cache: "no-store"` except cached reference lists using Next `unstable_cache`.

### Supabase

Supabase has two local tables:

- `staff_profiles`: local authorization cache keyed by Supabase Auth user ID
- `invite_log`: invite audit log

Supabase migrations live under `supabase/migrations/`. The service-role key is used only server-side.

## Key Flows

### Public Registration Without Session

`app/register/page.tsx` posts to `POST /api/registration`. The route validates name/mobile, rejects duplicates, creates an Airtable Contact, and returns `201`.

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

`POST /api/sessions` requires Admin or Preacher. The route validates location scope, creates an Airtable Session, generates `/attend?session=<id>` using `NEXT_PUBLIC_SITE_URL`, and writes the attendance URL back to Airtable.

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
- Do not restore the old localStorage demo auth model; current auth is Supabase-backed.
- Preserve the `/attendance` route path. It is intentionally not under `/api`.
- Preserve 10-digit mobile normalization on both client and server.
- Any session attendance changes must keep registration, attendance, dashboard polling, Airtable session fields, and service worker queue paths aligned.
- Run `pnpm exec tsc --noEmit` because Next build ignores TypeScript errors.
