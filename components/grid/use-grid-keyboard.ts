"use client"

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import type { KeyboardEvent, ReactNode } from "react"
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

/** Displayed in place of an empty value, matching the existing table convention. */
export const GRID_EMPTY_TEXT = "\u2014"

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
 * `cell.text` — which carries the optimistic override, the `GRID_EMPTY_TEXT`
 * placeholder and the `title` tooltip — became dead, and an in-flight edit kept
 * showing the prior value until the write resolved.
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
}

export interface GridKeyboardApi<TData> {
  focusedRowIndex: number
  /** Message for the `aria-live` status region; null when there is nothing to say. */
  statusMessage: string | null
  /**
   * Marks a column as focused after a pointer interaction on that cell.
   *
   * `extend` is the `Shift` modifier on that same pointer interaction. A plain
   * click re-anchors the range on the clicked cell; a `Shift`+click moves the
   * focus to it and leaves the anchor alone, so the rectangle grows towards the
   * pointer — which is what the modifier means everywhere else on screen.
   */
  focusCell: (rowId: string, columnId: string, extend?: boolean) => void
  isRowFocused: (row: Row<TData>) => boolean
  isRowEditing: (row: Row<TData>) => boolean
  /** DOM id of the focused row, referenced by the container's activedescendant. */
  focusedRowDomId: string | undefined
  getCellView: (row: Row<TData>, cell: Cell<TData, unknown>) => GridCellView
  containerProps: {
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
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
}: UseGridKeyboardOptions<TData>): GridKeyboardApi<TData> {
  const domId = useId()
  const focusedRowDomId = `${domId}-focused-row`

  const [focusedRowIndex, setFocusedRowIndex] = useState(0)
  const [focusedColumnId, setFocusedColumnId] = useState<string | null>(null)
  const [editing, setEditing] = useState<GridCellCoordinate | null>(null)
  const [draft, setDraft] = useState("")
  const [overrides, setOverrides] = useState<Record<string, CellOverride>>({})
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
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

      container
        .querySelector<HTMLElement>(`[data-grid-cell=${JSON.stringify(key)}]`)
        ?.focus()
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
      }
    },
    [focusCellIfGridHasFocus, focusedColumnId, scrollToIndex, visibleRows],
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
      }
    },
    [
      clampedRowIndex,
      columnIndexById,
      focusCellIfGridHasFocus,
      focusedColumnId,
      scrollToIndex,
      selectionAnchor,
      visibleColumnIds,
      visibleRows,
    ],
  )

  /** Puts the focus back on the anchor and collapses the range onto it. */
  const collapseSelection = useCallback(() => {
    if (selectionAnchor === null) {
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
    }
  }, [focusCellIfGridHasFocus, scrollToIndex, selectionAnchor, visibleRows])

  const exitEditing = useCallback(() => {
    setEditing(null)
    setDraft("")
  }, [])

  const beginEditing = useCallback(() => {
    const row = visibleRows[clampedRowIndex]

    if (!row) {
      return
    }

    const cells = row.getVisibleCells()
    // With no column focused, `e` starts the first editable cell so the key is
    // useful from a cold grid. With a column focused, that column decides: `e`
    // on a non-editable cell is a no-op, not a jump to a different cell.
    const target = focusedColumnId
      ? cells.find(
          (cell) =>
            cell.column.id === focusedColumnId && cell.column.columnDef.meta?.grid?.editable === true,
        )
      : cells.find((cell) => cell.column.columnDef.meta?.grid?.editable === true)

    if (!target) {
      return
    }

    setFocusedColumnId(target.column.id)
    setEditing({ rowId: row.id, columnId: target.column.id })
    setDraft(displayCellText(row.id, target))
  }, [clampedRowIndex, displayCellText, focusedColumnId, visibleRows])

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
      setStatusMessage(message)

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

  const commitEditing = useCallback(() => {
    if (!editing) {
      return
    }

    const target = editing
    const key = gridCellKey(target.rowId, target.columnId)
    const row = visibleRows.find((candidate) => candidate.id === target.rowId)
    const cell = row?.getVisibleCells().find((candidate) => candidate.column.id === target.columnId)

    if (!row || !cell) {
      exitEditing()
      return
    }

    const previousText = displayCellText(target.rowId, cell)
    const attemptedText = draft

    // Enter, like Escape, hands focus back to the cell it was editing.
    restoreFocusRef.current = key
    exitEditing()

    if (!onCellCommit) {
      revertCommit(key, target, previousText, attemptedText, new Error(MISSING_COMMIT_HANDLER))
      return
    }

    setOverrides((previous) => ({ ...previous, [key]: { value: attemptedText } }))
    setStatusMessage(null)

    let pending: void | Promise<void>

    try {
      pending = onCellCommit({
        rowId: target.rowId,
        columnId: target.columnId,
        row: row.original,
        previousValue: cell.getValue(),
        value: attemptedText,
      })
    } catch (cause) {
      revertCommit(key, target, previousText, attemptedText, cause)
      return
    }

    if (pending && typeof (pending as Promise<void>).then === "function") {
      const rejected = (pending as Promise<void>).catch((cause: unknown) => {
        revertCommit(key, target, previousText, attemptedText, cause)
      })

      void rejected
    }
  }, [displayCellText, draft, editing, exitEditing, onCellCommit, revertCommit, visibleRows])

  const cancelEditing = useCallback(() => {
    if (!editing) {
      return
    }

    restoreFocusRef.current = gridCellKey(editing.rowId, editing.columnId)
    exitEditing()
  }, [editing, exitEditing])

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
      }
    },
    [cancelEditing, commitEditing],
  )

  const handleContainerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.defaultPrevented) {
        return
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      if (isGuardedTarget(event.target)) {
        return
      }

      const arrowStep = ARROW_STEPS[event.key]

      // `Shift` is the range modifier and plain arrows are not handled here: a
      // plain arrow is CAP-1's move, and taking it here would duplicate that
      // story's key table. Only the `Shift` form is claimed, so an unhandled
      // plain arrow still scrolls the page rather than being silently eaten.
      if (arrowStep !== undefined && event.shiftKey) {
        event.preventDefault()
        stepFocus(arrowStep, true)
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

      if (event.key === "e") {
        // `preventDefault` is load-bearing, not tidy: the editor mounts and takes
        // focus during this same keydown, and without it the browser's default
        // text insertion then lands in the freshly focused input, so the key that
        // opened the editor also types a stray "e" into it.
        event.preventDefault()
        beginEditing()
        return
      }

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
      }
    },
    [
      beginEditing,
      cancelEditing,
      clampedRowIndex,
      collapseSelection,
      commitEditing,
      editing,
      hasRangeSelection,
      moveFocus,
      stepFocus,
      visibleRows.length,
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

  const focusCell = useCallback(
    (rowId: string, columnId: string, extend = false) => {
      const index = visibleRows.findIndex((row) => row.id === rowId)

      if (index === -1) {
        return
      }

      setFocusedColumnId(columnId)
      setFocusedRowIndex(index)

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
    (row: Row<TData>, cell: Cell<TData, unknown>): GridCellView => {
      const key = gridCellKey(row.id, cell.column.id)
      const override = overrides[key]
      const text = override?.value ?? rowCellText(cell)
      const meta = cell.column.columnDef.meta?.grid
      const isEditingCell = editing?.rowId === row.id && editing.columnId === cell.column.id
      const rowIndex = selectedRowIndexes?.get(row.id)
      const columnIndex = columnIndexById.get(cell.column.id)

      const isSelected =
        selectionBounds !== null &&
        rowIndex !== undefined &&
        columnIndex !== undefined &&
        rowIndex >= selectionBounds.firstRow &&
        rowIndex <= selectionBounds.lastRow &&
        columnIndex >= selectionBounds.firstColumn &&
        columnIndex <= selectionBounds.lastColumn

      return {
        columnId: cell.column.id,
        text: text.length > 0 ? text : GRID_EMPTY_TEXT,
        render: renderCellNode(cell, consumerRenderedCells),
        align: meta?.align ?? "left",
        tabular: meta?.tabular === true,
        isFocused: isRowFocused(row) && focusedColumnId === cell.column.id,
        isSelected,
        editing: isEditingCell,
        draft: isEditingCell ? draft : "",
        error: override?.error,
        onDraftChange: setDraft,
        onDraftKeyDown: handleDraftKeyDown,
      }
    },
    [
      columnIndexById,
      consumerRenderedCells,
      draft,
      editing,
      focusedColumnId,
      handleDraftKeyDown,
      isRowFocused,
      overrides,
      rowCellText,
      selectedRowIndexes,
      selectionBounds,
    ],
  )

  return {
    focusedRowIndex: clampedRowIndex,
    statusMessage,
    focusCell,
    isRowFocused,
    isRowEditing,
    focusedRowDomId: clampedRowIndex >= 0 ? focusedRowDomId : undefined,
    getCellView,
    containerProps: {
      onKeyDown: handleContainerKeyDown,
      "aria-activedescendant": clampedRowIndex >= 0 ? focusedRowDomId : undefined,
    },
  }
}
