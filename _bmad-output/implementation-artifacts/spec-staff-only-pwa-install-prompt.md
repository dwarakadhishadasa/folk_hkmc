---
title: 'Staff-Only PWA Install Prompt'
type: 'bugfix'
created: '2026-05-05'
status: 'done'
route: 'one-shot'
---

# Staff-Only PWA Install Prompt

## Intent

**Problem:** The PWA install prompt was mounted globally and used browser install eligibility plus a global dismissal key, so public visitors could see or suppress it and staff users could miss it after auth changes.

**Approach:** Keep browser install eligibility detection mounted early, then render the bottom banner only after `useAuth()` hydrates an active staff session. Store the one-day dismissal under the staff Airtable record id and fix the served logo path.

## Suggested Review Order

- Auth gate keeps prompt staff-only without missing early install events.
  [`pwa-install-prompt.tsx:16`](../../components/pwa-install-prompt.tsx#L16)

- Browser eligibility still captures Chrome and iOS install paths before rendering.
  [`pwa-install-prompt.tsx:22`](../../components/pwa-install-prompt.tsx#L22)

- Staff-scoped dismissal prevents public/local stale suppression.
  [`pwa-install-prompt.tsx:57`](../../components/pwa-install-prompt.tsx#L57)

- Final render gate preserves bottom placement for authenticated staff only.
  [`pwa-install-prompt.tsx:114`](../../components/pwa-install-prompt.tsx#L114)

- Prompt asset now uses Next public path conventions.
  [`pwa-install-prompt.tsx:121`](../../components/pwa-install-prompt.tsx#L121)
