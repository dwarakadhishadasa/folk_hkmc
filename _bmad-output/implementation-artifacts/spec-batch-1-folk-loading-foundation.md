---
title: 'FOLK loading foundation and public route fallbacks'
type: 'feature'
created: '2026-11-28'
status: 'in-progress'
baseline_commit: 'b8e7a7937eaff22fcd8fa1256db108537bf36d6f'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/architecture/loading-state-audit.md'
  - '{project-root}/docs/architecture/testing.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `/register` and `/login` have blank states, `/` lacks a cold-load surface, and public pending/queued states are inconsistent. Portal also waits for client `/api/auth/me` before appearing.

**Approach:** Add FOLK-local loading primitives, route fallbacks, and explicit public-form states using Framer Motion. Resolve Home staff alongside locations and server-seed auth so Portal does not await client auth.

## Boundaries & Constraints

**Always:** FOLK only; preserve Gita Life and shared defaults. Use semantic tokens and no artificial delays. `LoadingRegion` owns `aria-busy` and one polite status; visual loaders are decorative. Preserve URLs, labels, OTP/API flows, `202 {queued:true}`, and payment FormData keys. Ignore modified navigation clicks.

**Never:** Edit `apps/gita-life/**`; add dependencies/global loading state/another animation library; use a generic full-screen spinner; refactor unrelated behavior; change shared Header/Providers/auth styles/AttendanceForm/UI primitives.

## I/O & Edge-Case Matrix

| Scenario | State | Expected behavior | Failure handling |
|---|---|---|---|
| Home cold load | locations pending | CourseHeader and home-shaped skeleton, then content | Retryable route error |
| Home signed-in | valid staff session | Portal server-rendered in loading/final shells without client-auth wait; role destination unchanged | Anonymous users retain Staff Login; no fake portal on failure |
| Login boot | auth unresolved | Header/form skeleton; bounded wait offers Retry | Never claim signed out from timeout |
| Login redirect | authenticated | “Already signed in; opening your portal…” in page shell | No `null`; pending until unload |
| Register boot | params unresolved | Header plus form skeleton | Retryable route error |
| Register offline | `202 queued` | Persistent queued confirmation; session copy says attendance is not yet marked | Sync failure cannot overwrite queued result |
| Register failure | 409/non-OK/malformed/network | Values retained; distinct duplicate/server/unknown copy | Pending always clears |
| Payment pending | multipart active | Busy button; Back/method/file controls locked; handler blocks re-entry | No error shown while pending |
| Payment failure | rejection/network loss | Inputs retained; definitive rejection may retry | Network/invalid success is outcome-unknown |
| Reduced motion | preference enabled | Shapes/status remain; shimmer/spin absent | No motion dependency |

</frozen-after-approval>

## Code Map

- `apps/folk/app/globals.css` — semantic tokens; `@source "./**/*"` covers `app/_components/`.
- `apps/folk/app/{register/page,login/login-page-client}.tsx` — form/auth branches.
- `components/folk-home/` — FOLK-only state machine, header, submit, and hero geometry.
- `lib/auth-context.tsx`, `authz.ts`, `staff-dto.ts` — reuse `initialStaff`, staff resolution, DTO mapping via a FOLK-local wrapper.
- Reuse route-progress/navigation feedback and auth-form styles unchanged.

## Implementation Notes

Shimmer uses `transform`; `motion-reduce` hides only shimmer. Fallbacks reuse real Header/CourseHeader and existing geometry. Route errors use safe copy and `reset()`. Request-cache optional Home staff and seed only FOLK-local rendering.

## Tasks & Acceptance

**Acceptance Criteria:**
- Given affected cold routes, when async work is pending, then chrome and content-shaped skeletons are visible; rejected reads expose retryable FOLK errors.
- Given signed-in `/` with delayed client auth, then Portal is already visible with the correct role destination; anonymous users retain Staff Login.
- Given reduced motion, loaders retain shapes/status without animation.
- Given existing checks, then URLs, labels, APIs, theme/hydration remain unchanged and no Gita Life source or behavior changes.

**Execution:**
- [x] `apps/folk/app/_components/loading/` — add `Skeleton`, `SkeletonText`, `SkeletonAvatar`, `SkeletonCard`, `SkeletonTable`, `SkeletonList`, `SkeletonImage`, `ShimmerEffect`, `LoadingSpinner`, `InlineLoader`, `PageLoading`, `ButtonLoading`, `LoadingRegion`, and retryable route-error composition.
- [x] `apps/folk/app/_components/loading/` — compose auth-form and home-page skeletons.
- [x] `apps/folk/app/(home)/{page,loading,error}.tsx`, `staff.ts`, `home-auth-shell.tsx` — move Home into a route group; add fallbacks; resolve request-cached optional staff alongside locations; seed loading/final shells without changing global auth.
- [x] `apps/folk/app/register/{loading,error,page}.tsx` — replace null/text fallbacks; add busy button, persistent queued state, isolated sync failures, distinct failure copy.
- [x] `apps/folk/app/login/{loading,error}.tsx`, `login-page-client.tsx` — add skeleton/error shells; replace `null`; use busy buttons; keep verification pending until unload; offer Retry after bounded unresolved bootstrap.
- [x] `components/folk-home/course-header.tsx` — mount RouteProgressBar; start navigation only for ordinary Portal/Staff Login clicks.
- [x] `components/folk-home/payment-step.tsx` — use ButtonLoading/`aria-busy`; guard re-entry; lock conflicting controls; distinguish rejection from unknown outcome.
- [x] `e2e/specs/public-loading.spec.ts` — test Portal with delayed client auth, login boot/redirect, register outcomes, payment states, reduced motion; assert intercepted payloads.

## Verification

**Commands (expected to pass; list must enumerate the new spec):**
- `pnpm test:static`
- `pnpm test:unit`
- `pnpm test:e2e:list public-loading`
- `pnpm test:e2e public-loading`
- `pnpm test:e2e smoke && pnpm test:e2e:theme`
- `pnpm test:offline-queue --base-url http://127.0.0.1:3000`
- `pnpm test:e2e:determinism`
- `git diff --exit-code -- apps/gita-life`

**Manual checks:**
- Inspect affected routes at mobile/desktop in both themes and reduced motion.
- Cold Home/Register timing is not deterministic locally; report unverified unless observed. Preview checks must be non-destructive; local tests/single timings do not prove improvement.
