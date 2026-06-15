---
title: 'Route Preacher and Admin Login to Homepage'
type: 'bugfix'
created: '2026-06-15'
status: 'done'
baseline_commit: '018f9c55f57375f9ef06f318bf4d08fb76986b70'
context:
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** After a Preacher or Admin accepts onboarding or signs in without requesting a specific protected page, the app can still send them to the live/session dashboard. This makes the first staff landing feel operational instead of returning them to the program homepage.

**Approach:** Change the default successful staff landing for both `Preacher` and `Admin` to `/` across the aligned auth completion paths. Preserve the existing Volunteer default of `/contact`, and preserve explicit safe redirect requests such as `/login?redirect=/sessions`, `/login?redirect=/dashboard`, or invite links with `next` when the role is allowed to use that path.

## Boundaries & Constraints

**Always:** Keep Supabase session creation and staff authorization exactly where they are today. Update both Program apps (`apps/folk` and `apps/gita-life`) plus shared auth recovery/callback helpers so default landing behavior is consistent. Keep Volunteer route coercion to `/contact`.

**Ask First:** Halt before changing route permissions, removing `/dashboard`, changing protected page guards, changing header/nav visibility, or adding a new onboarding/home dashboard surface.

**Never:** Do not weaken server-side staff checks, trust client role data for authorization, redirect Volunteers to the homepage by default, or change explicit safe redirects for Admin/Preacher users who were trying to reach a protected route.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Default Admin login | Auth completes for an active Admin without `next`/`redirect` | Browser lands on `/` | Existing auth errors still route to `/auth/error` |
| Default Preacher login | Auth completes for an active Preacher without `next`/`redirect` | Browser lands on `/` | Existing auth errors still route to `/auth/error` |
| Default Volunteer login | Auth completes for an active Volunteer without `next`/`redirect` | Browser lands on `/contact` | Existing auth errors still route to `/auth/error` |
| Requested protected page | Admin/Preacher starts at `/login?redirect=/sessions` or auth callback includes `next=/sessions` | Browser lands on `/sessions` | Unsafe paths fall back to role default |
| Volunteer requests non-contact page | Volunteer starts at `/login?redirect=/sessions` | Browser lands on `/contact` | Unsafe or disallowed paths are ignored |

</frozen-after-approval>

## Code Map

- `apps/folk/app/login/login-page-client.tsx` -- FOLK client login and already-authenticated redirect fallback.
- `apps/gita-life/app/login/login-page-client.tsx` -- Gita Life client login and already-authenticated redirect fallback.
- `apps/folk/app/auth/confirm/route.ts` -- FOLK server callback/invite/magic-link completion redirect fallback.
- `apps/gita-life/app/auth/confirm/route.ts` -- Gita Life server callback/invite/magic-link completion redirect fallback.
- `components/auth-hash-callback.tsx` -- Shared implicit/hash callback completion fallback.
- `components/auth-error-content.tsx` -- Shared invalid-invite recovery path when a valid session exists.
- `lib/auth-context.tsx` -- Shared browser auth state and OTP completion; no default landing helper here, but verify no redirect default lives in it.

## Tasks & Acceptance

**Execution:**
- [x] `apps/folk/app/login/login-page-client.tsx` -- return `/` for non-Volunteer default landing -- ensures unrequested FOLK Admin/Preacher logins land on the homepage.
- [x] `apps/gita-life/app/login/login-page-client.tsx` -- return `/` for non-Volunteer default landing -- keeps Gita Life auth behavior aligned.
- [x] `apps/folk/app/auth/confirm/route.ts` and `apps/gita-life/app/auth/confirm/route.ts` -- return `/` for non-Volunteer fallback in `safeNextPath` -- covers invite, magic-link, and code callback completion.
- [x] `components/auth-hash-callback.tsx` and `components/auth-error-content.tsx` -- return `/` for non-Volunteer default landing -- covers implicit callback and recovery after a hash-session race.
- [x] Search for remaining default landing helpers returning `/dashboard` and either update or document why they are not part of staff login completion.

**Acceptance Criteria:**
- Given an active Admin completes onboarding or login without a safe requested destination, when auth redirects, then they land on `/`.
- Given an active Preacher completes onboarding or login without a safe requested destination, when auth redirects, then they land on `/`.
- Given an active Volunteer completes onboarding or login, when auth redirects, then they still land on `/contact`.
- Given an active Admin or Preacher logs in after being redirected from `/sessions` or `/dashboard`, when auth completes, then they land on the requested safe protected route.
- Given an unsafe destination such as `//evil.example` or `/auth/error`, when auth completes, then the app ignores it and uses the role default.

## Spec Change Log

## Verification

**Commands:**
- `pnpm guardrails` -- expected: monorepo guardrails pass.
- `pnpm typecheck:workspace` -- expected: all workspace type checks pass.
- `pnpm lint` -- expected: lint completes with no new errors.
- `rg -n 'return "/dashboard"|landingPathForRole|safeNextPath' apps components lib` -- expected: no staff-login default fallback returns `/dashboard` unless it is a protected-page redirect parameter or non-login route reference.

**Results:**
- `pnpm guardrails` -- passed with pre-existing client-safe type import warnings in auth/PWA-adjacent components.
- `pnpm typecheck:workspace` -- passed across workspace packages/apps.
- `pnpm lint` -- passed with four pre-existing warnings in offline sync, PWA install prompt, and toast helpers.
- `rg -n 'return "/dashboard"|landingPathForRole|safeNextPath' apps components lib` -- passed; no remaining `return "/dashboard"` default in staff-login landing helpers.

**Manual checks:**
- Inspect the updated login and callback helpers to confirm only fallback defaults changed; explicit safe redirects and Volunteer coercion remain intact.

## Suggested Review Order

**Server Callback Defaults**

- Server invite and magic-link fallback now lands non-Volunteers on the homepage.
  [`route.ts:8`](../../apps/folk/app/auth/confirm/route.ts#L8)

- Gita Life mirrors the same server-side callback behavior.
  [`gita-life/route.ts:8`](../../apps/gita-life/app/auth/confirm/route.ts#L8)

**Client Login Defaults**

- FOLK OTP verification and already-authenticated fallback share the homepage default.
  [`login-page-client.tsx:13`](../../apps/folk/app/login/login-page-client.tsx#L13)

- Gita Life OTP login follows the same role-default rule.
  [`gita-life/login-page-client.tsx:16`](../../apps/gita-life/app/login/login-page-client.tsx#L16)

**Shared Recovery Paths**

- Hash callback completion preserves Volunteer contact routing and sends others home.
  [`auth-hash-callback.tsx:14`](../../components/auth-hash-callback.tsx#L14)

- Auth error recovery uses the same role fallback after session recovery.
  [`auth-error-content.tsx:13`](../../components/auth-error-content.tsx#L13)
