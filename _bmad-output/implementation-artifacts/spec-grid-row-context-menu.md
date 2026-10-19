---
title: 'Row context menu for contacts, retiring the actions column'
type: 'feature'
created: '2026-10-19'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '2748315296007612528e488d2ea0f9de7fceb544'
context:
  - '{project-root}/docs/manage-grid-pattern.md'
  - '{project-root}/docs/architecture/testing.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The contacts grid spends a column on a per-row delete bin that acts on exactly one row and holds permanent horizontal width for a 24px control. Deleting a set of records means one click, one confirmation and one request per row.

**Approach:** Remove the `actions` column. Replace it with a row context menu — right-click on a row, or `Shift+F10` / the Menu key on the focused row — carrying one item, `Delete all selected records`, which acts on **every selected row**. Right-clicking a row outside the current selection **replaces** the selection with that row before the menu opens, so the menu's target and the visible highlight never disagree. A confirmation dialog names the count, and the delete reports one outcome line per row.

**Decided, 2026-10-19 — `favorite` stays exactly as it is.** The star column, `toggleFavorite`, `pendingContactId`, `isFavorite`, the patch key and the bulk route are all untouched. This story removes one column, not two.

## Boundaries & Constraints

**Always:** The menu is a **grid primitive** with a consumer-supplied item set — `components/grid/**` gains no contacts vocabulary, no `isFavorite`, no route. The target set resolves before the menu opens. A failed row keeps its value and its selection; only server-confirmed rows leave the table. Delete stays confirmed; nothing destructive runs on a single click.

**Never:** No new dependency — `components/ui/context-menu.tsx` already exists on `@radix-ui/react-context-menu@2.2.4` and is unused. No second write path: deletes go through `GridRowLifecycle.onDeleteRow`. No set-based delete route. No per-row delete bin survives. Do not touch the favourite star, `isFavorite`, `MANAGE_CONTACT_PATCH_KEYS`, or the bulk route. Do not weaken `harness-guards.spec.ts` to style the menu.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| IN_SELECTION | Right-click a row already selected | Menu header names the count; the item acts on all selected rows | N/A |
| OUTSIDE_SELECTION | Right-click a row outside the selection | That row **replaces** the selection and is highlighted before the menu paints; the item acts on it alone | N/A |
| DELETE | `Delete all selected records`, confirmed | N sequential deletes; one outcome line per row; confirmed rows leave the table and the selection | A refused row stays in the table, stays selected, and its line names it and the reason |
| DRAFT_ROW | A `draft-` row is selected | Removed locally with no request | No request against an id the database never saw |
| EMPTY | Right-click the header, empty panel, or spacer row | No menu opens | N/A |
| KEYBOARD | `Shift+F10` or Menu on the focused row | Menu opens on that row, keyboard-navigable | N/A |

</frozen-after-approval>

## Code Map

- `components/grid/grid.tsx` — scroll container `~1712-1721` takes the trigger; `<tbody>` `~827` is why it cannot wrap a row; `GridProps` `~578`.
- `components/grid/grid-row.tsx` — `tr[data-grid-row]` `~260`, `data-state="selected"` `~261`.
- `components/grid/grid-row-lifecycle.tsx` — `requestDelete` `~298`, `confirmDelete` `~312`, `GridRowDeleteReport` `~201`, dialog `~367-404`, `GridRowDeleteControl` `~159` (now unused).
- `components/ui/context-menu.tsx` — unused Radix wrapper; content is portalled.
- `components/manage/manage-contacts-table.tsx` — `ACTIONS_COLUMN_ID` `~60`, `COLUMN_IDS` `~92`, visible set `~92-108`, labels `~141`, the actions display def `~990-1014`. The favourite star `~951-984` and `toggleFavorite` `~708` are **untouched**.
- `components/grid/grid-toolbar.tsx` — `hideable` doc `~30-41` and the locked-columns note `~57` cite `actions` as their example.
- `e2e/fixtures/manage-grid.ts` — `rowDeleteButton` `~519` resolves the per-row bin that is going away.

## Tasks & Acceptance

**Execution:**
- [ ] `components/grid/grid.tsx` -- optional `rowContextMenu` prop, trigger on the scroll container, target row resolved from the event target, and a selection-replace callback fired before open -- the primitive owns the trigger and the target, the consumer owns the verbs.
- [ ] `components/grid/grid-row-lifecycle.tsx` -- `requestDeleteMany(rowIds)`, a count-aware confirmation, and a report taking its region label from the caller; delete `GridRowDeleteControl` -- the menu is now the only delete entry point, so the bin is dead code.
- [ ] `components/manage/manage-contacts-table.tsx` -- delete the `actions` display def and its id/label/visible-set entries; add the consumer menu calling `requestDeleteMany` -- one column goes, the star stays.
- [ ] `components/grid/grid-toolbar.tsx` -- re-word the two doc comments that cite `actions` as the locked-column example -- the example no longer exists.
- [ ] `components/grid/index.ts` -- export the menu props and outcome types; drop `GridRowDeleteControl`.
- [ ] `e2e/specs/grid-row-context-menu.spec.ts` -- new spec covering every matrix row -- the menu has no coverage otherwise.
- [ ] `e2e/specs/manage-contacts-row-lifecycle.spec.ts` -- rewrite the three `rowDeleteButton` call sites to open the context menu; the confirm/report/cancel assertions carry over -- the bin they drive is gone.
- [ ] `e2e/fixtures/manage-grid.ts` -- replace `rowDeleteButton` with a row-menu opener; update the seam table -- `data-grid-delete-row` no longer exists.
- [ ] `grid-toolbar`, `grid-cell-renderers`, `grid-column-drag-menu` specs -- drop `actions` from the field lists (14→13 data fields, 9→8 visible, locked `Name` only, lock markers 2→1) and re-anchor the widget case on `favorite` alone -- these assert the column set as text.
- [ ] `docs/manage-grid-pattern.md` -- replace §5's "row-action menu is the obvious next primitive" note with the settled pattern.

**Acceptance Criteria:**
- Given a default contacts load, then no `actions` column exists and the header carries `select` plus eight visible fields; `favorite` is still defined and still hidden by default, exactly as CAP-18 had it.
- Given three rows selected, when one is right-clicked, then the menu names the three and delete removes exactly those three after confirmation.
- Given three rows selected, when a fourth row is right-clicked, then the selection becomes that one row before the menu opens.
- Given one of three deletes refused, then that row remains in the table, remains selected, and its line names it and the server's message.
- Given focus on a row, when `Shift+F10` is pressed, then the menu opens there and is keyboard-navigable.
- Given `favorite` is unhidden, then its star still toggles, still writes, and still reports through the existing notice.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

The trigger cannot live on a row: Radix renders a `<span>` wrapper unless given `asChild`, and a `<span>` between `<tbody>` and `<tr>` is invalid markup. So it wraps the scroll container and the row is resolved from the event target on open.

The consumer menu is a **component**, not a render function, because it must call `useGridRowLifecycle()`, and a render function cannot hold hooks.

## Verification

**Commands:**
- `pnpm typecheck:workspace` -- expected: clean; `next.config.mjs` ignores build errors, so this is the type gate.
- `pnpm guardrails` -- expected: pass; `components/grid/**` and `components/manage/**` both moved.
- `pnpm test:e2e:grid` -- expected: green, no `✘`.
- `pnpm test:e2e:manage` -- expected: green.
- `pnpm test:static` -- expected: clean.

**Manual checks (if no CLI):**
- Right-click inside and outside a selection; the highlight matches the menu's count before any item is chosen.
- Confirm the favourite star still toggles and the Favorites view reflects the write.
