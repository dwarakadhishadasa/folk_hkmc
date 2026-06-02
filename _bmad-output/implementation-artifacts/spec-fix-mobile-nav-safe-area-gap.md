---
title: 'Fix Mobile Nav Safe Area Gap'
type: 'bugfix'
created: '2026-05-20'
status: 'done'
route: 'one-shot'
---

# Fix Mobile Nav Safe Area Gap

## Intent

**Problem:** On mobile screens, the fixed bottom navigation can appear to lift during scroll, exposing page content in a visible gap below the nav.

**Approach:** Extend the mobile nav background below its own bottom edge so safe-area and visual-viewport scroll quirks remain covered across screens.

## Suggested Review Order

- Confirm the fixed mobile nav reserves scroll room and paints below itself.
  [`globals.css:160`](../../app/globals.css#L160)
