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

1. Grid primitives + toolbar + view-state hook
2. **`manage-contacts-table.tsx` refactored onto it** (the worked example, reviewed by a human)
3. Per-table routes wired to the existing views
4. Remaining tables migrated, one at a time, each reviewed against the agreed contacts pattern

Step 2 is the checkpoint that matters. One worked example a human has agreed to beats four built on an unvalidated pattern.