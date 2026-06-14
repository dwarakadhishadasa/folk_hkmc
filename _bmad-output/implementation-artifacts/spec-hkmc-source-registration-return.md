---
title: 'HKMC Source Registration Return'
type: 'feature'
created: '2026-06-14'
status: 'done'
route: 'one-shot'
---

# HKMC Source Registration Return

## Intent

**Problem:** Participants who arrive from the HKMC Gita Life page need a clear post-registration path back to the main HKM Chennai website without seeing extra secondary actions.

**Approach:** Detect the `source=hkmc-gita-life` registration query parameter and, only after successful registration, show a single primary "Visit HKM Chennai" button linked to `https://hkmchennai.org`.

## Suggested Review Order

- Source-aware success state gates the HKMC return action to registrations that include `source=hkmc-gita-life`.
  [`page.tsx:19`](../../apps/gita-life/app/register/page.tsx#L19)

- The successful registration screen now shows the single requested "Visit HKM Chennai" primary action for that source.
  [`page.tsx:129`](../../apps/gita-life/app/register/page.tsx#L129)
