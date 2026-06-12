---
title: 'Connect Admin Invite Button'
type: 'bugfix'
created: '2026-06-11'
status: 'done'
route: 'one-shot'
---

# Connect Admin Invite Button

## Intent

**Problem:** The shared Invite nav item sent Admin users to `/volunteers`, so the Admin Invite button did not open the staff invite flow.

**Approach:** Make the Invite nav target role-aware: Admin users go to `/admin/invite`, while non-admin preacher access continues to use `/volunteers`.

## Suggested Review Order

- Review the role-aware invite target and unchanged non-admin fallback.
  [`header.tsx:158`](../../components/header.tsx#L158)
