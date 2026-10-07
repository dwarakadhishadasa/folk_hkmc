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
| `editable: true` | Gates the `e` key. Also the only thing that should be in `PATCH_KEY_BY_COLUMN`. |
| `filter: "text" \| "number"` | Chooses the per-column filter control and supplies its `filterFn` |
| `align`, `tabular` | Reaches the cell directly |
| `frozen: true` | Joins the pinned run |
| `selectable: true` | Row-selection control: excluded from the pinned run and from hiding |
| `hideable: false` | Removed from the visibility menu |

For the select column set `enableSorting: false` and `enableHiding: false` on the def as well; the
metadata expresses intent, the flags express behaviour.

### Custom cells and headers use TanStack's renderer

A cell widget is `columnDef.cell`, a header widget is `columnDef.header`. `flexRender` is exported
from `@tanstack/react-table` and is what `grid.tsx` calls. Do not add a `renderCell` prop: it would
be a second contract for one job.

A header widget suppresses that header's sort button, filter popover, column menu and resize
handle. A header that is a control must not also be a sort button.

Two conventions inside a custom cell:

- `onPointerDown` → `stopPropagation()`. Otherwise the cell takes the pointer, the grid moves cell
  focus to that column, and the next `e` becomes a no-op because the column is not editable.
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

## 6. URL state contract

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

## 7. Porting checklist

- [ ] Refactored in place; the caller and the prop signature did not change.
- [ ] `sort`, `q`, `f.*`, `cols`, `hide`, `size.*` round-trip; `?mode=` survives.
- [ ] Identity column pinned as part of the leading run; one 1px divider, no scroll shadow.
- [ ] `select` first, row action last.
- [ ] Editable columns appear in `meta.grid.editable` **and** `PATCH_KEY_BY_COLUMN`.
- [ ] Every commit rejects with an `Error` carrying the server's message.
- [ ] One fetch helper, `readError` on every body, named network failure.
- [ ] Selection held in `useState`, passed as `state.rowSelection`, with `onRowSelectionChange`; not
      in the URL.
- [ ] Bulk action reports every row individually and applies only confirmed writes.
- [ ] No `useMemo` sort or filter of the row set, no `components/ui/table`, no second table.
- [ ] Nothing under `components/grid/` imports `@/components/manage/*` or names `/api/manage`. The
      primitives are consumed by four tables; anything table-specific in them stops them being
      primitives.

## 8. Report divergence

**A port that cannot follow this document says so in its story, rather than quietly absorbing the
difference.** Record what did not carry over, what was forced, and what later tables should expect
instead. Then update this document. A pattern contract that drifts without being reported is worse
than no contract, because it reads as settled.

Known gaps at the time of writing:

- No command palette, and no `/manage` table jump. `design-constraints.md` requires
  `Cmd`/`Ctrl`+`K`; it is still to come.
- No `Select`-based column filter. The contacts port replaced a sentinel-valued dropdown with
  per-column filter popovers, which compose with the global filter instead of replacing it.
- The favorite star is the only row action. A row-action *menu* is the obvious next primitive if
  more than one per-row action appears.
- `docs/` is excluded from ESLint, so this document is not linted. Keep it honest by hand.