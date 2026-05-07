# Story 4.1: Reuse Loaded Session Context During Attendance Requests

Status: review

## Story

As a participant or staff dashboard viewer,
I want attendance requests to avoid repeated session reads,
so that attendance actions and dashboard refreshes return faster.

## Acceptance Criteria

1. Given `POST /attendance` loads a Session to validate attendance gates, when duplicate attendance detection runs, then it reuses the loaded Session or its `attendanceRecordIds`, and it does not fetch the same Session a second time through `getAttendanceBySession()`.
2. Given `GET /attendance?session=<id>` loads a Session for staff scope checks, when it reads linked attendance records, then it reuses the loaded Session or its `attendanceRecordIds`, and preserves Admin and Preacher scope validation.
3. Given no linked attendance records exist for a valid Session, when attendance is read, then the route returns an empty array quickly, and does not perform unnecessary Airtable attendance-record batch reads.
4. Given the attendance response is consumed by `LiveAttendanceDashboard`, when this refactor is complete, then returned records still include stable `id`, `mobile`, `userName`, and `createdAt` fields.

## Tasks / Subtasks

- [x] Add helper support in `lib/airtable.ts` to read attendance records from an already-loaded `SessionRecord` or from a supplied `attendanceRecordIds` array. (AC: 1, 2, 3)
- [x] Update `findAttendanceByContactAndSession()` or add an overload/helper so `POST /attendance` can reuse the session loaded for window validation. (AC: 1)
- [x] Update `GET /attendance?session=<id>` to reuse the session loaded for staff scope checks instead of calling `getAttendanceBySession(sessionId)` and refetching the same session. (AC: 2)
- [x] Ensure empty `attendanceRecordIds` short-circuit to `[]` without Airtable batch lookup. (AC: 3)
- [x] Preserve the dashboard response shape exactly: `id`, `mobile`, `userName`, `createdAt`. (AC: 4)

## Dev Notes

- Current `app/attendance/route.ts` POST loads `findSessionById(sessionId)` for gates, then calls `findAttendanceByContactAndSession(contact.id, sessionId)`, which calls `getAttendanceBySession(sessionId)`, which calls `findSessionById(sessionId)` again.
- Current `app/attendance/route.ts` GET loads `findSessionById(sessionId)` for scope checks, then calls `getAttendanceBySession(sessionId)`, which again loads the session.
- Current `lib/airtable.ts` already preserves `SessionRecord.attendanceRecordIds` and uses exact Airtable `RECORD_ID()` batch fetching through `listRecordsByIds()`. Reuse that pattern from `spec-fix-live-dashboard-session-attendance-fetch.md`.
- Do not go back to formulas that search linked-record display text for raw session ids; that was the bug fixed in the previous implementation artifact.
- Keep attendance reads uncached; this story removes duplicate work inside a request, not live data freshness.
- Preserve Admin/Preacher dashboard scope logic in GET `/attendance`.

### Project Structure Notes

- Keep Airtable record-fetch helpers in `lib/airtable.ts`.
- Keep route-specific authorization and JSON response shaping in `app/attendance/route.ts`.

### References

- [Source: _bmad-output/planning-artifacts/performance-responsiveness-epics.md#Story-4.1]
- [Source: _bmad-output/implementation-artifacts/spec-fix-live-dashboard-session-attendance-fetch.md]
- [Source: app/attendance/route.ts]
- [Source: lib/airtable.ts]
- [Source: components/live-attendance-dashboard.tsx]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `pnpm exec tsc --noEmit` passed.
- `pnpm build` passed.
- Code-path review confirmed `POST /attendance` and session-scoped `GET /attendance` pass already-loaded `SessionRecord` data into attendance helpers.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Added attendance helpers that read from an already-loaded session or supplied attendance record ids.
- Updated attendance duplicate checks and dashboard reads to avoid reloading the same Session inside the request.
- Preserved empty attendance short-circuit and stable dashboard response fields.

### File List

- `lib/airtable.ts`
- `app/attendance/route.ts`

### Change Log

- 2026-05-07: Reused loaded Session context during attendance duplicate checks and dashboard reads.
