---
title: 'Refine Gita Life Hero Branding'
type: 'feature'
created: '2026-06-14'
status: 'done'
route: 'one-shot'
---

# Refine Gita Life Hero Branding

## Intent

**Problem:** The Gita Life landing page carried extra presenter text, a framed Gita Life header logo, and a hero image/quote treatment that felt less aligned with the public HKM Chennai Gita Life page.

**Approach:** Use a plain ISKCON Thiruvanmiyur header wordmark, make the Gita Life course logo the dominant hero brand, soften the course-title text into a supporting saffron quote, and present the Krishna-Arjuna image with a cleaned crop, themed border, and integrated quote overlay.

## Suggested Review Order

**Hero Hierarchy**

- Brand mark now leads; course title becomes a quieter supporting line.
  [`page.tsx:65`](../../apps/gita-life/app/page.tsx#L65)

- Cleaned full-composition artwork preserves Arjuna while supporting the quote overlay.
  [`page.tsx:96`](../../apps/gita-life/app/page.tsx#L96)

**Header Identity**

- Gita Life header owns a plain ISKCON wordmark without a logo tile.
  [`gita-life.ts:14`](../../packages/program-config/src/programs/gita-life.ts#L14)

- Shared header supports optional header-specific logo assets without changing app icons.
  [`header.tsx:200`](../../components/header.tsx#L200)

- Gita Life header dimensions keep the wordmark tall while protecting narrow widths.
  [`globals.css:46`](../../apps/gita-life/app/globals.css#L46)

**Supporting Contracts**

- Branding type allows header logo overrides while preserving existing logo consumers.
  [`types.ts:3`](../../packages/program-config/src/types.ts#L3)

- Offline cache includes the new header and hero assets with a cache version bump.
  [`sw.js:1`](../../public/sw.js#L1)
