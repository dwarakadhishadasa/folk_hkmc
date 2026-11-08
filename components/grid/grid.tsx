"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ComponentType, MouseEvent, ReactNode, UIEvent } from "react"
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import type {
  Cell,
  ColumnDef,
  ColumnSizingInfoState,
  ColumnSizingState,
  Header,
  OnChangeFn,
  Row,
  RowData,
  RowSelectionState,
  Table,
  TableState,
} from "@tanstack/react-table"
import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core"

import {
  SortableContext,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers"
import type { Modifier } from "@dnd-kit/core"

import { GRID_ROW_DRAG_PREFIX } from "@/components/grid/grid-row-drag"
import { GridHeaderCell } from "@/components/grid/grid-header-cell"
import { GridPanel, gridPanelKey } from "@/components/grid/grid-panel"
import { GridRow, GRID_BASE_FONT_CLASS, GRID_ROW_HEIGHT } from "@/components/grid/grid-row"
import {
  GridRowAddControl,
  GridRowLifecycleProvider,
} from "@/components/grid/grid-row-lifecycle"
import { GridToolbar, type GridToolbarColumn } from "@/components/grid/grid-toolbar"
import {
  emptyCondition,
  type GridFilterCondition,
  type GridFilterConnective,
} from "@/components/grid/grid-filter-operators"
import {
  addNode,
  collectColumnIds,
  conditionNode,
  evaluateFilterGroup,
  filterGroupFromConditions,
  flattenConditions,
  needsManualEvaluation,
  type GridFilterGroup,
} from "@/components/grid/grid-filter-tree"
import type { GridFilterField } from "@/components/grid/grid-filter-popover"
import { gridConditionFilter, gridGlobalFilterFn } from "@/components/grid/grid-filter-fn"
import type {
  GridCellCommitHandler,
  GridCellView,
  GridDensity,
  GridFieldType,
  GridEditErrorHandler,
  GridFrozenColumn,
  GridPanelState,
  GridRowContextMenuProps,
  GridRowLifecycle,
  GridTransientHandle,
} from "@/components/grid/grid-types"
import type { GridSortField } from "@/components/grid/grid-sort-popover"
import { useGridKeyboard } from "@/components/grid/use-grid-keyboard"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { cn } from "@/lib/utils"

/**
 * A column def for any value type.
 *
 * TanStack parameterizes `ColumnDef` by its cell value, which makes a
 * heterogeneous `createColumnHelper` array (a string accessor beside a number
 * accessor) unassignable to any single instantiation — the optional
 * header/footer/cell templates are contravariant in the value type. The library's
 * own `columns` option is `ColumnDef<TData, any>[]` for exactly this reason, so
 * this mirrors it once instead of forcing every consumer to cast.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GridColumnDef<TData extends RowData> = ColumnDef<TData, any>

/** One column as the grid hands it to a `tableFooter` render. */
export interface GridFooterColumn {
  /** The column's id — what a consumer keys its per-column content on. */
  columnId: string
  /**
   * The column's sized width, in px — `header.getSize()`, the value the URL's
   * `size.*` keys carry.
   *
   * **Not the width the cell renders at.** The strip's cell is sized from the
   * grid's column layout, which is a share of the table's width whenever the
   * frame is stretching it (see `resolveColumnLayout`), and this process cannot
   * know the frame's width without measuring it. A footer that needs its cell's
   * laid-out width reads the element it is rendered into; this number is the
   * answer to "how wide did the user ask for this column", which is the question
   * a total can actually use.
   */
  width: number
}

/**
 * Applied centrally to any column def that omits a width, so `getTotalSize()` is
 * never degenerate and the frozen column always has something to pin against.
 */
export const GRID_DEFAULT_COLUMN_WIDTH = 160

/** Wide enough that the frozen column stays legible however hard it is dragged. */
export const GRID_MIN_COLUMN_WIDTH = 72

/** Viewport rows rendered beyond the visible window, per direction. */
export const GRID_OVERSCAN = 12

/**
 * Stable identity for the grid's drag context.
 *
 * dnd-kit's `useUniqueId` assigns ids from a module-level counter when the
 * context has no `id`, and the server and the browser keep separate counters —
 * so without this the drag handle's `aria-describedby` differs between the two
 * renders and React logs a hydration mismatch on every `/manage` load. A
 * constant is the honest fix: a value derived per grid would be stable only if
 * both sides mounted the same number of grids, which is the assumption that
 * breaks. See the note at the `<DndContext>` for the mechanism.
 */
const DND_CONTEXT_ID = "grid-dnd"

/**
 * NOTE: the Panel 5 edit hint ("Enter saves · Escape discards · clicking away
 * also saves") was removed along with the status strip. The edit model is still
 * what it was — clicking away *does* commit — but the grid no longer says so, so
 * a consumer that wants the affordance stated must render it. Worth knowing if
 * this is ever removed by accident: the hint was the only place the model was
 * stated in words, and an operator who assumes clicking away cancels will commit
 * a draft they meant to discard.
 */

const INITIAL_COLUMN_SIZING_INFO: ColumnSizingInfoState = {
  startOffset: null,
  startSize: null,
  deltaOffset: null,
  deltaPercentage: null,
  isResizingColumn: false,
  columnSizingStart: [],
}

/**
 * The grid's filter functions live in `grid-filter-fn.ts` and are re-exported
 * here so the public surface under `@/components/grid` does not change.
 *
 * They were moved out of this file because they are pure functions over a
 * TanStack `Row` — no React, no table, no DOM — and the record-review
 * primitive reuses them. Importing them from here would have pulled dnd-kit
 * and the virtualizer into that primitive's bundle for three functions.
 */
export { gridConditionFilter, gridGlobalFilterFn, normalizeFilterValue } from "@/components/grid/grid-filter-fn"

/**
 * Resolves a column's id the same way TanStack would, so the URL codec and the
 * table can never disagree about what a column is called. Grid column defs are
 * flat leaves, so this never has to walk a hierarchy.
 */
function resolveColumnId<TData extends RowData>(
  definition: GridColumnDef<TData>,
  index: number,
): string {
  if (definition.id) {
    return definition.id
  }

  const accessorKey = "accessorKey" in definition ? definition.accessorKey : undefined

  if (accessorKey !== undefined && accessorKey !== null) {
    return String(accessorKey)
  }

  const header = "header" in definition ? definition.header : undefined

  if (typeof header === "string" && header.length > 0) {
    return header
  }

  return `column_${index}`
}

/** String headers become labels; anything else falls back to the column id. */
function resolveColumnLabel<TData extends RowData>(
  definition: GridColumnDef<TData>,
  columnId: string,
): string {
  const header = "header" in definition ? definition.header : undefined
  return typeof header === "string" && header.length > 0 ? header : columnId
}

/**
 * The grid's horizontal layout: every visible column's rendered width, in px.
 *
 * TanStack hands out numbers and nothing else — `header.getSize()` is a column's
 * size, `table.getTotalSize()` is their sum — and turning that into geometry is
 * this primitive's job. Two questions have to be answered, and neither has a CSS
 * answer that holds.
 *
 * **How much wider than its size does a column render?** The table is
 * `width: 100%` with `min-width: getTotalSize()`, so the frame stretches the
 * columns whenever their sizes fall short of it, and the factor that stretch
 * applies is a number this process does not have: the table's width is
 * `max(frame, totalSize)` and only the browser knows the frame's width. Hence
 * `frameWidth`.
 *
 * **By which rule?** Every column's share of the slack — not one column taking
 * all of it. The alternative was what this replaced: a single column left
 * `width: auto` to absorb the stretch, which CSS 2.1 is explicit about giving
 * *all* leftover space (the leftover goes to `auto` columns and is divided only
 * among `auto` columns), so hiding one field inflated the Actions gutter by the
 * entire freed width and left every real field where it was. A per-column share
 * is the rule a table of mixed-width fields wants: a 240px notes field gains
 * three times what a 40px checkbox gutter does, and both gain something.
 *
 * Chromium *would* spread the leftover proportionally on its own — plain pixel
 * column widths in a wider table are scaled to fill, measured here — but that
 * behaviour is under-specified (CSS 2.1 says only that the leftover is
 * "distributed") and, more to the point, nothing redistributes the **pinned run's
 * offsets**: those are computed here, so a prefix left at its raw size would sit
 * a visible gap away from the column before it on any stretched frame. Measuring
 * the frame is what makes one px-valued layout serve the widths, the offsets and
 * the status strip below them.
 */
interface GridColumnLayout {
  /** Every visible column's rendered width in px, in display order. */
  widths: number[]
  /** The table's own width, and the floor below which it starts scrolling. */
  tableWidth: string
  minWidth: number
}

/**
 * How much wider than its size each column renders.
 *
 * One, unless the frame is wider than the columns' summed sizes — which is the
 * whole of the stretch, and is why the frame has to be measured rather than
 * assumed. A frame narrower than the total gets no factor at all: `min-width`
 * has already taken the table past it, and every column renders at its own size.
 */
function columnStretch(totalSize: number, frameWidth: number): number {
  if (frameWidth <= 0 || totalSize <= 0 || frameWidth <= totalSize) {
    return 1
  }

  return frameWidth / totalSize
}

/**
 * Rounds a rendered width to hundredths of a pixel.
 *
 * The rendered widths have to **sum** to the table's width, or the browser
 * redistributes the difference and the layout stops being the one computed here —
 * the same reason the pinned offsets depend on these numbers. Two decimal places
 * is far below a device pixel and keeps the inline style readable; the sum is
 * taken from the rounded values so it stays exact.
 */
function renderWidth(px: number): number {
  return Math.round(px * 100) / 100
}

/** The live resize gesture, as far as the layout is concerned. */
interface GridColumnDrag {
  columnId: string
  /** How far the pointer has moved the column's size from where the drag began. */
  delta: number
}

/**
 * Resolves the layout for this render.
 *
 * **Mid-gesture the layout is frozen at the one the drag began with, and only the
 * dragged column moves.** A stretched layout is a *ratio* — every column is a
 * share of a total — so feeding a live total back into it re-derives every other
 * column's share on every pointer move, and the boundary under the pointer stops
 * tracking it: for the last column it does not move at all, because its own share
 * is a fixed fraction of a total that grew by exactly the amount the drag added.
 * Holding the rest still makes each boundary move one-for-one with the pointer,
 * and the table's width follows the drag, so it scrolls when the gesture runs past
 * the frame.
 *
 * The table's width is pinned to the sum **only** mid-gesture. At rest `100%` is
 * what makes the columns fill the frame, and the sum is then the frame; during a
 * drag a `100%` table whose columns no longer add up to it would have the browser
 * take the difference back out of them, which is the layout this is avoiding.
 *
 * `frozenWidths` is null until the frame has been measured once and is ignored if
 * it does not line up with the current column set — a stale layout would be worse
 * than the unstretched one, which is what a first render gets.
 */
function resolveColumnLayout<TData extends RowData>(
  headers: readonly Header<TData, unknown>[],
  totalSize: number,
  frameWidth: number,
  drag: GridColumnDrag | null,
  frozenWidths: readonly number[] | null,
): GridColumnLayout {
  if (drag && frozenWidths && frozenWidths.length === headers.length) {
    let sum = 0

    const widths = headers.map((header, index) => {
      const width = renderWidth(
        frozenWidths[index] + (header.column.id === drag.columnId ? drag.delta : 0),
      )
      sum += width

      return width
    })

    return { widths, tableWidth: `${renderWidth(sum)}px`, minWidth: renderWidth(sum) }
  }

  const stretch = columnStretch(totalSize, frameWidth)

  return {
    widths: headers.map((header) => renderWidth(header.getSize() * stretch)),
    tableWidth: "100%",
    minWidth: renderWidth(totalSize),
  }
}

/**
 * Resolves the leading pinned region and each column's `left` offset.
 *
 * A column marked `meta.grid.frozen` joins, and so does a `selectable` column
 * ahead of it: a selection control is chrome rather than identity, but it still
 * has to stick or the pinned identity column scrolls out from underneath it. The
 * region ends at the first column that is neither, which is what makes it
 * leading — a pinned region with a gap in it has no meaningful offset.
 *
 * A table that marks nothing falls back to pinning only its first visible column,
 * the behaviour that predates the flag, and skips that fallback when the first
 * column is a selection control rather than an identity.
 *
 * `layout` supplies the offsets rather than the raw sizes, because a pinned
 * column's offset is the sum of the **rendered** widths before it — on a stretched
 * frame that is a larger number than the sum of their sizes, and using the sizes
 * leaves a gap between the two pinned columns exactly as wide as the stretch.
 */
function resolveFrozenRun<TData extends RowData>(
  headers: Header<TData, unknown>[],
  layout: GridColumnLayout,
): GridFrozenColumn[] {
  const marked = headers.some((header) => header.column.columnDef.meta?.grid?.frozen === true)
  const run: GridFrozenColumn[] = []
  let left = 0

  for (const [index, header] of headers.entries()) {
    const meta = header.column.columnDef.meta?.grid
    const isSelectable = meta?.selectable === true

    if (marked) {
      if (!isSelectable && meta?.frozen !== true) {
        break
      }
    } else if (index > 0 || isSelectable) {
      break
    }

    run.push({ columnId: header.column.id, left })
    left += layout.widths[index]
  }

  return run
}

/**
 * Column ids whose own definition supplied a body renderer, per slot.
 *
 * TanStack merges `_getDefaultColumnDef()` into **every** column, so
 * `columnDef.cell` and `columnDef.header` are both defined even for a plain
 * accessor column — reading them to decide whether the consumer rendered
 * anything answers "always". `columnDef.cell` is
 * `props => props.renderValue()?.toString() ?? null` and `columnDef.header` is
 * the accessor key, which means a check that trusts them hands the row renderer
 * to a column that never asked for one.
 *
 * The defaults are unreachable from the public API, so the answer is taken from
 * the definitions the consumer passed in, before any default was merged. That is
 * also the only honest place to ask: "did this column author a widget" is a
 * question about the author's code, not about the resolved library state.
 *
 * `cells` counts any renderer at all, because any renderer replaces the value
 * the grid would otherwise print. `headers` counts only a function or an
 * element, because a *string* header is the label the header cell already
 * renders — treating it as a widget would suppress the menu, drag activator
 * and resize on every labelled column.
 */
function resolveConsumerRenderers<TData extends RowData>(definitions: GridColumnDef<TData>[]) {
  const cells = new Set<string>()
  const headers = new Set<string>()

  definitions.forEach((definition, index) => {
    const id = resolveColumnId(definition, index)

    if ("cell" in definition && definition.cell !== undefined && definition.cell !== null) {
      cells.add(id)
    }

    const header = "header" in definition ? definition.header : undefined

    if (typeof header === "function" || (typeof header === "object" && header !== null)) {
      headers.add(id)
    }
  })

  return { cells, headers }
}

/**
 * The consumer's own header node, or `undefined` for a plain labelled column.
 *
 * A string header is the label path the cell already renders, so only a
 * function or element header counts as a consumer-rendered body — that is how
 * the cell knows to suppress its own menu, drag activator and resize. (No
 * header label is a sort button, and headers carry no filter control — those
 * surfaces live in the sort popover and the filter conditions bar.)
 */
function renderHeaderNode<TData extends RowData>(
  header: Header<TData, unknown>,
  consumerRendered: ReadonlySet<string>,
): ReactNode | undefined {
  if (!consumerRendered.has(header.column.id)) {
    return undefined
  }

  return flexRender(header.column.columnDef.header, header.getContext()) ?? undefined
}

/**
 * Narrows a resolved table state to what the URL writer is allowed to see.
 *
 * `GridProps.onStateChange` is typed for a complete `TableState` because that is
 * what TanStack hands it, but the URL half is genuinely partial — the consumer
 * reads six keys out of it and ignores the rest. One documented assertion here
 * is cheaper than widening that prop, and it keeps the row-selection removal in
 * a single place rather than one per call site.
 */
function forUrlWriter(state: Partial<TableState>): TableState {
  return state as TableState
}

/**
 * Keys the consumer owns, and therefore the only ones worth forwarding.
 *
 * TanStack resets the page index whenever the row model changes size, and that
 * reset arrives as a full state snapshot. A consumer's `state` has no
 * `pagination`, so forwarding the snapshot would only re-send the *other*
 * fields — resolved from the table's own state, which lags the prop on the
 * render the reset lands in. A consumer that writes state to the URL then gets a
 * stale sort or column set written back, the prop changes, the reset fires
 * again, and the two ping-pong. A pagination-only change is not a consumer state
 * change.
 */
const OWNED_STATE_KEYS = [
  "sorting",
  "globalFilter",
  "columnFilters",
  "columnOrder",
  "columnVisibility",
  "columnSizing",
  "rowSelection",
] as const

function sameOwnedState(previous: TableState, next: Partial<TableState>): boolean {
  return OWNED_STATE_KEYS.every(
    (key) => JSON.stringify(previous[key] ?? null) === JSON.stringify(next[key] ?? null),
  )
}

/**
 * Reads one cell out of a raw row, the same way TanStack would.
 *
 * `ColumnDef` is a union over its accessor forms, so `in` is what narrows it —
 * a cast would hide a consumer whose def matches neither and silently read
 * `undefined` for every row. Grid defs are flat leaves, so the depth argument is
 * always 0.
 */
function columnAccessor<TData extends RowData>(
  definition: GridColumnDef<TData>,
): (row: TData) => unknown {
  if ("accessorFn" in definition && typeof definition.accessorFn === "function") {
    const accessorFn = definition.accessorFn

    return (row) => accessorFn(row, 0)
  }

  const id = definition.id ?? ""
  const accessorKey = "accessorKey" in definition && typeof definition.accessorKey === "string"
    ? definition.accessorKey
    : id

  return (row) => (row as Record<string, unknown>)[accessorKey]
}

/**
 * Builds the order a header drop commits, or null when the drop names a
 * column that is not in the order.
 *
 * The dragged id is removed from the **full** order and re-inserted at the
 * drop target's slot, so hidden columns keep their positions — the same
 * hidden-skipping walk the old `moveColumn` stepper did one step at a time,
 * generalized to an arbitrary drop. A naive index splice over visible columns
 * alone would collapse those slots.
 */
export function resolveColumnDropOrder(
  fullOrder: readonly string[],
  activeId: string,
  overId: string,
): string[] | null {
  if (!fullOrder.includes(activeId) || !fullOrder.includes(overId)) {
    return null
  }

  const from = fullOrder.indexOf(activeId)
  const over = fullOrder.indexOf(overId)
  const next = fullOrder.filter((id) => id !== activeId)
  const slot = next.indexOf(overId)

  // Only reachable when `activeId === overId`, which `commitColumnDrop` already
  // filters. It is checked here rather than left to `splice`: `indexOf` returns
  // -1 for a missing id, and `splice(-1, 0, x)` silently inserts *before the
  // last element* instead of refusing — which would hand back an order holding
  // the dragged id twice. A pure helper that is also exported has to be correct
  // for every input, not only the ones its first caller happens to send.
  if (slot === -1) {
    return null
  }

  // `arrayMove` semantics, which is what the drag preview shows: moving right
  // lands the column *after* the one it passed, moving left lands before it.
  // Inserting always-before would commit one slot short of the preview and the
  // column would jump on release.
  next.splice(from < over ? slot + 1 : slot, 0, activeId)
  return next
}

/**
 * Whether a candidate order leaves the leading pinned run intact.
 *
 * The frozen `left` offsets accumulate in `columnOrder`, so an order that
 * interleaves a scrolling column into the run yields a sticky column whose
 * `left` does not match its real position — invisible statically, broken
 * while scrolling. The drop is therefore validated against the *resulting*
 * order, never against the drop target alone.
 */
export function isPinnedRunIntact(next: readonly string[], pinnedIds: readonly string[]): boolean {
  return pinnedIds.every((id, index) => next[index] === id)
}

/**
 * Clamps and rounds to what the table will actually render, so the committed
 * `size.<colId>` value and the measured width agree even when a drag stopped
 * against the minimum.
 */
function clampColumnSizing(sizing: ColumnSizingState): ColumnSizingState {
  const next: ColumnSizingState = {}

  for (const [id, size] of Object.entries(sizing)) {
    next[id] = Math.max(GRID_MIN_COLUMN_WIDTH, Math.round(size))
  }

  return next
}

export interface GridProps<TData extends RowData> {
  rows: TData[]
  columns: GridColumnDef<TData>[]
  /**
   * Required and stable: edit commits address a cell by `rowId`, so an array
   * index would address the wrong row the moment the set is sorted or filtered.
   */
  getRowId: (row: TData, index: number, parent?: Row<TData>) => string
  /** Controlled table state. `useGridViewState` supplies it, URL-derived. */
  state: Partial<TableState>
  onStateChange: OnChangeFn<TableState>
  /**
   * Match-all or match-any across the condition list. One value for the whole
   * list — never per condition.
   *
   * Kept for callers that predate groups. When `filterTree` is supplied it
   * wins, and the tree's own root connective is the authority.
   */
  filterConnective?: GridFilterConnective
  onFilterConnectiveChange?: (connective: GridFilterConnective) => void
  /**
   * The complete filter, groups included. A flat filter is a root group whose
   * children are all conditions; `useGridViewState` supplies the tree.
   */
  filterTree?: GridFilterGroup
  onFilterTreeChange?: (next: GridFilterGroup, immediate?: boolean) => void
  /**
   * Receives the resolved selection whenever it changes.
   *
   * Selection is deliberately not part of `state`'s URL half: `pickGridState`
   * enumerates six grid keys and `rowSelection` is not among them, because a
   * selection is per-visit working state rather than a shareable view. It is
   * intercepted here so a checkbox click never reaches the URL writer.
   */
  onRowSelectionChange?: (rowSelection: RowSelectionState) => void
  /**
   * Receives the row ids the grid is currently showing, in display order.
   *
   * This is the **filtered and sorted** row model, not the unfiltered rows
   * prop: a record opened from the grid steps through the list the operator is
   * looking at, and a host must not re-filter the raw rows to guess it.
   */
  onVisibleRowIdsChange?: (rowIds: readonly string[]) => void
  ariaLabel: string
  density: GridDensity
  onDensityChange: (density: GridDensity) => void
  /** Escape hatch from `useGridViewState`: a resize or reorder drag writes the URL once. */
  transient?: GridTransientHandle
  onCellCommit?: GridCellCommitHandler<TData>
  onEditError?: GridEditErrorHandler<TData>
  /** Clears `q`, `f.*` and `sort`; wired to the filtered-empty panel action. */
  onClearFilters?: () => void
  /** Replaces the filtered-empty panel body entirely. */
  emptyContent?: ReactNode
  /** Consumer chrome rendered in the toolbar, after the density control. */
  toolbarExtra?: ReactNode
  /**
   * A consumer's column-aligned footer, rendered as a `<tfoot>` inside the
   * grid's own table and stuck to the bottom of the scroll viewport.
   *
   * **Why it belongs in the table.** The grid's table is wider than its
   * scrollport, so any strip *below* the scroller drifts the moment the
   * operator scrolls right; inside the table the footer shares the columns'
   * widths for free and stays under them through every scroll position. The
   * table is `border-separate border-spacing-0`, which is what lets its cells
   * stick without dragging the whole row with them.
   *
   * Called once per visible column, in display order, with the column's
   * resolved width; returning `null` leaves that cell empty. One number, one
   * basis is the consumer's rule to keep — a footer cell is where a total goes
   * under its own field, not aggregate storage the grid interprets.
   */
  tableFooter?: (column: GridFooterColumn) => ReactNode
  /**
   * CAP-6 row lifecycle, opted into by supplying it. Omit it and the grid has
   * no add affordance, no delete affordance, no confirmation and no report —
   * the primitive never assumes a table can create or destroy a row.
   *
   * The four members are documented on `GridRowLifecycle`. In short: the
   * consumer owns the row factory and the delete write, and the grid owns the
   * affordance, the confirmation and the per-row report.
   */
  rowLifecycle?: GridRowLifecycle<TData>
  /** Called only for a row the server confirmed, so the consumer can drop it. */
  onRowRemoved?: (rowId: string) => void
  /**
   * A row context menu, opted into by supplying it.
   *
   * `Grid` owns the trigger — `contextmenu` on the scroll surface, which is also
   * what `Shift+F10` and the Menu key dispatch — resolves the target set, and
   * replaces the selection when the pointer lands on a row outside it. The
   * consumer owns the items, because `components/grid/**` has no vocabulary for
   * what a row can do.
   *
   * Omitted, right-click is untouched: no native menu is suppressed and no
   * trigger listener is installed.
   */
  rowContextMenu?: ComponentType<GridRowContextMenuProps>
  /**
   * Row drag-and-drop, opted into by supplying it.
   *
   * The consumer owns the handle (it lives in a consumer column) and the write;
   * `Grid` owns the drag context, the droppable rows and the placement
   * resolution. `placement` says which side of `targetId` the row was released
   * on, because "before" and "after" are different writes when rows are
   * adjacent.
   *
   * Omit it and rows never register as drop targets, so the column drag that
   * shares this `DndContext` is unaffected.
   */
  onRowReorder?: (draggedId: string, targetId: string, placement: "before" | "after") => void
  /**
   * Called when a just-added row cannot be focused because the active filters
   * exclude it — a blank draft under a text filter, which nothing will ever
   * reveal on its own.
   *
   * This used to be written to the grid's own status line. That line is gone, so
   * a consumer that wants to say anything about it has to render something:
   * silently dropping the case leaves an operator looking at a record that
   * appears not to have been created.
   */
  onUnreachableNewRow?: () => void
  /**
   * Receives keyboard-operation messages the grid has no strip of its own to
   * render into — a copy the browser refused, a paste that skipped read-only
   * cells. See `UseGridKeyboardOptions.onNotice`.
   */
  onNotice?: (message: string) => void
  /** Forces a CAP-9 variant, for the review harness. Derived from rows otherwise. */
  panel?: GridPanelState
  className?: string
}

interface GridVirtualRowsProps<TData extends RowData> {
  scrollContainerRef: { current: HTMLDivElement | null }
  virtualizerRef: { current: Virtualizer<HTMLDivElement, Element> | null }
  rowModel: Row<TData>[]
  rows: TData[]
  getRowId: (row: TData, index: number, parent?: Row<TData>) => string
  density: GridDensity
  isReady: boolean
  panelState: GridPanelState
  columnCount: number
  visibleColumnIds: readonly string[]
  frozenColumns: readonly GridFrozenColumn[]
  /** Whether rows register as drop targets for `onRowReorder`. */
  rowDragEnabled: boolean
  getCellView: (row: Row<TData>, cell: Cell<TData, unknown>) => GridCellView<TData>
  isRowFocused: (row: Row<TData>) => boolean
  isRowEditing: (row: Row<TData>) => boolean
  focusedRowDomId: string | undefined
  onCellPointerDown: (rowId: string, columnId: string, extend: boolean) => void
  onCellPointerEnter: (rowId: string, columnId: string) => void
  onCellDoubleClick: (rowId: string, columnId: string) => void
  focusRow: (rowId: string) => boolean
  focusRowCell: (rowId: string) => boolean
  pendingFocusRowId: string | null
  onPendingFocusResolved: () => void
  onUnreachableNewRow?: () => void
  onClearFilters?: () => void
  emptyContent?: ReactNode
}

/**
 * The virtualized `<tbody>`: window spacers plus the rendered rows.
 *
 * Split out of `Grid` because the virtualizer's scroll subscription
 * re-renders its owner on every range change — and during active scrolling
 * those changes arrive `flushSync`d inside the scroll event itself. Owning the
 * hook here confines each scroll tick to this subtree, so the toolbar, the
 * header row and the footer strip below never reconcile mid-scroll.
 */
function GridVirtualRows<TData extends RowData>({
  scrollContainerRef,
  virtualizerRef,
  rowModel,
  rows,
  getRowId,
  density,
  isReady,
  panelState,
  columnCount,
  visibleColumnIds,
  frozenColumns,
  rowDragEnabled,
  getCellView,
  isRowFocused,
  isRowEditing,
  focusedRowDomId,
  onCellPointerDown,
  onCellPointerEnter,
  onCellDoubleClick,
  focusRow,
  focusRowCell,
  pendingFocusRowId,
  onPendingFocusResolved,
  onUnreachableNewRow,
  onClearFilters,
  emptyContent,
}: GridVirtualRowsProps<TData>) {
  const virtualizer = useVirtualizer({
    count: isReady ? rowModel.length : 0,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => GRID_ROW_HEIGHT[density],
    overscan: GRID_OVERSCAN,
  })

  useEffect(() => {
    virtualizerRef.current = virtualizer

    return () => {
      if (virtualizerRef.current === virtualizer) {
        virtualizerRef.current = null
      }
    }
  }, [virtualizer, virtualizerRef])

  useEffect(() => {
    virtualizer.measure()
  }, [density, virtualizer])

  const virtualRows = isReady ? virtualizer.getVirtualItems() : []
  const rowHeight = GRID_ROW_HEIGHT[density]
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0
  const paddingBottom =
    virtualRows.length > 0 ? virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end : 0

  /**
   * A stable value for "the rendered window moved".
   *
   * `virtualRows` cannot be the dependency itself: `getVirtualItems()` returns a
   * fresh array on every call, so it is a new reference on every render — useless
   * as evidence that anything changed. Its two ends are what actually decide
   * whether a row is on screen, so they are what this compares.
   */
  const virtualWindowKey = virtualRows.length
    ? `${virtualRows[0]?.index}:${virtualRows[virtualRows.length - 1]?.index}`
    : "empty"

  /**
   * Lands the focus queued by `+ Add record`, once the row is both in the row
   * model and inside the rendered window.
   *
   * Two failures, kept apart because only one of them can be retried:
   *
   * - the row is in the model but its cell is not rendered yet — a freshly
   *   appended row on a scrolled grid. `scrollToIndex` only moves the scroll
   *   offset; the virtual range updates on the render *after* it. Retried when
   *   `virtualWindowKey` changes, which is the value that proves it moved.
   * - the row is not in the row model at all — a blank draft under an active
   *   text filter. Nothing will ever reveal it, so it is reported through the
   *   status line rather than retried forever.
   *
   * Neither is reported as success. Focus that silently failed to move is the
   * one failure an operator cannot see.
   */
  useEffect(() => {
    if (pendingFocusRowId === null) {
      return
    }

    // `focusRow` is idempotent and is what puts the model — anchor, row, column,
    // scroll — on the row. `focusRowCell` then lands DOM focus, which only
    // succeeds once the virtualizer has rendered the row.
    if (!focusRow(pendingFocusRowId)) {
      // Three states resolve here and they need three different answers:
      //
      // - the consumer has not appended the row yet. `createRow` runs inside the
      //   click handler and its state lands on the *next* render, so the first
      //   effect pass legitimately finds nothing. Retried.
      // - the row is in `rows` but not in the row model. A blank draft under an
      //   active text filter, which nothing will ever reveal. Reported.
      // - otherwise it is simply not there. Same report; both are the operator
      //   looking at a row that is not on screen.
      if (rows.some((row, index) => getRowId(row, index) === pendingFocusRowId)) {
        onPendingFocusResolved()
        onUnreachableNewRow?.()
      }

      return
    }

    if (focusRowCell(pendingFocusRowId)) {
      onPendingFocusResolved()
    }
  }, [
    focusRow,
    focusRowCell,
    getRowId,
    onPendingFocusResolved,
    onUnreachableNewRow,
    pendingFocusRowId,
    rows,
    virtualWindowKey,
  ])

  return (
    <tbody data-grid-panel={gridPanelKey(panelState)}>
      {/*
        Every row in the model, not only the mounted window: the strategy reads
        this list for indices, and a virtualized row that scrolled out is still
        a slot the dragged row can land on.
      */}
      <SortableContext
        items={
          rowDragEnabled
            ? rowModel.map((row) => `${GRID_ROW_DRAG_PREFIX}${row.id}`)
            : []
        }
        strategy={verticalListSortingStrategy}
      >
      <GridPanel
        state={panelState}
        density={density}
        columnCount={columnCount}
        onClearFilters={onClearFilters}
        emptyContent={emptyContent}
      />

      {paddingTop > 0 ? (
        <tr aria-hidden="true" style={{ height: paddingTop }}>
          <td colSpan={Math.max(columnCount, 1)} className="p-0" />
        </tr>
      ) : null}

      {virtualRows.map((virtualRow) => {
        const row = rowModel[virtualRow.index]

        if (!row) {
          return null
        }

        const focused = isRowFocused(row)

        return (
          <GridRow<TData>
            key={row.id}
            row={row}
            getCellView={getCellView}
            visibleColumnIds={visibleColumnIds}
            isSelected={row.getIsSelected()}
            frozenColumns={frozenColumns}
            density={density}
            isFocused={focused}
            isEditing={isRowEditing(row)}
            rowDragId={rowDragEnabled ? `${GRID_ROW_DRAG_PREFIX}${row.id}` : undefined}
            // The virtual row's index into the sorted, filtered model: the
            // 1..N the gutter shows. `row.index` is the pre-sort index.
            rowPosition={virtualRow.index + 1}
            domId={focused ? focusedRowDomId : undefined}
            onCellPointerDown={onCellPointerDown}
            onCellPointerEnter={onCellPointerEnter}
            onCellDoubleClick={onCellDoubleClick}
          />
        )
      })}

      {paddingBottom > 0 ? (
        <tr aria-hidden="true" style={{ height: paddingBottom }}>
          <td colSpan={Math.max(columnCount, 1)} className="p-0" />
        </tr>
      ) : null}
      </SortableContext>
    </tbody>
  )
}

/**
 * The composed grid: virtualized rows, sticky header, frozen first column, grid
 * keys, and the CAP-9 panel branch.
 *
 * Two things are deliberately absent. `<table>` markup is emitted directly
 * rather than through `components/ui/table.tsx`, whose wrapper div is a second
 * scroll container that would capture both the virtualizer and the sticky frozen
 * column. And the shadcn `Table` wrappers' `border-collapse` default is replaced
 * by `border-separate`, because collapsed borders cannot coexist with sticky
 * cells.
 *
 * Grid view state is controlled from props and round-trips through the URL via
 * the caller's `onStateChange`; this component holds no sort, filter, order,
 * visibility or size state of its own. Row selection is the one exception and
 * it is routed to `onRowSelectionChange` instead of the URL writer.
 */
export function Grid<TData extends RowData>({
  rows,
  columns,
  getRowId,
  state,
  onStateChange,
  filterConnective = "all",
  onFilterConnectiveChange = () => {},
  filterTree,
  onFilterTreeChange,
  onRowSelectionChange,
  onVisibleRowIdsChange,
  ariaLabel,
  density,
  onDensityChange,
  transient,
  onCellCommit,
  onEditError,
  onClearFilters,
  emptyContent,
  toolbarExtra,
  tableFooter,
  rowLifecycle,
  onRowRemoved,
  rowContextMenu,
  onRowReorder,
  onUnreachableNewRow,
  onNotice,
  panel,
  className,
}: GridProps<TData>) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const footerStripRef = useRef<HTMLDivElement | null>(null)

  /**
   * The scroll container's content width, and the only measurement the grid's
   * layout makes.
   *
   * The table is `width: 100%` with `min-width: getTotalSize()`, so the columns
   * are stretched by exactly `frameWidth / getTotalSize()` whenever their sizes
   * fall short of the frame — a ratio no amount of reading TanStack's state can
   * produce, because the table's used width is the larger of the two and only the
   * browser knows the frame's. Hiding a column is what makes the shortfall appear,
   * which is why this is the difference between the freed width going to every
   * column and going to whichever one used to be left `auto`.
   *
   * `clientWidth` rather than `contentRect.width` from the observer: both exclude
   * a scrollbar, and `clientWidth` is the number the browser rounds, so at worst
   * the layout is half a pixel off the table's own width and the browser takes the
   * difference out of the columns. An equality check before `setState` keeps the
   * observer from re-rendering the toolbar, the header and the status strip on
   * every tick in which only the container's *height* moved — which is what the
   * virtualizer does on every scroll.
   */
  const [frameWidth, setFrameWidth] = useState(0)

  useEffect(() => {
    const container = scrollRef.current

    if (!container) {
      return
    }

    const measure = (): void => {
      const width = container.clientWidth

      setFrameWidth((current) => (current === width ? current : width))
    }

    measure()
    const observer = new ResizeObserver(measure)

    observer.observe(container)

    return () => {
      observer.disconnect()
    }
  }, [])

  /**
   * Keeps the status row's horizontal position equal to the scroller's.
   *
   * The row lives *below* the scroll container — the one place a count and its
   * totals stay visible while rows scroll past — so it cannot inherit the
   * table's offsets by construction. Instead the strip is a second scroller
   * whose content is the same width as the table, and every scroll event is
   * mirrored onto the other: trackpad over the bar scrolls the grid, and the
   * grid scrolling drags the bar's totals along with their fields. Both
   * directions, because a bar the operator cannot scroll is a strip that
   * answers to only half of the gestures.
   *
   * Coalesced through `rAF`: a direct `scrollLeft` write per event forces a
   * sync layout on every tick and the mirrored write fires the other's own
   * scroll event, doubling the work under inertia. The latest offset wins;
   * the equality check at write time is the loop guard.
   */
  const footerSyncFrame = useRef<number | null>(null)
  const footerSyncPending = useRef<{ source: HTMLDivElement; left: number } | null>(null)

  const syncFooterScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const source = event.currentTarget
    footerSyncPending.current = { source, left: source.scrollLeft }

    if (footerSyncFrame.current !== null) {
      return
    }

    footerSyncFrame.current = requestAnimationFrame(() => {
      footerSyncFrame.current = null
      const pending = footerSyncPending.current
      footerSyncPending.current = null

      if (!pending) {
        return
      }

      const target = pending.source === scrollRef.current ? footerStripRef.current : scrollRef.current

      if (target && target.scrollLeft !== pending.left) {
        target.scrollLeft = pending.left
      }
    })
  }, [])

  useEffect(() => {
    return () => {
      if (footerSyncFrame.current !== null) {
        cancelAnimationFrame(footerSyncFrame.current)
        footerSyncFrame.current = null
      }
      footerSyncPending.current = null
    }
  }, [])

  const columnDefinitions = useMemo<GridColumnDef<TData>[]>(
    () =>
      columns.map((definition, index) => {
        const id = resolveColumnId(definition, index)
        const withId = { ...definition, id } as GridColumnDef<TData>
        const fieldType = withId.meta?.grid?.fieldType

        return {
          ...withId,
          size: withId.size ?? GRID_DEFAULT_COLUMN_WIDTH,
          // Every column that declares a `fieldType` is filterable. A column
          // with no `fieldType` has no operators and stays unfiltered.
          filterFn: withId.filterFn ?? (fieldType ? gridConditionFilter(fieldType) : undefined),
        } as GridColumnDef<TData>
      }),
    [columns],
  )

  const columnIds = useMemo(
    () => columnDefinitions.map((definition) => definition.id ?? "").filter((id) => id.length > 0),
    [columnDefinitions],
  )

  const fieldTypeByColumnId = useMemo(() => {
    const types: Record<string, GridFieldType> = {}

    for (const definition of columnDefinitions) {
      const id = definition.id ?? ""
      const fieldType = definition.meta?.grid?.fieldType

      if (id.length > 0 && fieldType) {
        types[id] = fieldType
      }
    }

    return types
  }, [columnDefinitions])

  const consumerRenderers = useMemo(() => resolveConsumerRenderers(columns), [columns])

  const labelById = useMemo(() => {
    const labels = new Map<string, string>()

    columnDefinitions.forEach((definition, index) => {
      const id = resolveColumnId(definition, index)
      labels.set(id, resolveColumnLabel(definition, id))
    })

    return labels
  }, [columnDefinitions])

  /**
   * The columns the popover may name: every one that declares a `fieldType`.
   * Built from the grid's own defs rather than supplied by the consumer, so a
   * column cannot be filterable without the operators that make it filterable.
   *
   * `options` comes from `editorOptions` because that is where a select or
   * multiselect column already declares its allowed values — a second copy of
   * that list in the filter surface is a second thing to forget to update.
   */
  const filterFields = useMemo<GridFilterField[]>(
    () =>
      columnDefinitions.flatMap((definition) => {
        const id = definition.id ?? ""
        const fieldType = definition.meta?.grid?.fieldType
        const label = labelById.get(id) ?? definition.header

        if (id.length === 0 || !fieldType || typeof label !== "string") {
          return []
        }

        return [
          {
            id,
            label,
            fieldType,
            // A select/multiselect declares its allowed values as `options`; a
            // linked field declares pickable records, whose **labels** are the
            // values the filter can match. Falling back here is the filter's only
            // channel for a linked column's labels.
            options:
              definition.meta?.grid?.editorOptions?.options ??
              definition.meta?.grid?.editorOptions?.records?.map((record) => record.label),
            // `emphasis` is already the column carrying the row's identity, so
            // `+ Add condition` can prefer it without a second notion of
            // "primary" existing in two places.
            primary: definition.meta?.grid?.emphasis === true,
          },
        ]
      }),
    [columnDefinitions, labelById],
  )

  const [filterOpen, setFilterOpen] = useState(false)

  // A caller that predates groups supplies only `columnFilters` + a connective;
  // wrapping them in a root group here means everything downstream sees one
  // shape. `state` is read rather than `tableState`, because in manual-filtering
  // mode the table's copy has been emptied on purpose.
  const fallbackTree = useMemo(
    () =>
      filterGroupFromConditions(
        (state.columnFilters ?? []).flatMap((entry) => {
          const value = entry.value as GridFilterCondition

          return value && typeof value.operator === "string"
            ? [{ ...value, columnId: entry.id }]
            : []
        }),
        filterConnective,
      ),
    [filterConnective, state.columnFilters],
  )
  const resolvedFilterTree = filterTree ?? fallbackTree
  const parsedConditions = useMemo(
    () => flattenConditions(resolvedFilterTree),
    [resolvedFilterTree],
  )

  const handleConditionsChange = useCallback(
    (next: GridFilterCondition[]) => {
      // Spreads `state`, not `tableState`: in manual-filtering mode `tableState`
      // has emptied `columnFilters`, and writing that back would erase every
      // condition the moment one of them was edited.
      onStateChange(
        forUrlWriter({
          ...state,
          columnFilters: next.map((condition) => ({ id: condition.columnId, value: condition })),
        }),
      )
    },
    [onStateChange, state],
  )

  /**
   * The one writer the toolbar and popover use. When the consumer supplies a
   * tree (the URL-backed controller does), it is the authority. The flat
   * fallback keeps an older consumer working: it can express the root
   * connective and the leaves, but not a nested group, which is exactly the
   * capability such a consumer never had.
   */
  const handleFilterTreeChange = useCallback(
    (next: GridFilterGroup, immediate?: boolean) => {
      if (onFilterTreeChange) {
        onFilterTreeChange(next, immediate)

        return
      }

      handleConditionsChange(flattenConditions(next))

      if (next.connective !== filterConnective) {
        onFilterConnectiveChange(next.connective)
      }
    },
    [filterConnective, handleConditionsChange, onFilterConnectiveChange, onFilterTreeChange],
  )

  /**
   * The column menu's Filter item: add this column's condition if it has none,
   * then open the ONE toolbar-anchored popover with it selected. It never opens a
   * popover of its own — the thirteen per-column funnels this replaces must not
   * come back, and a second surface would be a second truth.
   *
   * Deferred a frame for the same reason `openSortPopover` is: the menu's close
   * returns focus to its trigger, which is outside the popover, and opening in
   * the same tick lets Radix read that focus return as a dismiss.
   */
  const handleFilterColumn = useCallback(
    (columnId: string) => {
      if (!collectColumnIds(resolvedFilterTree).has(columnId)) {
        const fieldType = fieldTypeByColumnId[columnId]

        handleFilterTreeChange(
          addNode(
            resolvedFilterTree,
            [],
            conditionNode(emptyCondition(columnId, fieldType)),
          ),
          true,
        )
      }

      requestAnimationFrame(() => {
        setFilterOpen(true)
      })
    },
    [fieldTypeByColumnId, handleFilterTreeChange, resolvedFilterTree],
  )

  /**
   * A tree with a nested group or a match-any root cannot be expressed as
   * TanStack column filters, which only AND. Those trees are evaluated here
   * against the source rows and the table is handed the surviving rows with an
   * EMPTY `columnFilters`, leaving the global `q` filter to compose on top
   * exactly as it does in the flat match-all case.
   *
   * A flat all-of tree still takes the TanStack path: it is the common case and
   * the table already does that AND for us.
   */
  const conditionedRows = useMemo<TData[]>(() => {
    if (!needsManualEvaluation(resolvedFilterTree) || parsedConditions.length === 0) {
      return rows
    }

    const readById = new Map<string, (row: TData) => unknown>()
    const typeById = new Map<string, GridFieldType | undefined>()

    for (const definition of columnDefinitions) {
      const id = definition.id ?? ""

      if (id.length === 0) {
        continue
      }

      typeById.set(id, definition.meta?.grid?.fieldType)
      readById.set(id, columnAccessor(definition))
    }

    return rows.filter((row) =>
      evaluateFilterGroup(
        resolvedFilterTree,
        (columnId) => readById.get(columnId)?.(row),
        typeById,
      ),
    )
  }, [columnDefinitions, parsedConditions.length, resolvedFilterTree, rows])

  /**
   * The width being dragged, held locally for the duration of one gesture. The
   * committed value is always in the URL; an abandoned drag clears this and the
   * table falls back to the URL-derived width.
   *
   * `delta` is the pointer's own displacement since the gesture began, which is
   * not the same number as the difference between `size` and the size the drag
   * started at once the frame is stretching the table — the layout needs the
   * pointer's, because that is the thing the boundary has to track.
   */
  const [dragWidth, setDragWidth] = useState<{
    columnId: string
    size: number
    delta: number
  } | null>(null)
  const sizingInfoRef = useRef<ColumnSizingInfoState>(INITIAL_COLUMN_SIZING_INFO)
  const resizeRef = useRef<{
    active: boolean
    moved: boolean
    startSize: number
    pending: Partial<TableState> | null
  }>({ active: false, moved: false, startSize: GRID_DEFAULT_COLUMN_WIDTH, pending: null })

  const tableState = useMemo<Partial<TableState>>(() => {
    const committedColumnSizing = state.columnSizing ?? {}

    return {
      ...state,
      sorting: state.sorting ?? [],
      globalFilter: state.globalFilter ?? "",
      // A nested or match-any tree has already been applied to
      // `conditionedRows`, and TanStack would AND anything left in here on top
      // of it — so the table is told there are no column filters. `state` keeps
      // them for the indicator and the URL.
      columnFilters: needsManualEvaluation(resolvedFilterTree)
        ? []
        : state.columnFilters ?? [],
      columnOrder: state.columnOrder ?? columnIds,
      columnVisibility: state.columnVisibility ?? {},
      columnSizing: dragWidth
        ? { ...committedColumnSizing, [dragWidth.columnId]: dragWidth.size }
        : committedColumnSizing,
    }
  }, [columnIds, dragWidth, resolvedFilterTree, state])

  const tableRef = useRef<Table<TData> | null>(null)

  /**
   * The resting layout, kept for the next resize gesture to hold.
   *
   * Rewritten on every render with no gesture in flight, so the render
   * immediately before one begins is the layout that gesture must freeze — and
   * read-only otherwise. A pure derived cache rather than state: it is a value
   * derived from props on every render anyway, and putting it in state would
   * mean a second render of every row before a drag could even start.
   */
  const restingWidthsRef = useRef<readonly number[] | null>(null)

  const handleTableStateChange = useCallback<OnChangeFn<TableState>>(
    (updater) => {
      const table = tableRef.current

      if (!table) {
        onStateChange(updater)
        return
      }

      // Resolve against the table's own merged state, never against the partial
      // prop: the updaters TanStack builds read keys the URL does not carry
      // (`pagination` among them) and dereference them, so a partial here
      // throws. The resolved value is complete, which is what makes forwarding
      // the object form safe.
      const resolved = typeof updater === "function" ? updater(table.getState()) : updater

      if (sameOwnedState(table.getState(), resolved)) {
        return
      }

      // Row selection rides the same updater as everything else, so every
      // checkbox click resolves a full table state that carries it. It is split
      // off here and never forwarded: `onStateChange` is the URL writer, and a
      // selection is per-visit working state, not a shareable view. Only a
      // genuine change is handed on, so a resize drag — which re-resolves the
      // whole state on every move — does not re-notify the selection.
      const forwarded: Partial<TableState> = { ...resolved }

      // With a URL-backed tree the writer reads `filterTreeRef`, so an emptied
      // `columnFilters` here cannot erase the filter. The flat fallback still
      // needs the real list re-attached: in match-any mode it was deliberately
      // handed EMPTY `columnFilters`, and a sort or hide would otherwise write
      // that emptiness back.
      if (!onFilterTreeChange && filterConnective === "any") {
        forwarded.columnFilters = parsedConditions.map((condition) => ({
          id: condition.columnId,
          value: condition,
        }))
      }
      const nextRowSelection = forwarded.rowSelection
      delete forwarded.rowSelection

      if (nextRowSelection !== undefined && nextRowSelection !== table.getState().rowSelection) {
        onRowSelectionChange?.(nextRowSelection)
      }

      if (resizeRef.current.active) {
        // Mid-drag: hold the width locally instead of driving the router per move.
        resizeRef.current.pending = forwarded
        return
      }

      onStateChange(forUrlWriter(forwarded))
    },
    [
      filterConnective,
      onFilterTreeChange,
      onRowSelectionChange,
      onStateChange,
      parsedConditions,
    ],
  )

  const handleColumnSizingInfoChange = useCallback<OnChangeFn<ColumnSizingInfoState>>(
    (updater) => {
      const next = typeof updater === "function" ? updater(sizingInfoRef.current) : updater
      sizingInfoRef.current = next

      if (next.isResizingColumn) {
        if (!resizeRef.current.active) {
          resizeRef.current.active = true
          resizeRef.current.moved = false
          transient?.begin()
        }

        const size = Math.max(
          GRID_MIN_COLUMN_WIDTH,
          Math.round((next.startSize ?? GRID_DEFAULT_COLUMN_WIDTH) + (next.deltaOffset ?? 0)),
        )

        resizeRef.current.startSize = size

        if (!resizeRef.current.moved && size !== (next.startSize ?? size)) {
          resizeRef.current.moved = true
        }

        setDragWidth({
          columnId: next.isResizingColumn,
          size,
          // The pointer's displacement, not the change in the size it produced:
          // `size` is clamped at `GRID_MIN_COLUMN_WIDTH`, so past the floor the two
          // part ways and only the pointer's is the displacement the boundary
          // should follow.
          delta: Math.round(next.deltaOffset ?? 0),
        })
        return
      }

      if (!resizeRef.current.active) {
        return
      }

      resizeRef.current.active = false
      const pending = resizeRef.current.pending
      const moved = resizeRef.current.moved
      resizeRef.current.pending = null
      resizeRef.current.moved = false
      setDragWidth(null)
      transient?.commit()

      // A click without a move leaves the width untouched; committing it would
      // write a `size.*` key equal to the default for no reason.
      if (pending && moved) {
        onStateChange(
          forUrlWriter({
            ...pending,
            columnSizing: clampColumnSizing(pending.columnSizing ?? {}),
          }),
        )
      }
    },
    [onStateChange, transient],
  )

  const table = useReactTable({
    data: conditionedRows,
    columns: columnDefinitions,
    getRowId,
    state: tableState,
    onStateChange: handleTableStateChange,
    globalFilterFn: gridGlobalFilterFn,
    columnResizeMode: "onChange",
    onColumnSizingInfoChange: handleColumnSizingInfoChange,
    defaultColumn: { minSize: GRID_MIN_COLUMN_WIDTH },
    // Stated explicitly rather than inherited from TanStack's default of `true`:
    // `grid-row.tsx` keys `data-state="selected"` off `row.getIsSelected()`, and a
    // selection surface that depends on an unstated default is one refactor away
    // from silently rendering unchecked rows.
    enableRowSelection: true,
    // Client-side row models over the full scoped set. Server-side paging is
    // deferred behind the numeric trigger in data-loading-decision.md §3, and
    // these flags are the switch that move would flip.
    manualPagination: false,
    manualSorting: false,
    manualFiltering: false,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  // `useReactTable` mutates its own options during render, so the same pattern is
  // safe here: the handler above only ever reads this outside of render.
  tableRef.current = table

  // `table` is a stable mutable instance, so header geometry is derived from the
  // state the table was last given rather than memoized against the instance.
  const rowModel = table.getRowModel().rows

  /**
   * The visible row ids, as one string key.
   *
   * The row model is a fresh array every render, so a dependency on the array
   * itself would notify the host on every render and could loop. The ids are
   * the fact that changed or did not; a NUL separator cannot appear in a UUID
   * or a draft id.
   */
  const visibleRowIdsKey = rowModel.map((row) => row.id).join("\u0000")

  useEffect(() => {
    onVisibleRowIdsChange?.(visibleRowIdsKey.length > 0 ? visibleRowIdsKey.split("\u0000") : [])
  }, [onVisibleRowIdsChange, visibleRowIdsKey])

  const headerHeaders = table.getHeaderGroups()[0]?.headers ?? []
  const visibleColumnIds = headerHeaders.map((header) => header.column.id)
  const visibleIndexById = new Map(visibleColumnIds.map((id, index) => [id, index]))
  // `getTotalSize()` sums the **visible** columns, so it falls with every hide —
  // which is exactly the moment the frame's slack appears and has to go somewhere.
  const totalSize = table.getTotalSize()
  const restingLayout = resolveColumnLayout(headerHeaders, totalSize, frameWidth, null, null)

  if (dragWidth === null) {
    restingWidthsRef.current = restingLayout.widths
  }

  const columnLayout =
    dragWidth === null
      ? restingLayout
      : resolveColumnLayout(
          headerHeaders,
          totalSize,
          frameWidth,
          dragWidth,
          restingWidthsRef.current,
        )
  const frozenColumns = resolveFrozenRun(headerHeaders, columnLayout)
  const frozenColumnIds = frozenColumns.map((entry) => entry.columnId)
  // The trailing column, for the one thing that still treats it as special: it
  // drops its own right divider, because the frame's border is the edge there and
  // a second line just inside it reads as a doubled edge. Its *width* is a share
  // like every other column's.
  const lastVisibleColumnId =
    headerHeaders.length > 0 ? headerHeaders[headerHeaders.length - 1].column.id : null

  /**
   * The set the open context menu acts on, and the row it was opened on.
   *
   * Resolved on the `contextmenu` event rather than when the menu renders:
   * Radix opens its content in that same event, and the target has to exist by
   * the first paint so the menu's count and the visible selection cannot
   * disagree for a frame.
   */
  const [rowMenu, setRowMenu] = useState<{
    rowIds: readonly string[]
    targetRowId: string
  } | null>(null)

  // JSX needs a capitalised component; the alias also keeps the opt-in check
  // below reading as one question.
  const RowContextMenu = rowContextMenu

  const handleRowContextMenu = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!RowContextMenu) {
        return
      }

      const rowElement =
        event.target instanceof Element ? event.target.closest("[data-grid-row]") : null
      const rowId = rowElement?.getAttribute("data-grid-row") ?? null

      if (rowId === null) {
        // A header, a spacer row or the empty panel is not a row: no menu. The
        // browser's own menu is suppressed here too, because a menu that acts on
        // "the selected records" must not appear over something that is not a row.
        event.preventDefault()
        setRowMenu(null)
        return
      }

      const selection = table.getState().rowSelection ?? {}

      if (selection[rowId] === true) {
        // Already part of the selection: every selected row *in scope* is the
        // target. Rows hidden by the active filter keep their selection but stay
        // out of the target, because an operator cannot act on what they cannot
        // see, and the count in the menu must describe the rows it would delete.
        const rowIds = rowModel.map((row) => row.id).filter((id) => selection[id] === true)

        setRowMenu({ rowIds, targetRowId: rowId })
        return
      }

      // Outside the selection: the row becomes the whole target and the
      // selection follows it before the menu paints, so the highlight and the
      // menu can never disagree about what will be deleted.
      onRowSelectionChange?.({ [rowId]: true })
      setRowMenu({ rowIds: [rowId], targetRowId: rowId })
    },
    [RowContextMenu, onRowSelectionChange, rowModel, table],
  )

  const panelState = useMemo<GridPanelState>(() => {
    if (panel) {
      return panel
    }

    if (rowModel.length > 0) {
      return { kind: "ready" }
    }

    // `rows` is the SOURCE count, not what the table was handed: in match-any mode
    // `conditionedRows` is what TanStack holds, so reading its length here would
    // report a filter that matched nothing as "no records" — the wrong panel, and
    // the wrong answer to "did my filter do anything".
    return { kind: "empty", reason: rows.length === 0 ? "no-records" : "no-matches" }
  }, [panel, rowModel.length, rows.length])

  const isReady = panelState.kind === "ready"

  /**
   * The virtualizer instance lives in `GridVirtualRows` below: the scroll
   * subscription re-renders its owner on every range change, so owning it here
   * would re-render the toolbar, header and footer on every scroll tick. This
   * ref carries the instance up without a render; the child assigns it.
   */
  const virtualizerRef = useRef<Virtualizer<HTMLDivElement, Element> | null>(null)

  const scrollToIndex = useCallback((index: number) => {
    virtualizerRef.current?.scrollToIndex(index, { align: "auto" })
  }, [])

  /**
   * The row a new record was just appended into, waiting for the window to
   * reveal it.
   *
   * `scrollToIndex` only moves the scroll offset; the virtual *range* is
   * recomputed on the render after it, so a cell focused synchronously straight
   * after a scroll does not exist yet and `focusCellElement` parks focus on the
   * container. Retrying against `virtualRows` — which is the value that proves
   * the window actually moved — is what makes the focus land on a cell rather
   * than on the grid frame.
   */
  const [pendingFocusRowId, setPendingFocusRowId] = useState<string | null>(null)

  const handleAddRow = useCallback(() => {
    if (!rowLifecycle) {
      return false
    }

    const { id } = rowLifecycle.createRow()

    // Queued rather than applied inline: the row is in the consumer's state, not
    // yet in this render's row model, so an immediate `focusRow` would resolve
    // no row. The landing effect in `GridVirtualRows` retries once the
    // consumer's append has landed.
    setPendingFocusRowId(id)
    return true
  }, [rowLifecycle])

  const handlePendingFocusResolved = useCallback(() => {
    setPendingFocusRowId(null)
  }, [])

  const keyboard = useGridKeyboard<TData>({
    table,
    containerRef: scrollRef,
    scrollToIndex,
    onCellCommit,
    onEditError,
    consumerRenderedCells: consumerRenderers.cells,
    // So a typed editor's validation message names the field the operator sees
    // ("Source") rather than its column id.
    columnLabelById: labelById,
    onNotice,
  })

  /**
   * Row selection and cell-range selection are mutually exclusive.
   *
   * They are two different answers to "what will the next action apply to", and
   * a grid that paints both leaves the operator unable to tell which one an
   * action would use. The direction is read from what just changed rather than
   * from which is non-empty: a range that starts while rows are selected clears
   * the rows, and a row that becomes selected while a range is live collapses
   * the range. Both effects in one place so the rule cannot be applied from one
   * side only.
   */
  const selectedRowCount = Object.keys(state.rowSelection ?? {}).length
  const { hasRangeSelection, collapseSelection } = keyboard
  const rangeWasLiveRef = useRef(false)
  const selectedRowCountRef = useRef(0)

  useEffect(() => {
    const rangeJustBecameLive = hasRangeSelection && !rangeWasLiveRef.current
    const rowsJustBecameSelected = selectedRowCount > 0 && selectedRowCountRef.current === 0

    if (rangeJustBecameLive && selectedRowCount > 0) {
      onRowSelectionChange?.({})
    } else if (rowsJustBecameSelected && hasRangeSelection) {
      collapseSelection()
    }

    rangeWasLiveRef.current = hasRangeSelection
    selectedRowCountRef.current = selectedRowCount
  }, [collapseSelection, hasRangeSelection, onRowSelectionChange, selectedRowCount])

  useEffect(() => {
    const onWindowBlur = () => {
      if (!resizeRef.current.active) {
        return
      }

      // A drag abandoned by leaving the window must not persist its width.
      resizeRef.current.active = false
      resizeRef.current.moved = false
      resizeRef.current.pending = null
      sizingInfoRef.current = INITIAL_COLUMN_SIZING_INFO
      setDragWidth(null)
      transient?.cancel()
    }

    window.addEventListener("blur", onWindowBlur)
    return () => window.removeEventListener("blur", onWindowBlur)
  }, [transient])

  const commitColumnDrop = useCallback(
    (activeId: string, overId: string): boolean => {
      const fullOrder = table.getState().columnOrder ?? columnIds
      const next = resolveColumnDropOrder(fullOrder, activeId, overId)

      if (!next || next.every((id, index) => fullOrder[index] === id)) {
        return false
      }

      // The pinned run is validated against the resulting order, not the drop
      // target: see `isPinnedRunIntact`.
      if (!isPinnedRunIntact(next, frozenColumnIds)) {
        return false
      }

      table.setColumnOrder(next)
      return true
    },
    [columnIds, frozenColumnIds, table],
  )

  /**
   * Columns move on one axis, rows on the other, and they share this
   * `DndContext` — so the horizontal lock has to be decided per drag rather
   * than by a modifier list that would also pin a row drag to the x axis.
   */
  const axisLock = useCallback<Modifier>((args) => {
    if (String(args.active?.id ?? "").startsWith(GRID_ROW_DRAG_PREFIX)) {
      return args.transform
    }

    return restrictToHorizontalAxis(args)
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  )

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      // A row drag writes `sort_order` through `onRowReorder`, not through the
      // URL, so it must not open the column drag's transient.
      if (String(event.active.id).startsWith(GRID_ROW_DRAG_PREFIX)) {
        return
      }

      // A drag writes nothing per frame; the drop commits once, like the width
      // drag's `begin` / `commit` pair.
      transient?.begin()
    },
    [transient],
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const activeId = String(event.active.id)
      const overId = event.over ? String(event.over.id) : null

      if (activeId.startsWith(GRID_ROW_DRAG_PREFIX)) {
        if (overId !== null && overId.startsWith(GRID_ROW_DRAG_PREFIX)) {
          const draggedId = activeId.slice(GRID_ROW_DRAG_PREFIX.length)
          const targetId = overId.slice(GRID_ROW_DRAG_PREFIX.length)

          if (targetId !== draggedId && onRowReorder) {
            // `arrayMove` semantics, read off the row model: the dragged row
            // takes the target's index. Moving down means it lands after the
            // target; moving up means before it. Reading indices rather than
            // pointer halves is what makes the drop agree with the animation
            // the operator just watched.
            const ids = table.getRowModel().rows.map((row) => row.id)
            const from = ids.indexOf(draggedId)
            const to = ids.indexOf(targetId)
            const placement = from < to ? "after" : "before"

            onRowReorder(draggedId, targetId, placement)
          }
        }

        // No URL field describes row order, so the column transient stays shut.
        return
      }

      if (overId === null || overId === activeId) {
        transient?.cancel()
        return
      }

      if (commitColumnDrop(activeId, overId)) {
        transient?.commit()
      } else {
        // Unchanged or rejected: no write, so the URL keeps no `cols` it did
        // not already carry.
        transient?.cancel()
      }
    },
    [commitColumnDrop, onRowReorder, table, transient],
  )

  const handleDragCancel = useCallback(() => {
    transient?.cancel()
  }, [transient])

  // The visibility list is the fourteen DATA fields, in column-definition
  // order. The selection column is withheld because it is a control and not a
  // field: a row of checkboxes in a list of fields is the kind of thing that
  // looks like an affordance and is not one. `hideable` is resolved here rather
  // than in the toolbar because it needs `getCanHide()`, which is table state.
  const toolbarColumns: GridToolbarColumn[] = columnIds.flatMap((id) => {
    const column = table.getColumn(id)
    const definition = column?.columnDef

    if (definition?.meta?.grid?.selectable === true) {
      return []
    }

    return [
      {
        id,
        label: labelById.get(id) ?? id,
        visible: visibleIndexById.has(id),
        hideable: column?.getCanHide() === true && definition?.meta?.grid?.hideable !== false,
      },
    ]
  })

  const sortableColumns: GridSortField[] = headerHeaders
    .filter((header) => header.column.getCanSort())
    .map((header) => ({
      id: header.column.id,
      label: labelById.get(header.column.id) ?? header.column.id,
    }))

  const rowHeight = GRID_ROW_HEIGHT[density]

  /**
   * The grid's own contents, wrapped in the row-lifecycle provider only when a
   * `rowLifecycle` was supplied.
   *
   * The wrapper is conditional rather than always-present with a null
   * lifecycle, because `useGridRowLifecycle()` returning null *is* the "this
   * grid cannot create or destroy rows" answer — a provider that always
   * existed would make an inert affordance indistinguishable from an absent one.
   */
  /**
   * The frame is a bounded flex column, so the scroll container takes the height
   * it is *given* rather than asserting a viewport fraction of its own.
   *
   * It used to be capped at a fraction of the viewport, and that cap was the
   * whole of the nested scrollbar and the clipped final column: a
   * viewport-height-capped inner scroller inside a page that also scrolls gives
   * a viewport-dependent frame, and the last column's right edge is exactly
   * where the horizontal scrollbar's thumb sits. The fraction is deliberately
   * unrecoverable — `harness-guards.spec.ts` scans this directory as text and
   * bans the viewport unit outright, so it cannot be quietly reinstated here and
   * neither can a `calc` of one against a hardcoded offset. (That guard matches
   * the unit, so this comment deliberately spells neither, or it would fail its
   * own rule.)
   * `flex-1` alone would not be a fix either — free space is distributed, never
   * created — so `min-h-0` here and on every ancestor between `main` and this
   * element is load-bearing: a flex item's default `min-height: auto` refuses to
   * shrink below its content, and a chain missing it silently grows the page
   * again.
   */
  const grid = (
    <div
      data-grid-root=""
      className={cn(
        "bg-card flex min-h-0 flex-1 flex-col overflow-hidden",
        className,
      )}
    >
      <GridToolbar
        columns={toolbarColumns}
        onColumnVisibilityChange={(columnId, visible) => {
          table.getColumn(columnId)?.toggleVisibility(visible)
        }}
        hiddenFieldCount={toolbarColumns.filter((column) => !column.visible).length}
        globalFilter={typeof state.globalFilter === "string" ? state.globalFilter : ""}
        onGlobalFilterChange={(value) => {
          table.setGlobalFilter(value)
        }}
        density={density}
        onDensityChange={onDensityChange}
        visibleCount={rowModel.length}
        totalCount={rows.length}
        filterFields={filterFields}
        filterTree={resolvedFilterTree}
        onFilterTreeChange={handleFilterTreeChange}
        filterOpen={filterOpen}
        onFilterOpenChange={setFilterOpen}
        sortFields={sortableColumns}
        sorting={table.getState().sorting ?? []}
        onSortingChange={(sorting) => {
          table.setSorting(sorting)
        }}
        rowAction={
          rowLifecycle ? (
            <GridRowAddControl
              canCreate={rowLifecycle.canCreate !== false}
              onAdd={handleAddRow}
            />
          ) : undefined
        }
        toolbarExtra={toolbarExtra}
      />

      {/*
        The one scroll container in the primitive, and the element the virtualizer
        measures against. `data-grid-scroll` is a new seam on this element — it
        did not repurpose an existing one — and it exists for the *count* of
        scroll containers, which `role`/`aria-label`/`tabIndex` cannot answer:
        they identify which element this is, not how many others scroll.
      */}
      <ContextMenu
        onOpenChange={(open) => {
          // Radix owns the open state; clearing the target on close is what
          // keeps a stale row set from outliving the menu it was resolved for.
          if (!open) {
            setRowMenu(null)
          }
        }}
      >
        <ContextMenuTrigger asChild disabled={!RowContextMenu}>
      <div
        ref={scrollRef}
        data-grid-scroll=""
        role="group"
        aria-label={ariaLabel}
        tabIndex={0}
        className="focus-visible:ring-ring/50 min-h-0 flex-1 overflow-auto outline-none focus-visible:ring-[3px] focus-visible:ring-inset"
        onScroll={syncFooterScroll}
        onContextMenu={handleRowContextMenu}
        {...keyboard.containerProps}
      >
        {/*
          A literal `id`, not a generated one. `useDraggable` puts an
          `aria-describedby` on its activator built from
          `useUniqueId("DndDescribedBy", id)`, and that helper falls back to a
          **module-level counter** when `id` is absent:

              const id = ids[prefix] == null ? 0 : ids[prefix] + 1;
              ids[prefix] = id;
              return prefix + "-" + id;

          Server and browser keep separate counters, so the server rendered
          `DndDescribedBy-0` where the client produced `DndDescribedBy-3` — a
          hydration mismatch on every `/manage` load, thrown from the drag
          handle's `{...attributes}` spread. Supplying `id` short-circuits the
          counter (`if (value) return value`), which makes both renders agree.

          Constant rather than derived from `ariaLabel`: a per-grid suffix would
          work only if the number of grids on the page were identical on both
          sides, which is exactly the assumption that broke. The id is internal
          to dnd-kit and never rendered as markup.
        */}
        <DndContext
          id={DND_CONTEXT_ID}
          sensors={sensors}
          modifiers={[axisLock]}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
        {/*
          The table fills its scroll container and scrolls only when the summed
          column sizes exceed it. `minWidth` is that sum, so a wide column set
          scrolls and a narrow one stretches; the width itself is the container's
          except mid-resize, where it is pinned to the columns' own total so the
          browser does not take the drag's difference back out of them (see
          `resolveColumnLayout`).

          Every cell is then sized from `columnLayout.widths`, the **rendered**
          width rather than `header.getSize()` — which is the whole of the change:
          the sizes sum to less than the frame whenever a field has been hidden,
          and each column now takes a share of that difference instead of one of
          them taking all of it. The footer strip below is sized from the same
          numbers, which is what keeps the two column-aligned.
        */}
        <table
          data-grid-table=""
          style={{
            width: columnLayout.tableWidth,
            minWidth: columnLayout.minWidth,
            tableLayout: "fixed",
          }}
          className={cn(
            GRID_BASE_FONT_CLASS,
            // Text selection inside the grid is the cell range, never the
            // browser's native text range: a Shift+click drag-selects the
            // text between the two clicks, which spans every intermediate
            // row and paints full rows over the rectangle. `select-none`
            // removes that second signal entirely; copy still works through
            // the range clipboard (`Ctrl/Cmd+C`). The in-cell editor below
            // re-enables `select-text` so draft text stays selectable.
            "border-separate border-spacing-0 select-none",
            dragWidth && "pointer-events-none",
          )}
        >
          <thead>
            <tr style={{ height: rowHeight }}>
              {/*
                The visible columns are the sortable set, in display order — the
                same list the drag preview slides. Hidden columns keep their
                slots in `columnOrder`; the drop resolution maps this move back
                onto the full order.
              */}
              <SortableContext items={visibleColumnIds} strategy={horizontalListSortingStrategy}>
              {headerHeaders.map((header, index) => {
                const column = header.column
                const stickyLeft =
                  frozenColumns.find((entry) => entry.columnId === column.id)?.left ?? null
                const isSelectable = column.columnDef.meta?.grid?.selectable === true
                // TanStack has no reorder flag of its own — `columnOrder` is always
                // writable — so the drag is the only gate. A pinned column carries
                // no activator at all: moving the select column out of the run
                // takes the identity column with it, and moving the identity
                // column itself lets it scroll away, which is the one thing the
                // pinned run exists to prevent. Hiding is gated the same way,
                // one line below. A drop that would interleave a scrolling
                // column into the run is rejected against the resulting order
                // in `commitColumnDrop` above.
                const isPinned = frozenColumnIds.includes(column.id)

                return (
                  <GridHeaderCell
                    key={column.id}
                    label={labelById.get(column.id) ?? column.id}
                    columnId={column.id}
                    fieldType={fieldTypeByColumnId[column.id]}
                    width={columnLayout.widths[index]}
                    isLast={column.id === lastVisibleColumnId}
                    rowHeight={rowHeight}
                    stickyLeft={stickyLeft}
                    sortDirection={column.getIsSorted()}
                    isSortable={column.getCanSort()}
                    canHide={
                      column.getCanHide() &&
                      column.columnDef.meta?.grid?.hideable !== false &&
                      !isPinned
                    }
                    canDrag={!isSelectable && !isPinned}
                    suppressMenu={isSelectable}
                    sortableColumns={sortableColumns}
                    sorting={table.getState().sorting ?? []}
                    onSortingChange={(sorting) => {
                      table.setSorting(sorting)
                    }}
                    onHide={() => {
                      column.toggleVisibility(false)
                    }}
                    onFilter={handleFilterColumn}
                    resizeHandler={header.getResizeHandler()}
                    render={renderHeaderNode(header, consumerRenderers.headers)}
                  />
                )
              })}
              </SortableContext>
            </tr>
          </thead>

          <GridVirtualRows<TData>
            scrollContainerRef={scrollRef}
            virtualizerRef={virtualizerRef}
            rowModel={rowModel}
            rows={rows}
            getRowId={getRowId}
            density={density}
            isReady={isReady}
            panelState={panelState}
            columnCount={visibleColumnIds.length}
            visibleColumnIds={visibleColumnIds}
            frozenColumns={frozenColumns}
            rowDragEnabled={onRowReorder !== undefined}
            getCellView={keyboard.getCellView}
            isRowFocused={keyboard.isRowFocused}
            isRowEditing={keyboard.isRowEditing}
            focusedRowDomId={keyboard.focusedRowDomId}
            onCellPointerDown={keyboard.beginCellSelection}
            onCellPointerEnter={keyboard.extendCellSelection}
            onCellDoubleClick={keyboard.onCellDoubleClick}
            focusRow={keyboard.focusRow}
            focusRowCell={keyboard.focusRowCell}
            pendingFocusRowId={pendingFocusRowId}
            onPendingFocusResolved={handlePendingFocusResolved}
            onUnreachableNewRow={onUnreachableNewRow}
            onClearFilters={onClearFilters}
            emptyContent={emptyContent}
          />
        </table>
        </DndContext>

        {/*
          The consumer's status row, *below* the scroll container and outside
          it — the one place a count and a couple of totals can always be seen,
          because rows that scroll take anything rendered among them away. The
          pattern is the reference implementation's footer bar: pinned under the
          rows while the row set scrolls, and moving horizontally *with* the
          grid so every total stays under its own field.

          Below the scroller it cannot inherit the table's columns by
          construction, so two things carry the alignment: every cell is sized
          from the same `header.getSize()` the header row uses, and the strip
          mirrors the scroller's `scrollLeft` in both directions on every scroll
          event (`syncFooterScroll`). A frozen column therefore pins the strip's
          cell exactly as it pins the table's, which is what keeps the readout
          under the identity column and a total under its field however far
          right the operator scrolls.
        */}
      </div>
        </ContextMenuTrigger>

        {RowContextMenu && rowMenu ? (
          <ContextMenuContent>
            <RowContextMenu rowIds={rowMenu.rowIds} targetRowId={rowMenu.targetRowId} />
          </ContextMenuContent>
        ) : null}
      </ContextMenu>

      {tableFooter ? (
        <div
          ref={footerStripRef}
          data-grid-footer=""
          data-grid-footer-scroll=""
          onScroll={syncFooterScroll}
          className="shrink-0 overflow-x-auto overflow-y-hidden border-t border-t-[color:var(--grid-cell-border)] bg-card [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {/*
            The wide content the scroller above clips. The strip is sized from the
            same `columnLayout` as the table and by the same numbers, so a total
            stays under its own field with or without slack, and while the grid
            scrolls and while a column is being resized. There is no cell left to
            grow, because no single column absorbs anything. The *outer* element is
            the scroller, because an element can only scroll when its content
            overflows it — a strip carrying its own width and its own overflow
            scrolls nothing and would leave the totals behind on the first scroll
            to the right.
          */}
          <div
            className="flex items-center"
            style={{ width: columnLayout.tableWidth, minWidth: columnLayout.minWidth }}
          >
            {headerHeaders.map((header, index) => {
              const stickyLeft =
                frozenColumns.find((entry) => entry.columnId === header.column.id)?.left ?? null

              return (
                <div
                  key={header.column.id}
                  data-grid-footer-cell={header.column.id}
                  style={{
                    width: columnLayout.widths[index],
                    // Sticky, and for the same cells the table freezes: a
                    // pinned run that the bar does not repeat would leave the
                    // readout behind on the first scroll to the right.
                    position: stickyLeft === null ? undefined : "sticky",
                    left: stickyLeft === null ? undefined : stickyLeft,
                    backgroundColor: stickyLeft === null ? undefined : "var(--card)",
                  }}
                  className="text-[13px] flex-none px-2 py-1 text-[var(--grid-footer-ink)]"
                >
                  {tableFooter({ columnId: header.column.id, width: header.getSize() })}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )

  if (!rowLifecycle) {
    return grid
  }

  return (
    <GridRowLifecycleProvider<TData>
      lifecycle={rowLifecycle}
      rows={rows}
      getRowId={getRowId}
      onRowRemoved={(rowId) => {
        onRowRemoved?.(rowId)
      }}
    >
      {grid}
    </GridRowLifecycleProvider>
  )
}
