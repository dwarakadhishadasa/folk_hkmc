# Story 1.2: Split Staff Authorization Hot Path From Airtable Synchronization

Status: review

## Story

As a staff user,
I want protected pages to authorize me from the local staff profile,
so that page loads are not slowed down by Airtable sync work.

## Acceptance Criteria

1. Given an authenticated Supabase user has an active `staff_profiles` row, when `getStaffContext()` is called by a protected page or staff API route, then it verifies the Supabase user and reads `staff_profiles`, and it does not call `findStaffUserByEmail()`, `findStaffUserById()`, `syncStaffProfileByEmail()`, or `syncStaffSupabaseUserId()`.
2. Given the matching `staff_profiles` row has `status = Inactive`, when `getStaffContext()` is called, then access is denied with the existing inactive or forbidden authorization behavior, and no Airtable fallback silently reactivates the staff user.
3. Given no `staff_profiles` row exists for the authenticated Supabase user, when a normal protected page load calls `getStaffContext()`, then access fails with an explicit authorization error or redirects to the existing auth error flow, and Airtable sync is attempted only through invite confirmation, login sync, or an explicit refresh helper.
4. Given login confirmation or invite acceptance completes, when the sync path runs, then it still reads Airtable `Users` as the source of truth and refreshes `staff_profiles`, and any optional Airtable staff lookup cache used by sync helpers has a TTL of 30-60 seconds only.
5. Given a staff profile needs to be refreshed after Airtable changes, when an explicit sync or refresh helper is invoked by a login, invite confirmation, admin flow, or intentional `/api/auth/me` refresh mode, then Airtable synchronization may run deliberately, and normal protected page rendering still does not fall back to Airtable automatically.

## Tasks / Subtasks

- [x] Refactor `getStaffContext()` in `lib/authz.ts` so the hot path calls `supabase.auth.getUser()` and then reads `public.staff_profiles` through a server-safe client/admin path. (AC: 1, 2, 3)
  - [x] Map `staff_profiles` rows to `StaffContext` using the fields from Story 1.1.
  - [x] Reject missing, inactive, malformed, or unsupported role rows through `AuthzError` codes that preserve current redirect/error behavior.
- [x] Keep `syncStaffProfileByEmail()` as the explicit Airtable-backed sync helper for invite confirmation, login, and intentional refresh. (AC: 4, 5)
- [x] Audit current callers of `getStaffContext()` and verify none still trigger Airtable staff lookup indirectly on normal protected page loads. (AC: 1, 3)
- [x] If adding backup caching around `findStaffUserByEmail()` or `findStaffUserById()`, limit it to sync helpers with 30-60 second TTL and document the scope. (AC: 4)
- [x] Add lightweight verification notes showing protected page loads no longer call Airtable staff lookup helpers. (AC: 1, 5)

## Dev Notes

- Current `getStaffContext()` in `lib/authz.ts` always calls `syncStaffProfileByEmail()`. That means normal `/contact`, `/sessions`, `/volunteers`, `/manage`, staff API routes, and `/api/auth/me` all hit Airtable staff lookup/sync work after Supabase user verification.
- Do not change the proxy into a business authorization layer. `proxy.ts` and `lib/supabase/proxy.ts` are for Supabase cookie maintenance only; protected pages and route handlers must still call `getStaffContext()` or `requireRole()`.
- Do not use `supabase.auth.getSession()` as server authorization. The planning artifact requires verified server user reads, and current code uses `supabase.auth.getUser()`.
- Preserve existing role boundaries: Volunteers can create contacts only; Preachers and Admins can access sessions, dashboard reads, volunteer invite, and Manage; Admin retains full scoped access.
- A missing `staff_profiles` row on a protected page is not a reason to silently call Airtable. Login/invite/explicit refresh paths are the sync boundary.
- If this story is implemented before Story 1.1, it will not have enough local scope data. Implement Story 1.1 first or include its migration/type changes in the same branch.

### Project Structure Notes

- Keep auth logic centralized in `lib/authz.ts`.
- Keep Airtable staff lookup helpers in `lib/airtable.ts`; do not create duplicate staff lookup modules unless extracting a small server-only helper reduces real complexity.
- Staff profile reads must stay server-only; client components should continue to receive `StaffContext` through route/page/provider data, not by querying Supabase tables directly.

### References

- [Source: _bmad-output/planning-artifacts/performance-responsiveness-epics.md#Story-1.2]
- [Source: _bmad-output/planning-artifacts/nextjs-supabase-staff-auth-plan.md#App-Architecture-Changes]
- [Source: _bmad-output/planning-artifacts/nextjs-supabase-staff-auth-plan.md#Staff-Route-Permissions]
- [Source: lib/authz.ts]
- [Source: app/api/auth/me/route.ts]
- [Source: app/contact/page.tsx]
- [Source: app/sessions/page.tsx]
- [Source: lib/airtable.ts]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `pnpm exec tsc --noEmit` passed.
- `pnpm build` passed.
- Code-path review: `getStaffContext()` now reads `staff_profiles` directly and only auth confirmation uses `syncStaffProfileByEmail()`.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Replaced the protected-page auth hot path with verified Supabase user plus local `staff_profiles` read.
- Preserved explicit Airtable-backed sync in `syncStaffProfileByEmail()` for login/invite confirmation boundaries.
- No backup Airtable lookup cache was added, so there is no new TTL surface to document.

### File List

- `lib/authz.ts`
- `lib/supabase/types.ts`

### Change Log

- 2026-05-07: Split normal staff authorization from Airtable synchronization.
