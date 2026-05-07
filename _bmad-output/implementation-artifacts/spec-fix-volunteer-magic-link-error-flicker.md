---
title: 'Fix Volunteer Magic Link Error Flicker'
type: 'bugfix'
created: '2026-05-08'
status: 'done'
route: 'one-shot'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/1-2-split-staff-authorization-hot-path-from-airtable-synchronization.md'
---

# Fix Volunteer Magic Link Error Flicker

## Intent

**Problem:** Volunteer magic-link sign-in could briefly render the Sign-in Problem screen before the valid session finished routing to the staff landing page.

**Approach:** Send new magic links directly to the server confirmation route, keep legacy `/login` callbacks single-shot, and make hash-token callbacks complete the explicit staff-profile sync before choosing the landing page.

## Suggested Review Order

**Primary Callback Path**

- New magic links now skip the client `/login` handoff.
  [`auth-context.tsx:57`](../../lib/auth-context.tsx#L57)

- Legacy `/login?code=...` callbacks perform one full-page handoff.
  [`page.tsx:27`](../../app/login/page.tsx#L27)

**Hash Callback Fallback**

- Fragment-only and otherwise server-unverifiable `/auth/confirm` requests show a neutral callback shell before any invalid-link copy is shown.
  [`route.ts:71`](../../app/auth/confirm/route.ts#L71)

- The shell redirects truly invalid callbacks after the browser can inspect the hash.
  [`page.tsx:15`](../../app/auth/hash-callback/page.tsx#L15)

- Hash-token sessions now sync staff context before role routing.
  [`auth-hash-callback.tsx:42`](../../components/auth-hash-callback.tsx#L42)

- The sync endpoint keeps Airtable work on an explicit login boundary.
  [`route.ts:6`](../../app/api/auth/complete-implicit/route.ts#L6)

**Regression Hardening - 2026-05-08**

- `/auth/error?code=invalid-invite` now defers the visible Sign-in Problem card while the browser checks for Supabase hash session tokens.
  [`auth-error-content.tsx:35`](../../components/auth-error-content.tsx#L35)

- Already-authenticated users who land on the transient invalid-invite route are returned to the role landing page instead of staying on the error screen.
  [`auth-error-content.tsx:57`](../../components/auth-error-content.tsx#L57)

**Verification**

- `pnpm exec tsc --noEmit` passed.
- `pnpm build` passed.
- `pnpm lint` could not run because `eslint` is not installed in this checkout.

## Dev Agent Record

- 2026-05-08: Hardened the auth callback fallback so unsupported or incomplete server-side OTP query payloads defer to `/auth/hash-callback` before rendering invalid-link copy.
- 2026-05-08: Added client-side invalid-invite guard on `/auth/error` so hash-bearing magic-link redirects show only neutral completion UI while `AuthHashCallback` completes session setup.
- 2026-05-08: Verification run: `pnpm exec tsc --noEmit` passed; `pnpm build` passed; `pnpm lint` blocked because `eslint` is not installed.

## File List

- `app/auth/confirm/route.ts`
- `app/auth/error/page.tsx`
- `components/auth-error-content.tsx`
- `_bmad-output/implementation-artifacts/spec-fix-volunteer-magic-link-error-flicker.md`
