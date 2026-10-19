---
title: 'Grid fluid layout, hairline dividers, and selection tint'
type: 'bugfix'
created: '2026-10-16'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The contacts grid does not resize with the browser (fixed-width table inside a capped `container`), its header resize handles render as thick separators, body cells have no vertical gridlines, a few visible columns leave trailing empty space, and the row-selection highlight should be `#f1f6ff`.

**Approach:** Make the `/manage` shell fluid full-width, let the grid table stretch to its scroll container (`width 100%` with `min-width` at the summed column size), slim the resize handle to a 1px visual over a wider hit area, add hairline vertical cell dividers, and drive the selected-row surface from a `--grid-selected` theme token (`#f1f6ff` in light) so `components/grid/` stays hex-free per `harness-guards.spec.ts`.

</frozen-after-approval>

## Implementation Notes

- Fluid shell: `apps/folk/app/manage/page.tsx` and `apps/gita-life/app/manage/page.tsx` dropped the `container mx-auto` cap for `w-full`; the portal now tracks browser width. Header left untouched (shared by 22 surfaces; its background is already full-bleed).
- Stretch: `components/grid/grid.tsx` table and footer-strip inner use `width 100%` + `minWidth totalSize`. The last visible column is `fluid` (no fixed width, floored at its size) and absorbs slack; the footer's last cell grows with `flexGrow 1`, so totals stay under their fields in both regimes.
- Dividers: `components/grid/grid-row.tsx` body cells gained `border-r` (last cell exempt to avoid doubling the frame edge); `components/grid/grid-header-cell.tsx` resize handle is now a 1px edge-anchored line (`before:right-0 w-px`) over a 12px hit area, coinciding with the column-boundary borders. Follow-up fix: last visible header cell drops its own `border-r` (it previously doubled the frame edge).
- Selection: `bg-[var(--grid-selected,var(--muted))]` on selected cells plus matching inset shadow for frozen cells. Token defined in both apps' `globals.css` (`#f1f6ff` light, `#1e2a47` dark); `.dark` blocks verified byte-identical. Token route keeps `components/grid/` hex-free per `harness-guards.spec.ts`.
- Verification: `pnpm test:static` exit 0 (12 pre-existing lint warnings). `test:e2e:theme` 16 passed. `test:e2e:manage` 33 passed + rows 17/18 failing (known pre-existing fixture drift per testing guide). Targeted grid slice (metrics, scroll-surface, cell-range, drag-menu): 25 passed; drag 1-4 + hide + range 1 failures reproduce the known pre-existing drag/keyboard workstream breakage. `test:e2e:guards`: 22 passed + 2 pre-existing fails (`grid-filter-value.tsx:330` comment mentions `white-space`; stray `zz-debug.spec.ts` unregistered — both on base, files untouched). Live probe on `/manage?view=contacts&mode=admin`: header/body column edges delta 0, selected cell computes to `rgb(241,246,255)`, screenshots confirm alignment and tint.
- Commit skipped: worktree also holds another workstream's uncommitted changes (`grid-toolbar.tsx`, `package.json`, two scripts); committing would misattribute them. Left for Dwaraka.

## Review Triage Log

- Blind-hunter: fluid-column resize has no visible effect through the slack range — `low`, rejected (rare path; last column is the 48px Actions gutter; disabling its resize would be its own UX cost).
- Blind-hunter: all slack piles into one trailing column on ultrawide — `low`, rejected (the requested stretch-to-frame behavior; typical slack is 0–500px).
- Blind-hunter: header last cell kept `border-r`, doubling the frame edge — `low`, patched (`!fluid && "border-r"`).
- Blind-hunter: frozen-run boundary now identical to every divider — `low`, rejected (uniform grid was the request; region still functionally pinned).
- Blind-hunter: selection token has no fallback and is outside `@theme inline` — `low`, patched (`var(--grid-selected,var(--muted))`; hex fallback impossible — guard bans hex under `components/grid/`).
- Blind-hunter: hover/focus can paint over selection — `low`, rejected (pre-existing cascade, unchanged by this diff; translucent hover over selection is conventional).
- Blind-hunter: footer last cell grow/floor mismatch vs table cell — `false` (effective flex is `1 0 auto`: basis is the measured width and shrink is 0, so it cannot compress below it).
- Blind-hunter: handle invisible at rest; no keyboard resize path — `low`, rejected (hover-reveal is intentional; keyboard resize never existed and is a separate feature).
- Blind-hunter: cool-blue tint clashes with gita-life's warm palette — `low`, rejected (user's literal `#f1f6ff` ask applied uniformly; blue keeps contrast against gita-life's cream `muted`).

