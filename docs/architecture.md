# Architecture

## Executive Summary

`folk_hkmc` is a pnpm/Turborepo monorepo with two program-scoped Next.js App Router apps: `@hkmc/folk` and `@hkmc/gita-life`. Each app has a client-heavy UI and its own route handlers, while shared server logic, program metadata, auth contracts, and UI primitives live in root `lib/`, `components/`, and `packages/*`. The current architecture is best described as:

```text
Browser / PWA for one program deployment
  -> apps/{folk,gita-life}/app pages and client components
  -> apps/{folk,gita-life}/app route handlers
  -> shared server-only lib/ services and @hkmc/* packages
  -> Supabase Auth (identity) + Supabase Postgres (all operational records and staff)
```

Supabase is the single operational datastore. There is no Airtable access layer, no Airtable environment variable, and no second admin surface — `/manage` is an in-app portal fed by the same Postgres tables.

The repository does not have a separate backend service. Server-only modules in `lib/` and server-only package exports are the backend boundary.

## Runtime Layers

| Layer | Files | Responsibilities |
| --- | --- | --- |
| App shell | `apps/*/app/layout.tsx`, `components/providers.tsx` | Program metadata, fonts, global providers, Speed Insights, service worker registration |
| Public pages | `apps/*/app/page.tsx`, `apps/*/app/register/page.tsx`, `apps/*/app/attend/page.tsx` | Program landing, registration, attendance |
| Staff pages | `apps/*/app/contact/page.tsx`, `apps/*/app/sessions/page.tsx`, `apps/*/app/dashboard/page.tsx`, `apps/*/app/volunteers/page.tsx`, `apps/*/app/admin/invite/page.tsx`, `apps/*/app/manage/page.tsx` | Server-side staff context checks and staff workflows |
| Client state | `lib/auth-context.tsx`, `components/navigation-feedback-provider.tsx` | Auth hydration, OTP flow, navigation feedback |
| Route handlers | `apps/*/app/api/**/route.ts`, `apps/*/app/attendance/route.ts`, `apps/*/app/auth/**/route.ts` | Program-local API contracts, auth callbacks, staff mutations, attendance |
| Authorization | `lib/authz.ts`, root `proxy.ts`, `apps/*/proxy.ts`, `lib/supabase/*` | Supabase cookies, `public.users` staff-context reads, role checks, audit events |
| Program config | `packages/program-config`, `lib/current-program.ts` | Public branding, module flags, program-scoped env |
| Supabase data | `lib/supabase/data.ts`, `lib/supabase/manage.ts`, `lib/supabase/admin.ts`, `lib/supabase/server.ts` | Operational records, `/manage` aggregations, service-role and cookie-backed clients |
| PWA/offline | `public/sw.js`, `components/offline-indicator.tsx`, `public/manifest.json` | Asset caching and selected offline POST queueing |

### Workspace packages

| Package | Role |
| --- | --- |
| `@hkmc/data-contracts` | Program IDs, staff roles, staff statuses, and shared API response types with type guards |
| `@hkmc/program-config` | Public branding and module flags (client-safe) plus the server-only program profile resolver |
| `@hkmc/authz` | Staff-context and role-guard helpers that re-export from root `lib/authz.ts` |
| `@hkmc/ui` | Shared UI primitives (alias of `components/ui`) |

## Authentication And Authorization

### Sign-In Flow

1. Staff enters email on `/login`.
2. `POST /api/auth/signin` looks the email up in `public.users` via `findStaffUserByEmail()` and rejects anything that is not `Active` with `403`.
3. The route ensures a Supabase Auth user exists (`ensureSupabaseAuthUser()`) and loads the staff context (`syncStaffProfileByEmail()`), which returns the `public.users.id` UUID for that email and program.
4. Browser calls `supabase.auth.signInWithOtp`.
5. Staff enters email OTP, or follows an invite/callback link.
6. `POST /api/auth/complete-implicit` or `GET /auth/confirm` re-resolves the staff context from `public.users`.
7. Client stores no custom local session. Supabase cookies represent the session.
8. `GET /api/auth/me` returns the current `StaffContext`.

There is no sync step and no external identity lookup: `public.users.id` references `auth.users(id)`, so the auth account and the staff record share one UUID.

### Staff Context

`getStaffContext()` in `lib/authz.ts` is the protected server boundary. It reads the Supabase user from cookies, resolves the current program from `PROGRAM_ID`/`NEXT_PUBLIC_PROGRAM_ID`, loads the caller's row from `public.users`, validates `status` and `role`, and returns:

```ts
interface StaffContext {
  programId: "folk" | "gita-life"
  supabaseUserId: string
  email: string
  userId: string                 // public.users.id (UUID)
  name: string
  role: "Admin" | "Preacher" | "Volunteer" | "Assistant"
  status: "Active" | "Inactive" | "Suspended" | "Revoked"
  locationIds: string[]
  assignedPreacherUserId?: string // public.users.assigned_preacher_id (UUID)
  lastSyncedAt: string
}
```

`userId` and `assignedPreacherUserId` are `public.users` UUIDs. The same spelling is used on the contact and invite request bodies, so a client form key and its server-side route field always match.

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

Supabase Postgres is the operational store. `lib/supabase/data.ts` is the single data-access module; it carries `import "server-only"`, so no route or page can reach it from a client bundle.

### Operational tables

- `contacts`: program-scoped people records, unique on `(phone, program_id)`
- `attendance`: per-contact-per-session rows, unique on `(contact_id, session_id)`
- `sessions`: program sessions with attendance windows, `preacher_id`, `location_id`, `created_by`
- `locations`: program locations
- `users`: **the staff source of truth** for Admin, Preacher, Volunteer, and Assistant, with `id` referencing `auth.users(id)`
- `programs`: known program IDs, currently `folk` and `gita-life`

### Views

- `contact_attendance_counts`: per-contact rollup feeding the `/manage` contacts table, including `past_60_day_attendance_count` computed over a rolling 60-day window in `Asia/Kolkata`

### Audit and legacy tables

- `audit_events`: authorization/audit events, written by `writeAuditEvent()`
- `invite_log`: invite audit log

`staff_memberships`, `staff_profiles`, `airtable_identities`, and `airtable_sync_state` were the historical synchronization bridge. No runtime code read or wrote them once `public.users` became authoritative, and `supabase/migrations/20261007000000_retire_airtable_named_columns.sql` has since dropped all four on the hosted project. The same migration renamed `invite_log.airtable_user_id` → `user_id`, `invite_log.inviter_airtable_user_id` → `inviter_user_id`, and `audit_events.actor_airtable_user_id` → `actor_user_id`; `lib/supabase/types.ts` was regenerated afterwards. The migration files that created the bridge stay in the repository as applied history — the tables themselves no longer exist.

### Storage

The `contact-photos` bucket is **private**. Photos render via signed URLs minted by server code with the service role; no anon or authenticated client has direct access.

Supabase migrations live under `supabase/migrations/`. The service-role key is used only server-side. There is no local Supabase stack — development and verification run against the hosted project.

### Row-Level Security

RLS is the authenticated-read scope layer; all writes are service-role only. Scope resolves through the caller's `public.users` row and only when that row is `Active`. The per-role, per-table contract and the `public.caller_*()` helper functions are documented in `docs/data-models.md` and defined in `rls-policy-matrix.md`. `node scripts/verify-rls.mjs` exercises all 75 checks.

## Key Flows

### Public Registration Without Session

`apps/*/app/register/page.tsx` posts to `POST /api/registration` in the current program app. The route validates name/mobile, rejects duplicates, creates a `contacts` row, and returns `201`.

### Session-Backed Registration

When `/register?session=<id>` is used, `POST /api/registration` validates session eligibility, creates or reuses the contact, then creates attendance for the same session. Duplicate attendance returns a completed success response rather than requiring a second call.

### Attendance

`/attend?session=<id>` posts mobile/session to `POST /attendance`. The route validates the session window, looks up the contact, prevents duplicate attendance (Postgres `23505` → `409`), and creates an `attendance` row.

### Live Dashboard

`LiveAttendanceDashboard` polls `GET /attendance?session=<id>` every 20 seconds while visible. It sends up to 100 known attendance UUIDs so the server can return only new records for that session.

### Staff Contact Creation

`POST /api/contact` requires staff context. Routing differs by role:

- Volunteer: contact is assigned to the volunteer's assigned Preacher.
- Preacher: contact is assigned to that Preacher.
- Admin: request must include `assignedPreacherUserId`.

The key is a `public.users` UUID; the route trims it, resolves the preacher with `findStaffUserById()`, and writes `contacts.assigned_preacher_id`.

### Session Creation

`POST /api/sessions` requires Admin or Preacher. The route validates program membership and location scope, creates a `sessions` row, generates `/attendance?session=<uuid>` using the app's `NEXT_PUBLIC_SITE_URL`, and writes the attendance URL back.

### Staff Invites

Admin invite and volunteer invite routes upsert `public.users`, send the Supabase invite email, and write `invite_log`. Admins can create Admin, Preacher, Volunteer, and Assistant users. Preachers can invite Volunteers assigned to themselves. `upsertStaffUser()` writes `invited_by` and `assigned_preacher_id` from the resolved `public.users` UUIDs.

### `/manage` Portal

`/manage` is the in-app management portal, restricted to Admin and Preacher. It renders five tabs — `dashboard`, `contacts`, `sessions`, `attendance`, `favorites` — from Postgres via `loadManagePortalData()`. An Admin sees program-wide aggregates and can switch to their own preacher-scoped view (`mode=admin` / `mode=preacher`); a Preacher sees only their own scope. Contacts carry attendance counts from `contact_attendance_counts`, and the favorites/contact-detail screens read and write `is_favorite`, `rounds`, `books_read`, and `photo_path` (uploaded to the private `contact-photos` bucket and rendered via signed URLs). There is no external link and no fallback card.

Unauthenticated access redirects to `/login?redirect=/manage`; a non-Admin/Preacher staff member is redirected to the authorization-failure page and never sees the portal.

## Offline/PWA Architecture

`public/sw.js` precaches the landing page, `/attend`, offline shell, manifest, icons, and logo. It queues selected same-origin POST requests when fetch fails:

- `/api/contact`
- `/api/registration`
- `/registration` legacy path
- `/attendance`

Queued requests replay to the original URL on reconnect or background sync, a `409` counts as synced, and an offline submission returns a synthetic `202 {queued: true}`. The active UI listens for service worker pending-count messages through `components/offline-indicator.tsx`. `components/offline-sync-provider.tsx` and `lib/offline-sync.ts` are present but not currently mounted.

## Caching

- Supabase reads default to uncached reads for operational records.
- `listCachedLocations()` and `listCachedActivePreachers()` use `unstable_cache` with a 20-minute TTL and tags.
- `createLocation()` revalidates the locations cache.
- Auth-related routes set no-store behavior where needed.

## Important Constraints

- Keep secrets server-only. Never move the Supabase service-role key into client code.
- Keep `PROGRAM_ID` and `NEXT_PUBLIC_PROGRAM_ID` aligned with the deployed app.
- Keep program app parity intentionally: duplicated app route files under `apps/folk` and `apps/gita-life` should remain behaviorally aligned unless a requirement says otherwise.
- Do not restore the old localStorage demo auth model; current auth is Supabase-backed.
- Preserve the `/attendance` route path. It is intentionally not under `/api`.
- Preserve 10-digit mobile normalization on both client and server.
- Preserve `Asia/Kolkata` program-day semantics for attendance-day filtering and the `initial_contact` / `last_contacted_on` dates.
- Any session attendance changes must keep registration, attendance, dashboard polling, session fields, and service worker queue paths aligned.
- The client/server boundary is enforced locally: `pnpm guardrails` fails on a client graph that reaches a `server-only` module, and `pnpm typecheck:workspace` must pass because the Next build ignores TypeScript errors.
