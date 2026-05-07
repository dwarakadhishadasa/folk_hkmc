# Story 6.1: Capture Before-And-After Responsiveness Evidence

Status: review

## Story

As a product owner,
I want lightweight evidence that the responsiveness changes reduced repeated work,
so that the improvement is verifiable instead of subjective.

## Acceptance Criteria

1. Given the developer begins implementation, when they inspect the current protected page load behavior, then they record the baseline repeated calls or code paths for `/contact`, `/sessions`, and session-backed `/register`, and the notes identify duplicate auth/profile calls and relevant Airtable reads.
2. Given the developer needs to prove Airtable staff lookup is no longer hidden in the protected-page hot path, when verification is performed, then acceptable evidence includes code-path review, local debug counters, server logs, temporary instrumentation, or tests/stubs/spies around Airtable staff lookup helpers, and the chosen evidence is summarized in the completion notes.
3. Given Epic 1 and Epic 2 changes are implemented, when `/contact` and `/sessions` load as an authenticated staff user, then the verification notes show that normal protected page auth no longer calls Airtable staff lookup, and Locations and active Preachers use the intended cached helpers.
4. Given Epic 3 changes are implemented, when session-backed `/register` submits successfully, then the verification notes show one browser-facing registration request rather than a registration request followed by an attendance request.
5. Given Epic 5 changes are implemented, when the dashboard and offline indicator are open, then the verification notes show that one-second timer and 5-second pending-count polling work has been removed or reduced as specified.

## Tasks / Subtasks

- [x] Capture baseline evidence before implementing or while reviewing the existing code paths. (AC: 1)
  - [x] `/contact`: server `getStaffContext()`, reference data reads, client `/api/auth/me` hydration.
  - [x] `/sessions`: server `getStaffContext()`, location reads, client `/api/auth/me` hydration.
  - [x] session-backed `/register`: `/api/registration` followed by browser `/attendance`.
- [x] Capture after evidence for Epic 1 auth hot path and auth seeding. (AC: 2, 3)
- [x] Capture after evidence for Epic 2 cached reference helpers. (AC: 3)
- [x] Capture after evidence for Epic 3 single browser-facing registration request. (AC: 4)
- [x] Capture after evidence for Epic 5 timer and pending-count reductions. (AC: 5)
- [x] Summarize evidence in the relevant story completion notes and final implementation report. (AC: 1-5)

## Dev Notes

- Evidence can be lightweight. Good options: code path notes, temporary console/server counters removed before final, local logs, request screenshots, or focused tests/stubs if a test harness is added.
- Avoid fake precision. If there is no production tracing, document the method and observed call paths rather than inventing timings.
- For auth hot path, the key proof is that normal protected page rendering no longer calls `findStaffUserByEmail()`, `findStaffUserById()` for auth fallback, `syncStaffProfileByEmail()`, or `syncStaffSupabaseUserId()`.
- For reference caching, the key proof is that page option lists use cached helpers while writes and duplicate checks remain uncached.
- For registration, the key proof is browser network flow: one POST to `/api/registration` for session-backed registration and no follow-up POST to `/attendance`.
- For timers, the key proof is code path review plus local observation that one-second dashboard/session intervals and 5-second pending polling are gone.

### Project Structure Notes

- Store durable evidence in story completion notes, a performance note, or implementation report under `_bmad-output/implementation-artifacts/`.
- Remove temporary instrumentation before reporting completion unless the team intentionally wants debug counters retained.

### References

- [Source: _bmad-output/planning-artifacts/performance-responsiveness-epics.md#Story-6.1]
- [Source: lib/authz.ts]
- [Source: app/contact/page.tsx]
- [Source: app/sessions/page.tsx]
- [Source: app/register/page.tsx]
- [Source: components/live-attendance-dashboard.tsx]
- [Source: components/offline-indicator.tsx]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- Evidence captured in `_bmad-output/implementation-artifacts/performance-responsiveness-implementation-report.md`.
- `pnpm exec tsc --noEmit` passed.
- `pnpm build` passed.
- Code searches reviewed removal of duplicate auth sync paths, registration follow-up `/attendance`, one-second timers, and 5-second pending polling.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Captured baseline and after evidence for protected-page auth, cached reference reads, registration-backed attendance, timer reductions, and pending-count refresh.
- Final report records command results, local route smoke, blocked manual role coverage, and residual risks.

### File List

- `_bmad-output/implementation-artifacts/performance-responsiveness-implementation-report.md`
- `lib/authz.ts`
- `lib/auth-context.tsx`
- `components/staff-auth-shell.tsx`
- `lib/airtable.ts`
- `app/contact/page.tsx`
- `app/sessions/page.tsx`
- `app/api/registration/route.ts`
- `app/register/page.tsx`
- `components/live-attendance-dashboard.tsx`
- `components/sessions-manager.tsx`
- `components/offline-indicator.tsx`
- `public/sw.js`

### Change Log

- 2026-05-07: Captured responsiveness baseline/after evidence and final implementation report.
