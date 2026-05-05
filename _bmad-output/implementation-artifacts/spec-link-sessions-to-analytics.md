---
title: 'Link Sessions to Analytics'
type: 'bugfix'
created: '2026-05-05'
status: 'done'
route: 'one-shot'
context:
  - '{project-root}/docs/data-models.md'
---

# Link Sessions to Analytics

## Intent

**Problem:** Newly created Airtable `Sessions` records were not linked to the singleton `Analytics` record, so session rollups in the Analytics table did not include app-created sessions.

**Approach:** Add the `Sessions.Analytics` linked-record field to the Airtable session adapter, default it to the documented singleton record, and expose an env override for non-production bases.

## Suggested Review Order

**Airtable Session Link**

- Session creation now writes the Analytics linked-record field.
  [`airtable.ts:513`](../../lib/airtable.ts#L513)

- The singleton record is centralized with an env override.
  [`airtable.ts:125`](../../lib/airtable.ts#L125)

- Session mapping now preserves Analytics links returned by Airtable.
  [`airtable.ts:462`](../../lib/airtable.ts#L462)

**Setup Notes**

- Local setup documents the Analytics record override.
  [`development-guide.md:42`](../../docs/development-guide.md#L42)

- The ignored local env example includes the override value.
  [`.env.example:17`](../../.env.example#L17)
