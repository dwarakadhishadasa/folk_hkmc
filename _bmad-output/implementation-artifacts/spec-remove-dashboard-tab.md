---
title: 'Remove Dashboard Tab'
type: 'chore'
created: '2026-05-05'
status: 'done'
route: 'one-shot'
---

# Remove Dashboard Tab

## Intent

**Problem:** The preacher navigation includes a Dashboard tab that duplicates attendance visibility now available through Sessions, adding avoidable top-level clutter.

**Approach:** Remove the `/dashboard` link from the authenticated preacher header navigation while preserving the route and dashboard component for direct access and existing integrations.

## Suggested Review Order

- Preacher navigation now starts with Sessions while the Dashboard route remains untouched.
  [`header.tsx:51`](../../components/header.tsx#L51)
