---
title: 'Preacher Dashboard Admin Airtable Interface'
type: 'feature'
created: '2026-05-05'
status: 'done'
route: 'one-shot'
context:
  - '{project-root}/_bmad-output/project-context.md'
---

# Preacher Dashboard Admin Airtable Interface

## Intent

**Problem:** Admin staff can reach the preacher/dashboard page, but there was no direct path from that surface into the Airtable interface dashboard for admin-level operations.

**Approach:** Add an Admin-only dashboard entry that builds an Airtable interface URL from `AIRTABLE_BASE_ID` and `AIRTABLE_INTERFACE_DASHBOARD_PAGE_ID`, defaulting the page id to `pagc77PtbNsr9ljWu`.

## Suggested Review Order

**Dashboard Entry**

- Builds the Airtable page URL on the server from non-secret env config.
  [`page.tsx:10`](../../app/dashboard/page.tsx#L10)

- Renders the Airtable admin flow only for active Admin staff.
  [`page.tsx:72`](../../app/dashboard/page.tsx#L72)

**Configuration**

- Documents the new Airtable interface page variable for local setup.
  [`development-guide.md:7`](../../docs/development-guide.md#L7)

- Carries the requested dashboard page id in the local env example.
  [`.env.example:19`](../../.env.example#L19)
