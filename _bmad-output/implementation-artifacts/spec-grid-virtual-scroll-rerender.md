---
title: 'Grid virtual scroll render isolation'
type: 'bugfix'
created: '2026-10-16'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Vertical table scroll still janks after the hot-path fix (probe: p50 50ms/frame, 107 longtasks per scroll) because the virtualizer subscription lives in `Grid`, so every range change `flushSync`-renders the toolbar, header, all rows and footer per tick.

**Approach:** Own the virtualizer in a tbody-only `GridVirtualRows` child so scroll ticks reconcile rows alone, and memo `GridRow` with an explicit comparator so steady rows skip cell-view construction entirely; measured by the throwaway probe, not by feel.

</frozen-after-approval>

## Implementation Notes

- Probe (`/tmp/opencode/scroll-probe.mjs`, admin `/manage?view=contacts`, 1440x900, dev server): baseline p50 66.7ms/p95 266.7ms/174 longtasks → after rAF+shadows p50 50ms/p95 216.6ms/107 longtasks → after isolation+memo p50 16.7ms/p95 33.4ms/0 over-50ms/0 longtasks. Horizontal axis vacuous at 1440px (fluid stretch leaves no overflow).
- `GridVirtualRows` owns `useVirtualizer`, spacers, `measure()` and the add-row landing effect; parent passes a `virtualizerRef` for `scrollToIndex` and resolves pending-focus via callback. DOM structure byte-identical (`table > thead + tbody`).
- `GridRow` is `memo`d; cell views build inside the row so a skip also skips `buildEditorContext`/`flexRender`. Comparator covers row ref, factory ref, column order/visibility ref, frozen ref, flags, explicit `isSelected` (selection is uncontrolled) and stable callbacks. `visibleColumnIds` is compare-only.
- `pnpm typecheck:workspace` clean. 2 new eslint react-compiler informational warnings on `grid.tsx` (hook returns uninemoizable functions) — benign, memoization cannot skip subscription renders.
- Files touched: `components/grid/grid.tsx`, `components/grid/grid-row.tsx`.

## Verification

- Targeted e2e with changes: 57 passed, 5 failed — all 5 in `grid-edit-model.spec.ts` (CAP-10 opener/commit/Escape rows).
- Stash-cycle baseline (`grid.tsx`+`grid-row.tsx` back to HEAD, `grid-edit-model` alone): same 5 failed, 22 passed. Pre-existing per `docs/architecture/testing.md` §6 (documents `grid-edit-model (5)` 60s actionability timeouts); not caused by this change or the fluid workstream delta in the tree.
- Uncommitted: tree mixes the fluid workstream; bundling would misattribute. Full `test:e2e:grid`+`:manage` and prod-build measurement not run.
