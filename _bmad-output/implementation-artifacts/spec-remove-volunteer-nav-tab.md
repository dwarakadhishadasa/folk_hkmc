---
title: 'Remove Volunteer Home Tab'
type: 'chore'
created: '2026-05-08'
status: 'done'
route: 'one-shot'
---

# Remove Volunteer Home Tab

## Intent

**Problem:** Volunteer navigation should keep the useful Contact button, but Home is redundant because the logo already links to `/`.

**Approach:** Keep Contact in authenticated navigation for all staff roles, preserve Admin/Preacher-only destinations, and leave Home out of the nav item list.

## Suggested Review Order

- Volunteer role keeps Contact; Admin/Preacher destinations remain additive.
  [`header.tsx:162`](../../components/header.tsx#L162)

- Mobile nav renders when Contact is present and still skips empty logged-out nav.
  [`header.tsx:240`](../../components/header.tsx#L240)
