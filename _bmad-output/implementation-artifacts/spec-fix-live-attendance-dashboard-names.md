---
title: 'Fix Live Attendance Dashboard Names'
type: 'bugfix'
created: '2026-07-01'
status: 'done'
route: 'one-shot'
---

# Fix Live Attendance Dashboard Names

## Intent

**Problem:** The live attendance dashboard could receive attendance rows without a plain string `Name` value, causing attendee names to fall back to `Unknown` or render unreliably even when the linked Contact record had the correct name.

**Approach:** Normalize dashboard attendance rows in the shared Airtable server helper, use linked Contact names for session-scoped live attendance, and keep date-only attendance reads on raw Attendance fields.

## Suggested Review Order

**Dashboard Row Normalization**

- Attendance dashboard rows now resolve names and phone numbers through Attendance fields first, then linked Contact records.
  [`airtable.ts:828`](../../lib/airtable.ts#L828)

- Airtable display values now tolerate strings, numbers, arrays, and object-shaped collaborator/lookup values while rejecting raw record IDs as names.
  [`airtable.ts:256`](../../lib/airtable.ts#L256)

**Route Wiring**

- FOLK live attendance GET responses hydrate Contacts only for session-scoped live attendance.
  [`route.ts:155`](../../apps/folk/app/attendance/route.ts#L155)

- Gita Life stays aligned with the same session-scoped hydration behavior.
  [`route.ts:155`](../../apps/gita-life/app/attendance/route.ts#L155)

**Polling Bound**

- The dashboard sends a bounded known-ID set large enough to avoid refetching older attendance rows during larger live sessions.
  [`live-attendance-dashboard.tsx:31`](../../components/live-attendance-dashboard.tsx#L31)
