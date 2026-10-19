"use client"

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import type { ClipboardEvent, KeyboardEvent, ReactNode } from "react"
import { flexRender } from "@tanstack/react-table"
import type { Cell, Row, Table } from "@tanstack/react-table"

import type {
  GridCellCommitHandler,
  GridCellCoordinate,
  GridCellSelection,
  GridCellView,
  GridEditErrorHandler,
  GridSelectionCoordinate,
} from "@/components/grid/grid-types"
import type { GridEditorContext, GridEditorDefinition } from "@/components/grid/grid-editor-types"
import { resolveGridEditor } from "@/components/grid/grid-editors"


/**
 * Separates the row id from the column id in `data-grid-cell`.
 *
 * `~` rather than NUL: a NUL cannot appear in a CSS string, so a selector
 * built from one silently matches nothing and focus restoration after
 * Escape/Enter would quietly stop working. `~` is unreserved in RFC 3986, legal
 * inside a quoted CSS attribute selector, and legal in an attribute value.
 */
export const GRID_CELL_KEY_SEPARATOR = "~"

const GUARDED_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"])

const GENERIC_COMMIT_FAILURE = "The change could not be saved."

const MISSING_COMMIT_HANDLER = "This grid was mounted without an onCellCommit handler."

/** Value of `meta.grid.editor` for a cell the `Space` key toggles. */
const CHECKBOX_EDITOR = "checkbox"

/**
 * One step of a cell move, in the visible row model and in display-column order.
 *
 * `column` is an offset into the *visible* leaf columns rather than an id delta,
 * because `columnOrder` and `columnVisibility` both decide which columns are on
 * screen and in what order — a move that stepped ids would land on a hidden
 * column's neighbour.
 */
type CellStep = { row: -1 | 0 | 1; column: -1 | 0 | 1 }

const ARROW_STEPS: Readonly<Record<string, CellStep>> = {
  ArrowUp: { row: -1, column: 0 },
  ArrowDown: { row: 1, column: 0 },
  ArrowLeft: { row: 0, column: -1 },
  ArrowRight: { row: 0, column: 1 },
}

export function gridCellKey(rowId: string, columnId: string): string {
  return `${rowId}${GRID_CELL_KEY_SEPARATOR}${columnId}`
}

/**
 * Anything that owns its own typing or its own focus model. Radix popover and
 * dropdown content renders inside a popper wrapper; those wrappers normally
 * live outside this container, but the containment check is what makes the
 * guarantee hold if a consumer renders one inline.
 */
function isGuardedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  if (GUARDED_TAGS.has(target.tagName) || target.isContentEditable) {
    return true
  }

  return target.closest("[data-radix-popper-content-wrapper]") !== null
}

/** Resolves a rejected commit into one human-readable line. */
function readFailureMessage(cause: unknown): string {
  if (cause instanceof Error && cause.message.length > 0) {
    return cause.message
  }

  if (
    cause &&
    typeof cause === "object" &&
    "error" in cause &&
    typeof (cause as { error?: unknown }).error === "string" &&
    (cause as { error: string }).error.length > 0
  ) {
    return (cause as { error: string }).error
  }

  return GENERIC_COMMIT_FAILURE
}

/**
 * The consumer's own cell node, or `undefined` for a plain value column.
 *
 * `flexRender` is TanStack's own contract and already returns `null` for a
 * column def with no `cell`, so this stays the single rendering path instead of
 * a second one the primitive would have to thread through `GridCellView`.
 *
 * The membership test is load-bearing and cannot be replaced by asking the
 * column def whether it has a `cell`: `table._getDefaultColumnDef()` supplies
 * `cell: props => props.renderValue()?.toString() ?? null` for **every** column,
 * so `columnDef.cell` is never absent. Trusting it made `render` defined for
 * every accessor column, and because `GridRow` prefers `render` over `text`,
 * `cell.text` — which carries the optimistic override and the `title` tooltip —
 * became dead, and an in-flight edit kept showing the prior value until the write
 * resolved.
 */
function renderCellNode<TData>(
  cell: Cell<TData, unknown>,
  consumerRendered: ReadonlySet<string>,
): ReactNode | undefined {
  if (!consumerRendered.has(cell.column.id)) {
    return undefined
  }

  return flexRender(cell.column.columnDef.cell, cell.getContext()) ?? undefined
}

interface CellOverride {
  /** Display text rendered in place of the row's own value. */
  value: string
  error?: string
}

/**
 * How wide the pinned run is on screen, measured from the header cells.
 *
 * **Measured, not summed from `column.getSize()`**, for two reasons that are
 * separate and both real:
 *
 * A pinned column's laid-out width is a *share* of the table's width whenever
 * the frame is stretching it (see `resolveColumnLayout` in `grid.tsx`), so the
 * summed size understates what the columns occupy by the stretch factor — on a
 * wide frame by hundreds of pixels, which is the same order as the reveal
 * distance being computed.
 *
 * And the run is not the set of columns that declare `meta.grid.frozen`: a
 * selection control ahead of the identity column is pinned too, without saying
 * so, so summing the frozen declarations alone leaves the identity column's own
 * offset out of the region.
 *
 * The **header** row is read, not the body: it carries the same pinned cells at
 * the same widths and there are one or two of them, where the body has two per
 * rendered row. The origin is the container's border-box left, which is the same
 * origin `absoluteLeft` below is measured from — so the two carry the same
 * constant and cancel.
 */
function pinnedRegionWidth(container: HTMLElement, containerRect: DOMRect): number {
  let width = 0

  for (const cell of container.querySelectorAll<HTMLElement>("thead [data-grid-frozen]")) {
    const right = cell.getBoundingClientRect().right - containerRect.left

    if (right > width) {
      width = right
    }
  }

  return width
}

export interface UseGridKeyboardOptions<TData> {
  table: Table<TData>
  /** The single scroll container, used for key handling and focus restoration. */
  containerRef: React.RefObject<HTMLDivElement | null>
  scrollToIndex: (index: number) => void
  onCellCommit?: GridCellCommitHandler<TData>
  onEditError?: GridEditErrorHandler<TData>
  /**
   * Column ids whose definition supplied a `cell` renderer.
   *
   * Required rather than inferred: TanStack's per-column default renderer cannot
   * be distinguished from a consumer's one after the defaults are merged, so
   * `Grid` resolves it from the definitions it was handed and passes it down.
   */
  consumerRenderedCells: ReadonlySet<string>
  /**
   * Column id to header label, so a validation message can name the field an
   * operator sees rather than its column id. Optional: a caller without one gets
   * the column id, which is what the fallback below uses.
   */
  columnLabelById?: ReadonlyMap<string, string>
  /**
   * Receives a keyboard operation's outcome message.
   *
   * Only for messages with no surviving on-screen signal: a copy the browser
   * refused, a paste that skipped read-only cells. A rejected cell commit is
   * *not* routed here — that message rides the cell itself, as its title and
   * its destructive colour.
   *
   * The grid used to own a status line to render these into. It does not any
   * more, so nothing is shown unless the consumer supplies this and renders
   * something; dropping it silently turns a failed copy into no feedback at
   * all.
   */
  onNotice?: (message: string) => void
}

export interface GridKeyboardApi<TData> {
  focusedRowIndex: number
  /**
   * Marks a column as focused after a pointer interaction on that cell.
   *
   * `extend` is the `Shift` modifier on that same pointer interaction. A plain
   * click re-anchors the range on the clicked cell; a `Shift`+click moves the
   * focus to it and leaves the anchor alone, so the rectangle grows towards the
   * pointer — which is what the modifier means everywhere else on screen.
   */
  focusCell: (rowId: string, columnId: string, extend?: boolean) => void
  /**
   * The one opener. Double-clicking a closed cell opens its editor; double-clicking
   * the cell whose editor is already open commits that draft and closes.
   *
   * Returns nothing because the caller already knows the gesture happened: the
   * interesting outcomes — a read-only column, a checkbox cell — are no-ops that
   * are *visible as such*, and `openEditor`'s boolean is what the guard itself
   * returns rather than something a spec needs to read.
   */
  onCellDoubleClick: (rowId: string, columnId: string) => void
  /**
   * Moves the whole focus model onto `rowId`: the first editable column of that
   * row, the range anchor with it, the virtualizer scrolled to it and the DOM
   * focus landed.
   *
   * Every step is the same one an arrow press takes (`stepFocus`), which is the
   * point. A new row therefore arrives focused the way an operator reaching it
   * with the keyboard would find it — not through a ref the primitive had to be
   * handed, and not under a second set of rules for "added" rows.
   *
   * Resolves the row and moves the *model* onto it; DOM focus is
   * `focusRowCell`'s job, and the split is load-bearing rather than tidiness.
   * `scrollToIndex` only moves the scroll offset — the virtual range updates on
   * the render *after* it — so a caller that treated "the row resolved" as "the
   * cell is focused" would park focus on the container and stop retrying. See
   * `focusRowCell`.
   *
   * Returns false when the row is not in the current row model at all, which is
   * reachable: a draft row with every field blank disappears under a text
   * filter. The caller reports that rather than dropping focus silently.
   */
  focusRow: (rowId: string) => boolean
  /**
   * Lands DOM focus on `rowId`'s focused cell, and returns whether it landed.
   *
   * Separate from `focusRow` because the answer is genuinely two-valued and only
   * the second value is retryable. A freshly appended row on a scrolled grid is
   * in the row model immediately but outside the rendered window, so this
   * returns false while the row is merely *pending* — the caller retries against
   * the rendered window, which is the dependency that proves it moved.
   */
  focusRowCell: (rowId: string) => boolean
  isRowFocused: (row: Row<TData>) => boolean
  isRowEditing: (row: Row<TData>) => boolean
  /** DOM id of the focused row, referenced by the container's activedescendant. */
  focusedRowDomId: string | undefined
  getCellView: (row: Row<TData>, cell: Cell<TData, unknown>) => GridCellView<TData>
  containerProps: {
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
    onPaste: (event: ClipboardEvent<HTMLDivElement>) => void
    "aria-activedescendant": string | undefined
  }
}

/**
 * CAP-8 grid keys plus the CAP-5 editing state machine.
 *
 * The grid owns draft, optimistic commit and visible revert; persistence is the
 * consumer's, behind `onCellCommit`. Nothing here reads or writes the URL — the
 * view-state hook owns that.
 */
export function useGridKeyboard<TData>({
  table,
  containerRef,
  scrollToIndex,
  onCellCommit,
  onEditError,
  consumerRenderedCells,
  columnLabelById,
  onNotice,
}: UseGridKeyboardOptions<TData>): GridKeyboardApi<TData> {
  const domId = useId()
  const focusedRowDomId = `${domId}-focused-row`

  const [focusedRowIndex, setFocusedRowIndex] = useState(0)
  const [focusedColumnId, setFocusedColumnId] = useState<string | null>(null)
  const [editing, setEditing] = useState<GridCellCoordinate | null>(null)
  const [draft, setDraft] = useState("")
  const [overrides, setOverrides] = useState<Record<string, CellOverride>>({})
  /**
   * Where a range selection started. `null` until a cell is pointed at.
   *
   * Only the anchor is stored. `focus` and `extent` are both the focused cell,
   * so keeping them as state too would be a second source of truth free to drift
   * from `focusedRowIndex`/`focusedColumnId` — and a range that disagreed with
   * its own focus cell would render the highlight over the wrong cells.
   */
  const [selectionAnchor, setSelectionAnchor] = useState<GridSelectionCoordinate | null>(null)

  const restoreFocusRef = useRef<string | null>(null)

  /**
   * Whether the operator has changed the open draft at least once.
   *
   * Set **only** by the editor-facing `setDraft`, never by `openEditor`'s own
   * seeding and never by comparing the draft to the cell's text. `openEditor`
   * seeds the draft from the cell's current value, so an untouched draft always
   * *equals* the existing value — and under blur-commit that equality would make
   * every stray cell click a PATCH. Comparing strings is the other half of the
   * same trap: it cannot tell "the operator retyped what was there" (a real
   * intent, and what the inline `Enter` path relies on) from "the operator
   * typed nothing".
   */
  const touchedRef = useRef(false)

  /**
   * Set by `cancelEditing`, read and cleared by the close/blur path.
   *
   * `OptionSearch` and the date input intercept `Escape` themselves, so Radix
   * never sees it there — but the multiselect option list and the calendar have
   * no local handler, and a bare `Escape` reaches Radix and closes the popover.
   * Now that popover close *commits*, that bare `Escape` would silently commit
   * instead of discarding, so every editor's `Escape` sets this flag and the
   * commit path reads it. A flag on the existing single path, not a second one.
   */
  const discardRequestedRef = useRef(false)

  const visibleRows = table.getRowModel().rows
  const clampedRowIndex =
    visibleRows.length === 0 ? -1 : Math.min(Math.max(focusedRowIndex, 0), visibleRows.length - 1)

  /**
   * Display order of the columns on screen, which is what `columnOrder` and
   * `columnVisibility` between them decide.
   *
   * Keyed off a joined string rather than off `table`: `table` is a stable
   * mutable instance, so its identity never changes when the visible column set
   * does, and memoizing on it would freeze a stale column list. `~` is the same
   * separator `gridCellKey` reserves, and a column id containing it is already
   * unusable in a cell selector, so nothing that works today breaks here.
   */
  const columnLayoutKey = table
    .getVisibleLeafColumns()
    .map((column) => column.id)
    .join(GRID_CELL_KEY_SEPARATOR)

  const visibleColumnIds = useMemo(
    () => (columnLayoutKey.length === 0 ? [] : columnLayoutKey.split(GRID_CELL_KEY_SEPARATOR)),
    [columnLayoutKey],
  )

  const columnIndexById = useMemo(
    () => new Map(visibleColumnIds.map((id, index) => [id, index])),
    [visibleColumnIds],
  )

  /** The focused cell as a selection coordinate, or null when no column is focused. */
  const focusCoordinate = useMemo<GridSelectionCoordinate | null>(
    () =>
      clampedRowIndex >= 0 && focusedColumnId !== null
        ? { rowIndex: clampedRowIndex, columnId: focusedColumnId }
        : null,
    [clampedRowIndex, focusedColumnId],
  )

  /**
   * The live range, or `null` when nothing is pointed at yet.
   *
   * `extent` tracks the focus by construction: a plain arrow re-anchors and a
   * `Shift` move leaves the anchor alone, so "where the range ends" and "which
   * cell is focused" are the same question and cannot be answered differently.
   */
  const selection = useMemo<GridCellSelection | null>(
    () =>
      focusCoordinate === null || selectionAnchor === null
        ? null
        : { anchor: selectionAnchor, focus: focusCoordinate, extent: focusCoordinate },
    [focusCoordinate, selectionAnchor],
  )

  /**
   * A range is live once the two corners differ.
   *
   * A one-cell range is deliberately *not* live. A single clicked cell would
   * otherwise be painted with the range surface and be indistinguishable from
   * a focused cell, which is the one thing CAP-4 says the range has to be
   * distinguishable from.
   */
  const hasRangeSelection =
    selection !== null &&
    (selection.anchor.rowIndex !== selection.extent.rowIndex ||
      selection.anchor.columnId !== selection.extent.columnId)

  /**
   * The row span and column span of the rectangle, inclusive.
   *
   * A column that is no longer visible resolves to `null`, and a range that
   * cannot be resolved draws nothing rather than drawing the wrong cells: the
   * alternative is silently reinterpreting the operator's selection as some
   * other rectangle. Anchors are row *indices*, so the row ends clamp into the
   * row model rather than dangling — which is the whole reason they are indices.
   */
  const selectionBounds = useMemo(() => {
    if (!hasRangeSelection || selection === null || visibleRows.length === 0) {
      return null
    }

    const anchorColumn = columnIndexById.get(selection.anchor.columnId)
    const extentColumn = columnIndexById.get(selection.extent.columnId)

    if (anchorColumn === undefined || extentColumn === undefined) {
      return null
    }

    const anchorRow = Math.min(Math.max(selection.anchor.rowIndex, 0), visibleRows.length - 1)
    const extentRow = Math.min(Math.max(selection.extent.rowIndex, 0), visibleRows.length - 1)

    return {
      firstRow: Math.min(anchorRow, extentRow),
      lastRow: Math.max(anchorRow, extentRow),
      firstColumn: Math.min(anchorColumn, extentColumn),
      lastColumn: Math.max(anchorColumn, extentColumn),
    }
  }, [columnIndexById, hasRangeSelection, selection, visibleRows.length])

  /**
   * Row id to visible position, built only while a range is live.
   *
   * `getCellView` runs once per rendered cell, so the lookup is done once here
   * rather than re-scanning the row model inside each of the ~25 cells in view.
   */
  const selectedRowIndexes = useMemo(
    () => (selectionBounds === null ? null : new Map(visibleRows.map((row, index) => [row.id, index]))),
    [selectionBounds, visibleRows],
  )

  /** The value a cell would show with no override applied. */
  const rowCellText = useCallback((cell: Cell<TData, unknown>): string => {
    const value = cell.getValue()

    if (value === null || value === undefined) {
      return ""
    }

    if (Array.isArray(value)) {
      return value.join(", ")
    }

    return String(value)
  }, [])

  /** The value a cell shows right now, override included. */
  const displayCellText = useCallback(
    (rowId: string, cell: Cell<TData, unknown>): string =>
      overrides[gridCellKey(rowId, cell.column.id)]?.value ?? rowCellText(cell),
    [overrides, rowCellText],
  )

  const focusCellElement = useCallback(
    (key: string) => {
      const container = containerRef.current

      if (!container) {
        return
      }

      const cell = container.querySelector<HTMLElement>(
        `[data-grid-cell=${JSON.stringify(key)}]`,
      )

      if (cell) {
        cell.focus()
        return
      }

      // The target is not rendered: a jump scrolled it out of the virtualized
      // window before focus landed, and the previously focused cell unmounts
      // with it. Park focus on the container — but only when the grid owns it
      // or just lost it to the unmount — so the next keystroke still reaches
      // the grid instead of dying on <body>.
      const active = document.activeElement

      if (
        active === container ||
        active === document.body ||
        (active instanceof HTMLElement && container.contains(active))
      ) {
        container.focus()
      }
    },
    [containerRef],
  )

  /** Only move DOM focus when the grid already owns it, so typing is never stolen. */
  const focusCellIfGridHasFocus = useCallback(
    (key: string) => {
      const container = containerRef.current

      if (!container) {
        return
      }

      const active = document.activeElement
      const ownsFocus =
        active === container || (active instanceof HTMLElement && container.contains(active))

      if (ownsFocus) {
        focusCellElement(key)
      }
    },
    [containerRef, focusCellElement],
  )

  /**
   * Scrolls a focused cell into view horizontally, past the frozen run.
   *
   * Vertical reveal is the virtualizer's `scrollToIndex`; this is the axis it
   * does not cover. The frozen run is added to the occluded edge because a
   * cell revealed only up to the sticky columns is revealed behind them —
   * which is exactly where the last columns land without the adjustment.
   */
  const revealCell = useCallback(
    (rowIndex: number, columnId: string) => {
      const container = containerRef.current
      const row = visibleRows[rowIndex]

      if (!container || !row) {
        return
      }

      const cell = container.querySelector<HTMLElement>(
        `[data-grid-cell=${JSON.stringify(gridCellKey(row.id, columnId))}]`,
      )

      if (!cell) {
        return
      }

      const cellRect = cell.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      const pinned = pinnedRegionWidth(container, containerRect)
      const absoluteLeft = container.scrollLeft + (cellRect.left - containerRect.left)
      const absoluteRight = absoluteLeft + cell.offsetWidth
      const viewLeft = container.scrollLeft + pinned
      const viewRight = container.scrollLeft + container.clientWidth

      if (absoluteLeft < viewLeft) {
        container.scrollLeft = Math.max(0, absoluteLeft - pinned)
      } else if (absoluteRight > viewRight) {
        container.scrollLeft = absoluteRight - container.clientWidth
      }
    },
    [containerRef, visibleRows],
  )

  const moveFocus = useCallback(
    (nextIndex: number) => {
      if (visibleRows.length === 0) {
        return
      }

      const clamped = Math.min(Math.max(nextIndex, 0), visibleRows.length - 1)
      setFocusedRowIndex(clamped)
      scrollToIndex(clamped)

      const row = visibleRows[clamped]
      const columnId = focusedColumnId ?? row?.getVisibleCells()[0]?.column.id

      if (row && columnId) {
        // A move without `Shift` collapses the range onto the cell it lands on,
        // exactly as a drag without `Shift` would. Leaving the anchor behind
        // would make the highlight grow every time the operator simply arrowed
        // across the grid.
        setSelectionAnchor({ rowIndex: clamped, columnId })
        focusCellIfGridHasFocus(gridCellKey(row.id, columnId))
        revealCell(clamped, columnId)
      }
    },
    [focusCellIfGridHasFocus, focusedColumnId, revealCell, scrollToIndex, visibleRows],
  )

  /**
   * Moves the focus one cell, re-anchoring the range or growing it.
   *
   * `extend` is `Shift`, and it is the only difference between the two: with it
   * the anchor is left where it is and the far corner follows, without it the
   * anchor travels with the focus. Both directions end on a rendered cell, so a
   * range can never name a row the grid is not showing.
   */
  const stepFocus = useCallback(
    (step: CellStep, extend: boolean) => {
      if (visibleRows.length === 0 || visibleColumnIds.length === 0) {
        return
      }

      const row = visibleRows[clampedRowIndex]
      const columnId = focusedColumnId ?? row?.getVisibleCells()[0]?.column.id

      if (!row || !columnId) {
        return
      }

      const nextRowIndex = Math.min(Math.max(clampedRowIndex + step.row, 0), visibleRows.length - 1)
      const currentColumnIndex = columnIndexById.get(columnId) ?? 0
      const nextColumnIndex = Math.min(
        Math.max(currentColumnIndex + step.column, 0),
        visibleColumnIds.length - 1,
      )
      const nextColumnId = visibleColumnIds[nextColumnIndex]

      if (!nextColumnId) {
        return
      }

      // The anchor is captured before the move, because on the first `Shift`
      // press there is no range yet and the anchor is the cell being left.
      const nextAnchor: GridSelectionCoordinate = extend
        ? (selectionAnchor ?? { rowIndex: clampedRowIndex, columnId })
        : { rowIndex: nextRowIndex, columnId: nextColumnId }

      setSelectionAnchor(nextAnchor)
      setFocusedRowIndex(nextRowIndex)
      setFocusedColumnId(nextColumnId)
      scrollToIndex(nextRowIndex)

      const nextRow = visibleRows[nextRowIndex]

      if (nextRow) {
        focusCellIfGridHasFocus(gridCellKey(nextRow.id, nextColumnId))
        revealCell(nextRowIndex, nextColumnId)
      }
    },
    [
      clampedRowIndex,
      columnIndexById,
      focusCellIfGridHasFocus,
      focusedColumnId,
      revealCell,
      scrollToIndex,
      selectionAnchor,
      visibleColumnIds,
      visibleRows,
    ],
  )

  /**
   * `Tab` / `Shift+Tab`: the next / previous cell in the same row, wrapping to
   * the adjacent row's edge cell at the row ends and stopping at the grid's
   * corners. A plain move, so the range collapses onto the destination.
   */
  const moveTab = useCallback(
    (fromRowIndex: number, fromColumnId: string, backward: boolean) => {
      if (visibleRows.length === 0 || visibleColumnIds.length === 0) {
        return
      }

      const fromColumnIndex = columnIndexById.get(fromColumnId) ?? 0
      const lastColumnIndex = visibleColumnIds.length - 1
      const fromRow = visibleRows[fromRowIndex]

      // The grid's corners are stops, not wrap points: `Tab` on the last cell
      // stays, rather than landing on the last row's first cell. Focus still
      // lands on the current cell, so the stop is visible rather than silent.
      if (!backward && fromRowIndex >= visibleRows.length - 1 && fromColumnIndex >= lastColumnIndex) {
        if (fromRow) {
          focusCellIfGridHasFocus(gridCellKey(fromRow.id, fromColumnId))
          revealCell(fromRowIndex, fromColumnId)
        }

        return
      }

      if (backward && fromRowIndex <= 0 && fromColumnIndex <= 0) {
        if (fromRow) {
          focusCellIfGridHasFocus(gridCellKey(fromRow.id, fromColumnId))
          revealCell(fromRowIndex, fromColumnId)
        }

        return
      }

      let nextRowIndex = fromRowIndex
      let nextColumnIndex = fromColumnIndex + (backward ? -1 : 1)

      if (nextColumnIndex > lastColumnIndex) {
        nextColumnIndex = 0
        nextRowIndex += 1
      } else if (nextColumnIndex < 0) {
        nextColumnIndex = lastColumnIndex
        nextRowIndex -= 1
      }

      nextRowIndex = Math.min(Math.max(nextRowIndex, 0), visibleRows.length - 1)
      const nextColumnId = visibleColumnIds[nextColumnIndex]
      const nextRow = visibleRows[nextRowIndex]

      if (!nextColumnId || !nextRow) {
        return
      }

      setSelectionAnchor({ rowIndex: nextRowIndex, columnId: nextColumnId })
      setFocusedRowIndex(nextRowIndex)
      setFocusedColumnId(nextColumnId)
      scrollToIndex(nextRowIndex)
      focusCellIfGridHasFocus(gridCellKey(nextRow.id, nextColumnId))
      revealCell(nextRowIndex, nextColumnId)
    },
    [
      columnIndexById,
      focusCellIfGridHasFocus,
      revealCell,
      scrollToIndex,
      visibleColumnIds,
      visibleRows,
    ],
  )

  /**
   * `Home` / `End`: the first / last cell of the focused row.
   * `Cmd/Ctrl+Home/End`: the first cell of the first row / the last cell of
   * the last row. Plain moves, so both collapse the range.
   */
  const moveToEdge = useCallback(
    (toFirst: boolean, toGridEdge: boolean) => {
      if (visibleRows.length === 0 || visibleColumnIds.length === 0) {
        return
      }

      const edgeColumnId = toFirst ? visibleColumnIds[0] : visibleColumnIds[visibleColumnIds.length - 1]
      const edgeRowIndex = toGridEdge ? (toFirst ? 0 : visibleRows.length - 1) : clampedRowIndex
      const edgeRow = visibleRows[edgeRowIndex]

      if (!edgeColumnId || !edgeRow) {
        return
      }

      setSelectionAnchor({ rowIndex: edgeRowIndex, columnId: edgeColumnId })
      setFocusedRowIndex(edgeRowIndex)
      setFocusedColumnId(edgeColumnId)
      scrollToIndex(edgeRowIndex)
      focusCellIfGridHasFocus(gridCellKey(edgeRow.id, edgeColumnId))
      revealCell(edgeRowIndex, edgeColumnId)
    },
    [
      clampedRowIndex,
      focusCellIfGridHasFocus,
      revealCell,
      scrollToIndex,
      visibleColumnIds,
      visibleRows,
    ],
  )

  /** Puts the focus back on the anchor and collapses the range onto it. */
  const collapseSelection = useCallback(() => {    if (selectionAnchor === null) {
      return
    }

    // The anchor itself is not rewritten: `focus` and `extent` are both derived
    // from the focused cell, so moving the focus onto the anchor is the whole of
    // the collapse.
    const anchorRow = visibleRows[selectionAnchor.rowIndex]

    setFocusedRowIndex(selectionAnchor.rowIndex)
    setFocusedColumnId(selectionAnchor.columnId)
    scrollToIndex(selectionAnchor.rowIndex)

    if (anchorRow) {
      focusCellIfGridHasFocus(gridCellKey(anchorRow.id, selectionAnchor.columnId))
      revealCell(selectionAnchor.rowIndex, selectionAnchor.columnId)
    }
  }, [focusCellIfGridHasFocus, revealCell, scrollToIndex, selectionAnchor, visibleRows])

  const exitEditing = useCallback(() => {
    setEditing(null)
    setDraft("")
  }, [])

  /**
   * The editor-facing draft setter, and the **only** thing that marks a draft
   * touched.
   *
   * `openEditor` seeds through `setDraft` directly and `commitCellInput` passes
   * explicit values, so neither can make this fire: it means "the operator typed
   * into the open editor", which is exactly the condition blur-commit needs.
   */
  const setEditorDraft = useCallback((next: string) => {
    touchedRef.current = true
    setDraft(next)
  }, [])

  /**
   * The draft key handler, read through a ref.
   *
   * `handleDraftKeyDown` needs `commitEditing`, `commitEditing` needs the editor
   * commit route, and the editor context hands `handleDraftKeyDown` to the
   * controls — a cycle no amount of reordering resolves, because every edge is
   * real. A ref breaks it without a stale closure: the value is reassigned after
   * every render and read only from an event handler.
   */
  const draftKeyDownRef = useRef<(event: KeyboardEvent<HTMLInputElement>) => void>(() => undefined)

  /**
   * The blur-commit handler, read through a ref for the same reason as
   * `draftKeyDownRef`: `buildEditorContext` is built before `commitEditing` is
   * declared, because the editor context hands the editor a way to blur-commit
   * and `commitEditing` needs that context to reach `runCommit`. The cycle is
   * real, so it is broken the same way.
   */
  const blurCommitRef = useRef<() => void>(() => undefined)

  const revertCommit = useCallback(
    (
      key: string,
      target: GridCellCoordinate,
      previousText: string,
      attemptedText: string,
      cause: unknown,
    ) => {
      const message = readFailureMessage(cause)
      const row = visibleRows.find((candidate) => candidate.id === target.rowId)

      // The override is written explicitly rather than dropped: the previous
      // value has to be visible again even if the consumer mutated its rows.
      setOverrides((previous) => ({
        ...previous,
        [key]: { value: previousText, error: message },
      }))

      onEditError?.({
        rowId: target.rowId,
        columnId: target.columnId,
        row: row?.original as TData,
        previousValue: previousText,
        attemptedValue: attemptedText,
        message,
        cause,
      })
    },
    [onEditError, visibleRows],
  )

  /**
   * The one write path. Draft commits, `Delete` clears and `Space` toggles all
   * land here, so every write gets the optimistic override and the visible
   * revert. `attemptedValue` is the typed value; the override carries its
   * display text, which is what makes a boolean toggle paint immediately.
   */
  const runCommit = useCallback(
    (target: GridCellCoordinate, attemptedValue: unknown, previousText: string) => {
      const key = gridCellKey(target.rowId, target.columnId)
      const row = visibleRows.find((candidate) => candidate.id === target.rowId)
      const displayValue =
        attemptedValue === null || attemptedValue === undefined
          ? ""
          : Array.isArray(attemptedValue)
            ? attemptedValue.join(", ")
            : String(attemptedValue)

      // Enter, like Escape, hands focus back to the cell it was editing.
      restoreFocusRef.current = key
      exitEditing()

      if (!onCellCommit) {
        revertCommit(key, target, previousText, displayValue, new Error(MISSING_COMMIT_HANDLER))
        return
      }

      setOverrides((previous) => ({ ...previous, [key]: { value: displayValue } }))

      let pending: void | Promise<void>

      try {
        pending = onCellCommit({
          rowId: target.rowId,
          columnId: target.columnId,
          row: row?.original as TData,
          previousValue: row
            ?.getVisibleCells()
            .find((candidate) => candidate.column.id === target.columnId)
            ?.getValue(),
          value: attemptedValue,
        })
      } catch (cause) {
        revertCommit(key, target, previousText, displayValue, cause)
        return
      }

      if (pending && typeof (pending as Promise<void>).then === "function") {
        const rejected = (pending as Promise<void>).catch((cause: unknown) => {
          revertCommit(key, target, previousText, displayValue, cause)
        })

        void rejected
      }
    },
    [exitEditing, onCellCommit, revertCommit, visibleRows],
  )

  /**
   * The row's first editable visible column, or its first visible column when it
   * has none.
   *
   * The row the operator just added arrives focused on this column, which is the
   * same rule an arrow press would have used to get there.
   */
  const firstEditableColumnId = useCallback(
    (row: Row<TData>): string | undefined => {
      const cells = row.getVisibleCells()

      return (
        cells.find((cell) => cell.column.columnDef.meta?.grid?.editable === true)?.column.id ??
        cells[0]?.column.id
      )
    },
    [],
  )

  /**
   * The one opener. A double-click on a closed cell is the **only** gesture that
   * gets here — `e`, printable-character type-to-edit, `Space`-seeding,
   * `Enter`-when-not-editing and the old click-to-open display are all retired by
   * CAP-10 — so the seeding rule is the cell's own display text and nothing can
   * drift apart from it. An editor whose `draftSeed` differs gets its own
   * representation (a date cell edits `2026-03-05`, not `5 Mar 2026`).
   *
   * Returns false on a read-only cell, which the callers treat as a no-op rather
   * than an error, and `false` is what proves `meta.grid.editable` is the guard.
   */
  const openEditor = useCallback(
    (rowIndex: number, columnId: string): boolean => {
      const row = visibleRows[rowIndex]

      if (!row) {
        return false
      }

      const cell = row
        .getVisibleCells()
        .find((candidate) => candidate.column.id === columnId)

      if (!cell || cell.column.columnDef.meta?.grid?.editable !== true) {
        return false
      }

      setFocusedRowIndex(rowIndex)
      setFocusedColumnId(columnId)

      const definition = resolveGridEditor(cell.column.columnDef.meta?.grid?.editor)

      // `checkbox` is the one editor whose control *is* the cell, so "opening" it
      // flips the value instead of mounting a draft. A double-click never gets
      // here for one — `onCellDoubleClick` returns before this — so this branch
      // exists for the keyboard model rather than for the pointer.
      if (definition?.commitsOnInteraction === true) {
        runCommit(
          { rowId: row.id, columnId },
          cell.getValue() !== true,
          displayCellText(row.id, cell),
        )
        return true
      }

      setEditing({ rowId: row.id, columnId })

      // Reset before seeding, and never through `setEditorDraft`: the draft is
      // about to be *equal* to the cell's value, and a blur before a single
      // keystroke must still be a no-op.
      touchedRef.current = false
      discardRequestedRef.current = false

      const text = displayCellText(row.id, cell)
      setDraft(definition?.draftSeed?.(text, cell.getValue()) ?? text)
      return true
    },
    [displayCellText, runCommit, visibleRows],
  )

  const cancelEditing = useCallback(() => {
    if (!editing) {
      return
    }

    // Read and cleared by the commit path, not here: `Escape` inside an editor
    // both exits it *and* arms the flag, and the popover's own close event may
    // arrive after this has already run.
    discardRequestedRef.current = true
    restoreFocusRef.current = gridCellKey(editing.rowId, editing.columnId)
    exitEditing()
  }, [editing, exitEditing])

  /**
   * Builds what one editor instance is handed.
   *
   * Every closure here terminates in `runCommit`, which is the point: an editor
   * supplies input parsing and validation and nothing else. Nothing in
   * `grid-editors.tsx` knows a route exists, so there is exactly one mutation
   * channel for a cell write however the value was produced — a typed
   * character, a picked option, `Delete`, or a paste.
   *
   * `text` is the DW-27 contract in one field: the cell's display value with
   * the optimistic override already applied. A `renderDisplay` that reads
   * `getValue()` instead shows the prior value for the whole round trip.
   */
  const buildEditorContext = useCallback(
    (
      cell: Cell<TData, unknown>,
      definition: GridEditorDefinition<unknown>,
      draftOverride?: string,
    ): GridEditorContext<TData> => {
      const row = cell.row
      const columnId = cell.column.id
      const target: GridCellCoordinate = { rowId: row.id, columnId }
      const key = gridCellKey(row.id, columnId)
      const raw = displayCellText(row.id, cell)
      const meta = cell.column.columnDef.meta?.grid
      const currentDraft = draftOverride ?? draft

      const commitValue = (value: unknown) => {
        runCommit(target, value, raw)
      }

      const ctx: GridEditorContext<TData> = {
        rowId: row.id,
        columnId,
        row: row.original,
        text: raw,
        getValue: () => cell.getValue(),
        draft: currentDraft,
        setDraft: setEditorDraft,
        onDraftKeyDown: (event) => draftKeyDownRef.current(event),
        blurCommit: () => blurCommitRef.current(),
        commitDraft: (draftArgument?: string) => {
          const source = draftArgument ?? currentDraft
          let parsed: unknown

          try {
            parsed = definition.parse(source, ctx)
          } catch (cause) {
            // A rejected draft is a rejected write, exactly: the cell returns to
            // the value on screen, marks destructive, and the message lands in the
            // same status line. That reuse is the whole validation story — an
            // editor has no error slot of its own to keep in step.
            restoreFocusRef.current = key
            exitEditing()
            revertCommit(key, target, raw, source, cause)
            return
          }

          commitValue(parsed)
        },
        commitValue,
        close: cancelEditing,
        open: () => {
          const index = visibleRows.findIndex((candidate) => candidate.id === row.id)

          if (index !== -1) {
            openEditor(index, columnId)
          }
        },
        editing: editing?.rowId === row.id && editing.columnId === columnId,
        options: meta?.editorOptions ?? {},
        label: columnLabelById?.get(columnId) ?? columnId,
      }

      return ctx
    },
    [
      cancelEditing,
      columnLabelById,
      displayCellText,
      draft,
      editing,
      exitEditing,
      openEditor,
      revertCommit,
      runCommit,
      setEditorDraft,
      visibleRows,
    ],
  )

  /**
   * The one route from a cell to a write.
   *
   * A draft is parsed by the column's editor when it has one, so `Delete` and a
   * paste are validated exactly like typing is; a value that is already typed
   * goes straight through. Both end at `runCommit`, and a `parse` that throws
   * ends at `revertCommit` — the same two exits every write already had.
   */
  const commitCellInput = useCallback(
    (
      target: GridCellCoordinate,
      cell: Cell<TData, unknown>,
      input: { kind: "value"; value: unknown } | { kind: "draft"; draft: string },
    ) => {
      const definition = resolveGridEditor(cell.column.columnDef.meta?.grid?.editor)

      if (!definition || input.kind === "value") {
        runCommit(
          target,
          input.kind === "value" ? input.value : input.draft,
          displayCellText(target.rowId, cell),
        )
        return
      }

      buildEditorContext(cell, definition, input.draft).commitDraft(input.draft)
    },
    [buildEditorContext, displayCellText, runCommit],
  )

  const commitEditing = useCallback(() => {
    if (!editing) {
      return
    }

    // An `Escape` that got this far is a discard, not a save. The flag is
    // consumed here rather than in `cancelEditing` because a popover's close
    // event can arrive after the editor has already exited, and `editing` is
    // then null — so this is also where the *second* caller of the commit path
    // finds out that the draft was discarded.
    if (discardRequestedRef.current) {
      discardRequestedRef.current = false
      return
    }

    const target = editing
    const row = visibleRows.find((candidate) => candidate.id === target.rowId)
    const cell = row?.getVisibleCells().find((candidate) => candidate.column.id === target.columnId)

    if (!row || !cell) {
      exitEditing()
      return
    }

    commitCellInput(target, cell, { kind: "draft", draft })
  }, [commitCellInput, draft, editing, exitEditing, visibleRows])

  /**
   * The blur half of the commit path, for one cell.
   *
   * Runs through `commitEditing` and therefore through the single commit route,
   * so blur gets the optimistic display, the validation-before-save ordering and
   * the revert for free. It adds exactly two rules on top:
   *
   * - **untouched issues no request.** The draft was seeded from the cell's own
   *   value, so committing it would PATCH production data on every stray click.
   * - **focus is not restored.** `runCommit` hands focus back to the edited cell
   *   so `Enter` and `Escape` land where the operator was; on a blur they have
   *   *deliberately* moved somewhere else, so the same suppression the `Tab`
   *   branch applies is applied here.
   *
   * `skipUntouched` is what makes this safe to route every editor through: a
   * `select` that was opened and closed without a pick must not write.
   */
  const commitEditingOnBlur = useCallback(() => {
    if (!editing) {
      return
    }

    if (discardRequestedRef.current) {
      // Already exited by `cancelEditing`; the flag is cleared there.
      return
    }

    if (!touchedRef.current) {
      // Nothing to write, so this is a **cancel** rather than a commit, and it
      // gets the cancel's focus behaviour: the cell is where the operator was,
      // and Radix's own trigger-restore has nowhere to land because the trigger
      // unmounts with the editor. Deliberately *not* `cancelEditing` — that would
      // arm the discard flag, and the next commit has to be a real one.
      restoreFocusRef.current = gridCellKey(editing.rowId, editing.columnId)
      exitEditing()
      return
    }

    commitEditing()
    restoreFocusRef.current = null
  }, [commitEditing, editing, exitEditing])

  /**
   * The sole opener gesture, and the commit route when the cell is already open.
   *
   * Two jobs, one handler, because they are the same gesture seen twice: a
   * double-click on a closed cell opens it; a double-click on the open cell's own
   * editor commits and closes, which is what a second double-click means to an
   * operator who has just typed into it.
   *
   * **The checkbox case is deliberately inert.** A double-click is two clicks and
   * `CheckboxControl.onCheckedChange` fires on each, so the value nets unchanged
   * — and `openEditor` would toggle a *third* time. Hence the
   * `commitsOnInteraction` skip rather than a special case in the editor: the
   * rule is "a double-click never opens an editor whose control is the cell".
   */
  const onCellDoubleClick = useCallback(
    (rowId: string, columnId: string): void => {
      const index = visibleRows.findIndex((row) => row.id === rowId)

      if (index === -1) {
        return
      }

      const row = visibleRows[index]
      const cell = row
        ?.getVisibleCells()
        .find((candidate) => candidate.column.id === columnId)

      if (!row || !cell) {
        return
      }

      const definition = resolveGridEditor(cell.column.columnDef.meta?.grid?.editor)

      if (definition?.commitsOnInteraction === true) {
        return
      }

      if (editing?.rowId === rowId && editing.columnId === columnId) {
        commitEditingOnBlur()
        return
      }

      openEditor(index, columnId)
    },
    [commitEditingOnBlur, editing, openEditor, visibleRows],
  )

  /**
   * Clears a cell through the normal commit path. Skipped — silently — on the
   * select column and any column whose control owns its own activation:
   * clearing a selection checkbox is not a cell write, and neither is clearing
   * a checkbox cell, whose empty state is `false` rather than `""`.
   *
   * A column carrying an `editor` is **exempt** from the consumer-renderer
   * skip. `consumerRenderedCells` exists to protect a column that authors its
   * own cell node from the grid printing a competing value, but an editor column
   * authors its node inside the grid, so exempting it is what keeps the column
   * writable at all. `resolveConsumerRenderers` stays table-agnostic; the
   * compensation is applied here, where the write is decided.
   */
  const clearCell = useCallback(
    (rowIndex: number, columnId: string): boolean => {
      const row = visibleRows[rowIndex]
      const cell = row?.getVisibleCells().find((candidate) => candidate.column.id === columnId)
      const meta = cell?.column.columnDef.meta?.grid

      if (!row || !cell || meta?.editable !== true) {
        return false
      }

      if (
        meta.selectable === true ||
        meta.editor === CHECKBOX_EDITOR ||
        (meta.editor === undefined && consumerRenderedCells.has(columnId))
      ) {
        return false
      }

      commitCellInput({ rowId: row.id, columnId }, cell, { kind: "draft", draft: "" })
      return true
    },
    [commitCellInput, consumerRenderedCells, visibleRows],
  )

  /**
   * Toggles a checkbox cell. The only editor that commits on interaction;
   * everything else commits on `Enter`, an explicit pick or an explicit close.
   */
  const toggleCheckboxCell = useCallback(
    (rowIndex: number, columnId: string): boolean => {
      const row = visibleRows[rowIndex]
      const cell = row?.getVisibleCells().find((candidate) => candidate.column.id === columnId)

      if (!row || !cell || cell.column.columnDef.meta?.grid?.editor !== CHECKBOX_EDITOR) {
        return false
      }

      commitCellInput(
        { rowId: row.id, columnId },
        cell,
        { kind: "value", value: cell.getValue() !== true },
      )
      return true
    },
    [commitCellInput, visibleRows],
  )


  /**
   * Copies the live range — or the single focused cell when no range is
   * active — as tab-separated text, one line per row. A missing cell
   * contributes an empty field. The grid renders an empty value as nothing at
   * all, so there is no display affordance for a placeholder to leak from — but
   * the assertion that it stays empty lives here, at the serializer, and not only
   * at the cell.
   */
  const copySelection = useCallback((): boolean => {
    if (visibleRows.length === 0 || visibleColumnIds.length === 0 || clampedRowIndex < 0) {
      return false
    }

    const bounds =
      selectionBounds ??
      (() => {
        const columnIndex = focusedColumnId ? (columnIndexById.get(focusedColumnId) ?? -1) : -1

        if (columnIndex === -1) {
          return null
        }

        return {
          firstRow: clampedRowIndex,
          lastRow: clampedRowIndex,
          firstColumn: columnIndex,
          lastColumn: columnIndex,
        }
      })()

    if (!bounds) {
      return false
    }

    const lines: string[] = []

    for (let rowIndex = bounds.firstRow; rowIndex <= bounds.lastRow; rowIndex += 1) {
      const row = visibleRows[rowIndex]

      if (!row) {
        continue
      }

      const cells = row.getVisibleCells()
      const fields: string[] = []

      for (let columnIndex = bounds.firstColumn; columnIndex <= bounds.lastColumn; columnIndex += 1) {
        const columnId = visibleColumnIds[columnIndex]
        const cell = columnId
          ? cells.find((candidate) => candidate.column.id === columnId)
          : undefined

        if (!cell || !columnId) {
          fields.push("")
          continue
        }

        fields.push(overrides[gridCellKey(row.id, columnId)]?.value ?? rowCellText(cell))
      }

      lines.push(fields.join("\t"))
    }

    const text = lines.join("\n")

    if (typeof navigator === "undefined" || !navigator.clipboard) {
      onNotice?.("Copy is not available in this browser.")
      return false
    }

    void navigator.clipboard
      .writeText(text)
      .catch(() => onNotice?.("Copy failed: the browser refused clipboard access."))

    return true
  }, [
    clampedRowIndex,
    columnIndexById,
    focusedColumnId,
    onNotice,
    overrides,
    rowCellText,
    selectionBounds,
    visibleColumnIds,
    visibleRows,
  ])

  /**
   * Pastes tab-separated text starting at the focused cell, expanding down and
   * right. Every editable cell commits through the normal revertable path;
   * read-only and checkbox cells are skipped and the skip is reported in the
   * status channel rather than silently swallowed.
   */
  const pasteText = useCallback(
    (text: string): boolean => {
      if (visibleRows.length === 0 || visibleColumnIds.length === 0 || clampedRowIndex < 0) {
        return false
      }

      const startColumnIndex = focusedColumnId
        ? (columnIndexById.get(focusedColumnId) ?? -1)
        : -1

      if (startColumnIndex === -1) {
        return false
      }

      const rows = text.replace(/\r\n?/g, "\n").split("\n")

      // A trailing newline is a line terminator, not another row: without this
      // a spreadsheet's copy (which always ends one) pastes a phantom row.
      if (rows.length > 0 && rows[rows.length - 1] === "") {
        rows.pop()
      }

      let committed = 0
      let skipped = 0

      rows.forEach((line, rowOffset) => {
        const row = visibleRows[clampedRowIndex + rowOffset]

        if (!row) {
          return
        }

        const cells = row.getVisibleCells()

        line.split("\t").forEach((field, columnOffset) => {
          const columnId = visibleColumnIds[startColumnIndex + columnOffset]
          const cell = columnId
            ? cells.find((candidate) => candidate.column.id === columnId)
            : undefined
          const meta = cell?.column.columnDef.meta?.grid

          if (
            !cell ||
            !columnId ||
            meta?.editable !== true ||
            meta.selectable === true ||
            meta.editor === CHECKBOX_EDITOR ||
            (meta.editor === undefined && consumerRenderedCells.has(columnId))
          ) {
            skipped += 1
            return
          }

          commitCellInput({ rowId: row.id, columnId }, cell, { kind: "draft", draft: field })
          committed += 1
        })
      })

      if (committed === 0 && skipped === 0) {
        return false
      }

      if (skipped > 0) {
        onNotice?.(`Skipped ${skipped} read-only cell${skipped === 1 ? "" : "s"}; ${committed} pasted.`)
      }

      return true
    },
    [
      clampedRowIndex,
      columnIndexById,
      commitCellInput,
      consumerRenderedCells,
      focusedColumnId,
      onNotice,
      visibleColumnIds,
      visibleRows,
    ],
  )

  /**
   * The container's paste handler. The `paste` event carries the text without
   * a permission prompt and without a lost-user-activation failure, which is
   * why pasting reads the event rather than `navigator.clipboard` from a
   * keydown. While editing — or in any other guarded target — the event is
   * left alone so the draft input keeps its native paste.
   */
  const handleContainerPaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      if (editing || isGuardedTarget(event.target)) {
        return
      }

      const text = event.clipboardData?.getData("text")

      if (!text) {
        return
      }

      event.preventDefault()
      pasteText(text)
    },
    [editing, pasteText],
  )

  const handleDraftKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault()
        event.stopPropagation()
        commitEditing()
        return
      }

      if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        cancelEditing()
        return
      }

      // `Tab` out of the editor commits first and then moves, so a fast
      // operator tabbing across a row leaves committed values behind rather
      // than abandoned drafts. The move starts from the cell being edited,
      // which is still in state until the commit below clears it. The commit's
      // focus restoration is suppressed: it would hand focus back to the cell
      // just left, overriding the move.
      if (event.key === "Tab") {
        event.preventDefault()
        event.stopPropagation()

        if (!editing) {
          return
        }

        const editingRowIndex = visibleRows.findIndex((row) => row.id === editing.rowId)

        commitEditing()
        restoreFocusRef.current = null

        if (editingRowIndex !== -1) {
          moveTab(editingRowIndex, editing.columnId, event.shiftKey)
        }
      }
    },
    [cancelEditing, commitEditing, editing, moveTab, visibleRows],
  )

  // Synced after every render rather than assigned during one: updating a ref
  // during render is what `react-hooks/refs` forbids, and the editor context has
  // to hand this handler out before it is declared (see `draftKeyDownRef`). An
  // effect is safe here because no editor exists until the operator acts, which
  // is long after mount.
  useEffect(() => {
    draftKeyDownRef.current = handleDraftKeyDown
  })

  useEffect(() => {
    blurCommitRef.current = commitEditingOnBlur
  })

  const handleContainerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.defaultPrevented) {
        return
      }

      // Handled before the modifier bail-out: `Cmd/Ctrl+Home/End` must jump
      // while the grid owns focus rather than yielding to the browser, and
      // `Cmd/Ctrl+C` must copy the selection rather than the page. In a
      // guarded target the event is left alone so inputs keep native copy.
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !isGuardedTarget(event.target)) {
        if (event.key === "Home" && !editing) {
          event.preventDefault()
          moveToEdge(true, true)
          return
        }

        if (event.key === "End" && !editing) {
          event.preventDefault()
          moveToEdge(false, true)
          return
        }

        if (event.key === "c" || event.key === "C") {
          event.preventDefault()
          copySelection()
          return
        }
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      if (isGuardedTarget(event.target)) {
        return
      }

      const arrowStep = ARROW_STEPS[event.key]

      // Plain arrows move the focus and re-anchor the range; `Shift` extends
      // it instead. Both are claimed, so neither scrolls the page.
      if (arrowStep !== undefined) {
        event.preventDefault()
        stepFocus(arrowStep, event.shiftKey)
        return
      }

      if (event.key === "Tab") {
        event.preventDefault()
        const row = visibleRows[clampedRowIndex]
        const columnId = focusedColumnId ?? row?.getVisibleCells()[0]?.column.id

        if (columnId) {
          moveTab(clampedRowIndex, columnId, event.shiftKey)
        }

        return
      }

      if (event.key === "Home") {
        event.preventDefault()
        moveToEdge(true, false)
        return
      }

      if (event.key === "End") {
        event.preventDefault()
        moveToEdge(false, false)
        return
      }

      if (event.key === "j" && visibleRows.length > 0) {
        event.preventDefault()
        moveFocus(clampedRowIndex + 1)
        return
      }

      if (event.key === "k" && visibleRows.length > 0) {
        event.preventDefault()
        moveFocus(clampedRowIndex - 1)
        return
      }

      // CAP-10: `e` and `Enter`-when-not-editing are **not** openers. There is no
      // branch here for them, and that absence is the contract — a branch that
      // existed and did nothing would be a second thing to keep in step with the
      // opener. `Enter` while a draft is open still commits it, which is the one
      // of the three that survives.
      if (event.key === "Enter" && editing) {
        event.preventDefault()
        commitEditing()
        return
      }

      if (event.key === "Escape" && editing) {
        event.preventDefault()
        cancelEditing()
        return
      }

      // Not editing: Escape drops the range and puts the focus back on its
      // anchor. It stops here rather than falling through to the browser's own
      // "stop loading" behaviour, which on a sorted-and-filtered grid would
      // leave the operator unable to tell the two apart.
      if (event.key === "Escape" && hasRangeSelection) {
        event.preventDefault()
        collapseSelection()
        return
      }

      // `Space` is a toggle on a checkbox cell and nothing else. It no longer seeds an
      // editor anywhere (CAP-10 retired the seeding half), but the toggle is not
      // an opener and is not retired with it, and `preventDefault` stays on both
      // paths so the page never scrolls out from under the grid.
      if (event.key === " ") {
        event.preventDefault()

        if (focusedColumnId) {
          toggleCheckboxCell(clampedRowIndex, focusedColumnId)
        }

        return
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault()

        if (focusedColumnId) {
          clearCell(clampedRowIndex, focusedColumnId)
        }
      }
    },
    [
      cancelEditing,
      clearCell,
      clampedRowIndex,
      collapseSelection,
      commitEditing,
      copySelection,
      editing,
      focusedColumnId,
      hasRangeSelection,
      moveFocus,
      moveTab,
      moveToEdge,
      stepFocus,
      toggleCheckboxCell,
      visibleRows,
    ],
  )

  useEffect(() => {
    if (editing !== null) {
      return
    }

    const key = restoreFocusRef.current
    restoreFocusRef.current = null

    if (key) {
      focusCellElement(key)
    }
  }, [editing, focusCellElement])

  /**
   * Moves DOM focus unless something *outside* the grid deliberately took it.
   *
   * `focusCellIfGridHasFocus` is the stricter gate, and it is right for an arrow
   * press: there the grid is holding focus by construction, so the check only
   * rules out a stray programmatic call. It is the wrong gate for a row *swap*,
   * because the swap is exactly what destroyed the focus — the focused `<tr>` is
   * keyed by row id, so a promoted row unmounts it and `document.activeElement`
   * is `<body>` by the time this runs. Gating on "the grid still owns focus"
   * there means the guard is always false exactly when it is needed, and the
   * operator's next keystroke dies on `<body>`.
   *
   * So this reuses the condition `focusCellElement`'s own fallback already uses
   * for that situation: the grid, an element inside it, or `<body>` — the state a
   * focus-unmount leaves behind. A focus genuinely parked in a toolbar control is
   * still respected, so this never steals the caret from a search box.
   */
  const focusCellIfGridOwnsFocusOrLostIt = useCallback(
    (key: string) => {
      const container = containerRef.current

      if (!container) {
        return
      }

      const active = document.activeElement
      const gridOwnsFocus =
        active === container ||
        active === document.body ||
        (active instanceof HTMLElement && container.contains(active))

      if (gridOwnsFocus) {
        focusCellElement(key)
      }
    },
    [containerRef, focusCellElement],
  )

  /**
   * Keeps the focused coordinate pointing at a row when the row *underneath it*
   * is replaced.
   *
   * Reachable because a created record is promoted: the grid's focus is on the
   * draft row, the server answers with a row that has its own id, and the
   * consumer swaps it in — so the focused cell unmounts and DOM focus dies on
   * `<body>`, which would leave the grid unable to receive the next keystroke.
   *
   * Keyed on the row *id*, not the index: the coordinate is a visible-row index,
   * so after the swap it already names the right position and only the id it
   * points at has changed. The gate is `focusCellIfGridOwnsFocusOrLostIt` and
   * not `focusCellIfGridHasFocus` for the reason documented there — this is the
   * one move in the hook that has to re-acquire focus the swap destroyed, and
   * the strict gate can never see that state.
   */
  const focusedRowIdRef = useRef<string | null>(null)

  useEffect(() => {
    const currentId = visibleRows[clampedRowIndex]?.id ?? null
    const previousId = focusedRowIdRef.current
    focusedRowIdRef.current = currentId

    if (previousId === null || previousId === currentId || focusedColumnId === null) {
      return
    }

    focusCellIfGridOwnsFocusOrLostIt(gridCellKey(currentId as string, focusedColumnId))
  }, [clampedRowIndex, focusCellIfGridOwnsFocusOrLostIt, focusedColumnId, visibleRows])

  /**
   * Moves the whole focus model onto `rowId`: its first editable column, the
   * range anchor with it, the virtualizer scrolled to it and DOM focus landed.
   *
   * Every step is the one an arrow press takes (`stepFocus`), which is the point.
   * A new row therefore arrives focused the way an operator reaching it with the
   * keyboard would find it — not through a ref the primitive had to be handed,
   * and not under a second set of rules for "added" rows.
   *
   * Returns false when the row is not in the current row model, which is
   * reachable: a draft row with every field blank disappears under a text filter.
   * The caller reports that rather than dropping focus silently.
   */
  const focusRow = useCallback(
    (rowId: string): boolean => {
      const index = visibleRows.findIndex((row) => row.id === rowId)

      if (index === -1) {
        return false
      }

      const row = visibleRows[index]
      const columnId = firstEditableColumnId(row)

      if (!row || !columnId) {
        return false
      }

      // Each setter is guarded rather than called unconditionally. This function
      // is retried on every render until the row is rendered, so an unguarded
      // `setSelectionAnchor({ … })` would install a fresh object every pass and
      // the retry would drive the render loop that it is waiting on —
      // "Maximum update depth exceeded", with the grid blank rather than merely
      // slow. Equality is the right test because the values are primitives and
      // the anchor is only compared by value everywhere else.
      if (focusedRowIndex !== index) {
        setFocusedRowIndex(index)
      }

      if (focusedColumnId !== columnId) {
        setFocusedColumnId(columnId)
      }

      if (selectionAnchor?.rowIndex !== index || selectionAnchor.columnId !== columnId) {
        setSelectionAnchor({ rowIndex: index, columnId })
      }

      scrollToIndex(index)
      return true
    },
    [
      firstEditableColumnId,
      focusedColumnId,
      focusedRowIndex,
      scrollToIndex,
      selectionAnchor,
      visibleRows,
    ],
  )

  const focusRowCell = useCallback(
    (rowId: string): boolean => {
      const index = visibleRows.findIndex((row) => row.id === rowId)

      if (index === -1) {
        return false
      }

      const row = visibleRows[index]
      const columnId = focusedColumnId ?? firstEditableColumnId(row)

      if (!row || !columnId) {
        return false
      }

      const container = containerRef.current

      if (!container) {
        return false
      }

      // The rendered-window check, before anything moves. `focusCellElement`
      // would resolve a missing cell by parking focus on the container, which is
      // right for an arrow press — a human will press again — and wrong here,
      // because the caller reads the return value as "landed" and stops
      // retrying. So this asks the DOM directly and reports honestly.
      const cell = container.querySelector<HTMLElement>(
        `[data-grid-cell=${JSON.stringify(gridCellKey(row.id, columnId))}]`,
      )

      if (!cell) {
        return false
      }

      // Deliberately not `focusCellIfGridHasFocus`: the operator pressed a button
      // in the grid's chrome, so focus is on that button rather than inside the
      // grid, and "only move DOM focus when the grid already owns it" would
      // leave the new row unfocused. Add is an explicit request to go there.
      cell.focus()
      revealCell(index, columnId)
      return true
    },
    [containerRef, firstEditableColumnId, focusedColumnId, revealCell, visibleRows],
  )

  const focusCell = useCallback(
    (rowId: string, columnId: string, extend = false) => {
      const index = visibleRows.findIndex((row) => row.id === rowId)

      if (index === -1) {
        return
      }

      setFocusedColumnId(columnId)
      setFocusedRowIndex(index)

      // A Shift+click that reaches here with a live native selection would
      // keep painting full rows underneath the range rectangle (the browser
      // selects the text between the two clicks, which spans every
      // intermediate row). The range owns selection, so a stale native range
      // is dropped. Guarded for SSR; `preventDefault` in `grid-row.tsx` stops
      // new ones, this clears one a prior interaction already produced.
      if (extend && typeof window !== "undefined") {
        window.getSelection()?.removeAllRanges()
      }

      // A plain click re-anchors; `Shift`+click keeps the anchor and lets the
      // focus — which is the range's far corner — travel to the pointer. The
      // consumers that own their own activation (the select column, the favorite
      // control) stop the pointer event before it reaches here, so a `Shift`+click
      // on a checkbox extends a cell range instead of extending a row selection.
      if (!extend) {
        setSelectionAnchor({ rowIndex: index, columnId })
      }
    },
    [visibleRows],
  )

  const isRowFocused = useCallback(
    (row: Row<TData>) => clampedRowIndex >= 0 && visibleRows[clampedRowIndex]?.id === row.id,
    [clampedRowIndex, visibleRows],
  )

  const isRowEditing = useCallback(
    (row: Row<TData>) => editing?.rowId === row.id,
    [editing],
  )

  const getCellView = useCallback(
    (row: Row<TData>, cell: Cell<TData, unknown>): GridCellView<TData> => {
      const key = gridCellKey(row.id, cell.column.id)
      const override = overrides[key]
      const text = override?.value ?? rowCellText(cell)
      const meta = cell.column.columnDef.meta?.grid
      const isEditingCell = editing?.rowId === row.id && editing.columnId === cell.column.id
      const rowIndex = selectedRowIndexes?.get(row.id)
      const columnIndex = columnIndexById.get(cell.column.id)

      const definition = resolveGridEditor(meta?.editor)

      const isSelected =
        selectionBounds !== null &&
        rowIndex !== undefined &&
        columnIndex !== undefined &&
        rowIndex >= selectionBounds.firstRow &&
        rowIndex <= selectionBounds.lastRow &&
        columnIndex >= selectionBounds.firstColumn &&
        columnIndex <= selectionBounds.lastColumn

      const consumerCell = renderCellNode(cell, consumerRenderedCells)

      return {
        columnId: cell.column.id,
        text,
        render: consumerCell,
        align: meta?.align ?? "left",
        tabular: meta?.tabular === true,
        // Read here rather than in `grid-row.tsx` so the row only ever renders
        // what it is handed, exactly as `editor` below is built here.
        //
        // A column supplying its own `cell` widget is excluded: the widget has
        // already chosen this cell's appearance, and a data renderer over a
        // control would be restyling a button as if it were a value.
        fieldType: consumerCell ? undefined : meta?.fieldType,
        unresolvedText: meta?.unresolvedText,
        editable: meta?.editable === true,
        emphasis: meta?.emphasis === true,
        isFocused: isRowFocused(row) && focusedColumnId === cell.column.id,
        isSelected,
        editing: isEditingCell,
        draft: isEditingCell ? draft : "",
        // Built here rather than in `grid-row.tsx` because every closure in the
        // context terminates in `runCommit`; the row only renders what it is
        // handed.
        editor: definition
          ? {
              definition,
              context: buildEditorContext(cell, definition, isEditingCell ? draft : ""),
            }
          : undefined,
        error: override?.error,
        onDraftChange: setEditorDraft,
        onDraftKeyDown: (event) => draftKeyDownRef.current(event),
        onDraftBlur: () => blurCommitRef.current(),
      }
    },
    [
      buildEditorContext,
      columnIndexById,
      consumerRenderedCells,
      draft,
      editing,
      focusedColumnId,
      isRowFocused,
      overrides,
      rowCellText,
      selectedRowIndexes,
      selectionBounds,
      setEditorDraft,
    ],
  )

  return {
    focusedRowIndex: clampedRowIndex,
    focusCell,
    onCellDoubleClick,
    focusRow,
    focusRowCell,
    isRowFocused,
    isRowEditing,
    focusedRowDomId: clampedRowIndex >= 0 ? focusedRowDomId : undefined,
    getCellView,
    containerProps: {
      onKeyDown: handleContainerKeyDown,
      onPaste: handleContainerPaste,
      "aria-activedescendant": clampedRowIndex >= 0 ? focusedRowDomId : undefined,
    },
  }
}
