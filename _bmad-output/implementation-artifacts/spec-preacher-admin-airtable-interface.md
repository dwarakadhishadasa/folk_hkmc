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

**Problem:** Admin staff need a top-level Admin navigation tab that opens the Airtable interface dashboard for admin-level operations without placing that flow inside Live Attendance.

**Approach:** Add an Admin-only `/admin` route that builds the Airtable interface URL from `AIRTABLE_BASE_ID` and `AIRTABLE_INTERFACE_DASHBOARD_PAGE_ID`, defaulting the page id to `pagc77PtbNsr9ljWu`, then point the header's Admin tab at that route.

## Suggested Review Order

**Admin Route**

- Builds and redirects to the Airtable page after server-side Admin authorization.
  [`page.tsx:7`](../../app/admin/page.tsx#L7)

- Keeps Live Attendance focused on the dashboard content only.
  [`page.tsx:68`](../../app/dashboard/page.tsx#L68)

**Navigation**

- Sends the visible Admin tab to the new gated Airtable redirect route.
  [`header.tsx:72`](../../components/header.tsx#L72)

**Configuration**

- Documents the new Airtable interface page variable for local setup.
  [`development-guide.md:7`](../../docs/development-guide.md#L7)

- Carries the requested dashboard page id in the local env example.
  [`.env.example:19`](../../.env.example#L19)
