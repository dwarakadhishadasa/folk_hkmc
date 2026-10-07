"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import type {
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
import { useVirtualizer } from "@tanstack/react-virtual"

import { GridHeaderCell } from "@/components/grid/grid-header-cell"
import { GridPanel, gridPanelKey } from "@/components/grid/grid-panel"
import { GridRow, GRID_BASE_FONT_CLASS, GRID_ROW_HEIGHT } from "@/components/grid/grid-row"
import { GridToolbar, type GridToolbarColumn } from "@/components/grid/grid-toolbar"
import type {
  GridCellCommitHandler,
  GridDensity,
  GridEditErrorHandler,
  GridFrozenColumn,
  GridPanelState,
  GridTransientHandle,
} from "@/components/grid/grid-types"
import { useGridKeyboard } from "@/components/grid/use-grid-keyboard"
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

/**
 * Applied centrally to any column def that omits a width, so `getTotalSize()` is
 * never degenerate and the frozen column always has something to pin against.
 */
export const GRID_DEFAULT_COLUMN_WIDTH = 160

/** Wide enough that the frozen column stays legible however hard it is dragged. */
export const GRID_MIN_COLUMN_WIDTH = 72

/** Viewport rows rendered beyond the visible window, per direction. */
export const GRID_OVERSCAN = 12

const INITIAL_COLUMN_SIZING_INFO: ColumnSizingInfoState = {
  startOffset: null,
  startSize: null,
  deltaOffset: null,
  deltaPercentage: null,
  isResizingColumn: false,
  columnSizingStart: [],
}

function normalizeFilterValue(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
}

/**
 * The grid's global filter.
 *
 * TanStack applies the global filter function once per globally-filterable leaf
 * column and ORs the results, so this returns a normalized substring test for
 * the column it was handed and the caller unions them. Supplying it explicitly
 * rather than relying on `'auto'` keeps the behaviour independent of which
 * built-in `getGlobalAutoFilterFn` the installed version resolves to, and keeps
 * the normalization (trim + casefold) in one place that per-column filters share.
 */
export function gridGlobalFilterFn<TData extends RowData>(
  row: Row<TData>,
  columnId: string,
  value: unknown,
): boolean {
  const needle = normalizeFilterValue(value)

  if (needle.length === 0) {
    return true
  }

  const cellValue = row.getValue(columnId)

  if (Array.isArray(cellValue)) {
    return cellValue.some((entry) => normalizeFilterValue(entry).includes(needle))
  }

  return normalizeFilterValue(cellValue).includes(needle)
}

/** `meta.grid.filter === "text"`: normalized substring. */
export function gridTextFilterFn<TData extends RowData>(
  row: Row<TData>,
  columnId: string,
  value: unknown,
): boolean {
  return gridGlobalFilterFn(row, columnId, value)
}

/**
 * `meta.grid.filter === "number"`: keeps rows at or above the entered value.
 *
 * The built-in `auto` resolution would pick `equalsNumber` for a numeric column
 * and compare it against a string, which matches nothing, so the numeric filter
 * has to be explicit.
 */
export function gridNumberFilterFn<TData extends RowData>(
  row: Row<TData>,
  columnId: string,
  value: unknown,
): boolean {
  const raw = String(value ?? "").trim()

  if (raw.length === 0) {
    return true
  }

  const threshold = Number(raw)

  if (!Number.isFinite(threshold)) {
    return true
  }

  const cellValue = row.getValue(columnId)
  const numeric = typeof cellValue === "number" ? cellValue : Number(cellValue)

  if (!Number.isFinite(numeric)) {
    return false
  }

  return numeric >= threshold
}

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
 */
function resolveFrozenRun<TData extends RowData>(headers: Header<TData, unknown>[]): GridFrozenColumn[] {
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
    left += header.getSize()
  }

  return run
}

/**
 * The consumer's own header node, or `undefined` for a plain labelled column.
 *
 * A string header is the label path the cell already renders, so only a
 * function or element header counts as a consumer-rendered body — that is how
 * the cell knows to suppress its own sort button, filter, menu and resize.
 */
function renderHeaderNode<TData extends RowData>(header: Header<TData, unknown>): ReactNode | undefined {
  const definition = header.column.columnDef.header

  if (typeof definition !== "function" && typeof definition !== "object") {
    return undefined
  }

  return flexRender(definition, header.getContext()) ?? undefined
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
   * Receives the resolved selection whenever it changes.
   *
   * Selection is deliberately not part of `state`'s URL half: `pickGridState`
   * enumerates six grid keys and `rowSelection` is not among them, because a
   * selection is per-visit working state rather than a shareable view. It is
   * intercepted here so a checkbox click never reaches the URL writer.
   */
  onRowSelectionChange?: (rowSelection: RowSelectionState) => void
  ariaLabel: string
  density: GridDensity
  onDensityChange: (density: GridDensity) => void
  /** Escape hatch from `useGridViewState`: a resize drag writes the URL once. */
  transient?: GridTransientHandle
  onCellCommit?: GridCellCommitHandler<TData>
  onEditError?: GridEditErrorHandler<TData>
  /** Clears `q`, `f.*` and `sort`; wired to the filtered-empty panel action. */
  onClearFilters?: () => void
  /** Replaces the filtered-empty panel body entirely. */
  emptyContent?: ReactNode
  /** Consumer chrome rendered in the toolbar, after the density control. */
  toolbarExtra?: ReactNode
  /** Forces a CAP-9 variant, for the review harness. Derived from rows otherwise. */
  panel?: GridPanelState
  className?: string
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
  onRowSelectionChange,
  ariaLabel,
  density,
  onDensityChange,
  transient,
  onCellCommit,
  onEditError,
  onClearFilters,
  emptyContent,
  toolbarExtra,
  panel,
  className,
}: GridProps<TData>) {
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const columnDefinitions = useMemo<GridColumnDef<TData>[]>(
    () =>
      columns.map((definition, index) => {
        const id = resolveColumnId(definition, index)
        const withId = { ...definition, id } as GridColumnDef<TData>
        const filterKind = withId.meta?.grid?.filter

        return {
          ...withId,
          size: withId.size ?? GRID_DEFAULT_COLUMN_WIDTH,
          filterFn:
            withId.filterFn ??
            (filterKind === "number"
              ? gridNumberFilterFn
              : filterKind === "text"
                ? gridTextFilterFn
                : undefined),
        } as GridColumnDef<TData>
      }),
    [columns],
  )

  const columnIds = useMemo(
    () => columnDefinitions.map((definition) => definition.id ?? "").filter((id) => id.length > 0),
    [columnDefinitions],
  )

  const labelById = useMemo(() => {
    const labels = new Map<string, string>()

    columnDefinitions.forEach((definition, index) => {
      const id = resolveColumnId(definition, index)
      labels.set(id, resolveColumnLabel(definition, id))
    })

    return labels
  }, [columnDefinitions])

  /**
   * The width being dragged, held locally for the duration of one gesture. The
   * committed value is always in the URL; an abandoned drag clears this and the
   * table falls back to the URL-derived width.
   */
  const [dragWidth, setDragWidth] = useState<{ columnId: string; size: number } | null>(null)
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
      columnFilters: state.columnFilters ?? [],
      columnOrder: state.columnOrder ?? columnIds,
      columnVisibility: state.columnVisibility ?? {},
      columnSizing: dragWidth
        ? { ...committedColumnSizing, [dragWidth.columnId]: dragWidth.size }
        : committedColumnSizing,
    }
  }, [columnIds, dragWidth, state])

  const tableRef = useRef<Table<TData> | null>(null)

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

      // Row selection rides the same updater as everything else, so every
      // checkbox click resolves a full table state that carries it. It is split
      // off here and never forwarded: `onStateChange` is the URL writer, and a
      // selection is per-visit working state, not a shareable view. Only a
      // genuine change is handed on, so a resize drag — which re-resolves the
      // whole state on every move — does not re-notify the selection.
      const forwarded: Partial<TableState> = { ...resolved }
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
    [onRowSelectionChange, onStateChange],
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

        setDragWidth({ columnId: next.isResizingColumn, size })
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
    data: rows,
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
  const headerHeaders = table.getHeaderGroups()[0]?.headers ?? []
  const visibleColumnIds = headerHeaders.map((header) => header.column.id)
  const visibleIndexById = new Map(visibleColumnIds.map((id, index) => [id, index]))
  const frozenColumns = resolveFrozenRun(headerHeaders)
  const frozenColumnIds = frozenColumns.map((entry) => entry.columnId)

  const panelState = useMemo<GridPanelState>(() => {
    if (panel) {
      return panel
    }

    if (rowModel.length > 0) {
      return { kind: "ready" }
    }

    return { kind: "empty", reason: rows.length === 0 ? "no-records" : "no-matches" }
  }, [panel, rowModel.length, rows.length])

  const isReady = panelState.kind === "ready"

  const virtualizer = useVirtualizer({
    count: isReady ? rowModel.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => GRID_ROW_HEIGHT[density],
    overscan: GRID_OVERSCAN,
  })

  const scrollToIndex = useCallback(
    (index: number) => {
      virtualizer.scrollToIndex(index, { align: "auto" })
    },
    [virtualizer],
  )

  const keyboard = useGridKeyboard<TData>({
    table,
    containerRef: scrollRef,
    scrollToIndex,
    onCellCommit,
    onEditError,
  })

  useEffect(() => {
    virtualizer.measure()
  }, [density, virtualizer])

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

  const moveColumn = useCallback(
    (columnId: string, direction: -1 | 1) => {
      const fullOrder = table.getState().columnOrder ?? columnIds
      const visible = new Set(table.getVisibleLeafColumns().map((column) => column.id))
      const from = fullOrder.indexOf(columnId)

      if (from === -1) {
        return
      }

      let target = from

      // Step over hidden columns so "move left" means the previous *visible* column.
      for (let step = 0; step < Math.abs(direction); step += 1) {
        let candidate = target + direction

        while (candidate >= 0 && candidate < fullOrder.length && !visible.has(fullOrder[candidate])) {
          candidate += direction
        }

        if (candidate < 0 || candidate >= fullOrder.length) {
          return
        }

        target = candidate
      }

      if (target === from) {
        return
      }

      const next = [...fullOrder]
      next.splice(from, 1)
      next.splice(target, 0, columnId)
      table.setColumnOrder(next)
    },
    [columnIds, table],
  )

  const filterValueByColumn = useMemo(() => {
    const values = new Map<string, string>()

    for (const filter of state.columnFilters ?? []) {
      values.set(filter.id, filter.value === undefined || filter.value === null ? "" : String(filter.value))
    }

    return values
  }, [state.columnFilters])

  const toolbarColumns: GridToolbarColumn[] = columnIds.map((id) => ({
    id,
    label: labelById.get(id) ?? id,
    visible: visibleIndexById.has(id),
  }))

  const rowHeight = GRID_ROW_HEIGHT[density]
  const totalSize = table.getTotalSize()
  const virtualRows = isReady ? virtualizer.getVirtualItems() : []
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0
  const paddingBottom =
    virtualRows.length > 0 ? virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end : 0

  return (
    <div
      data-grid-root=""
      className={cn("bg-card overflow-hidden rounded-md border border-border", className)}
    >
      <GridToolbar
        columns={toolbarColumns}
        onColumnVisibilityChange={(columnId, visible) => {
          table.getColumn(columnId)?.toggleVisibility(visible)
        }}
        globalFilter={typeof state.globalFilter === "string" ? state.globalFilter : ""}
        onGlobalFilterChange={(value) => {
          table.setGlobalFilter(value)
        }}
        density={density}
        onDensityChange={onDensityChange}
        visibleCount={rowModel.length}
        totalCount={rows.length}
        frozenColumnIds={frozenColumnIds}
        toolbarExtra={toolbarExtra}
      />

      <p
        role="status"
        aria-live="polite"
        className={cn(
          "border-b border-border px-2 py-1 text-[13px]",
          keyboard.statusMessage ? "text-destructive block" : "sr-only",
        )}
      >
        {keyboard.statusMessage ?? ""}
      </p>

      <div
        ref={scrollRef}
        role="group"
        aria-label={ariaLabel}
        tabIndex={0}
        className="focus-visible:ring-ring/50 max-h-[70vh] overflow-auto outline-none focus-visible:ring-[3px] focus-visible:ring-inset"
        {...keyboard.containerProps}
      >
        <table
          data-grid-table=""
          style={{ width: totalSize, tableLayout: "fixed" }}
          className={cn(
            GRID_BASE_FONT_CLASS,
            "border-separate border-spacing-0",
            dragWidth && "pointer-events-none select-none",
          )}
        >
          <thead>
            <tr style={{ height: rowHeight }}>
              {headerHeaders.map((header) => {
                const column = header.column
                const stickyLeft =
                  frozenColumns.find((entry) => entry.columnId === column.id)?.left ?? null
                const filterKind = column.columnDef.meta?.grid?.filter ?? null
                const visibleIndex = visibleIndexById.get(column.id) ?? 0
                // TanStack has no reorder flag of its own — `columnOrder` is
                // always writable — so the selection control is held in place here
                // instead. A leading control column that could be dragged out from
                // the pinned region would take the identity column with it.
                const isSelectable = column.columnDef.meta?.grid?.selectable === true

                return (
                  <GridHeaderCell
                    key={column.id}
                    label={labelById.get(column.id) ?? column.id}
                    columnId={column.id}
                    width={header.getSize()}
                    rowHeight={rowHeight}
                    stickyLeft={stickyLeft}
                    sortDirection={column.getIsSorted()}
                    isSortable={column.getCanSort()}
                    onSortToggle={() => {
                      column.toggleSorting()
                    }}
                    filterKind={filterKind}
                    filterValue={filterValueByColumn.get(column.id) ?? ""}
                    onFilterChange={(value) => {
                      column.setFilterValue(value.length === 0 ? undefined : value)
                    }}
                    canHide={
                      column.getCanHide() &&
                      column.columnDef.meta?.grid?.hideable !== false &&
                      !frozenColumnIds.includes(column.id)
                    }
                    canMoveLeft={visibleIndex > 0 && !isSelectable}
                    canMoveRight={
                      !isSelectable && visibleIndex > -1 && visibleIndex < visibleColumnIds.length - 1
                    }
                    onMoveLeft={() => {
                      moveColumn(column.id, -1)
                    }}
                    onMoveRight={() => {
                      moveColumn(column.id, 1)
                    }}
                    onHide={() => {
                      column.toggleVisibility(false)
                    }}
                    resizeHandler={header.getResizeHandler()}
                    render={renderHeaderNode(header)}
                  />
                )
              })}
            </tr>
          </thead>

          <tbody data-grid-panel={gridPanelKey(panelState)}>
            <GridPanel
              state={panelState}
              density={density}
              columnCount={visibleColumnIds.length}
              onClearFilters={onClearFilters}
              emptyContent={emptyContent}
            />

            {paddingTop > 0 ? (
              <tr aria-hidden="true" style={{ height: paddingTop }}>
                <td colSpan={Math.max(visibleColumnIds.length, 1)} className="p-0" />
              </tr>
            ) : null}

            {virtualRows.map((virtualRow) => {
              const row = rowModel[virtualRow.index]

              if (!row) {
                return null
              }

              return (
                <GridRow<TData>
                  key={row.id}
                  row={row}
                  cells={row.getVisibleCells().map((cell) => keyboard.getCellView(row, cell))}
                  frozenColumns={frozenColumns}
                  density={density}
                  isFocused={keyboard.isRowFocused(row)}
                  isEditing={keyboard.isRowEditing(row)}
                  domId={keyboard.isRowFocused(row) ? keyboard.focusedRowDomId : undefined}
                  onCellPointerDown={keyboard.focusCell}
                />
              )
            })}

            {paddingBottom > 0 ? (
              <tr aria-hidden="true" style={{ height: paddingBottom }}>
                <td colSpan={Math.max(visibleColumnIds.length, 1)} className="p-0" />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
