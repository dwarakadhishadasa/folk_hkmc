# Record review panel

Binding contract for CAP-5. Read this before writing the panel. Every decision here is load-bearing: the panel is the first genuinely new surface this grid has gained, and the failure modes are mostly *state loss*, which no assertion catches unless the assertion is written first.

## Placement — a right-side sheet, not a modal

`components/ui/sheet` already exists. A modal would be wrong for one concrete reason: **CAP-5's success requires the operator to return to the grid with filters, sort, selection and scroll intact, and a modal that covers the grid makes "return to the grid" unverifiable by eye.** The sheet keeps the grid visible beside it, so grid-state preservation is a thing you can *see* rather than take on trust.

If OQ-3 is answered "modal," the state-preservation assertions still hold — they are written against the grid's URL and state, not against the panel — but the demonstration gets weaker.

## The primitive boundary

The panel is **table-agnostic** and lives outside `components/grid/`'s vocabulary. It receives data; it never fetches.

```
RecordPanel<TRecord>
  record: TRecord
  fields: readonly RecordPanelField<TRecord>[]
  onCommit: (commit) => void | Promise<void>   // the SAME handler the grid uses
  isSaving, saveError                            // supplied, not owned
  onNavigate(direction), onClose
```

`manage-contact-record-panel.tsx` supplies `fields` from `COLUMN_LABELS` and `PATCH_KEY_BY_COLUMN`; the generic shell knows nothing about contacts. That is what makes a Sessions or Attendance port a copy rather than a rewrite.

**The panel must not add a fetch.** The full scoped set is already in `payload.contacts`; CAP-9 forbids a second row store. A panel that refetches on open is a new network path, a new loading state, and a new way for the grid and the panel to disagree about a row.

## Opening it — an explicit control, not a click

**Row click does not open the panel.** Dwaraka discarded it: CAP-10 makes a double-click mean "edit this cell," and a row click would either collide with it or fire on the first click of a double-click. The panel is opened by a **dedicated control in the row's action column** (OQ-6), which is already the established home for per-row controls — `favorite` (`:946`) and the delete control (`:985`) live there and the actions column is `hideable: false`.

That choice also dissolves the hardest problem in the original design. Three controls call `stopPropagation` on `onPointerDown` — the select checkbox (`:796`), the favorite star (`:953`), the delete control (`:990`) — precisely because a row-level click handler would otherwise fire when they were used. With no row-level handler, **that whole class of bug disappears.** Keep the three calls regardless; they also stop the grid's own cell focus from moving out from under a control.

**A single click on a cell now means one thing: move cell focus.** That is the correct reading of CAP-10, and it is what keeps the grid's keyboard navigation coherent.

## What the panel shows

Everything the grid does not, plus everything it does, in one place:

- **All fifteen fields**, including the ones hidden or scrolled off in the grid. A record review that shows a subset is a second grid.
- **Read-only fields visibly read-only** — attendance rollups, `lastContactedOn`, `collectedBy`. CAP-7.
- **Linked records as labels**, matching CAP-4, and **navigable** where the relationship supports it: a location or staff name links to that entity's view. The brief asks for this and the data supports it (`payload.locations`, `payload.staffNames`) — but the *targets* are the existing `/manage?view=…` routes, not new ones.
- **The attendance history** a record actually has: `payload.attendance` carries every `ManageAttendanceRecord` (`:149`), and `totalAttendanceCount` / `past60DayAttendanceCount` are rollups resolved from `contact_attendance_counts`. This is the highest-value content in the panel and it is already loaded.

**Absent: a delete control inside the panel.** Story 5 ships delete in the row's action column with confirmation and per-row outcomes. A second delete path is a second confirmation flow and a second place for the two to disagree.

## Navigation

Prev/next moves through the **current filtered, sorted order** — the same order the operator is looking at. Not the raw payload order, and not the selection.

That means the panel needs the visible row ids in order. It must **not** re-derive them by re-sorting: `grid.tsx` already holds the resolved row model. A panel that sorts independently can disagree with the grid about what "next" means the moment a sort is applied.

Boundary behavior at the ends: disable the control, do not wrap. Wrapping an operator from the last record back to the first, with no visual cue, reads as a glitch.

Keyboard: `ArrowUp` / `ArrowDown` while the panel has focus, and `Escape` to close — with `Escape` **not** stealing the key from an open editor (the `isGuardedTarget` guard in `use-grid-keyboard.ts:68` is the model; the panel needs the same discipline).

**Opening the panel is not `Enter`.** OQ-6(b) was rejected because `Enter` is also CAP-10's commit key, and one key meaning "open the record" in one context and "save this field" in another is exactly the kind of context-sensitivity that produces lost edits. Navigation inside the panel is safe because an open editor swallows `Enter` before the panel sees it.

## Unsaved edits — resolved, and the whole section is deleted

The original design had the panel track a dirty flag and prompt on close or navigate. **That is no longer needed and must not be built.**

CAP-10 makes blur a commit, so an edit cannot be abandoned by clicking away. The panel is therefore always clean when closed, the prompt would never appear, and a `data-record-panel-dirty` attribute plus an `AlertDialog` would be dead code with a spec asserting a state that cannot occur.

**This is the one place where OQ-2's resolution simplified the design rather than complicating it.** If a future story adds a dirty flag, it is reintroducing a problem the user explicitly removed.

The consequence to carry into CAP-10 instead: because blur commits, a partially-typed value can be saved by an accidental click elsewhere. That is accepted — it is the same trade every spreadsheet makes — but it is why validation and a visible revert (CAP-7) matter more here, not less.

## Save feedback

`handleCellCommit` already resolves a rejection into a visible revert and a status line. The panel reuses it and must show three states distinctly — CAP-7's success names all three:

| State | Surface |
| --- | --- |
| saving | a spinner on the field; the field is not re-editable |
| saved | transient confirmation; the grid row is already updated optimistically |
| failed | the server's own message (`readError`, `manage-contacts-table.tsx:37`), the cell reverts |

**One validation story, one message.** `use-grid-keyboard` owns it. A second error surface in the panel is a third thing to keep in step — the code says so in as many words at `:468-474`.

## State preservation on close

The assertion is the point. On close, all of these must be identical:

- filters (`q`, `f.<colId>`)
- sort (`sort`)
- column order and visibility (`cols`, `hide`)
- column widths (`size.<colId>`)
- row selection (`rowSelection`)
- **scroll position** — the panel must not unmount the grid's scroll container, which is why it is a sheet and not a route change
- the focused cell, if one is focused

Scroll is the one that breaks silently. It is not in the URL. If the panel is a client-side overlay over an unmounted-then-remounted grid, scroll resets to top and every other assertion still passes.

## Testable seams

Assert on attributes, not on panel internals:

| Seam | Selector | Asserts |
| --- | --- | --- |
| panel open | `data-record-panel` | present after the action control is used, absent after close |
| open record | `data-record-panel-record` | equals the activated row's id |
| field | `data-record-panel-field="<columnId>"` | renders the label, not the id |
| save state | `data-record-panel-saving` | present during, absent after |
| navigation | `data-record-panel-nav="next" \| "prev"` | disabled at the ends |

All new. **Do not repurpose an existing `data-grid-*` attribute** — `e2e/fixtures/manage-grid.ts` documents that contract, and 21 specs outside this work depend on it.

Required specs, matching the brief's minimum test list: open, close, navigate, edit-and-save, failed-save reverts and surfaces the message, and grid state preserved across open/close. The dirty-close prompt spec is **deleted** — it tested behaviour CAP-10 removed.
