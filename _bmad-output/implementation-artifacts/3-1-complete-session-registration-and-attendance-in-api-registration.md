# Story 3.1: Complete Session Registration And Attendance In `/api/registration`

Status: review

## Story

As a participant,
I want registration from a session link to also mark my attendance,
so that I get one clear result without a second mobile network round trip.

## Acceptance Criteria

1. Given a participant submits `/api/registration` with a valid `sessionId`, when the contact does not already exist, then the server creates the Contact with session-derived assigned preacher and location, and creates the linked Attendance record for the same session before returning success.
2. Given a participant submits `/api/registration` with a valid `sessionId`, when the Contact already exists and Attendance does not exist for that Contact plus Session, then the server creates only the missing Attendance record and returns a completed response without creating a duplicate Contact.
3. Given Attendance already exists for the Contact plus Session, when `/api/registration` handles the request, then the response treats duplicate attendance as a completed outcome and includes enough response data for the UI to show "registration complete and attendance marked" or equivalent.
4. Given Contact creation succeeds but Attendance creation fails transiently, when the same request is retried, then the server finds the existing Contact and attempts only the missing Attendance work and avoids duplicate Contact creation.
5. Given a submitted `sessionId` is invalid, closed, not public, or outside the attendance window, when `/api/registration` handles the request, then the server returns an explicit JSON error and no Attendance record is created.
6. Given `/attendance` and session-backed `/api/registration` both enforce session eligibility, when the developer implements the combined flow, then the two routes share a common session-window or attendance-eligibility helper, and validation behavior does not drift between attendance-only and registration-backed attendance.

## Tasks / Subtasks

- [x] Extract session eligibility/window validation from `app/attendance/route.ts` into a server-only helper reused by both routes. (AC: 5, 6)
- [x] Update `app/api/registration/route.ts` so a valid `sessionId` flow loads the session once, validates public/open/close gates, derives preacher and location from the session, and creates the Contact if needed. (AC: 1, 5)
- [x] After contact resolution, complete attendance server-side using `findAttendanceByContactAndSession()` and `createAttendanceRecord()`. (AC: 1, 2, 3, 4)
- [x] Make retry behavior idempotent across partial success. (AC: 2, 3, 4)
  - [x] Existing Contact plus missing Attendance creates only Attendance.
  - [x] Existing Contact plus existing Attendance returns a completed outcome, not a hard failure.
- [x] Return a stable JSON contract that `app/register/page.tsx` can use for one final success state. (AC: 3)
- [x] Preserve public offline queue compatibility for queued `/api/registration` requests that include `sessionId`. (AC: 1, 4)

## Dev Notes

- Current `app/api/registration/route.ts` creates a Contact and returns `409 alreadyRegistered` before doing attendance work. It derives session preacher/location for new contacts only.
- Current `app/register/page.tsx` compensates by calling `/attendance` after `/api/registration` succeeds or returns `409 alreadyRegistered` with a session id. This story moves that follow-up work into the server route.
- Current `app/attendance/route.ts` has a local `sessionWindowState()` helper. Extract it to avoid drift.
- Current `lib/airtable.ts` already has the necessary primitives: `findContactByPhone()`, `createContact()`, `findSessionById()`, `findAttendanceByContactAndSession()`, `createAttendanceRecord()`, and `normalizeMobile()`.
- Keep Indian mobile normalization to last 10 digits on both server and client boundaries.
- Attendance duplicate detection must remain Contact plus Session, not phone-only or date-only.
- Do not cache any contact lookup, duplicate attendance check, or write operation.
- Preserve `spec-preacher-scoped-contact-location.md`: session-backed registration should use the linked session location record id, not the public free-text location field.

### Project Structure Notes

- Keep public registration route at `app/api/registration/route.ts`.
- Keep public attendance route at `app/attendance/route.ts`; do not rename it to `/api/attendance`.
- Shared session eligibility helpers can live in `lib/airtable.ts` only if they are Airtable-adapter concerns; otherwise use a focused server-only module such as `lib/attendance-session.ts`.

### References

- [Source: _bmad-output/planning-artifacts/performance-responsiveness-epics.md#Story-3.1]
- [Source: _bmad-output/planning-artifacts/performance-responsiveness-epics.md#ADR-PR-003]
- [Source: _bmad-output/planning-artifacts/nextjs-supabase-staff-auth-plan.md#Attendance-Registration-Flow]
- [Source: app/api/registration/route.ts]
- [Source: app/attendance/route.ts]
- [Source: app/register/page.tsx]
- [Source: lib/airtable.ts]
- [Source: public/sw.js]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `pnpm exec tsc --noEmit` passed.
- `pnpm build` passed.
- Public `/register?session=recSmokeTest12345` rendered successfully from the dev server.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Added shared server-only session attendance eligibility validation.
- Updated `/api/registration` so session-backed submissions create/reuse Contact and create/reuse Attendance in one server request.
- Added a stable completed JSON contract with contact, attendance, registration outcome, and attendance outcome fields.
- Preserved idempotent retry behavior after partial Contact success.

### File List

- `lib/attendance-session.ts`
- `app/api/registration/route.ts`
- `app/attendance/route.ts`
- `lib/airtable.ts`
- `app/register/page.tsx`
- `public/sw.js`

### Change Log

- 2026-05-07: Completed session-backed registration and attendance in `/api/registration`.
