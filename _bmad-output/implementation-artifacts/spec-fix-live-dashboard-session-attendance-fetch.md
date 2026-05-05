---
title: 'Fix Live Dashboard Session Attendance Fetch'
type: 'bugfix'
created: '2026-05-05'
status: 'done'
route: 'one-shot'
context:
  - '{project-root}/docs/data-models.md'
---

# Fix Live Dashboard Session Attendance Fetch

## Intent

**Problem:** After a session starts, the live dashboard switches to session-scoped polling, but the Airtable formula used by the helper searched linked-record display text for the raw session record id and returned no attendance rows.

**Approach:** Preserve the session's inverse `Attendance Records` links from Airtable, fetch those attendance rows by `RECORD_ID()`, and reuse the same linked-id comparison for duplicate detection.

## Suggested Review Order

**Session-Scoped Attendance Reads**

- Session records now preserve inverse attendance links returned by Airtable.
  [`airtable.ts:38`](../../lib/airtable.ts#L38)

- Linked attendance ids are fetched by exact Airtable record id, in bounded batches.
  [`airtable.ts:258`](../../lib/airtable.ts#L258)

- Dashboard session polling now reads attendance through the session's linked attendance records.
  [`airtable.ts:602`](../../lib/airtable.ts#L602)

**Duplicate Detection**

- Duplicate attendance checks now compare linked `Contact` ids from fetched session attendance rows.
  [`airtable.ts:573`](../../lib/airtable.ts#L573)
