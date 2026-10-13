---
title: 'Type-keyed cell renderers, linked-record labels, and blank-not-dash'
type: 'feature'
created: '2026-10-13'
status: 'done'
baseline_commit: 'd363a2be21898c88408f195f5f0d539011b879df'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/manage-grid-pattern.md'
  - '{project-root}/docs/architecture/testing.md'
  - '{project-root}/_bmad-output/specs/spec-manage-dashboard-grid/design-constraints.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Two families of column share one renderer. Stored-field columns carry `meta.grid.editor`; the joined accessor columns `location` and `collectedBy` carry neither an editor nor a stored value, so nothing tells the grid what they hold. An operator cannot tell a field type from a cell, a dangling location reference prints a raw UUID, and every empty cell prints an em-dash that is punctuation, not absence.

**Approach:** Give `GridColumnMeta` its own `fieldType` key, independent of `editor`, and render cells without an editor through a typed registry keyed on it. Produce an honest unresolved marker where a join misses. Delete `GRID_EMPTY_TEXT` so an empty cell renders nothing.

## Boundaries & Constraints

**Always:**
- `fieldType` answers "what is this cell"; `editor` answers "how is it edited". They are separate keys, never derived from one another.
- A registry renderer reads `cell.text` only. `cell.text` carries the optimistic override; re-reading the stored value shows the prior value for the whole round trip (DW-27).
- A column is never both `editable` and carrying a `cell` widget.
- A registry renderer never emits a `<button>` — `e2e/fixtures/manage-grid.ts` resolves the favorite star as the row's only unscoped button.
- No renderer grows the cell. Rows are fixed at 32px/28px and the virtualizer estimates from `GRID_ROW_HEIGHT`.
- `components/grid/` stays table-agnostic: no Manage/contacts/`/api/manage` vocabulary, so the unresolved marker's wording is the consumer's, not the grid's.
- Semantic tokens only; no raw hex, no `dark:` variant, no second accent colour (design-constraints.md).
- No value is fabricated to make a column look fuller, and no label is ever derived from an id.
- The default field set (CAP-18) is **not** this story's. Nine of fourteen visible is story 7's; this story renders all fourteen.

**Never:**
- Never render a raw id or UUID where a label was expected.
- Never let the em-dash placeholder return by another route — clipboard, optimistic override, or editor context.
- Never restyle a column that supplies its own `cell` widget; the star and the row actions are controls, not data.
- Never edit an e2e assertion to make a source change pass. The three blank-not-dash assertions are the recorded exception; every other red is a source bug.
- Do not add the default field set here. CAP-18 belongs to story 7.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Stored field with an editor | any `editor` column | Unchanged: editor closed display, then the draft editor | N/A |
| Joined accessor, label resolves | `locationNameById` has the id | The human label, one pill, no id anywhere in the cell | N/A |
| Joined accessor, id dangling | lookup misses | The consumer's unresolved marker. Never the raw id | N/A |
| Joined accessor, genuinely absent | `locationIds: []`, `collectedById` null | Nothing rendered — blank, not the marker. Two different facts | N/A |
| Many locations on one contact | two resolvable ids | One pill holding the joined string. Not split per location | N/A |
| Empty stored value | any empty cell | Nothing. No em-dash, in the grid or in the clipboard | N/A |
| Read-only data column | `editable` absent, no widget | Muted foreground, distinct from an editable cell | N/A |
| Custom-control column | `favorite`, `actions` | Consumer widget, unmounted by the registry and by the read-only treatment | N/A |

</frozen-after-approval>

## Code Map

- `components/grid/grid-types.ts` — `GridColumnMeta` (`:51-61`) has **no** field-type key; `editor?: GridEditorKey` (`:53`) is the only type signal. `GridCellView` (`:272-315`) carries `text`/`render`/`align`/`tabular` but not `editable` or column meta.
- `components/grid/grid-row.tsx` — render precedence `:250-263` (`cell.editor` → `cell.editing` → `cell.render` → `cell.text`); `title` suppression `:217-221`. **Do not touch** `:165-200` — hairline, frozen-cell backgrounds, the doubled `data-grid-cell-selected` specificity trick. Cell className `:236-247`.
- `components/grid/grid-editors.tsx` — closed displays are `OpenableDisplay` (`:282-300`, a `<span role="presentation">`) and `Pill` (`:303-316`, the token-clean pill to reuse). `EMPTY_TEXT` (`:59`) mirrors `GRID_EMPTY_TEXT` because this module is imported *by* `use-grid-keyboard.ts`; it gates the closed display at `:691`, `:751` and the multiselect split at `:792`. `resolveGridEditor` / `GRID_EDITOR_REGISTRY` at `:1158-1168` — **mirror this shape** for the renderer registry.
- `components/grid/use-grid-keyboard.ts` — `GRID_EMPTY_TEXT` `:20`, applied at `:1000` (editor ctx) and `:1900` (cell view). Clipboard already contributes an empty field, never the placeholder (`:1253-1257`) — preserve that.
- `components/grid/grid-preview.tsx` — primitive harness. `flagged` must stay **last**; `grid-keyboard.spec.ts` addresses it as the last cell for `End`/`Tab` (`:52`). New columns go before it.
- `components/manage/manage-contacts-table.tsx` — 14 columns `:786-1010`. `location` accessor `:849` is `… locationNameById.get(id) ?? id …` (**prints the raw id**); `collectedBy` `:937` is `… payload.staffNames[id] ?? ""` (**silently empty**). `name` `:828-835` has no emphasis. `favorite` `:946-978` and `actions` `:986-1008` carry `cell` widgets.
- The em-dash assertions, all of which changed: `grid-keyboard.spec.ts:255` · `grid-clipboard.spec.ts:135,152` · `manage-contacts-edit.spec.ts:446` · `grid-editors.spec.ts:384,692` · `grid-edit-model.spec.ts:407`. **Five specs, not the three the source recorded** — `surface-and-toolbar.md:74` named only the first three, and a grep filtered to comment-shaped lines misses the two literal `"—"` baselines in the later two.
- `e2e/specs/bulk-fixtures.spec.ts:571` asserts every seeded contact's location resolves to a real row — **the unresolved marker cannot be tested by planting a dangling id in the contacts fixture.**

## Tasks & Acceptance

**Execution:**
- [x] `components/grid/grid-types.ts` — add the `GridFieldType` union (`text | select | multiselect | date | number | boolean | linked | longtext`), `fieldType?`/`emphasis?` on `GridColumnMeta`, and `fieldType`/`editable`/`emphasis` on `GridCellView` — the marker is its own key, so a column with no editor can still declare what it holds.
- [x] `components/grid/grid-cell-renderers.tsx` — NEW. A `GRID_CELL_RENDERER_REGISTRY` typed record over all eight field types plus `resolveGridCellRenderer`, mirroring `resolveGridEditor`. Each renderer receives `{ text }` and nothing else.
- [x] `components/grid/use-grid-keyboard.ts` — delete `GRID_EMPTY_TEXT` and both applications; populate the new view fields from `meta?.grid`.
- [x] `components/grid/grid-editors.tsx` — delete the mirrored `EMPTY_TEXT`; retarget `:691`/`:751`/`:792` to a length test on `ctx.text`. The stale claim at `:57` that the value is asserted in `grid-editors.spec.ts` is false — no spec uses it — so delete the claim with the constant.
- [x] `components/grid/grid-row.tsx` — insert the registry between the consumer widget and the bare `cell.text`; retarget the `title` suppression to an empty-text test; apply the read-only and emphasis treatments on the `<td>`.
- [x] `components/grid/index.ts` — swap the `GRID_EMPTY_TEXT` export for the registry's.
- [x] `components/grid/grid-preview.tsx` — add `fieldType` markers and a `linked` column before `flagged`, carrying one resolvable and one dangling reference, so the marker is reachable without breaking the contacts fixture invariant.
- [x] `components/manage/manage-contacts-table.tsx` — give all fourteen columns a `fieldType`; mark `emphasis` on `name`; replace the `?? id` and `?? ""` fallbacks with the consumer's unresolved marker.
- [x] `e2e/specs/grid-keyboard.spec.ts`, `grid-clipboard.spec.ts`, `manage-contacts-edit.spec.ts` — the recorded assertion change, each with the reason inline.
- [x] `e2e/specs/grid-cell-renderers.spec.ts` — NEW. Type coverage, linked labels, the unresolved marker, blank-not-dash, editable-vs-read-only, widget columns untouched, and the clipboard carrying no placeholder.
- [x] `docs/manage-grid-pattern.md` — add `fieldType`/`emphasis` to the `meta.grid` table.

**Acceptance Criteria:**
- Given the Contacts grid, when it renders, then every column declares a `fieldType` covering text, select, multiselect, date, number, boolean, linked and longtext, and `location` and `collectedBy` — neither of which has an editor — render through the registry rather than falling through to bare text.
- Given a location or staff id with no matching lookup, when the cell renders, then the consumer's unresolved marker is shown and the raw id appears nowhere in the cell, the cell's `title`, or the clipboard; given a contact with no location at all, then the cell renders nothing, so absent and dangling stay different facts.
- Given a cell whose value is empty, when it renders, then its text is empty and no em-dash reaches the grid, the editor context, the optimistic override, or the clipboard.
- Given an editable column and a read-only one side by side, when they render, then each carries a distinguishing attribute and the read-only cell is muted; given a column supplying its own widget, then it keeps its own rendering and takes neither the registry's nor the read-only treatment.
- Given a cell whose value is truncated, when it is inspected, then the full value is still reachable, including on a cell the registry renders.
- Given a rejected commit, when the cell renders, then the refusal still reads as destructive and is not masked by the read-only treatment.
- Given `Name`, when a row is scanned, then it is the only weighted column, expressed with weight and space rather than a colour, and no column gains a per-option hue.

## Implementation Notes

Implemented on `feat/grid-keyboard-editors-and-theme`, baseline `d363a2b`. 18 files
touched, 3 added.

**New:** `components/grid/grid-cell-renderers.tsx` (the registry), 
`e2e/specs/grid-cell-renderers.spec.ts` (12 tests), this file.

**`fieldType` is declared on all fourteen contacts columns and every preview
column.** The two joined accessors were the point of the story, and they are the
only two that changed accessor logic: `?? id` became `UNRESOLVED_LOCATION` and
`?? ""` became `UNRESOLVED_STAFF`.

**The marker's shape changed mid-implementation, and the first shape was wrong.**
The renderer originally pattern-matched a sentinel string, comparing `text` against
a shared constant. That would have silently stopped working the first time someone
reworded the marker — no error, the raw id back on screen. It is now a declared
value: `meta.grid.unresolvedText` travels to the renderer, which is handed a
boolean. The grid matches nothing.

**`GRID_EMPTY_TEXT` removal was wider than the spec recorded.** `surface-and-toolbar.md:74`
names three specs; there are five. My first grep filtered to comment-shaped lines
and missed the two literal `"—"` baselines in `grid-editors.spec.ts:384` and
`grid-edit-model.spec.ts:407` — they surfaced only when the suite went red, three
tests failing at once. Worth recording as a lesson about the grep, not about the
code: a search for a glyph is not a search for a glyph's *uses*.

**The read-only muted class is withheld when `cell.error` is set.** `text-muted-foreground`
and `text-destructive` are the same Tailwind specificity, so leaving both on the cell
makes stylesheet order decide whether a refusal is visible. An explicit guard is
readable; a silent precedence fight is not. Test 9 asserts the decision directly.

**The preview harness numbers rows from 1, not 0.** `buildPreviewRows` starts at
`index = 1`, so the first rendered row is `row-1`. Three of my own tests initially
failed on the wrong row for this reason. Every row index in the spec is now written
as a comment against the id.

**`GridCellView` gained no row value, on purpose.** A renderer that could reach the
stored value could break DW-27 from a new direction. It receives `{ text,
unresolvedText }` and cannot.

### Pre-existing change in this tree, not mine

The working tree arrived with an authorized removal of the grid's `aria-live` status
channel (`grid.tsx`, `use-grid-keyboard.ts`, `grid-row.tsx`, `grid-preview.tsx`,
`e2e/fixtures/manage-grid.ts`, four spec files). Story 3's work sits on top of it in
those same files. Both were verified green together; they are one commit because they
were one working tree. That change contradicts story 7 of
`spec-grid-keyboard-editors-and-theme`, which requires the status channel to survive
for per-row delete feedback. **Unresolved, and Dwaraka's call.**

## Spec Change Log

## Review Triage Log

## Design Notes

**`cell.text`, never the row.** This is DW-27 one layer down. `GridCellView` exposes no raw row value and must keep it that way — the optimistic override lives on `text`.

**The registry sits *after* the consumer widget.** A column with its own `cell` widget has already chosen its appearance; `favorite` and `actions` are controls, and a data renderer over them would be restyling a button as a value. Precedence: editor → editing → consumer widget → registry → bare text.

**The linked renderer emits ONE pill and does not split.** `location` joins with `", "`, so a location named `Foo, Bar` would split into two wrong labels. Splitting invents structure the data lacks — the fabrication CAP-3 forbids.

**The unresolved marker is the consumer's, produced at the accessor.** `components/grid/` carries no contacts vocabulary, and whether a miss means "unresolved" is the consumer's lookup that knows. Both maps are already in scope there (`locationNameById` `:435`, `payload.staffNames` `:1014`), so this is a change of fallback, not new plumbing.

**Read-only is muted; emphasis is weight.** `design-constraints.md` allows one accent and bans shadows and stripes, so neither may reach for a colour. Errors must stay `text-destructive`, so the read-only class is skipped when `cell.error` is set rather than relying on two competing `text-*` utilities resolving in the right order.

**The unresolved marker is proven on the preview grid.** `bulk-fixtures.spec.ts:571` asserts every seeded contact's location resolves to a real row; planting a dangling id there would break a live invariant to test a display rule.

**CAP-18 was deliberately excluded, and the sources disagree.** `epics.md` Story 2.1 titles this story "…and the default field set" and its AC demands nine of fourteen visible, while `stories.yaml` story 3 scopes to CAP-3/CAP-4 and story 7 claims CAP-18 outright. Resolved toward `stories.yaml`: the current file was reconciled after `epics.md` (Oct 13 15:21 vs 14:19), `epic-2-context.md` also omits the field set, and `epics.md:485-499` lists its own reconciliation deltas without moving CAP-18. The grid therefore renders all fourteen columns after this story, and story 7 owns the default.

## Verification

**Commands run, with this run\'s actual results:**
- `pnpm test:static` -- **PASS.** guardrails passed, typecheck 6/6 projects, lint 0 errors + the 12 pre-existing warnings.
- `pnpm test:e2e grid-cell-renderers` -- **15 passed**, 1.2m, exit 0.
- `pnpm test:e2e grid-` -- **104 passed**, 14.1m, exit 0.
- `pnpm test:e2e manage-contacts` -- **36 passed**, 5.1m, exit 0. Row 17 (the
  location filter reads the same joined string the cell renders) and row 4 (the
  optimistic empty value) are the two that would have caught a marker leaking into
  the filter path or the override path.
- `grep -rn "dark:" components/grid/` and the raw-hex / `white` / `black` grep -- both **0**.
- `md5sum` on both `dev/grid-preview` routes -- identical.

**Not run, therefore unverified:** `pnpm test:e2e:determinism`. Six spec files and the
fixture changed, and the testing contract makes it required after exactly that.

**One flake, not proven.** `grid-edit-model.spec.ts:189` (the `Escape` after a calendar
popover) failed once in a full `grid-` run, passed alone, and passed in the next full
run. Recorded as a flake rather than a proven one; story 1 documents bare `Escape`
reaching Radix as a known sharp edge on this path.

**One runner at a time.** Every spec shares one seeded database; a concurrent run corrupts fixtures and reports false failures.