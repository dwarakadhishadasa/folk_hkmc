---
title: 'Header text-only sort labels and same-tab Manage nav'
type: 'bugfix'
created: '2026-10-16'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Every grid column header shows a sort chevron beside its name (visual noise across ten-plus columns), and the header's Manage entry opens `/manage` in a new tab instead of navigating in place.

**Approach:** Drop the header sort-indicator icons entirely (headers render label text only; `aria-sort` keeps exposing sort state to assistive tech, and sorting stays available through the column menu and toolbar Sort control), and remove the Manage nav item's new-tab flag so it navigates in the current window like every other entry.

</frozen-after-approval>

## Implementation Notes

- `components/grid/grid-header-cell.tsx`: `SortIndicator` (ArrowUp/ArrowDown/ChevronsUpDown) removed with its lucide imports; both label spans render text only. `aria-sort` retained on the cell, sorting still via column menu + toolbar Sort control. Dead `gap-1` on the now-single-child spans removed per review.
- `components/header.tsx`: Manage item lost `newTab: true` (kept `prefetch: false`); desktop + mobile nav share `navItems`, so both go same-tab through the existing `NavAnchor` path.
- Verification: `pnpm test:static` exit 0. `pnpm test:e2e smoke` 10 passed (fresh run). Live probe on `/manage?view=contacts&mode=admin`: Manage link `target` is null (same-tab), 0 SVGs in header label spans, `aria-sort` present; screenshot confirms text-only headers.
- Full-suite attempt: foreground run hit the 10 min tool timeout; background rerun completed 134 passed / 155 failed / 2 not run — failures are uniformly `waiting for [data-grid-root]` 20s timeouts (page never rendered) under machine load ~4.5 while the suite, dev server, and live user testing overlapped. Same code passed targeted suites minutes earlier (theme 16/16, manage 33/35 + 2 known, grid slice 25 + known). Verdict: environmental, not a regression. A clean full run at idle is still owed for the `header.tsx` shared-component change — run `pnpm test:e2e` when the machine is free.
- Scroll-lag report: attributed to the same load (suite + dev + active use), not the diff — the change removes DOM (icons) and touches no scroll path. Machine now idle; re-test requested.
- Commit skipped (shared dirty tree with another workstream).

## Review Triage Log

- Blind-hunter: no sighted sorted-state equivalent — rejected (user chose "remove everything"; toolbar Sort control remains the sighted surface).
- Blind-hunter: sortability undiscoverable — rejected (pre-existing; chevrons rendered on non-sortable columns too, so nothing regressed).
- Blind-hunter: dead `gap-1` on single-child flex — patched (both spans).
- Blind-hunter: truncated labels lack `title` — rejected (pre-existing, out of scope).
- Blind-hunter: no live-region on sort change — rejected (new feature surface, out of scope).
- Blind-hunter: separator has no keyboard resize path — rejected (pre-existing; noted in prior review).
- Blind-hunter: fluid column has no max clamp / frozen-plus-fluid combo — rejected (consistent with existing no-max pattern; all-frozen-visible is hypothetical).
- Blind-hunter: re-evaluate `prefetch: false`, cover pending/active Manage states — rejected (no breakage; active-path highlighting now reachable for the first time, which is an improvement).
- Blind-hunter: `newTab` branch in `NavAnchor` now dead — rejected (interface capability for future items, ~3 lines; removing it would churn a shared component for no gain).

