---
title: 'Show Session Name In Live Attendance'
type: 'bugfix'
created: '2026-05-05'
status: 'done'
route: 'one-shot'
---

# Show Session Name In Live Attendance

## Intent

**Problem:** The live attendance header showed the current date below "Live Attendance", which made the session-scoped dashboard less clear during active attendance windows.

**Approach:** Reuse the existing active session context and render the active session name as the subtitle, falling back to "No active session" when there is no live session.

## Suggested Review Order

- The dashboard subtitle now reflects the active session instead of today's date.
  [`live-attendance-dashboard.tsx:108`](../../components/live-attendance-dashboard.tsx#L108)
