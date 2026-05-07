# Performance Responsiveness Implementation Report

Date: 2026-05-07

## Summary

Implemented the ready-for-dev performance responsiveness story chain across staff authorization, reference-data caching, registration-backed attendance, live attendance reads, timer scheduling, offline pending-state refresh, and verification reporting.

## Changed Files

- `supabase/migrations/20260504102000_add_staff_profile_scope_fields.sql`
- `lib/supabase/types.ts`
- `lib/authz.ts`
- `lib/auth-context.tsx`
- `components/staff-auth-shell.tsx`
- `components/providers.tsx`
- `components/header.tsx`
- `lib/airtable.ts`
- `lib/attendance-session.ts`
- `app/contact/page.tsx`
- `app/sessions/page.tsx`
- `app/admin/invite/page.tsx`
- `app/volunteers/page.tsx`
- `app/manage/page.tsx`
- `app/dashboard/page.tsx`
- `app/api/registration/route.ts`
- `app/attendance/route.ts`
- `app/register/page.tsx`
- `components/live-attendance-dashboard.tsx`
- `components/sessions-manager.tsx`
- `components/offline-indicator.tsx`
- `public/sw.js`

## Baseline Evidence

- `/contact` previously called `getStaffContext()`, which called `syncStaffProfileByEmail()`, which called Airtable staff lookup helpers. The same page also read `listLocations()` and, for Admins, `listActivePreachers()`, then the global client `AuthProvider` immediately called `/api/auth/me` after hydration.
- `/sessions` previously called `getStaffContext()`, then `listLocations()`, then the global client `AuthProvider` immediately called `/api/auth/me` after hydration.
- Session-backed `/register?session=...` previously posted to `/api/registration`, then browser code called `/attendance` to finish attendance or duplicate attendance handling.
- `POST /attendance` and `GET /attendance?session=...` previously loaded a Session and then called helpers that reloaded the same Session to read linked Attendance records.
- `LiveAttendanceDashboard` and `SessionsManager` previously used one-second intervals for state transitions without visible second-by-second countdowns.
- `OfflineIndicator` previously polled the service worker pending count every 5 seconds.

## After Evidence

- `getStaffContext()` now verifies the Supabase user and reads `public.staff_profiles` directly. Normal protected page rendering no longer calls `findStaffUserByEmail()`, `findStaffUserById()`, `syncStaffProfileByEmail()`, or `syncStaffSupabaseUserId()`.
- Airtable staff sync remains explicit through `syncStaffProfileByEmail()`, used by auth confirmation and intentional login/invite sync boundaries.
- Protected pages render inside `StaffAuthShell` with the server-resolved `StaffContext`, so `Header` and the staff-only PWA prompt use seeded auth state without the protected-page duplicate `/api/auth/me` hydration fetch.
- `/contact` now uses cached Locations and cached active Preachers for option lists, while Volunteer assigned-preacher lookup and `/api/contact` write-side validation remain fresh.
- `/sessions` now uses cached Locations and continues to filter by the current staff context.
- `/api/registration` now validates session eligibility, derives session preacher/location, creates or reuses the Contact, and creates or reuses Attendance in one server route.
- `/register?session=...` now posts only to `/api/registration`; it no longer calls `/attendance` after a successful or completed duplicate result.
- `/attendance` uses the shared session eligibility helper and reuses already-loaded Session context for duplicate checks and dashboard reads.
- `LiveAttendanceDashboard` sends a capped `knownAttendanceIds` hint. The route validates the hint and fetches only new linked Attendance ids when safe; malformed, missing, or excessive hints fall back to the full response.
- Dashboard client de-duplication by Airtable record id and the existing `document.hidden` guard remain in place.
- One-second session timers were replaced with close/open boundary timeouts, while the 20-second attendance polling cadence remains.
- `OfflineIndicator` now refreshes pending count on mount, `online`, visible `visibilitychange`, service-worker queue notifications, and manual sync responses. The 5-second polling interval was removed.
- `public/sw.js` still queues only public registration/attendance POST requests; staff contact writes remain online-only.

## Verification Commands

- `pnpm exec tsc --noEmit` passed.
- `pnpm build` passed. Build output notes that Next skips type validation, so the explicit TypeScript command above remains the type gate.
- `pnpm lint` failed because `eslint` is not installed. This matches `_bmad-output/implementation-artifacts/deferred-work.md`.

## Local Smoke

- Dev server started at `http://localhost:3000`.
- `GET /` returned `200`.
- `GET /register?session=recSmokeTest12345` returned `200`.
- `GET /attend?session=recSmokeTest12345` returned `200`.
- Unauthenticated `GET /contact` redirected to `/login?redirect=/contact`.
- Unauthenticated `GET /sessions` redirected to `/login?redirect=/sessions`.
- Unauthenticated `GET /dashboard` redirected to `/login?redirect=/dashboard`.
- `GET /api/auth/me` without staff cookies returned `200` with the unauthenticated staff-null contract.

## Vercel Speed Insights Field Results

Captured from Vercel Speed Insights on 2026-05-07 for desktop preview traffic over the last 7 days. Sample sizes are small, so treat this as directional evidence rather than a settled production baseline.

- `TTFB`: 1.92s, poor, route `/` with 3 data points.
- `FCP`: 2.04s, needs improvement, route `/` with 3 data points.
- `LCP`: 2.04s, great.
- `INP`: 272ms, needs improvement. Route evidence: `/contact` 272ms with 2 data points, `/` 272ms with 1 data point, `/volunteers` 216ms with 1 data point.
- `CLS`: 0, great.
- `FID`: 67ms, great.
- Real Experience Score currently shows `0`.

Follow-up should prioritize `/` response latency for the poor `TTFB`, then route-level interaction profiling for `/contact`, `/`, and `/volunteers`. Mobile Speed Insights results were not included in the provided screenshots and should be captured separately.

## Blocked Manual Coverage

- Full Admin, Preacher, and Volunteer browser smoke was not executed because no role-specific test accounts/session cookies were provided in this environment.
- Live Airtable write/read verification for Contact, Session, Attendance, and queued replay was not executed to avoid creating real records from an automated smoke pass.
- Supabase remote migration application, advisors, and generated-type refresh were not run against the connected project. The local migration and local TypeScript type mirror were updated; run Supabase migration/type/advisor checks in the target environment before release.

## Residual Risks

- Existing `next.config.mjs` still ignores TypeScript during `next build`; keep `pnpm exec tsc --noEmit` mandatory.
- Existing lint remains blocked until ESLint is added/configured.
- Cached Airtable reference data uses a 20-minute TTL. Admin mutation or refresh flows should call `revalidateAirtableReferenceCache()` when they are added.
