---
title: 'Disambiguate Participant and Staff Login Paths'
type: 'feature'
created: '2026-06-14'
status: 'done'
route: 'one-shot'
---

# Disambiguate Participant and Staff Login Paths

## Intent

**Problem:** Participants were mistaking staff login entry points for their next step, especially on the Gita Life public page where participant-facing copy linked to `/login`.

**Approach:** Keep `/login` available for authorized staff, but relabel it as staff-only, remove public participant CTAs that point there, and redirect participant intent toward registration or coordinator contact.

## Suggested Review Order

**Public Participant Path**

- The hero now keeps registration primary and sends questions to the coordinator.
  [`page.tsx:92`](../../apps/gita-life/app/page.tsx#L92)

- The lower CTA now reinforces registration instead of implying participant portal access.
  [`page.tsx:192`](../../apps/gita-life/app/page.tsx#L192)

**Staff-Only Login Recovery**

- The login page clearly names the staff portal before the form.
  [`login-page-client.tsx:150`](../../apps/gita-life/app/login/login-page-client.tsx#L150)

- Participant misclicks get an immediate registration path without blocking staff login.
  [`login-page-client.tsx:155`](../../apps/gita-life/app/login/login-page-client.tsx#L155)

**Header Labeling**

- Logged-out header auth is labeled as staff login and protected from wrapping.
  [`header.tsx:271`](../../components/header.tsx#L271)

- Gita Life tones the staff login button down inside the white header.
  [`globals.css:62`](../../apps/gita-life/app/globals.css#L62)
