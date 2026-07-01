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

**Approach:** Keep the inverse `Attendance Records` lookup as an optimization, but also scan today's Attendance rows and filter by their linked `Session` record IDs so session-scoped live attendance has a reliable source of truth.

## Suggested Review Order

**Session Attendance Lookup**

- Session-scoped reads now merge inverse Session attendance links with Attendance rows that link back to the Session.
  [`airtable.ts:850`](../../lib/airtable.ts#L850)

- Incremental refresh excludes already-known records across both lookup paths and deduplicates merged records.
  [`airtable.ts:827`](../../lib/airtable.ts#L827)

**Dashboard Row Normalization**

- Attendance dashboard rows still hydrate linked Contacts for session-scoped rows, preserving names and phone fallback.
  [`airtable.ts:876`](../../lib/airtable.ts#L876)

- Airtable display values now tolerate strings, numbers, arrays, and object-shaped collaborator/lookup values while rejecting raw record IDs as names.
  [`airtable.ts:256`](../../lib/airtable.ts#L256)

**Route Wiring**

- FOLK live attendance GET responses call the shared session lookup for both first load and incremental refresh.
  [`route.ts:143`](../../apps/folk/app/attendance/route.ts#L143)

- Gita Life stays aligned with the same session fallback behavior.
  [`route.ts:143`](../../apps/gita-life/app/attendance/route.ts#L143)

**Polling Bound**

- The dashboard sends a bounded known-ID set large enough to avoid refetching older attendance rows during larger live sessions.
  [`live-attendance-dashboard.tsx:31`](../../components/live-attendance-dashboard.tsx#L31)
