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

- Fragment-only `/auth/confirm` requests show a neutral callback shell.
  [`route.ts:66`](../../app/auth/confirm/route.ts#L66)

- The shell redirects truly invalid callbacks after the browser can inspect the hash.
  [`page.tsx:15`](../../app/auth/hash-callback/page.tsx#L15)

- Hash-token sessions now sync staff context before role routing.
  [`auth-hash-callback.tsx:42`](../../components/auth-hash-callback.tsx#L42)

- The sync endpoint keeps Airtable work on an explicit login boundary.
  [`route.ts:6`](../../app/api/auth/complete-implicit/route.ts#L6)

**Verification**

- `pnpm exec tsc --noEmit` passed.
- `pnpm build` passed.
- `pnpm lint` could not run because `eslint` is not installed in this checkout.
