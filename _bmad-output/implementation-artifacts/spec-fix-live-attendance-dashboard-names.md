---
title: 'Fix Live Attendance Dashboard Session Rows'
type: 'bugfix'
created: '2026-07-01'
status: 'done'
route: 'one-shot'
---

# Fix Live Attendance Dashboard Session Rows

## Intent

**Problem:** The live attendance dashboard could show `0` and "No attendance recorded yet" even after students marked attendance when the Airtable Session record did not return populated inverse `Attendance Records` links.

**Approach:** Keep the inverse `Attendance Records` lookup as the efficient path, but also scan Attendance rows created during the session attendance window and filter by linked `Session` record IDs when inverse links are empty or stale.

## Suggested Review Order

**Session Attendance Lookup**

- Session-scoped reads now merge inverse Session attendance links with Attendance rows that link back to the Session.
  [`airtable.ts:865`](../../lib/airtable.ts#L865)

- The fallback is bounded to the session attendance window, or the session date when no window exists.
  [`airtable.ts:821`](../../lib/airtable.ts#L821)

- Incremental refresh excludes already-known records across both lookup paths and deduplicates merged records.
  [`airtable.ts:842`](../../lib/airtable.ts#L842)

**Dashboard Row Normalization**

- Attendance dashboard rows hydrate linked Contacts for session-scoped rows, preserving names and phone fallback.
  [`airtable.ts:895`](../../lib/airtable.ts#L895)

- Airtable display values tolerate strings, numbers, arrays, and object-shaped collaborator/lookup values while rejecting raw record IDs as names.
  [`airtable.ts:256`](../../lib/airtable.ts#L256)

**Route Wiring**

- FOLK live attendance GET responses call the shared session lookup for both first load and incremental refresh.
  [`route.ts:139`](../../apps/folk/app/attendance/route.ts#L139)

- Gita Life stays aligned with the same session fallback behavior.
  [`route.ts:139`](../../apps/gita-life/app/attendance/route.ts#L139)

**Polling Bound**

- The dashboard sends a bounded known-ID set large enough to avoid refetching older attendance rows during larger live sessions.
  [`live-attendance-dashboard.tsx:31`](../../components/live-attendance-dashboard.tsx#L31)
