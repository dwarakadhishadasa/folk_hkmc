---
title: 'Fix auth Load failed after signout'
type: 'bugfix'
created: '2026-05-20'
status: 'done'
route: 'quick-dev'
baseline_commit: '8f75221'
context:
  - '{project-root}/_bmad-output/project-context.md'
---

# Fix auth Load failed after signout

## Intent

**Problem:** iOS Safari/PWA users could intermittently see a browser "Load failed" state after signing out and logging back in. The reported Vercel trace showed `/auth/signout` redirecting to a cached `/login` response, followed by auth refresh and RSC requests, which matches a stale auth/RSC cache race around a cookie boundary.

**Approach:** Treat signout/login as an auth boundary: clear client auth before the server signout redirect, make login/signout/auth-me responses non-cacheable, use document navigation after OTP verification, and stop the service worker from caching auth, API, protected page, and RSC payloads.

## Code Map

- [`../../lib/auth-context.tsx`](../../lib/auth-context.tsx) -- clears local staff state and browser Supabase state before navigating to server signout.
- [`../../app/auth/signout/route.ts`](../../app/auth/signout/route.ts) -- returns a no-store redirect to `/login?signedOut=1`.
- [`../../app/api/auth/me/route.ts`](../../app/api/auth/me/route.ts) -- marks staff identity responses as no-store and `Vary: Cookie`.
- [`../../app/login/page.tsx`](../../app/login/page.tsx) -- dynamic no-store server wrapper for the login route.
- [`../../app/login/login-page-client.tsx`](../../app/login/login-page-client.tsx) -- preserves login UI while using full document navigation across auth transitions.
- [`../../public/sw.js`](../../public/sw.js) -- bumps the cache version and bypasses runtime caching for auth/API/protected/RSC requests while preserving offline write queue behavior.

## Tasks & Acceptance

**Execution:**

- [x] `lib/auth-context.tsx` -- clear client auth state during logout before server signout.
- [x] `app/auth/signout/route.ts` and `app/api/auth/me/route.ts` -- add explicit no-store cookie-varying responses.
- [x] `app/login/page.tsx` and `app/login/login-page-client.tsx` -- force the login route dynamic and avoid client-router RSC reuse across login redirects.
- [x] `public/sw.js` -- keep offline queue support but prevent stale auth, API, protected page, and RSC response reuse.

**Acceptance Criteria:**

- Given a staff user signs out from `/contact`, when `/auth/signout` redirects to `/login?signedOut=1`, then the login document and `/api/auth/me` response must not be served from stale runtime cache.
- Given the user verifies an OTP after signout, when the app sends them to their role landing page, then the navigation should be a fresh document request with current Supabase cookies.
- Given the PWA is offline, when a staff contact write fails due to network loss, then the existing service worker queue behavior for `/api/contact` remains intact.

## Verification

**Commands:**

- `pnpm exec tsc --noEmit` -- passed.
- `pnpm build` -- passed; `/login` is now dynamic in the route summary.
- `node --check public/sw.js` -- passed.

**Notes:**

- `pnpm lint` could not run because the checkout does not have `eslint` installed or declared, even though the script calls `eslint .`.
