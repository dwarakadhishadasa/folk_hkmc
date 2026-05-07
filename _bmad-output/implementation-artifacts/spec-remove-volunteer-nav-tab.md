---
title: 'Remove Volunteer Nav Tab'
type: 'chore'
created: '2026-05-08'
status: 'done'
route: 'one-shot'
---

# Remove Volunteer Nav Tab

## Intent

**Problem:** Volunteer navigation had a single app tab for a journey that should stay limited to the contact form. With no alternate Volunteer destinations, the tab was redundant.

**Approach:** Build header app navigation only for Admin and Preacher users, and render the mobile bottom nav only when there are actual navigation items.

## Suggested Review Order

- Volunteer role now produces no app nav items; Admin/Preacher destinations remain unchanged.
  [`header.tsx:162`](../../components/header.tsx#L162)

- Mobile bottom nav no longer renders an empty fixed shell when Volunteer nav is empty.
  [`header.tsx:240`](../../components/header.tsx#L240)
