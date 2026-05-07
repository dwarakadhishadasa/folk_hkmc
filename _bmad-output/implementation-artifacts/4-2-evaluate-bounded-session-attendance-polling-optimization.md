# Story 4.2: Evaluate Bounded Session Attendance Polling Optimization

Status: review

## Story

As a staff dashboard viewer,
I want live attendance refreshes to avoid unnecessary repeated processing when there is a measurable win,
so that the dashboard stays live without adding fragile Airtable complexity.

## Acceptance Criteria

1. Given Story 4.1 has removed duplicate session reads, when the developer evaluates further live polling optimization, then they document whether Airtable can support a safe new-only or bounded response improvement without increasing complexity, and implementation may be deferred if no measurable or reliable win is found.
2. Given `LiveAttendanceDashboard` has already rendered attendance records for an active session, when a safe optimization is implemented, then the client may send a bounded known-record hint such as known attendance ids or a safe cursor-like value, and the route returns only new records when the hint can be applied safely.
3. Given the known-record hint is missing, too large, malformed, or unsafe, when `/attendance` handles the request, then it falls back to the existing full session attendance response, and still returns the stable dashboard response shape.
4. Given new attendance is created during an active session, when the next 20-second poll runs, then the new record appears in the dashboard, and existing records are not duplicated in client state.
5. Given the dashboard tab is hidden, when polling would otherwise run, then the existing hidden-document guard remains in place, and refresh resumes when the tab becomes visible.

## Tasks / Subtasks

- [x] Measure or reason from code whether additional bounded polling after Story 4.1 is worth implementing. (AC: 1)
  - [x] Document the decision in completion notes even if implementation is deferred.
- [x] If implementing, add a bounded known-record hint to `LiveAttendanceDashboard` fetches. (AC: 2)
  - [x] Keep the hint small and safe, such as a capped list of known attendance ids.
  - [x] Avoid exposing sensitive server-only data.
- [x] Update `GET /attendance?session=<id>` to validate the hint and return only new records when safe. (AC: 2, 3)
- [x] Preserve fallback to full session attendance response for missing, malformed, or excessive hints. (AC: 3)
- [x] Preserve client de-duplication by Airtable record id and the existing `document.hidden` guard. (AC: 4, 5)

## Dev Notes

- This story is intentionally evaluative. A "defer with evidence" outcome is acceptable if the added protocol would be more fragile than beneficial.
- Current `components/live-attendance-dashboard.tsx` polls every 20 seconds, skips while `document.hidden`, and merges new records by `record.id`.
- Current `/attendance` response shape is consumed by the dashboard and must remain stable even if only new records are returned.
- Airtable linked attendance ids come from the Session inverse `Attendance Records` field. If this field ordering or availability is not reliable for cursor semantics, prefer no change or a known-id filter approach.
- Do not reduce the 20-second poll cadence in this story. The performance goal is less repeated processing, not less live feedback.

### Project Structure Notes

- Client polling logic lives in `components/live-attendance-dashboard.tsx`.
- Session-scoped dashboard read logic lives in `app/attendance/route.ts`.
- Airtable batch helpers live in `lib/airtable.ts`.

### References

- [Source: _bmad-output/planning-artifacts/performance-responsiveness-epics.md#Story-4.2]
- [Source: _bmad-output/planning-artifacts/performance-responsiveness-epics.md#ADR-PR-004]
- [Source: components/live-attendance-dashboard.tsx]
- [Source: app/attendance/route.ts]
- [Source: lib/airtable.ts]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `pnpm exec tsc --noEmit` passed.
- `pnpm build` passed.
- Code-path review confirmed known-id hints are capped at 100 Airtable record ids and malformed hints fall back to full reads.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Implemented the safe bounded optimization because Session inverse attendance ids are already available after Story 4.1.
- `LiveAttendanceDashboard` sends a capped known attendance id list; `/attendance` validates it and fetches only linked ids that are not yet known.
- Existing client de-duplication and `document.hidden` polling guard remain intact.

### File List

- `components/live-attendance-dashboard.tsx`
- `app/attendance/route.ts`
- `lib/airtable.ts`

### Change Log

- 2026-05-07: Added bounded known-attendance-id polling optimization with safe fallback.
