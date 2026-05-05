---
title: 'Preacher Manage Airtable Interface'
type: 'feature'
created: '2026-05-05'
status: 'done'
route: 'one-shot'
context:
  - '{project-root}/_bmad-output/project-context.md'
---

# Preacher Manage Airtable Interface

## Intent

**Problem:** Admin and Preacher staff need a top-level Manage navigation tab that opens the Airtable interface dashboard without placing that flow inside Live Attendance.

**Approach:** Add a `/manage` route for Admin and Preacher staff that builds the Airtable interface URL from `AIRTABLE_BASE_ID` and `AIRTABLE_INTERFACE_DASHBOARD_PAGE_ID`, defaulting the page id to `pagc77PtbNsr9ljWu`, then point the header's Manage tab at that route.

## Suggested Review Order

**Manage Route**

- Builds and redirects to the Airtable page after server-side Admin/Preacher authorization.
  [`page.tsx:7`](../../app/manage/page.tsx#L7)

- Keeps Live Attendance focused on the dashboard content only.
  [`page.tsx:68`](../../app/dashboard/page.tsx#L68)

**Navigation**

- Sends the visible Manage tab to the new gated Airtable redirect route.
  [`header.tsx:71`](../../components/header.tsx#L71)

**Configuration**

- Documents the new Airtable interface page variable for local setup.
  [`development-guide.md:7`](../../docs/development-guide.md#L7)

- Carries the requested dashboard page id in the local env example.
  [`.env.example:19`](../../.env.example#L19)
