"use client"

import { useCallback, useMemo, useRef } from "react"
import type { ReactNode } from "react"
import {
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import type { OnChangeFn, Table, TableState } from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Search, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { gridConditionFilter, gridGlobalFilterFn } from "@/components/grid/grid-filter-fn"
import type {
  RecordReviewFieldDef,
  RecordReviewItem,
  RecordReviewRenderCard,
  RecordReviewRenderDetail,
} from "@/components/record-review/record-review-types"
import { cn } from "@/lib/utils"

/**
 * The card's height, in pixels.
 *
 * Fixed, because the roster is virtualized: a variable height would need a
 * measurement pass per card, and a card whose height depends on its content is
 * a card whose height the list cannot know before it renders it. The primitive
 * owns the height and the consumer's content must fit inside it, which is the
 * same bargain the grid's row heights make.
 */
export const RECORD_REVIEW_CARD_HEIGHT = 60

/** How many cards beyond the viewport are rendered. Matches the grid's overscan. */
export const RECORD_REVIEW_OVERSCAN = 8

/**
 * How many cards are rendered before the virtualizer has measured the roster.
 *
 * The virtualizer learns the roster's height from a `ResizeObserver`, whose
 * first callback arrives after layout. Until then it reports an empty window,
 * which would paint an empty roster for a frame. These cards fill that frame
 * and are replaced by the measured window on the next render.
 */
export const RECORD_REVIEW_INITIAL_CARDS = 12

/**
 * A complete `TableState` with nothing set.
 *
 * The `state` prop is a partial, because a consumer that only cares about the
 * sort should not have to spell out a pagination state. But the state handed
 * to TanStack has to be complete: the updaters TanStack builds read keys a
 * partial does not carry — `pagination` among them — and dereference them, so
 * a partial reaching them throws. This is the same defect the grid documents
 * at its own `onStateChange`.
 */
export const RECORD_REVIEW_DEFAULT_TABLE_STATE: TableState = {
  columnFilters: [],
  columnOrder: [],
  columnPinning: { left: [], right: [] },
  columnSizing: {},
  columnSizingInfo: {
    columnSizingStart: [],
    deltaOffset: null,
    deltaPercentage: null,
    isResizingColumn: false,
    startOffset: null,
    startSize: null,
  },
  columnVisibility: {},
  expanded: {},
  globalFilter: "",
  grouping: [],
  pagination: { pageIndex: 0, pageSize: 100 },
  rowPinning: { top: [], bottom: [] },
  rowSelection: {},
  sorting: [],
}

export interface RecordReviewProps<TItem extends RecordReviewItem> {
  /** The canvas heading. */
  title: ReactNode
  /** The accessible name of the roster. */
  listLabel: string
  /** The records in scope. Already scoped by the consumer. */
  items: TItem[]
  /**
   * The columns the roster can sort and filter on.
   *
   * These are the roster's *view* columns, not a table's data columns: a card
   * shows a thumbnail, a title and a line, and the fields below name what the
   * operator can sort by or filter on. A field with no accessor is a field the
   * roster cannot reason about, so every entry carries one.
   */
  fields: RecordReviewFieldDef<TItem>[]
  /**
   * The table state, controlled.
   *
   * The same contract the grid uses: the primitive never owns the sort, the
   * filter or the search text, so a consumer decides whether they live in the
   * URL, in component state, or on a server. `onStateChange` accepts both
   * updater forms, as TanStack's does.
   */
  state: Partial<TableState>
  onStateChange: OnChangeFn<TableState>
  /** The focused record's id, or `null` when nothing is focused. */
  selectedId: string | null
  /** Called with the focused record's id, or `null` when the focus is cleared. */
  onSelectedIdChange: (id: string | null) => void
  /** The card body. */
  renderCard: RecordReviewRenderCard<TItem>
  /** The detail body for the focused record. */
  renderDetail: RecordReviewRenderDetail<TItem>
  /** Consumer chrome in the toolbar, before the search. A filter chip, a sort control. */
  toolbar?: ReactNode
  /**
   * A count badge in the header.
   *
   * Omit it and the badge shows how many records the roster holds *right now* —
   * the filtered, sorted count, which is the number the operator is reading
   * the roster against. A consumer that means a different number passes one.
   */
  count?: number
  /** The search field's placeholder. */
  searchPlaceholder?: string
  /** Shown in the roster when nothing is in scope. */
  emptyList?: ReactNode
  /** Shown in the detail pane when nothing is focused. */
  emptyDetail?: ReactNode
  className?: string
}

/**
 * A record review: a roster of records on the left, the focused record's detail
 * on the right.
 *
 * The arrangement is the Airtable interface's, and it is the reason this
 * primitive exists. A table shows many records and no detail; a record review
 * shows a list you scan *and* the thing you are looking at, side by side, so
 * the operator never loses their place in the list to read a record.
 *
 * Two decisions are load-bearing and easy to undo by accident:
 *
 * 1. **The two canvases scroll independently.** The roster is a bounded list
 *    that never grows the page, and the detail pane is a bounded column of
 *    sections. They are side by side, so neither one's scroll moves the
 *    other's content out from under the operator.
 *
 * 2. **The list is a real table model underneath the cards.** Sorting runs
 *    through TanStack's `getSortedRowModel` and filtering through
 *    `getFilteredRowModel`, with the grid's own filter functions, so a card
 *    list cannot drift into a second, hand-rolled set of comparison rules. The
 *    cards are a presentation of a row model, not a replacement for one.
 */
export function RecordReview<TItem extends RecordReviewItem>({
  title,
  listLabel,
  items,
  fields,
  state,
  onStateChange,
  selectedId,
  onSelectedIdChange,
  renderCard,
  renderDetail,
  toolbar,
  count,
  searchPlaceholder = "Search",
  emptyList,
  emptyDetail,
  className,
}: RecordReviewProps<TItem>) {
  const rosterScrollRef = useRef<HTMLDivElement | null>(null)
  const tableRef = useRef<Table<TItem> | null>(null)

  /**
   * The state the table is given.
   *
   * The caller's partial is merged over a complete default, so the table never
   * sees a half-built state — see `RECORD_REVIEW_DEFAULT_TABLE_STATE`.
   */
  const tableState = useMemo<TableState>(
    () => ({ ...RECORD_REVIEW_DEFAULT_TABLE_STATE, ...state }),
    [state],
  )

  /**
   * The state write, resolved before it leaves the primitive.
   *
   * TanStack's updaters read keys a partial state does not carry — `pagination`
   * among them — and dereference them, so an updater resolved against the
   * caller's partial throws. It is resolved against the table's own merged
   * state here, and the resolved value is complete, which is what makes
   * forwarding the object form safe.
   */
  const handleStateChange = useCallback<OnChangeFn<TableState>>(
    (updater) => {
      const table = tableRef.current
      const resolved =
        typeof updater === "function" ? updater(table ? table.getState() : tableState) : updater

      onStateChange(resolved)
    },
    [onStateChange, tableState],
  )

  /**
   * The roster's columns.
   *
   * `filterFn` is bound per field from its `fieldType`, which is what makes
   * the filter condition speak the field's own language: a multiselect field
   * is tested with "has any of", a number with "is at least". The consumer
   * declares the type; the primitive does not guess it.
   */
  const columns = useMemo(
    () =>
      fields.map((field) => ({
        ...field.column,
        id: field.id,
        filterFn: gridConditionFilter(field.fieldType),
      })),
    [fields],
  )

  const table = useReactTable({
    data: items,
    columns,
    getRowId: (row) => row.id,
    state: tableState,
    onStateChange: handleStateChange,
    globalFilterFn: gridGlobalFilterFn,
    // Client-side row models over the full scoped set, exactly as the grid
    // runs them. A server-side switch is the grid's decision to make, not this
    // primitive's: the trigger for it is a measured row count, and this
    // primitive has no opinion about how many records a surface has.
    manualPagination: false,
    manualSorting: false,
    manualFiltering: false,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  /**
   * `useReactTable` mutates its own options during render, so the same pattern
   * is safe here: the handler only ever reads this outside of render.
   */
  tableRef.current = table

  const rows = table.getRowModel().rows

  /**
   * The count the header shows.
   *
   * The roster's own count, after the filter and the sort — the number the
   * operator is reading the roster against. A count of the unscoped set would
   * be a number about a different question.
   */
  const visibleCount = count ?? rows.length

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => rosterScrollRef.current,
    estimateSize: () => RECORD_REVIEW_CARD_HEIGHT,
    overscan: RECORD_REVIEW_OVERSCAN,
  })

  const virtualRows = virtualizer.getVirtualItems()

  /**
   * The window actually rendered.
   *
   * Before the virtualizer has measured the roster it reports an empty window,
   * which would paint an empty list for a frame. The first cards are rendered
   * instead, and the measured window replaces them on the next render.
   */
  const isMeasured = virtualRows.length > 0
  const visibleRows = isMeasured
    ? virtualRows.map((virtualRow) => ({ item: rows[virtualRow.index] }))
    : rows.slice(0, RECORD_REVIEW_INITIAL_CARDS).map((item) => ({ item }))

  const paddingTop = isMeasured ? virtualRows[0].start : 0
  const paddingBottom = isMeasured
    ? virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
    : 0

  const searchValue = typeof state.globalFilter === "string" ? state.globalFilter : ""

  const handleSearchChange = useCallback(
    (value: string) => {
      // The updater form, so the write is layered onto whatever TanStack
      // currently holds rather than onto the partial this component was handed.
      // A partial passed straight to `onStateChange` would drop every state key
      // it does not mention.
      onStateChange((previous) => ({ ...previous, globalFilter: value }))
    },
    [onStateChange],
  )

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  )

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col md:flex-row", className)}>
      <div
        data-record-review-roster=""
        className="flex w-full min-h-0 flex-1 flex-col border-b border-border md:w-[22rem] md:flex-none md:border-b-0 md:border-r"
      >
        <header className="shrink-0 border-b border-border bg-card px-3.5 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="truncate text-[13px] font-semibold text-[var(--program-text)]">{title}</h2>
            {visibleCount !== undefined ? (
              <span
                data-record-review-count=""
                // The RAW number as well as the formatted one: the badge reads
                // "1,234", and a test that has to strip the separators to get
                // the number back is a test one locale away from failing.
                data-record-review-count-value={visibleCount}
                className="rounded-full bg-muted px-2 py-0.5 text-[12px] font-medium text-muted-foreground"
              >
                {visibleCount.toLocaleString("en-IN")}
              </span>
            ) : null}
          </div>

          {toolbar ? <div className="mt-2 flex flex-wrap items-center gap-2">{toolbar}</div> : null}

          <div className="relative mt-2">
            <span
              aria-hidden="true"
              className="text-muted-foreground pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5"
            >
              <Search className="size-3.5" />
            </span>
            <Input
              type="search"
              value={searchValue}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="h-8 pl-8 pr-3 text-[13px]"
            />
            {searchValue.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute right-0.5 top-1/2 size-7 -translate-y-1/2"
                onClick={() => handleSearchChange("")}
                aria-label="Clear search"
              >
                <X aria-hidden="true" className="size-3.5" />
              </Button>
            ) : null}
          </div>
        </header>

        <div ref={rosterScrollRef} className="min-h-0 flex-1 overflow-y-auto">
          {rows.length === 0 ? (
            <div className="p-4 text-[13px] text-muted-foreground">
              {emptyList ?? "Nothing is in scope."}
            </div>
          ) : null}
          {/*
            The listbox stays mounted when the roster is empty. Removing it
            would make "the roster has no cards" indistinguishable from "the
            roster is not here", and a reader of the DOM — or a test — could
            not tell an empty list from a missing one.
          */}
          <div
            role="listbox"
            aria-label={listLabel}
            className="relative w-full"
            style={{ height: virtualizer.getTotalSize() }}
          >
            <div style={{ height: paddingTop }} />
            {visibleRows.map(({ item }) => {
              return (
                <div
                  key={item.id}
                  role="option"
                  aria-selected={item.id === selectedId}
                  // The record's own id, so a test can say WHICH records are in
                  // scope. A name is not an identity: `contacts.name` carries no
                  // uniqueness constraint, and two records can share one.
                  data-record-review-record-id={item.id}
                  tabIndex={0}
                  onClick={() => onSelectedIdChange(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      onSelectedIdChange(item.id)
                    }
                  }}
                  className={cn(
                    "border-l-2 px-3.5 py-2 outline-none transition-colors",
                    item.id === selectedId
                      ? "border-l-[var(--program-primary)] bg-muted"
                      : "border-l-transparent hover:bg-muted/60",
                    "focus-visible:ring-ring/50 focus-visible:ring-2",
                  )}
                  style={{ height: RECORD_REVIEW_CARD_HEIGHT }}
                >
                  {renderCard(item.original, { selected: item.id === selectedId })}
                </div>
              )
            })}
            <div style={{ height: paddingBottom }} />
          </div>
        </div>
      </div>

      <div data-record-review-detail="" className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-card">
        {selectedItem ? renderDetail(selectedItem) : (emptyDetail ?? null)}
      </div>
    </div>
  )
}
