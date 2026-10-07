# Capability tiers

The ten capabilities in SPEC.md are not one undifferentiated pile. The tiers exist because an agent asked for "Airtable functionality" without tiers will either attempt all of it badly or claim done after building a sortable table. This companion fixes the ordering and the no-stub rule.

## The rule

**Implement P0 fully. Do not stub a lower tier to claim completion of a higher one.** A capability is done when a demonstration or a test can decide it, not when a placeholder renders.

## Tier 0 — the grid exists and is honest about scale

| Cap | Capability | Done when |
|---|---|---|
| CAP-1 | Virtualized rows | A 200+ row table scrolls without dropping frames; DOM node count stays bounded as rows grow |
| CAP-2 | Sort, resize, reorder, show/hide columns | Each control mutates the visible column set and persists across a reload |
| CAP-3 | Global text filter + per-column filters | Typing in the global filter narrows across all columns; per-column filters narrow one column |
| CAP-9 | Loading / empty / error states | Each of the three states is reachable on demand and is visually distinct from each other |

CAP-9 is P0 and not P1 because perceived quality in a data tool is almost entirely loading and empty states. Agents skip them because the happy path demos better. A grid with a blank surface while loading reads as broken.

## Tier 1 — the operator can actually get work done

| Cap | Capability | Done when |
|---|---|---|
| CAP-5 | Inline cell editing | An edit commits on Enter/blur, shows the new value immediately, and visibly reverts with an error message when the write fails |
| CAP-4 | Row selection and bulk actions | Multiple rows can be selected and acted on together |
| CAP-6 | Per-table routes with deep links | Every table has its own URL; a reload and a shared link land on the same table |
| CAP-10 | Scope survives navigation | Switching between table routes preserves admin/preacher scope |

## Tier 2 — power use, deliberately deferred

Not in this spec's scope. Named here so a downstream agent does not read their absence as an oversight:

- saved views, persisted per user
- grouped and collapsed rows
- linked-record cells
- formula fields
- CSV / export
- undo and redo history

## Delivery order

1. Grid primitives + toolbar + view-state hook, with sort/filter/column state in the URL
2. **`manage-contacts-table.tsx` refactored onto it** (the worked example), including CAP-4 row selection and its bulk action, landing `docs/manage-grid-pattern.md`
3. Per-table routes wired to the existing views
4. Remaining tables migrated, one at a time, each following the written pattern contract
5. Verification at scale, guardrails, and docs

Step 2 is the story everything else copies. With no human gate, its agreement role moves into a written artifact: **story 2 must land `docs/manage-grid-pattern.md`**, recording the column-definition conventions, the editing commit/rollback contract, the selection and bulk-action semantics, and the URL state contract. Later ports read it before porting. Two things the gate used to settle are settled there instead:

- **Bulk-action batch semantics** in `lib/manage/api-handlers.ts`. CAP-4 ships in slice one because row selection is a grid primitive that all four tables need; the *action* is documented once, on real code, before three more copy it.
- **How a port signals the pattern did not fit.** A port reports what carried over and what did not, rather than quietly absorbing a divergence.

Row counts for all four tables are measured in the final story, not at a gate — the measurement is a deliverable, not a decision point.