---
title: 'Link Attendance to Analytics'
type: 'bugfix'
created: '2026-05-05'
status: 'done'
route: 'one-shot'
context:
  - '{project-root}/docs/data-models.md'
---

# Link Attendance to Analytics

## Intent

**Problem:** Newly created Airtable `Attendance` records were not linked to the singleton `Analytics` record, so Analytics could not directly include app-created attendance rows.

**Approach:** Add the missing live Airtable `Attendance.Analytics` linked-record field and update the attendance creation adapter to populate it with the configured singleton Analytics record.

## Suggested Review Order

**Airtable Attendance Link**

- Attendance creation now writes the Analytics linked-record field.
  [`airtable.ts:591`](../../lib/airtable.ts#L591)

- Attendance field typing now includes the new linked-record field.
  [`airtable.ts:29`](../../lib/airtable.ts#L29)

**Schema Notes**

- The model diagram now shows Attendance linked to Analytics.
  [`data-models.md:38`](../../docs/data-models.md#L38)

- Attendance and Analytics field lists document the new relationship.
  [`data-models.md:131`](../../docs/data-models.md#L131)
