# Story 5.1: Replace One-Second Session Timers With Deadline-Based Updates

Status: review

## Story

As a staff dashboard viewer,
I want session state to update only when meaningful,
so that the page remains responsive without needless re-renders.

## Acceptance Criteria

1. Given `LiveAttendanceDashboard` receives an active session close time, when it determines whether the session is active, then it schedules a deadline-based update at the close time or uses a lower-frequency update, and it no longer re-renders the whole dashboard every second solely to update `now`.
2. Given `SessionsManager` evaluates active sessions, when no user-visible second-by-second countdown is displayed, then it avoids a global one-second interval, and session active/inactive transitions still occur at the correct open or close boundary.
3. Given attendance polling runs every 20 seconds, when timer work is reduced, then the 20-second live attendance polling cadence is preserved, and the dashboard still feels live.
4. Given the active session expires while the page is open, when the deadline update fires, then the UI transitions to the no-active-session state without requiring a page refresh.

## Tasks / Subtasks

- [x] Replace the one-second `setInterval()` in `components/live-attendance-dashboard.tsx` with a deadline timeout or lower-frequency state update. (AC: 1, 3, 4)
  - [x] Clamp timeout delays safely for already-expired or invalid close times.
  - [x] Keep `hasActiveSession` accurate when the close time passes.
- [x] Replace the one-second global `setInterval()` in `components/sessions-manager.tsx` with deadline scheduling based on the nearest relevant open/close boundary. (AC: 2, 4)
  - [x] Recompute active session when `sessions` changes.
  - [x] Schedule the next update for the nearest future `attendanceOpensAt` or `attendanceClosesAt` boundary.
- [x] Preserve the existing 20-second attendance polling interval and visibility refresh behavior. (AC: 3)
- [x] Verify active session expiry transitions without refreshing the page. (AC: 4)

## Dev Notes

- Current `LiveAttendanceDashboard` stores `now` and updates it every second whenever an active session close time exists, but no visible second-by-second countdown is displayed.
- Current `SessionsManager` stores `now` and updates it every second globally to choose active sessions, again without visible second precision.
- `LiveAttendanceDashboard` has a separate 20-second polling interval for attendance data. Do not remove or slow that interval.
- `SessionsManager` chooses the latest active session by filtering `publicAttendanceEnabled`, open/close boundaries, and sorting by start time.
- Use cleanup-safe React effects so route changes, session changes, and Strict Mode do not leave stale timers.

### Project Structure Notes

- Timer state lives in client components; keep these files marked `"use client"`.
- Do not introduce a global state library for this narrow scheduling change.

### References

- [Source: _bmad-output/planning-artifacts/performance-responsiveness-epics.md#Story-5.1]
- [Source: components/live-attendance-dashboard.tsx]
- [Source: components/sessions-manager.tsx]
- [Source: _bmad-output/implementation-artifacts/spec-show-session-name-live-attendance.md]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `pnpm exec tsc --noEmit` passed.
- `pnpm build` passed.
- Code search confirmed the one-second intervals were removed from `LiveAttendanceDashboard` and `SessionsManager`; the 20-second attendance poll remains.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Replaced the dashboard close-time one-second timer with a clamped close-deadline timeout.
- Replaced the sessions manager global one-second interval with nearest open/close boundary scheduling.
- Preserved the 20-second attendance polling interval and visibility refresh behavior.

### File List

- `components/live-attendance-dashboard.tsx`
- `components/sessions-manager.tsx`

### Change Log

- 2026-05-07: Replaced one-second session timers with boundary-based updates.
