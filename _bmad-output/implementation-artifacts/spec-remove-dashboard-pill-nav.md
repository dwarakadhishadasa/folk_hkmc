---
title: 'Remove Dashboard Pill Nav'
type: 'feature'
created: '2026-06-14'
status: 'done'
route: 'one-shot'
---

# Remove Dashboard Pill Nav

## Intent

**Problem:** The shared program header still shows a Dashboard pill nav item for preacher-level users, and it appears in both FOLK and Gita Life because both apps use the same header component.

**Approach:** Remove the Dashboard entry from the shared header nav list and drop its unused icon import, leaving the dashboard route and redirects untouched.

## Suggested Review Order

- The shared nav list now starts at Contact for logged-in users.
  [`header.tsx:194`](../../components/header.tsx#L194)

- The dashboard icon import was removed with the nav item.
  [`header.tsx:7`](../../components/header.tsx#L7)
