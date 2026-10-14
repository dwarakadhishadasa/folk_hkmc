# The `/manage` grid pattern

The contract every `/manage` table follows. `components/manage/manage-contacts-table.tsx` is the
worked example; this document is what a later port reads *before* porting, because the agreement
that used to be settled by a human review gate is now settled in writing.

Read the companions too — `design-constraints.md` for density and surface rules,
`data-loading-decision.md` §3 for why rows are virtualized client-side and when that changes.

## 1. Host the grid, never a second table

The refactor is *in place*. `manage-contacts-table.tsx` kept its name, its `"use client"` directive
and its single `payload: ManagePortalPayload` prop; `manage-portal.tsx` did not change. There is one
table component in the portal, and it is a `<Grid>` host.

Forbidden, and checked by reading the source:

- A second table implementation beside the grid.
- `components/ui/table` imported by a ported table. `grid.tsx` emits `<table>` markup directly
  because that wrapper's div is a second scroll container, which would capture both the virtualizer
  and the sticky columns.
- `useMemo` sorting or filtering of the row set. Sorting and filtering belong to TanStack's client
  row models (`getSortedRowModel`, `getFilteredRowModel`); a hand-rolled comparator beside them is
  the defect this pattern exists to remove.

`useMemo` is still fine for a lookup the grid cannot derive — a `Map` of location ids to names, for
instance. What is forbidden is a memo that orders or filters the contact set.

## 2. Column definitions

Build columns with `createColumnHelper<T>()` and pin `id` on every def, so the grid's ids and
`useGridViewState({ columnIds })` cannot drift. `COLUMN_IDS` is the same list, in display order.

### Layout: `select`, identity, …, row action

| Position | Column | Why |
| --- | --- | --- |
| 1 | `select` | Selection control, never data |
| 2 | the identity column | Pinned, so scrolling right never loses the row |
| … | data columns | |
| last | the row-action column | Star, menu, anything that acts on one row |

The select column sits *in front of* the identity column, which is why the grid freezes a **marked
leading run** with cumulative `left` offsets rather than "whichever column is first". A leading
select column under the old rule would have become the frozen column and the identity would have
scrolled away.

### `meta.grid`

| Key | Effect |
| --- | --- |
| `editable: true` | Gates the double-click that opens the editor — and it is the *only* opener. Also the only thing that should be in `PATCH_KEY_BY_COLUMN`. |
| `editor: <GridEditorKey>` | Names the typed editor the cell renders and parses with. Resolved through the registry in `components/grid/grid-editors.tsx`. |
| `editorOptions` | Presentation-only configuration for that editor: `options`, `users`, `currency`, `locale`. |
| `fieldType: <GridFieldType>` | Names what the cell **holds**, resolved through the registry in `components/grid/grid-cell-renderers.tsx`. Independent of `editor` — see below. |
| `unresolvedText` | The marker a `linked` accessor substitutes for an id its lookup cannot resolve. Pairs with `fieldType: "linked"`. |
| `emphasis: true` | Marks the one column per row that carries the row's identity. Weight and space only, never a colour. |
| `filter: "text" \| "number"` | Supplies the column's value type and its `filterFn` |
| `align`, `tabular` | Reaches the cell directly |
| `frozen: true` | Joins the pinned run |
| `selectable: true` | Row-selection control: joins the pinned run ahead of the identity column |
| `hideable: false` | Removed from the visibility menu |

### `fieldType` is not `editor`, and that is the point

Two different questions, two different keys:

| Key | Question | Absent means |
| --- | -------- | ------------ |
| `editor` | How is this cell **edited**? | the cell cannot be edited at all |
| `fieldType` | What does this cell **hold**? | the cell renders its plain text |

They are separate declarations and neither is derived from the other. A joined
accessor column — `location`, `collectedBy` — has **no editor and no stored
value**, because its value is derived at render time from ids the payload
already resolved. A renderer keyed on `editor` alone renders nothing for both:
they fall through to bare text while a stored field next to them renders a pill.

So every column declares both, and `fieldType` covers `text`, `select`,
`multiselect`, `date`, `number`, `boolean`, `linked` and `longtext`. The grid
hands `grid-row.tsx` three attributes for this: `data-grid-field-type`,
`data-grid-cell-editable` and `data-grid-cell-emphasis`.

**A column supplying its own `cell` widget declares no `fieldType`.** The widget
has already chosen the cell's appearance; a data renderer over the favorite star
would be restyling a button as if it were a value.

#### `linked`, and the unresolved marker

A `linked` cell renders one label and **never invents one**. An id with no
matching lookup is a different fact from no id at all, so the two must not
collapse:

| State | Renders |
| --- | --- |
| Ids resolve | the labels, joined — as one pill, **not split per id** |
| An id resolves to nothing | `meta.grid.unresolvedText` |
| No ids at all | nothing |

The marker wording lives in the **consumer** because the grid has no vocabulary
for a location: `UNRESOLVED_LOCATION` in `manage-contacts-table.tsx` reads
correctly there and means nothing in a primitive. It travels through
`unresolvedText` and the renderer *marks* the cell rather than matching a shape,
so rewording the marker cannot silently stop it being recognised.

Never derive a label from the id. `?? id` printed a raw UUID into the cell, into
its `title`, and out through the clipboard; that fallback is what this replaced.

`filter` used to do a second job — choosing the per-column filter popover
control. That control is gone: headers carry no funnel button, and the filter
conditions bar (story 6 of the premium-grid spec) reads this key only as a
value type when it lands. What survives is the first job, supplying `filterFn`
so `f.<colId>` keeps filtering after the control moved.

For the select column set `enableSorting: false` and `enableHiding: false` on the def as well; the
metadata expresses intent, the flags express behaviour.

**A column in the pinned run cannot be hidden or reordered.** `columnOrder` is always writable in
TanStack — there is no flag to turn off — so the grid withholds the drag
activator from pinned members (no handle, no `useDraggable`), exactly as it
gates the visibility menu, and rejects any drop whose *resulting order* would
interleave a scrolling column into the run (`isPinnedRunIntact` in `grid.tsx`,
validated before commit, never just the drop target). Reordering `select` drops it out of the run and
takes the identity column with it; reordering the identity column lets it scroll away. Either one
undoes the reason the run exists.

### Custom cells and headers use TanStack's renderer

A cell widget is `columnDef.cell`, a header widget is `columnDef.header`. `flexRender` is exported
from `@tanstack/react-table` and is what `grid.tsx` calls. Do not add a `renderCell` prop: it would
be a second contract for one job.

A header widget suppresses that header's column menu, drag activator and resize
handle. A header that is a control must not also be a sort button — and since
no header label is a sort button anymore (sorting lives in the one global sort
popover, opened from the column menu), the reverse holds too: the label is
text plus a sort indicator, never a control of its own.

**Omit `cell` on every plain value column — and know that omitting it is the whole point.**
TanStack's `_getDefaultColumnDef()` supplies `cell: props => props.renderValue()?.toString() ?? null`
for *every* column, so `columnDef.cell` is never absent and cannot be used to ask whether a column
carries a widget. The grid therefore resolves that question from the column definitions **you handed
it**, before the defaults are merged, and renders `cell.text` — not the default renderer — for every
column that supplies none.

That is not cosmetic. `cell.text` is where the optimistic override and the `title`
tooltip live. A grid that trusted `columnDef.cell` renders the library's `renderValue` for
every accessor column instead, and an in-flight edit sits there showing the *old* value until the
write resolves — with nothing in the console and no failing type check. This shipped once; it is
why `renderCellNode` takes a resolved set instead of asking the column def.

**Never mark a column `editable` *and* give it a `cell` widget.** The two are exclusive
here. A widget renderer replaces the value the grid would otherwise print, and `cell.text`
is where the optimistic override lives — so an editable column with a widget shows the
*old* value for the whole round trip, with no error anywhere. Nothing warns you: the
column typechecks, it renders, and it silently loses CAP-5. An editable column must be a
plain accessor; put the widget in `header`, or in a separate non-editable column.

### `meta.grid.editor` is the third way, and it is not a widget

`editor` replaces that prohibition rather than being an exception to it. An editor column
**still supplies no `cell`**; the editor is resolved by key inside the primitive, and the
cell renders it *after* the override has been applied. `editorOptions` carries the option
list, the user list and the currency code — presentation only, like every other
`meta.grid` key, and never a value.

The rule that is actually load-bearing, and the reason DW-27 is closed rather than
documented:

> **A closed-state editor display must render `ctx.text`, never `ctx.getValue()`.**

`ctx.text` is the cell's display value with the optimistic override already on it.
`getValue()` is the stored value, for seeding a draft and nothing else. An editor that
re-reads the stored value shows the *prior* value for the whole round trip — the exact
defect the default-renderer mistake produced, one layer down. `grid-row.tsx` already
hands the editor the overridden text and falls back to it when `renderDisplay` returns
`undefined`, so an editor that omits a display widget cannot get this wrong; only one that
writes a widget can.

Two more conventions inside an editor display:

- **It must not be a `<button>`.** `e2e/fixtures/manage-grid.ts` resolves the favorite star
  as `getByRole("button")` *inside the row, unscoped*, and four green assertions rely on it
  being the only one. A button in every `select` / `multiselect` / `date` / `user` cell makes
  those ambiguous. The grid's own editors use a `<span role="presentation">`: the cell is
  already the focusable, keyboard-reachable thing, and a double-click opens its editor.
- **It must not grow the cell.** `GridRow` enforces fixed row heights, so anything with a
  list, a search, a calendar or a multi-line body opens in a `Popover` portal. `notes` is a
  popover precisely because a textarea cannot fit in 32px.

**One consequence to expect on your table: tooltips.** While the default renderer was winning,
`cell.render` was defined for every accessor column, and `GridRow` skips `title` whenever `render`
is set — so no value cell had a tooltip at all. Now that plain columns fall back to `cell.text`,
every non-empty value cell carries one, showing the full text behind a truncated cell and the
rejection message on a reverted one. That is the intended behavior for a fixed-row-height grid, and
it is a visible change on a table that already shipped: nothing regressed, something appeared.

Two conventions inside a custom cell:

- `onPointerDown` → `stopPropagation()`. Otherwise the cell takes the pointer, the grid moves cell
  focus to that column, and the next double-click becomes a no-op because the column is not editable.
- A row checkbox goes through `row.getIsSelected()` / `row.toggleSelected()` and the header control
  through `row.getIsSelected()` over `table.getRowModel().rows`, so `data-state="selected"` and the
  checkbox never disagree.

### Derived values are accessors, not state

`location` and `collectedBy` are `accessorFn` columns that join ids into the names the payload
already resolved. A joined **string**, not an array: the per-column text filter, the sort order and
the rendered cell then all read the same value.

## 3. The commit / rollback contract

`use-grid-keyboard.ts` already owns the whole CAP-5 state machine: the draft, the optimistic
display, the visible revert and the status line. A port supplies `onCellCommit` and nothing else.

```ts
const handleCellCommit = useCallback(async (commit: GridCellCommit<T>) => {
  const patchKey = PATCH_KEY_BY_COLUMN[commit.columnId]
  if (!patchKey) {
    // Reject rather than throw synchronously, and never send a patch anyway.
    throw new Error(`${labelFor(commit.columnId)} cannot be edited here.`)
  }

  applyWrite(await patchContact(commit.rowId, { [patchKey]: commit.value }))
}, [...])
```

Rules:

- **Reject with `new Error(message)`.** `use-grid-keyboard` resolves a rejection into a visible
  revert, a destructive cell and a status line. Returning `false`, swallowing, or rendering your own
  toast all break the same contract in three different ways.
- **One fetch path.** Every write in the component — inline edit, row action, anything later — goes
  through one helper that `fetch`es, routes the body through `readError`, and throws on a non-OK
  response. Two helpers means two error vocabularies.
- **Name the network failure.** Wrap a rejected `fetch` as `new Error("Unable to reach the
  server.")`; a raw `TypeError: fetch failed` is not actionable.
- **Merge the committed row.** `updateManageContact`'s result deliberately omits the attendance
  rollups, so `{ ...contact, ...written }` is the right merge and does not clobber the counts.
- **Do not reintroduce wrapping.** Row heights are fixed at 32px / 28px, so cells truncate to one
  line and the cell's `title` carries the full text. `whitespace-normal` on `notes` is a regression,
  not a fix.
- **Read error bodies through `readError`,** including the batch response. It exists because a
  malformed payload once meant a render crash.

`onEditError` is optional. The grid's own status line already shows the message; add a second
surface only when a port has something extra to say.

## 4. Selection

Selection is **not** URL state. `pickGridState` enumerates six grid keys and `rowSelection` is not
one of them, because a selection is per-visit working state: encoding it would make a shared link
carry someone else's row set.

So the consumer owns it in `useState` and passes it in two places:

```tsx
state={{ ...viewState, rowSelection }}
onRowSelectionChange={setRowSelection}
```

**The trap.** `grid.tsx` resolves TanStack's state updater against the table's merged state and
forwards the whole result to `onStateChange`, which is the URL writer. An un-intercepted
`rowSelection` change therefore attempts a URL write on every checkbox click. `Grid` splits
`rowSelection` out of the resolved value, hands it to `onRowSelectionChange`, and deletes it before
forwarding. If you ever find yourself adding a `rowSelection` key to the URL codec, something has
already gone wrong.

Conventions:

- The header control's state describes the rows **in view**, so a mixed view renders
  `"indeterminate"` and its label names both counts.
- Toggling the header acts on the visible rows only. Selection survives filtering, and the stated
  count is the whole selection — not the visible subset.
- An empty selection issues no request, and the action control is disabled rather than inert-by-hope.

## 5. Bulk actions

One action reaches one batch handler, and the batch semantics are settled here rather than
rediscovered per table.

### Request

```
PATCH /api/manage/contacts/bulk
{ "items": [ { "contactId": "<uuid>", "patch": { "isFavorite": true } }, … ] }
```

A per-item patch rather than `{ contactIds, patch }`, so a future bulk action whose rows need
different values does not need a second endpoint.

### Response

| Status | Meaning |
| --- | --- |
| `200 { results: [{ contactId, ok, contact? , error? }] }` | Every item was attempted |
| `400 { error }` | The **envelope** was wrong: not an object, `items` absent, not an array, empty, or over the cap. Nothing was written. |

`MANAGE_BULK_MAX_ITEMS = 200` is a timeout guard, not a product limit, and the client surfaces the
number so a selection over it shows the ceiling rather than a silent truncation.

**Any per-row failure, an `AuthzError` included, is a `200` with `ok: false` on that item.** A
partial batch is not a rejection and is never all-or-nothing.

### The handler

`handleManageContactBulkUpdate` in `lib/manage/api-handlers.ts` reuses the single-row path per item:

- `getStaffContext()` → `requireRole(staff, ["Admin", "Preacher"])`. No new authorization logic.
- `parseContactPatch(item)` per item, so a bad key is rejected with the same 400 wording and against
  the same `MANAGE_CONTACT_PATCH_KEYS` allow-list the single-row route uses.
- `updateManageContact` per item, so each row keeps its own scope assertion and its own audit event.
  **There is no set-based write and no bypass of `lib/manage/api-handlers.ts`.**
- Items run **sequentially**: audit events stay in request order, each row's scope assertion is
  independent, and there is no burst of concurrent writes against PostgREST.

RLS remains the enforcement point. A client may render a disabled affordance, but it must never
re-read scope to decide one.

### Reporting

The success condition is **per-row reporting**:

- One visible result line for **every** selected row, successes included. A collapsed toast fails
  the capability even when every row succeeded.
- A failure names its row and the server's own message.
- Only rows the server confirmed are applied to local state. A failed row keeps the value the
  operator can already see; nothing is marked saved that was not.
- A `200` whose body has no `results` array is a **bulk failure naming the response**, not a success.
- Selection is cleared **after** a run completes, never during it, so the operator can read the
  outcomes and then select again.

## 6. Row lifecycle

CAP-6. Opt into it by passing `rowLifecycle` to `Grid`; leave it off and the grid
has **no** add control, no delete affordance, no confirmation and no report. The
primitive never assumes a table can create or destroy a row.

```tsx
const rowLifecycle: GridRowLifecycle<T> = {
  createRow: () => { /* append a blank row to *your* state; return { id, row } */ },
  getRowLabel: (row) => row.name,
  onDeleteRow: async (row) => { /* the delete write; reject with a message to fail the row */ },
  canCreate: true,
}

<Grid
  rows={rows}
  rowLifecycle={rowLifecycle}
  onRowRemoved={(rowId) => { /* drop the row the server confirmed */ }}
  …
/>
```

Four members and nothing else — no row shape, no validation rule, no "save"
concept. The primitive renders the affordance, the confirmation and the report;
the table owns the row and every byte that crosses the network.

### Adding a record

- **The draft row is an ordinary row in your own state.** The grid cannot append
  to a `rows` prop it does not own, and a second row set inside the primitive
  would be a second source of truth for what the operator is looking at.
- **A cell commit on a draft row *is* the create.** It goes through your existing
  `onCellCommit` and nowhere else, so the create inherits the optimistic
  override, the destructive revert and the status line for free. **Do not add a
  second mutation channel for it.**
- **`createRow` returns a client-generated id** the grid can focus. The database
  owns `id`; a row that exists only on screen needs something that cannot collide
  with one, and the grid addresses the draft by that id until the server replaces
  it.
- **Focus lands through the keyboard model**, on the row's first `editable`
  column, exactly as an arrow press moves it. There is no ref-and-scroll, and no
  second rule for "added" rows. Two keyboard-model calls do it, and the split is
  load-bearing rather than tidiness: `focusRow` resolves the row and moves the
  model onto it (anchor, row index, column, `scrollToIndex`), `focusRowCell`
  lands DOM focus and returns whether it landed. `scrollToIndex` only moves the
  scroll offset — the virtual range updates on the render *after* it — so a caller
  that read `focusRow`'s `true` as "the cell is focused" parked focus on the grid
  frame and stopped retrying. `Grid` retries `focusRowCell` against the rendered
  window until it lands.
- **Accumulate the draft's values before the request, not after it succeeds.**
  Two `NOT NULL` fields cannot both be satisfied by one commit, so the handler
  refuses the first field and the second commit has to carry the first field's
  value along. Rolling back on failure instead makes a two-field record
  impossible to create. The cost is that a *refused* draft's cell shows the
  pre-commit text for one step while the row holds what was typed; the promotion
  corrects it.
- **Required-field rules stay server-side.** `parseContactPatch` names the field
  that is missing; the client reads that wording and throws it into the revert
  path. A client-side pre-check is a second copy that drifts.

### Deleting a record

- **The control is a column you render**, not one the grid injects:

  ```tsx
  cell: ({ row }) => <GridRowDeleteControl rowId={row.id} label={row.original.name} />
  ```

  A separate row-action column rather than a second control inside an existing
  one, so a column that renders a value and a column that acts on a row stay
  distinguishable in the header, in the visibility menu and in a spec.
- **Confirmation before action**, naming the row. Nothing is written until it is
  confirmed.
- **One visible outcome line per row**, successes included. A collapsed toast
  fails the capability even when every row succeeded — the same rule §5 states
  for the bulk action.
- **Only a confirmed delete is applied locally.** `onRowRemoved` fires for the
  rows the server confirmed and for nothing else, so a refused row keeps the
  value the operator can already see.
- **Drop the row's id from `rowSelection` too.** The selection is keyed by the
  same id, and a surviving entry makes the header count a row that is gone.

### Routes

| Method | Path | Handler |
|---|---|---|
| `POST` | `/api/manage/contacts` | `handleManageContactCreate` |
| `PATCH` | `/api/manage/contacts` | `handleManageContactUpdate` |
| `PATCH` | `/api/manage/contacts/bulk` | `handleManageContactBulkUpdate` |
| `DELETE` | `/api/manage/contacts` | `handleManageContactDelete` |

Both new handlers go through `lib/manage/api-handlers.ts` with the same
`getStaffContext()` + `requireRole(staff, ["Admin", "Preacher"])` the single-row
update uses, and the create reuses `parseContactPatch` verbatim — the allow-list,
the length bounds and the required-field wording are literally the same code the
update route runs. The route file is the byte-identical pair across `apps/folk`
and `apps/gita-life`; `md5sum` it after editing.

`DELETE` takes `contactId` in the **body**, not the query string, so it travels
through the same `normalizeContactId` and the same 400 wording as the update. A
second id channel would be a second validation path.

There is **no cascade**. `attendance.contact_id` references `contacts(id)`
without `ON DELETE CASCADE`, so a contact with recorded attendance is refused
with `409` and a named reason rather than silently taking its history with it.

## 7. URL state contract

Sort, filters, column order, visibility and size live in the URL, via `useGridViewState` as shipped.
Do not extend `GRID_PARAM_KEYS` / `GRID_PARAM_PREFIXES`, and do not add state the codec does not
name — density and row selection are the two deliberate exceptions, and both are local.

| Param | Meaning |
| --- | --- |
| `sort` | `colId:asc[,colId:desc]` in priority order |
| `q` | Global filter text |
| `f.<colId>` | Per-column filter |
| `cols` | Ordered, comma-joined column ids |
| `hide` | Hidden column ids, comma-joined |
| `size.<colId>` | Committed column width in integer px |

`applyGridParams` starts from a copy of the live params and touches only grid-owned keys, which is
what keeps `?mode=admin|preacher` byte-identical across every write. Never add a URL write that
strips it.

`sort` is written by the global sort popover (one field plus one direction, cleared to absent);
`cols` is written once per header drop through the transient handle, and only when the resulting
order differs and leaves the pinned run intact. Neither is ever written per frame.

## 8. The cell-metrics contract

The numbers the grid renders at, and the four states a cell can be in. Both are
asserted in `e2e/specs/grid-cell-metrics.spec.ts`; this section is what that file
is reading.

### Where the numbers live

One record, `GRID_DENSITY_OPTIONS` in `grid-row.tsx`, carries each option's
`{ density, label, height }`. Everything else is derived from it:

| Derived | Used by |
| --- | --- |
| `GRID_ROW_HEIGHT` | `grid-row.tsx` (`<tr>` height), `grid-panel.tsx`, `grid.tsx` (the virtualizer's `estimateSize`) |
| `GRID_DEFAULT_DENSITY` | every consumer's `useState`, so the trigger's initial readout cannot disagree with the initial height |
| the control's options | `grid-toolbar.tsx` renders them by mapping the record |

They used to be written in four unrelated places — a height map, two `useState`
literals and two `SelectItem` children — which meant the control could read
"Default rows" over a grid drawing 28px and nothing would fail. **An option that
exists has a height, and a height that changes moves its label with it.**

### What is fixed, and why it is fixed

| Token | Value | Where |
| --- | --- | --- |
| Grid base font | **13px** | `GRID_BASE_FONT_CLASS` on the `<tr>`, `text-[13px]` on every `<td>` |
| Default row height | **32px** | `GRID_DENSITY_OPTIONS[0].height` |
| Dense row height | **28px** | `GRID_DENSITY_OPTIONS[1].height`, a user option only |
| Cell padding | **8px** horizontal | `px-2` on the `<td>` |
| Active indicator | **1px inset** ring | `ring-1 ring-inset` — inset, so it occupies no layout box |

Fixed row heights are **load-bearing**, not a preference: the virtualizer
estimates from `GRID_ROW_HEIGHT`, so a row that grew would leave the scroll
geometry permanently wrong. Nothing may grow a cell — long text truncates to one
line and `title` carries the full value, and anything that needs more room (a
textarea, a calendar, a searchable list) opens in a `Popover` portal.

### The four states, and the attribute each is named by

| State | Named by | Driven by |
| --- | --- | --- |
| row hover | **nothing** — CSS `:hover` on the row | the pointer |
| active cell | `data-grid-cell-active` on the `<td>` | `focusedRowId` + `focusedColumnId`, i.e. React state |
| cell range | `data-grid-cell-selected` on the `<td>` | the selection model |
| row selected | `data-state="selected"` on the `<tr>` | the consumer's checkboxes |
| editing | the editor control inside the cell | the double-click that opened it |

**Active is React state, never CSS.** A `:hover`-driven "active" cannot be moved
with an arrow key and cannot be read by a test. It is presence-only, like
`-selected` and `-emphasis`, so "exactly one cell is active" is a `toHaveCount(1)`
rather than a scan for `="false"`.

Read the attribute, not the class. `ring-1` is a Tailwind detail: renaming the ring
to a `box-shadow` would break a spec that was never about rings. The same seam
already exists as `data-grid-cell-editable`, `data-grid-cell-emphasis` and
`data-grid-field-type` for the same reason.

The four are independent signals. An active cell sits inside a range, on a
selected row, or under an open editor, and none of those implies another.
**Appearance is not asserted** — `design-constraints.md` bans shadows and
stripes, which is exactly the CSS a hardcoded assertion would freeze; the
mandated *numbers* above are asserted, and the colours are graded by eye.

One consequence worth knowing before you write a gesture: the range's `extent`
tracks the focus, and a plain pointer-down re-anchors. So a plain double-click
drops the range, and an open editor with a live range survives only when the
double-click carries `Shift`.

## 9. Porting checklist

- [ ] Refactored in place; the caller and the prop signature did not change.
- [ ] **The grid fills the frame, and every ancestor between `main` and `<Grid>` carries the
      height to it** — see §10. A missing `min-h-0` on any hop is the whole failure.
- [ ] `sort`, `q`, `f.*`, `cols`, `hide`, `size.*` round-trip; `?mode=` survives.
- [ ] Identity column pinned as part of the leading run; one 1px divider, no scroll shadow; no
      pinned column is hideable, draggable, or a valid drop target for a scrolling column.
- [ ] `select` first, row action last.
- [ ] Editable columns appear in `meta.grid.editable` **and** `PATCH_KEY_BY_COLUMN`.
- [ ] Editable columns name an `meta.grid.editor` where a typed control fits, and still
      supply no `cell` widget of their own.
- [ ] Every column declares `meta.grid.fieldType`, including joined accessors that have
      no editor; exactly one column carries `emphasis`.
- [ ] A joined accessor substitutes its own `meta.grid.unresolvedText` for an id the
      lookup misses, and never falls back to the id or to `""`.
- [ ] Every commit rejects with an `Error` carrying the server's message.
- [ ] One fetch helper, `readError` on every body, named network failure.
- [ ] Selection held in `useState`, passed as `state.rowSelection`, with `onRowSelectionChange`; not
      in the URL.
- [ ] Bulk action reports every row individually and applies only confirmed writes.
- [ ] `rowLifecycle` supplied with a row factory, a row label and a delete write — or deliberately
      omitted, in which case there is no add control and no delete affordance anywhere.
- [ ] A cell commit on a draft row is the create, routed through the same `onCellCommit`; no second
      mutation channel.
- [ ] Delete confirms before acting, names the row, and reports one outcome line per row.
- [ ] No `useMemo` sort or filter of the row set, no `components/ui/table`, no second table.
- [ ] Density initialised from `GRID_DEFAULT_DENSITY`, never from a `"default"` literal, and no second
      place names a density's label (§8).
- [ ] Nothing grows a cell or a row: long values truncate with a `title`, and anything that needs more
      room opens in a `Popover` (§8).
- [ ] Nothing under `components/grid/` imports `@/components/manage/*` or names `/api/manage`. The
      primitives are consumed by four tables; anything table-specific in them stops them being
      primitives.

## 10. The grid fills the frame; its ancestors carry the height

**`<Grid>` takes the height it is given. It does not decide its own.** The scroll container is
`min-h-0 flex-1 overflow-auto` inside a `flex min-h-0 flex-1 flex-col` root, which means the grid
has no opinion about the viewport — and *cannot* have one, because the space above it is not a
constant.

The chain on `/manage?view=contacts`, from the shell inward:

| Hop | Carries |
| --- | --- |
| `apps/*/app/manage/page.tsx` shell | `flex h-dvh flex-col overflow-hidden` — the only place the viewport is named |
| …its `main` | `flex min-h-0 flex-1 flex-col` |
| `manage-portal.tsx` root | `flex min-h-0 flex-1 flex-col gap-6` |
| its `Tabs` | `min-h-0 flex-1` |
| the contacts `TabsContent` | `flex min-h-0 flex-col` — **no `overflow-auto`** |
| `manage-contacts-table.tsx` root | `flex min-h-0 flex-1 flex-col gap-3` |
| `grid.tsx` root → scroll container | `flex min-h-0 flex-1 flex-col` → `min-h-0 flex-1 overflow-auto` |

The other four tabs **do** take `overflow-auto`: they exceed the viewport and would otherwise be
clipped by the bounded shell. Contacts is the exception, because a second scroller above the grid is
the nested scrollbar this chain exists to remove.

### Two mistakes, both of which compile and both of which ship

**A missing `min-h-0` is silent.** A flex item defaults to `min-height: auto`, which refuses to shrink
below content. Drop one `min-h-0` and that hop stops being bounded and grows to its content instead —
the page scrolls again, and it reads as "the page scrolls again" rather than as a missing class.
`flex-1` alone is not enough either: `flex-1` distributes *free* space, it never creates a bound.

**A viewport fraction is a guess.** The offset above the grid moves with the page header height, with a
tab row that wraps at narrow widths, and with a scope notice that renders only in preacher mode. So
`max-h-[70vh]` is wrong in principle, and a `calc(100dvh - X)` substitute is the same guess with more
arithmetic. `harness-guards.spec.ts` bans the `vh` **unit** under `components/grid/` — not the one
literal value, so the `calc` form cannot come back through the side door.

### Why the cap was not simply deleted

With the cap gone and nothing above it establishing a height, the container becomes the virtualizer's
full extent (~8,000px at 250 rows). It then never scrolls vertically, so `position: sticky; top: 0` on
the header has no scrollport and the header scrolls away — and the horizontal scrollbar lands at the
bottom of that 8,000px, which is the clipped-final-column complaint arriving by a different route.

The header is `bg-muted` against the body's `bg-card`. That is a comparison to assert, never a literal
— see §8 on why appearance is graded by eye and only the mandated numbers are frozen.

`grid-scroll-surface.spec.ts` covers this: one scroll container on the page, the container's bottom
inside the viewport, the header still flush after scrolling to the bottom, the final column reachable
when scrolled right, and the bulk report bounded rather than crushing the grid.

## 11. Report divergence

**A port that cannot follow this document says so in its story, rather than quietly absorbing the
difference.** Record what did not carry over, what was forced, and what later tables should expect
instead. Then update this document. A pattern contract that drifts without being reported is worse
than no contract, because it reads as settled.

Known gaps at the time of writing:

- No command palette, and no `/manage` table jump. `design-constraints.md` requires
  `Cmd`/`Ctrl`+`K`; it is still to come.
- **A ported table must carry the height to its grid** (§10). A new surface under `/manage` inherits
  the bounded shell for free, but only the contacts tab has the chain today — a second grid needs the
  same hops, or it reintroduces the page-level scroller.
- **`openContactsGrid` waits for `data-grid-panel="ready"` and a non-zero count, neither of which is
  the rendered row window.** Read geometry immediately after it returns and the scroll container
  measures ~32px with an `innerHeight`-tall document, because the virtualizer has not rendered yet.
  Every geometry assertion must wait for `tr[data-grid-row]` to exist first — see
  `waitForRenderedRows` in `grid-scroll-surface.spec.ts`, and the same poll in
  `grid-cell-metrics.spec.ts`.
- No `Select`-based column filter. The contacts port replaced a sentinel-valued dropdown with
  per-column filter popovers, which compose with the global filter instead of replacing it.
  The popovers are now removed again — headers carry no filter control until the filter
  conditions bar (premium-grid story 6) lands, and `f.<colId>` round-trips through the URL
  meanwhile.
- The favorite star is no longer the only row action — the row lifecycle's delete control sits in its
  own `actions` column. A row-action *menu* is the obvious next primitive if more per-row actions
  appear.
- `favoriteStar` in `e2e/fixtures/manage-grid.ts` used to resolve `getByRole("button")` **inside the
  row, unscoped**, which is why a closed-state editor display must not be a `<button>`. The row
  lifecycle added a second button per row, so that locator is now scoped by accessible name
  (`/favorites$/`). That is a narrowing, not a loosening: every assertion still resolves to the same
  element. **Anchor the pattern on the part of the name that does not change with state** — the star
  reads `Add <name> to favorites` *or* `Remove <name> from favorites`, and an earlier `/to favorites$/`
  matched only the first form, so every already-favourited row timed out. **A third per-row button
  means the naming discipline has to hold.**
- A spec that intercepts a request with `page.route` should call `test.use({ serviceWorkers: "block" })`
  and register the route **before** navigating. `providers.tsx` registers `/sw.js` on every page, and
  once that worker controls the page the requests it serves never reach the network stack
  `page.route` watches — an interception installed after `goto` intermittently did not fire at all,
  observed as a test that deleted a row for real and then asserted the server had refused it.
- `docs/` is excluded from ESLint, so this document is not linted. Keep it honest by hand.
