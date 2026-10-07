---
title: 'Refactor manage-contacts-table onto the grid with inline editing and bulk actions'
type: 'refactor'
created: '2026-10-08'
status: 'in-progress'
baseline_revision: 'b3e1a3d'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/specs/spec-manage-dashboard-grid/data-loading-decision.md'
  - '{project-root}/_bmad-output/specs/spec-manage-dashboard-grid/design-constraints.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** `components/manage/manage-contacts-table.tsx` hand-rolls sorting and location filtering over the whole scoped row set with `useMemo`, renders no row virtualization, and holds all state in component state so nothing survives a reload. It also has no multi-row selection and no bulk action, and it cannot do inline cell editing at all. This is **the** pattern story: `capability-tiers.md:43` makes it the worked example that stories 3 and 5 copy without a human gate, so its agreements land as a written contract (`docs/manage-grid-pattern.md`) rather than as tacit understanding.

**Approach:** Port the component onto the story 1 `<Grid>` as a **refactor of the existing table**, not a table beside it. Delete `SortKey`, `COLUMNS`, the `useMemo` sort/filter block, the `ALL_LOCATIONS` sentinel `Select`, and the `Status` union. Wire CAP-5 to the existing `PATCH /api/manage/contacts` through `onCellCommit`, add CAP-4 selection plus one real bulk action that reaches a new batch handler in `lib/manage/api-handlers.ts` and reports per-row outcomes, and land `docs/manage-grid-pattern.md`.

## Boundaries & Constraints

**Always:**

- **Refactor in place.** `manage-contacts-table.tsx` keeps its name, its `"use client"` directive, and its single `payload: ManagePortalPayload` prop (`manage-portal.tsx:128` is the only caller and must not change). No second table component. `SPEC.md:74` forbids a parallel implementation: two grids means two sets of bugs and a permanent migration tax.
- **Preserve `readError` (`manage-contacts-table.tsx:43-51`) verbatim** in the contacts module. It defensively narrows an unknown payload before surfacing a message; dropping it turns a malformed response into a render crash. Every new fetch path in this story goes through it.
- **Grid state stays in the URL** (`data-loading-decision.md:57`), including `?mode=` preservation. `useGridViewState` is used as shipped; the codec's key list is not extended.
- **Row selection is deliberately NOT URL state.** `use-grid-view-state.ts:51` `pickGridState` strips `rowSelection`, and the codec has no key for it. Selection lives in `useState` in the contacts table, is passed as `state.rowSelection`, and is intercepted in `Grid` before the URL write path — otherwise every checkbox would attempt a URL write.
- **Inline editing reuses the shipped state machine.** `use-grid-keyboard.ts:277` already owns draft, optimistic display, and visible revert; this story only supplies `onCellCommit`/`onEditError`. Do not add a second edit path, and do not reintroduce cell wrapping — `design-constraints.md` fixes single-line truncation (`story 1` Design Notes).
- **Writes go through `/api/manage` only** (`lib/manage/api-handlers.ts`). No direct Supabase from a component. No new authorization logic: the batch handler calls the same `getStaffContext()` + `requireRole(staff, ["Admin","Preacher"])` the single handler uses. RLS remains the sole enforcement point; the client never re-checks scope.
- **No schema change, no RLS change, no new package.** The batch handler is one new export in an existing module plus one new byte-identical route file per app.
- Grid primitive changes stay **table-agnostic**: no `Manage*` import, no `/api/manage` reference, no contacts vocabulary anywhere under `components/grid/`.
- `design-constraints.md` remains binding: 13px base, 32/28px rows, `tabular-nums`, sticky header, **frozen identity column**, 1px borders, no drop shadows, one accent reserved for selection/focus, hairline row separators, no stripes.
- `manage-types.ts:5-6` claims `@/lib/supabase/manage` is in the guardrail's server-only prefix list. **It is not** (`brownfield.md:55`). Respect the boundary by convention; do not edit `scripts/verify-monorepo-guardrails.mjs:10-17` — `scripts/verify-airtable-removal.mjs:628-636` asserts its contents.

**Never:**

- Never add a batch API that bypasses `lib/manage/api-handlers.ts`, and never accept a caller-supplied patch key outside `MANAGE_CONTACT_PATCH_KEYS` (`manage-types.ts:148`). `parseContactPatch` (`api-handlers.ts:129`) already rejects unknown keys with a 400; the batch handler reuses it per item.
- Never swallow a per-row failure into a single success toast. Partial success must be individually visible.
- Never make the bulk action all-or-nothing by aborting the batch on the first failure, and never report success for a row whose write failed.
- Never put `rowSelection` in the URL codec. Selection is per-visit working state, not shareable view state.
- Never add a `?mode=`-stripping URL write, and never add a client-side authorization check or a disabled-by-policy affordance derived from a client-side re-read of scope.
- Never widen `serverOnlySpecifierPrefixes`, and never run `pnpm test:airtable-removal` edits against that list.
- No undo/redo, no CSV export, no offline queue wiring (`SPEC.md:85-87`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy-path cell edit | `e` on `name`, type `Radha K`, `Enter` | new value shows immediately; `PATCH /api/manage/contacts` fires once; row re-sorts to its new position | No error expected |
| Edit persists | reload after a successful edit | the server value is present; no local override needed | No error expected |
| Rejected cell edit | `PATCH` returns 400 `{"error":"Name is required."}` | cell visibly reverts to the prior value, cell turns destructive, status line shows the server message | rejection contained; `onEditError` fires |
| Empty required field | `e` on `phone`, clear it, `Enter` | optimistic empty display, then server 400, then visible revert with `Phone is required.` | revert is visible, never silent |
| Network failure on edit | `fetch` rejects | revert with `Unable to reach the server.` | caught, reverted, surfaced |
| Multi-row selection | header checkbox on a filtered set | every filtered row selected; all rows show `data-state="selected"` | No error expected |
| Indeterminate header | 3 of 40 rows selected | header checkbox renders the mixed state and names the count | No error expected |
| Select-all then filter | select all, then narrow the global filter | selection is retained across filtering; count reflects selected rows, not visible rows | No error expected |
| Bulk action all succeed | 5 selected, `isFavorite: true` | 5 per-row successes listed; rows update | No error expected |
| Bulk partial success | 3 succeed, 2 return 4xx/5xx | a result row per selected row; the 2 failures name their contact and their server message; the 3 successes are not collapsed into a green summary | no error swallowed |
| Bulk with one unreachable row | `fetch` rejects for one item only | that row reports a network failure; the others still commit | per-item isolation |
| Bulk over an empty selection | action invoked with 0 selected | action is not offered / is inert | no request issued |
| Batch body over the cap | 250 items, cap 200 | `400` naming the cap; client surfaces it; no partial write | rejected before any write |
| Batch item with a bad contactId | one item's `contactId` is not a UUID | that item fails alone; the rest commit | per-item isolation |
| Bulk items partially invalid | one item omits `contactId` | that item fails with `contactId must be a UUID.`; the rest commit | per-item isolation |
| Bulk response malformed | 200 with a body missing `results` | client reports a bulk failure naming the response, does not claim success | never render success on an unverified payload |
| Location filter | per-column filter on `location` | narrows to rows whose joined location names contain the text; combines with the global filter; round-trips via `f.location` | never throws on a stale column id |
| Sort after edit | edit `name`, then sort by `name` | ordering uses the committed value, not the pre-edit value | No error expected |
| Selection with zero rows in scope | empty scope | `No records` panel; no header checkbox interaction | No error expected |

</intent-contract>

## Code Map

- **`components/manage/manage-contacts-table.tsx`** — the refactor target, 342 lines. Delete `:22` `ALL_LOCATIONS`, `:24-41` `SortKey`/`SortState`/`Status`/`IDLE_STATUS`, `:54-63` `COLUMNS`, `:65-76` `compareText`/`timestamp`, and `:86-170` the four `useMemo` blocks plus `toggleSort`. **Keep `:43-52` `readError`.** Keep `:180-210` `toggleFavorite`'s PATCH shape but route it through the shared commit path.
- **`components/grid/grid.tsx:202-227`** — `GridProps`. `state` is `Partial<TableState>` so `rowSelection` can be passed today, but `:333-358` `handleTableStateChange` forwards every resolved key to `onStateChange`, which is the URL writer. Row-selection updates must be intercepted here, before that call.
- **`components/grid/grid.tsx:411-430`** — `useReactTable`. `enableRowSelection` is absent; TanStack defaults it to `true`, so `row.getIsSelected()` already drives `data-state="selected"` at `grid-row.tsx:112`. Add it explicitly so the intent is not dependent on a default.
- **`components/grid/grid.tsx:440-442`** — `visibleColumnIds` / `frozenColumnId = visibleColumnIds[0] ?? null`. A leading select column would be frozen, violating `design-constraints.md` ("scrolling right must never lose the row's identity"). Freezing must become a marked leading run with cumulative `left` offsets.
- **`components/grid/grid-row.tsx:128-157`** — cells render `cell.text` only. There is **no cell-renderer support anywhere in the grid**, so neither a checkbox nor the favorite star can render today. `GridCellView` (`grid-types.ts:122-135`) needs an optional pre-rendered node.
- **`components/grid/grid-header-cell.tsx:144-146`** — `isFrozen && "left-0 z-30"`; the same single-offset assumption.
- **`components/grid/grid-toolbar.tsx:33-45`** — `GridToolbarProps`. A `toolbarExtra` slot is needed so the bulk action bar renders in the toolbar rather than as a second surface above the grid.
- **`components/grid/use-grid-keyboard.ts:245-329`** — `revertCommit` / `commitEditing`. The CAP-5 contract already satisfied: optimistic display at `:304`, visible revert with message at `:258-262`, status line at `:262`. **Reuse; do not reimplement.**
- **`components/grid/use-grid-keyboard.ts:442-464`** — `getCellView`, the natural place to compute a rendered cell node, since it already has the `Cell`.
- **`components/grid/grid-view-state.ts:36-39`** — `GRID_PARAM_KEYS` / `GRID_PARAM_PREFIXES`. Read-only for this story.
- **`lib/manage/api-handlers.ts:129-218`** — `parseContactPatch`; throws `AuthzBadRequest` (400) and rejects any key outside `MANAGE_CONTACT_PATCH_KEYS` at `:142-144`. Reused per batch item.
- **`lib/manage/api-handlers.ts:220-244`** — `handleManageContactUpdate`: `getStaffContext` → `requireRole` → `parseContactPatch` → `updateManageContact`, with `badRequestResponse(error) ?? authzErrorResponse(error)`. The batch handler mirrors this exactly, per item, and returns 200 with per-item outcomes.
- **`lib/supabase/manage.ts:864-971`** — `updateManageContact` calls `assertManageContactInScope` (`:870`) and writes one audit event per call (`:947-956`). It is single-row; the batch handler calls it per item so each row keeps its own audit event and scope assertion. Do not add a set-based update.
- **`apps/folk/app/api/manage/contacts/route.ts`** and **`apps/gita-life/.../contacts/route.ts`** — 7 lines each, byte-identical (md5 `365610fd8…`), `PATCH` → `handleManageContactUpdate`. The new bulk route file must match that shape and be byte-identical across apps.
- **`components/manage/manage-portal.tsx:128`** — `<ManageContactsTable payload={payload} />`. Unchanged by this story.
- **`components/manage/manage-favorites-view.tsx:63-71`** — a second copy of `readError`. Untouched; do not consolidate (out of scope).
- **`components/manage/manage-types.ts:42-65`** — `ManageContact`; `:148-160` `MANAGE_CONTACT_PATCH_KEYS`; `:171-184` `ManageContactWriteResult`. The imports-nothing seam stays intact.
- **`scripts/verify-monorepo-guardrails.mjs:10-17`** — read-only. `:542-596` walks the transitive client import graph from `"use client"` roots under `components`.
- **`scripts/verify-airtable-removal.mjs:496-505`** — negative assertion: **zero** Airtable mentions under `apps/*/app/manage/`, `components/manage/`, `lib/manage/`. Any new comment there naming Airtable fails the gate.
- **`next.config.mjs:4-6`** — `ignoreBuildErrors: true`; `pnpm typecheck` is the real type gate.
- No test runner exists (`CONTRIBUTING.md:36`); verification is the `verify-*.mjs` scripts plus manual inspection.

## Tasks & Acceptance

**Execution:**

- `components/grid/grid-types.ts` -- add `frozen?: boolean`, `selectable?: boolean` and `hideable?: boolean` to `GridColumnMeta`; add optional `render?: ReactNode` to `GridCellView`; add optional `render?: ReactNode` to a new header-cell prop surface. Rationale: selection, the frozen identity run, and any cell widget need these expressed as table-agnostic column metadata rather than as contacts logic.
- `components/grid/grid.tsx` -- thread `render` into `GridCellView` via `flexRender(cell.column.columnDef.cell, cell.getContext())` inside the keyboard hook's `getCellView`, and `flexRender(header.column.columnDef.header, header.getContext())` into the header cell. Rationale: use TanStack's own renderer contract rather than inventing a second one; `flexRender` is exported from `@tanstack/react-table`.
- `components/grid/grid.tsx` -- set `enableRowSelection: true` explicitly; resolve `rowSelection` out of the updater result in `handleTableStateChange` and hand it to a new `onRowSelectionChange` prop instead of the URL writer; strip it before forwarding. Rationale: `pickGridState` already drops it, so the URL is safe, but the selection state itself would otherwise never update.
- `components/grid/grid.tsx` -- replace `frozenColumnId: string | null` with a leading frozen run: visible columns marked `meta.grid.frozen` (or the first visible column when none are marked), each given a cumulative `left` offset; pass `stickyLeft: number | null` to `GridRow` and `GridHeaderCell`. Rationale: the select column must not become the frozen column, and the name column must survive a horizontal scroll.
- `components/grid/grid-row.tsx` -- accept `stickyLeft`, render the cell node when `cell.render` is present, and put the `border-r` on the last frozen column only. Rationale: one divider between the frozen region and the scrolling region, not one per cell.
- `components/grid/grid-header-cell.tsx` -- accept an optional `render` for the header body and `stickyLeft: number | null`; keep sort/filter/menu/resize suppressed when `render` is supplied. Rationale: the header select-all checkbox must not also render a sort button.
- `components/grid/grid-toolbar.tsx` -- add an optional `toolbarExtra?: ReactNode` rendered after the density control and before the row count. Rationale: the bulk action bar belongs to the grid's own chrome, not to a second band above it.
- `components/grid/grid.tsx` -- add `toolbarExtra` and `onRowSelectionChange` to `GridProps` and pass `toolbarExtra` through. Rationale: CAP-4's action surface needs a slot in the primitive.
- `components/grid/index.ts` -- export any new public type the barrel is missing.
- `components/manage/manage-contacts-table.tsx` -- rewrite as a `<Grid>` host: `useGridViewState({ columnIds })`, `useState` for `rowSelection`, `density`, `contacts` (optimistic mirror of `payload.contacts`) and bulk results. Delete the superseded blocks listed in the Code Map. **Keep `readError` and the `payload` prop.**
- `components/manage/manage-contacts-table.tsx` -- define the column model: `select` (selectable, not filterable/sortable/hideable/movable), `name` (frozen, editable, text filter), `phone` (editable, text filter), `location` (accessorFn joining `payload.locations` names, text filter), `totalAttendanceCount` + `past60DayAttendanceCount` (number filter, `tabular`), `lastContactedOn`, `notes` (editable, truncating), `collectedBy` (accessorFn over `payload.staffNames`), `favorite` (star button, last). Rationale: `select` first, identity frozen second, row actions last — the layout three later tables copy.
- `components/manage/manage-contacts-table.tsx` -- implement `onCellCommit`: map `columnId` → `MANAGE_CONTACT_PATCH_KEYS` member, `PATCH` with `readError` on the body, resolve to update `contacts`, reject with `new Error(message)` so `use-grid-keyboard` reverts visibly. Non-editable or unknown column ids must reject rather than throw. Rationale: CAP-5 without a second edit path.
- `components/manage/manage-contacts-table.tsx` -- render the select column's header select-all (with the mixed state) and per-row checkboxes via `components/ui/checkbox`, and surface the selected count in the toolbar. Rationale: `design-constraints.md` reserves the single accent for selection and focus.
- `lib/manage/api-handlers.ts` -- add `MANAGE_BULK_MAX_ITEMS = 200` and `handleManageContactBulkUpdate`: same `getStaffContext` + `requireRole`, validate the envelope (`items` a non-empty array within the cap), then iterate items **sequentially**, calling `parseContactPatch` and `updateManageContact` per item and collecting `{ contactId, ok: true, contact }` / `{ contactId, ok: false, error }`. Return 200 with `{ results }`; return 400 only for envelope-level faults. Rationale: the batch semantics three tables copy. Sequential is deliberate — it keeps audit events ordered, keeps per-row scope assertions independent, and avoids a thundering herd against PostgREST. A per-row `AuthzError` is a per-row outcome, never an envelope failure.
- `apps/folk/app/api/manage/contacts/bulk/route.ts` and `apps/gita-life/app/api/manage/contacts/bulk/route.ts` -- 7-line byte-identical `PATCH` delegate with `export const dynamic = "force-dynamic"`. Rationale: matches the existing route shape and keeps the two apps identical.
- `components/manage/manage-contacts-table.tsx` -- implement the bulk action ("Add selected to favorites" / "Remove selected from favorites") against the bulk route, then render **one visible result row per selected row** with its outcome and, for failures, the server message. Rationale: CAP-4's success condition is per-row reporting; a collapsed toast fails it even when every row succeeded.
- `components/manage/manage-contacts-table.tsx` -- clear selection after a bulk run completes, and do not clear it mid-run. Rationale: the operator must be able to re-select after seeing outcomes.
- `docs/manage-grid-pattern.md` -- record the column-definition conventions, the commit/rollback contract, the selection and bulk-action semantics (including the cap, the sequential loop, and the per-row outcome shape), the URL state contract, and a "report divergence" instruction for later ports. Rationale: `capability-tiers.md:48` makes this document the substitute for the human gate; without it the agreement does not survive into stories 3 and 5.

**Acceptance Criteria:**

- Given `/manage` contacts with 200+ rows, when the operator scrolls to the end and back, then the rendered `<tr>` count stays bounded and does not grow with the row count.
- Given `/manage` contacts, when any column is sorted, filtered, moved, hidden or resized, then the URL param is written, the change survives a reload and a shared link, and `?mode=` is still present byte-identical.
- Given `/manage?mode=preacher`, when a per-column filter or the global filter is typed, then `mode=preacher` survives in the URL.
- Given the contacts table, when the source is byte-scanned, then `SortKey`, `COLUMNS`, `compareText`, `timestamp`, `ALL_LOCATIONS`, `Status`, `IDLE_STATUS` and every `useMemo` sort/filter block are gone, and `readError` is still present and still used on every fetch path.
- Given the contacts table, when the module is grepped, then there is no second table component, no `components/ui/table` import, and no `useMemo` sorting or filtering of the contact set.
- Given the contacts table, when an inline cell edit commits, then the new value appears immediately without a reload, the write goes to `PATCH /api/manage/contacts`, and a full reload shows the committed value.
- Given an inline cell edit whose write fails with a 400, then the cell reverts to its prior value visibly, the cell is marked destructive, and the server's message is shown — not a silent revert.
- Given an inline cell edit whose `fetch` rejects, then the cell reverts visibly with `Unable to reach the server.`
- Given the contacts table, when rows are selected, then each selected row is visibly indicated (checked control plus `data-state="selected"`) and the selected count is stated; when some but not all filtered rows are selected, then the header control shows the mixed state.
- Given a multi-row selection, when a bulk action runs, then a result is listed for **every** selected row individually; when at least one row fails, then each failure names its row and its reason and no row's failure is hidden behind a success summary.
- Given a bulk run that fails on the server, then the failed rows are not marked as saved and their prior values remain visible.
- Given a bulk run, then each row's audit event is written individually through the existing `updateManageContact` path — no set-based update and no bypass of `lib/manage/api-handlers.ts`.
- Given a bulk request over the item cap, then the server returns 400 naming the cap and writes nothing.
- Given the repository, when `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm guardrails` and `pnpm test:airtable-removal` run, then none regress versus `5678c08`, and `serverOnlySpecifierPrefixes` is byte-unchanged.

## Spec Change Log

## Review Triage Log

## Design Notes

**Why the grid needed selection support rather than receiving it.** Story 1 deliberately left `enableRowSelection` unopinionated and rendered no select column, on the stated reasoning that story 2 owns selection. But `grid-row.tsx:112` already keys `data-state="selected"` off `row.getIsSelected()`, so the styling hook existed while the control did not. This story adds the control and the checkbox; it does not invent a selection model.

**Why selection is not URL state.** `pickGridState` (`use-grid-view-state.ts:51`) enumerates exactly the six grid keys, so `rowSelection` never reaches `serializeGridViewState`. That is correct, not an oversight: a selection is per-visit working state, and encoding it in the URL would make a shared link carry someone else's row set and would add a seventh key the spec never asked for. The consequence for implementers is the real trap — `handleTableStateChange` forwards the *resolved whole state* to the URL writer, so an un-intercepted `rowSelection` change attempts a URL write on every checkbox click. Intercept it in `Grid`.

**The two-column frozen region.** `design-constraints.md` requires that scrolling right never lose row identity, so `name` must be pinned. A leading select column would have become the frozen column under the shipped `frozenColumnId = visibleColumnIds[0]` rule. Hence the frozen *run* with cumulative offsets, and hence the layout `select, name, …, favorite`: selection first, identity pinned, row action last.

**Cell rendering goes through `flexRender`, not a new prop.** TanStack's `columnDef.cell` / `columnDef.header` already exist and already receive a context object carrying `row` and `table`. A bespoke `renderCell` prop would be a second contract for one job, and would have to be threaded through `GridCellView` as a closure anyway.

**Batch semantics, stated once because three tables will copy them.** Requests are `{ items: [{ contactId, patch }] }`; a per-row patch shape is used rather than `{ contactIds, patch }` so a future bulk action whose rows need different values is not forced into a second endpoint. The response is `200 { results: [{ contactId, ok, contact? | error? }] }`. A `400` means the *envelope* was wrong — not an array, empty, or over `MANAGE_BULK_MAX_ITEMS = 200` — and nothing was written. Any per-row failure, including an `AuthzError`, is a `200` with `ok: false` on that item. Items are processed **sequentially**: ordered audit events, independent scope assertions, and no burst of concurrent writes against PostgREST. A cap of 200 is a timeout guard, not a product limit, and the operator sees the cap in the message.

**The client must not trust the batch envelope.** `readError` exists because a malformed payload once meant a render crash; the same applies to `results`. The client validates that `results` is an array and reports a bulk failure naming the response rather than rendering a success summary it cannot verify.

**`notes` loses its wrap.** `manage-contacts-table.tsx:328` currently uses `whitespace-normal`; story 1's Design Notes flag that fixed 32/28px row heights mean single-line truncation. This story truncates and surfaces the full text via `title`. Reintroducing wrapping to "fix" it would violate the density contract.

## Verification

**Commands:**

- `pnpm typecheck` -- expected: SUCCESS, no output. This is the real type gate (`next.config.mjs:4-6` sets `ignoreBuildErrors: true`).
- `pnpm lint` -- expected: SUCCESS with no new errors in `components/grid/`, `components/manage/`, `lib/manage/` or the two new route files. Pre-existing errors in `.agent/`, `.codebuddy/`, `.neovate/` are not this story's.
- `pnpm build` -- expected: SUCCESS for both apps.
- `pnpm guardrails` -- expected: `Monorepo guardrails passed.` Proves no client file reaches a server-only specifier, including transitively through the new bulk route.
- `pnpm test:airtable-removal` -- expected: no regression. The two pre-existing failures in `scripts/migrate-airtable-data.mjs` and `scripts/delta-sync-old-project.mjs` were reproduced at `5678c08` before any grid file existed and are out of scope; the count must not increase, and the `/manage has no Airtable URL…` check must stay at zero hits — the new files live under `components/manage/` and `lib/manage/`.
- `git diff --stat 5678c08 -- scripts/verify-monorepo-guardrails.mjs` -- expected: empty. Proves the prefix list was not touched.

**Manual checks (no test runner exists — `CONTRIBUTING.md:36`):**

- `pnpm dev:folk`, open `/manage` → Contacts. Scroll a 1,000+ row table end to end; confirm smooth scroll and a bounded `<tr>` count. Confirm the header stays pinned and both the select and name columns stay pinned when scrolled right, separated by one 1px divider and no shadow.
- Confirm the dense/default toggle, `tabular-nums` alignment of the two count columns, hairline separators, no stripes, and no drop shadow on the grid surface.
- Sort, move, hide and resize; confirm the URL updates, Back restores, and `mode=preacher` survives every write.
- Confirm the per-column filter on `location` narrows and combines with the global filter, and that the global filter narrows across every column.
- Press `j`/`k` to move row focus, `e` then type then `Enter` to commit an edit, `e` then type then `Escape` to cancel; confirm the first keystroke replaces rather than appends.
- Force a rejection: clear `phone` and commit (server answers 400 `Phone is required.`), and separately stop the network and commit. Both must revert visibly with a message.
- Reload after a successful edit; confirm the committed value is present.
- Select several rows including one outside the current filter; confirm every selected row is visibly indicated and the count is right. Confirm the header control shows the mixed state on partial selection.
- Run the bulk action on a selection where one row is forced to fail; confirm one result row per selected row, the failure naming its row and reason, and the successes not collapsed into a single green summary.
- Confirm both apps render identically, and that no file under `components/grid/` imports `@/components/manage/*` or references `/api/manage`.

**Scoped row count recorded at this gate** (story 6 measures all four; contacts is the one that validates the client-side pagination decision now):

| Program | Scoped contacts | Raw JSON | Gzipped |
|---|---|---|---|
| FOLK Chennai (`program_id = folk`) | **1,037** | 669,787 B | 68,561 B |
| Gita Life (`program_id = gita-life`) | **42** | 26,648 B | 3,666 B |

Against `data-loading-decision.md` §3's triggers: 1,037 rows is ~10% of the > 10,000 row threshold, and 68.6 KB gzipped is ~6.7% of the > 1 MB payload threshold. **Neither trigger fires; the client-side virtualization decision holds for contacts.** Note this is also why `collectPagedRows` exists — `manage.ts:196-199` documents the folk program's volume exceeding PostgREST's 1,000-row cap, and 1,037 rows means the contacts query spans two pages on every load. FOLK has 5 distinct assigned preachers, so preacher-mode narrowing is a real subset rather than a no-op.