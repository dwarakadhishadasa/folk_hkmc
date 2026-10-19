---
title: 'Grid scroll perf hot-path fix'
type: 'bugfix'
created: '2026-10-16'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Table scroll janks after `7eecfbd` (bidirectional `scrollLeft` mirror on every scroll event plus 999px inset `color-mix` shadows and `transition-colors` on every row) on top of the uncommitted fluid layout.

**Approach:** Coalesce the footer scroll sync through `rAF` while keeping its bidirectional contract, replace inset shadows with opaque single-fill backgrounds, and drop row transitions; fluid layout stays as-is.

</frozen-after-approval>

## Implementation Notes

- Kept bidirectional footer contract; coalesced `syncFooterScroll` via single pending `rAF` (`components/grid/grid.tsx:579-615`). Latest offset wins; equality at write time is the loop guard; frame cancelled on unmount.
- Dropped `transition-colors` from the row (`components/grid/grid-row.tsx:250`); replaced all five frozen `inset 999px color-mix` shadows with opaque single-fill `bg-[color-mix(...var(--card))]` (`:267,:269,:272,:279,:282`). Selected frozen is now the same solid token as the row — no double paint.
- Fluid layout, `border-r` dividers, resize handle untouched per minimal scope.
- Files touched: `components/grid/grid.tsx`, `components/grid/grid-row.tsx`.

## Review Triage Log

- Dual-scroller same-frame overwrite leaves one pane a frame stale — `low`, rejected (needs both scrollers driven within 16ms; self-heals on next event; per-target slots add state for a non-case).
- Pending source identity across scroller re-mount mid-frame — `low`, rejected (needs a `tableFooter` toggle inside a 16ms scroll window; guard already drops safely).
- Pending frame dropped when strip unmounts before fire — `false` (strip gone means nothing to sync; main scroller already holds its own offset).
- Mirrored write schedules one no-op echo frame — `low`, rejected (one cheap equality check per gesture frame; suppression flag costs more than it saves).
- Keyboard `revealCell` writes `scrollLeft` outside the coalescer — `low`, rejected (synchronous scroll is required for focus; footer catches up next frame by design).
- `revealCell` measure-then-write per keypress plus native focus scroll — `false` (30Hz key events, not 120Hz scroll; measuring before scrolling is required).
- Keyboard frozen-width vs `resolveFrozenRun` mismatch — deferred (pre-existing; needs one shared resolver).
- Footer strip has no keyboard affordance — deferred (pre-existing since `7eecfbd`; needs a focusability decision).
- Frozen opaque `color-mix` vs non-frozen translucent bases differ — `false` (prior shadow used the identical `in oklab` basis; zero visual delta from this change).
- Redundant selected-frozen rule plus hover/selected order dependence — `false` (duplicate identical declarations are not double paint; cascade order is pre-existing and triaged in the fluid spec).
- No combined stacked-state rules — `false` (pre-existing cascade, triaged in the fluid spec).
- `var(--grid-selected)` token as smuggled redesign — `false` (shipped by the fluid spec per explicit user ask, not by this change).
- `border-r` dividers / fluid header border as scope creep — `false` (owned by the fluid spec; this change left them untouched).
- Full-tree reconciliation per scroll frame — `false` (horizontal scroll sets no state, so zero React renders; vertical window updates are required virtualization renders).
- Per-row Map allocation and per-cell key strings — `low`, deferred as render-path idea (real but ns-scale; needs a profile proving it matters).
- Header menu/handle transitions still animate — `false` (transitions run on hover-state change, not per frame; sticky header does not move under scroll).
- Popover `rAF` deferrals lack cancellation — deferred (pre-existing, harmless under React 18).
- Spec notes pin line numbers and understate files — `false` (notes are point-in-time; duplicate identical rules are not double paint; spec correctly scopes to its own two files).
