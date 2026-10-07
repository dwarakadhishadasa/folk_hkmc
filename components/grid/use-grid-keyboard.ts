"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"
import type { KeyboardEvent } from "react"
import type { Cell, Row, Table } from "@tanstack/react-table"

import type {
  GridCellCommitHandler,
  GridCellCoordinate,
  GridCellView,
  GridEditErrorHandler,
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
}

export interface GridKeyboardApi<TData> {
  focusedRowIndex: number
  /** Message for the `aria-live` status region; null when there is nothing to say. */
  statusMessage: string | null
  /** Marks a column as focused after a pointer interaction on that cell. */
  focusCell: (rowId: string, columnId: string) => void
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
}: UseGridKeyboardOptions<TData>): GridKeyboardApi<TData> {
  const domId = useId()
  const focusedRowDomId = `${domId}-focused-row`

  const [focusedRowIndex, setFocusedRowIndex] = useState(0)
  const [focusedColumnId, setFocusedColumnId] = useState<string | null>(null)
  const [editing, setEditing] = useState<GridCellCoordinate | null>(null)
  const [draft, setDraft] = useState("")
  const [overrides, setOverrides] = useState<Record<string, CellOverride>>({})
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const restoreFocusRef = useRef<string | null>(null)

  const visibleRows = table.getRowModel().rows
  const clampedRowIndex =
    visibleRows.length === 0 ? -1 : Math.min(Math.max(focusedRowIndex, 0), visibleRows.length - 1)

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
        focusCellIfGridHasFocus(gridCellKey(row.id, columnId))
      }
    },
    [focusCellIfGridHasFocus, focusedColumnId, scrollToIndex, visibleRows],
  )

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
      }
    },
    [beginEditing, cancelEditing, clampedRowIndex, commitEditing, editing, moveFocus, visibleRows.length],
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
    (rowId: string, columnId: string) => {
      setFocusedColumnId(columnId)
      setFocusedRowIndex((current) => {
        const index = visibleRows.findIndex((row) => row.id === rowId)
        return index === -1 ? current : index
      })
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

      return {
        columnId: cell.column.id,
        text: text.length > 0 ? text : GRID_EMPTY_TEXT,
        align: meta?.align ?? "left",
        tabular: meta?.tabular === true,
        isFocused: isRowFocused(row) && focusedColumnId === cell.column.id,
        editing: isEditingCell,
        draft: isEditingCell ? draft : "",
        error: override?.error,
        onDraftChange: setDraft,
        onDraftKeyDown: handleDraftKeyDown,
      }
    },
    [draft, editing, focusedColumnId, handleDraftKeyDown, isRowFocused, overrides, rowCellText],
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
