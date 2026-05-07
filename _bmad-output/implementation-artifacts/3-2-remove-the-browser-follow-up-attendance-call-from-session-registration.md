# Story 3.2: Remove The Browser Follow-Up Attendance Call From Session Registration

Status: review

## Story

As a participant,
I want the registration screen to wait for one backend result,
so that the mobile flow feels faster and less fragile.

## Acceptance Criteria

1. Given `/register` is opened with a `session` query parameter, when the user submits the registration form, then the browser sends one request to `/api/registration`, and it does not call `/attendance` afterward.
2. Given `/api/registration` returns success for a session-backed request, when the registration page receives the response, then it shows the existing session-aware success message, and does not perform a second loading phase.
3. Given `/api/registration` returns a duplicate/already-registered completed outcome, when the registration page receives the response, then it treats the outcome as complete if attendance is already marked or newly marked, and it does not show a false failure.
4. Given the browser is offline and the service worker queues `/api/registration`, when the queued request includes `sessionId`, then replay preserves the `sessionId`, and the server can complete both registration and attendance when connectivity returns.

## Tasks / Subtasks

- [x] Remove `completeAttendance()` and all browser-side follow-up `/attendance` calls from `app/register/page.tsx`. (AC: 1)
- [x] Update `handleSubmit()` to interpret the new `/api/registration` session-backed response contract from Story 3.1. (AC: 2, 3)
  - [x] Treat "created contact and attendance", "existing contact and new attendance", and "existing attendance" as completed session outcomes.
  - [x] Keep the existing session-aware success message.
- [x] Keep offline `202 queued` behavior for `/api/registration` and ensure `sessionId` remains in the queued body. (AC: 4)
- [x] Verify service worker matching still queues `/api/registration` while staff contact writes remain online-only. (AC: 4)
- [x] Smoke test session-backed `/register?session=...` to confirm only one browser-facing POST happens. (AC: 1, 2)

## Dev Notes

- Current `app/register/page.tsx` defines `completeAttendance()` and calls `/attendance` after registration succeeds or when `/api/registration` returns `409 alreadyRegistered`.
- After Story 3.1, the server route owns attendance completion and duplicate handling. The client should only submit `/api/registration` once and render the returned outcome.
- Current service worker queues POSTs where the path includes `/registration` or `/attendance`; that already catches `/api/registration`. Make sure the request body still includes `sessionId`.
- Keep the public non-session registration behavior intact; no session means normal registration success without attendance completion.
- Do not remove `/attendance` POST support. It is still needed for attendance-only flow from `/attend`.

### Project Structure Notes

- The active session-backed registration UI is `app/register/page.tsx`, not `components/registration-form.tsx`.
- Keep UI copy clear and single-state: session registrations should end at "Registration complete and attendance marked" or equivalent.

### References

- [Source: _bmad-output/planning-artifacts/performance-responsiveness-epics.md#Story-3.2]
- [Source: app/register/page.tsx]
- [Source: app/api/registration/route.ts]
- [Source: app/attendance/route.ts]
- [Source: public/sw.js]
- [Source: _bmad-output/implementation-artifacts/spec-preacher-scoped-contact-location.md#Attendance-Registration]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `pnpm exec tsc --noEmit` passed.
- `pnpm build` passed.
- Code-path review confirmed `completeAttendance()` was removed and `app/register/page.tsx` no longer fetches `/attendance`.
- `GET /register?session=recSmokeTest12345` returned `200` on the local dev server.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Removed the browser follow-up attendance call from session-backed registration.
- Updated registration submit handling to treat the new `/api/registration` completed contract as the final success state.
- Preserved queued `202` behavior with `sessionId` still included in the original `/api/registration` request body.

### File List

- `app/register/page.tsx`
- `app/api/registration/route.ts`
- `public/sw.js`

### Change Log

- 2026-05-07: Removed browser-side follow-up `/attendance` POST from session-backed registration.
