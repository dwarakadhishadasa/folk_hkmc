# Story 1.3: Seed Client Auth State On Server-Authorized Staff Pages

Status: review

## Story

As a staff user,
I want the header and staff-only prompts to know my role without repeating the same auth fetch,
so that protected pages settle faster after navigation.

## Acceptance Criteria

1. Given a protected page already resolved `StaffContext` server-side, when the page renders the header and staff-only PWA prompt, then the nearest client auth provider or route-scoped auth seed receives the server-resolved staff context, and the initial protected page render does not immediately call `/api/auth/me`.
2. Given a public page does not resolve staff server-side, when the app loads, then the existing client auth refresh behavior may still call `/api/auth/me` if needed for public navigation state, and this does not reintroduce duplicate protected-page auth fetches.
3. Given a staff user signs out, when the signout route completes, then seeded or cached client auth state is cleared, and the header no longer shows authenticated navigation.
4. Given an Admin, Preacher, or Volunteer opens a protected page, when the page is hydrated, then role-specific navigation and staff-only PWA install prompt visibility match the resolved staff context.

## Tasks / Subtasks

- [x] Extend `AuthProvider` in `lib/auth-context.tsx` to accept optional initial `StaffContext` seed data. (AC: 1, 2)
  - [x] When initial staff is provided, initialize `staff` from it and mark hydration complete without an immediate `/api/auth/me` fetch.
  - [x] Preserve `refresh()` so public pages and explicit refresh paths can still call `/api/auth/me`.
- [x] Create a server-to-client seeding path for protected layouts/pages that already call `getStaffContext()`. (AC: 1, 4)
  - [x] Prefer a small route-scoped provider wrapper over duplicating provider logic across every page.
  - [x] Avoid passing secrets or raw Supabase session objects into client components.
- [x] Update protected staff pages that already resolve staff context, including `/contact`, `/sessions`, `/volunteers`, `/admin`, `/manage`, and `/dashboard` if applicable. (AC: 1, 4)
- [x] Verify `Header` and `PWAInstallPrompt` preserve role-aware behavior with seeded state. (AC: 3, 4)
- [x] Verify signout through `/auth/signout` clears server session and results in unauthenticated UI state. (AC: 3)

## Dev Notes

- Current `components/providers.tsx` mounts one global `AuthProvider`, and `AuthProvider` calls `refresh()` in a client effect on every load. That fetches `/api/auth/me`, which in turn calls `getStaffContext()`.
- Current protected pages such as `app/contact/page.tsx` and `app/sessions/page.tsx` already call `getStaffContext()` server-side before rendering, so the client effect duplicates auth/profile work.
- `Header` reads `isLoggedIn`, `isPreacher`, `username`, `role`, and `isHydrated` from `useAuth()`. It currently shows a reduced shell until hydration completes.
- `PWAInstallPrompt` is intentionally staff-only and uses `staff.airtableUserId` for dismissal state. Preserve that behavior from `spec-staff-only-pwa-install-prompt.md`.
- Keep public navigation behavior sane. Public pages that did not resolve staff on the server may still hydrate by calling `/api/auth/me`.
- This story depends on Story 1.2 for a faster `/api/auth/me` and `getStaffContext()` hot path, but it should still avoid the duplicate fetch on protected page initial render.

### Project Structure Notes

- `components/providers.tsx` is the global client provider entry point.
- `lib/auth-context.tsx` owns the auth context contract. Keep new seed props typed with `StaffContext`.
- Protected server pages are in `app/*/page.tsx`; avoid turning server pages into client components just to pass auth state.

### References

- [Source: _bmad-output/planning-artifacts/performance-responsiveness-epics.md#Story-1.3]
- [Source: _bmad-output/implementation-artifacts/spec-staff-only-pwa-install-prompt.md]
- [Source: lib/auth-context.tsx]
- [Source: components/providers.tsx]
- [Source: components/header.tsx]
- [Source: components/pwa-install-prompt.tsx]
- [Source: app/api/auth/me/route.ts]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `pnpm exec tsc --noEmit` passed.
- `pnpm build` passed.
- Public/protected redirect smoke: unauthenticated `/contact`, `/sessions`, and `/dashboard` redirect to login.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Added seeded `AuthProvider` support and a route-scoped `StaffAuthShell`.
- Wrapped protected staff pages that already resolve `StaffContext` so Header and staff-only PWA prompt receive seeded state.
- Moved the PWA prompt render under `Header`, allowing it to consume the nearest seeded auth context on protected pages.
- Signout continues through `/auth/signout`; public pages still use the global auth refresh path.

### File List

- `lib/auth-context.tsx`
- `components/staff-auth-shell.tsx`
- `components/providers.tsx`
- `components/header.tsx`
- `app/contact/page.tsx`
- `app/sessions/page.tsx`
- `app/admin/invite/page.tsx`
- `app/volunteers/page.tsx`
- `app/manage/page.tsx`
- `app/dashboard/page.tsx`

### Change Log

- 2026-05-07: Added server-to-client staff auth seeding for protected staff pages.
