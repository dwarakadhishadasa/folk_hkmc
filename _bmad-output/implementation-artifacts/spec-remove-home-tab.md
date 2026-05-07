---
title: 'Remove Home Tab'
type: 'chore'
created: '2026-05-07'
status: 'done'
route: 'one-shot'
---

# Remove Home Tab

## Intent

**Problem:** The header navigation includes a Home tab that duplicates the logo link to `/`, adding redundant top-level navigation.

**Approach:** Remove Home from authenticated and logged-out navigation while preserving the logo link and direct homepage route access.

## Suggested Review Order

- Header nav now starts with actionable app destinations, not duplicated home access.
  [`header.tsx:108`](../../components/header.tsx#L108)

- Logged-out header avoids rendering an empty desktop navigation shell.
  [`header.tsx:146`](../../components/header.tsx#L146)
