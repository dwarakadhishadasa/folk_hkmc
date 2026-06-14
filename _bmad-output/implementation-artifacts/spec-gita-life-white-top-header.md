---
title: 'Make Gita Life Top Header White'
type: 'feature'
created: '2026-06-14'
status: 'done'
route: 'one-shot'
---

# Make Gita Life Top Header White

## Intent

**Problem:** Gita Life should use a white top header instead of inheriting the shared dark program-primary header treatment.

**Approach:** Add fallback-backed header theme hooks to the shared header, define Gita Life-specific white header tokens, and align Gita Life PWA theme metadata with the white top chrome.

## Suggested Review Order

**Theme Contract**

- Fallback aliases keep the shared header safe outside Gita Life overrides.
  [`header.tsx:162`](../../components/header.tsx#L162)

- Gita Life owns the white header palette and contrast states.
  [`globals.css:42`](../../apps/gita-life/app/globals.css#L42)

**Top Header Behavior**

- Desktop nav states now read the header palette instead of dark-header constants.
  [`header.tsx:104`](../../components/header.tsx#L104)

- Header shell and logo tile use the resolved white-header variables.
  [`header.tsx:228`](../../components/header.tsx#L228)

- Login and logout controls share the same header focus system.
  [`header.tsx:263`](../../components/header.tsx#L263)

**Supporting Chrome**

- Browser/PWA viewport chrome follows the white Gita Life header.
  [`layout.tsx:35`](../../apps/gita-life/app/layout.tsx#L35)

- Installed app manifest also advertises the white theme color.
  [`manifest.ts:11`](../../apps/gita-life/app/manifest.ts#L11)

- Out-of-scope review leftovers are tracked for later.
  [`deferred-work.md:5`](deferred-work.md#L5)
