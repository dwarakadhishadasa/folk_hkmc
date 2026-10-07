"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import type { OnChangeFn, TableState } from "@tanstack/react-table"

import {
  applyGridParams,
  parseGridViewState,
  serializeGridViewState,
  type GridViewState,
} from "@/components/grid/grid-view-state"

export const GRID_FILTER_DEBOUNCE_MS = 250

export interface GridViewStateController {
  /** URL-derived table state. The URL is the only source of truth. */
  state: Partial<TableState>
  /** TanStack's controlled `onStateChange`, accepting both updater forms. */
  onStateChange: OnChangeFn<TableState>
  /** Clears `q`, every `f.<colId>` and `sort` from the URL. */
  clearFilters: () => void
  /**
   * Escape hatch for in-flight interaction. A column-resize drag holds its
   * width in component state and defers the URL write to pointer-up, so a drag
   * does not emit hundreds of router transitions and hundreds of history
   * entries. Committed state is always the URL: `commit` writes the final
   * value once, and `cancel` restores the URL-derived width.
   */
  beginTransientChange: () => void
  commitTransientChange: () => void
  cancelTransientChange: () => void
}

export interface UseGridViewStateOptions {
  /** Column ids in default display order. The URL codec validates against this. */
  columnIds: readonly string[]
}

const COLUMN_KEY_SEPARATOR = "\u0000"

function joinColumnKey(columnIds: readonly string[]): string {
  return columnIds.join(COLUMN_KEY_SEPARATOR)
}

function splitColumnKey(columnKey: string): string[] {
  return columnKey.length === 0 ? [] : columnKey.split(COLUMN_KEY_SEPARATOR)
}

/** Only the grid-owned slice of the table state survives a URL round trip. */
function pickGridState(state: Partial<TableState>): GridViewState {
  return {
    sorting: state.sorting ?? [],
    globalFilter: typeof state.globalFilter === "string" ? state.globalFilter : "",
    columnFilters: state.columnFilters ?? [],
    columnOrder: state.columnOrder ?? [],
    columnVisibility: state.columnVisibility ?? {},
    columnSizing: state.columnSizing ?? {},
  }
}

/** Identifies "the operator is typing" so only that path debounces. */
function sameExceptFilters(previous: GridViewState, next: GridViewState): boolean {
  return (
    previous.globalFilter === next.globalFilter &&
    JSON.stringify(previous.columnFilters) === JSON.stringify(next.columnFilters)
  )
}

export function useGridViewState({
  columnIds,
}: UseGridViewStateOptions): GridViewStateController {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // `columnIds` is usually a fresh array literal each render; the joined key is
  // a stable identity for it, so the parse only re-runs when the query or the
  // column set actually changes.
  const columnKey = joinColumnKey(columnIds)

  const state = useMemo<Partial<TableState>>(
    () => parseGridViewState(searchParams, splitColumnKey(columnKey)),
    [searchParams, columnKey],
  )

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const transientRef = useRef(false)
  const pendingRef = useRef<Partial<TableState> | null>(null)

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  const write = useCallback(
    (next: Partial<TableState>, mode: "push" | "replace") => {
      const query = applyGridParams(
        searchParams,
        serializeGridViewState(pickGridState(next), columnIds),
      ).toString()

      if (query === searchParams.toString()) {
        return
      }

      const url = query.length > 0 ? `${pathname}?${query}` : pathname

      if (mode === "push") {
        router.push(url, { scroll: false })
      } else {
        router.replace(url, { scroll: false })
      }
    },
    [columnIds, pathname, router, searchParams],
  )

  const scheduleFilterWrite = useCallback(
    (next: Partial<TableState>) => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current)
      }

      debounceRef.current = setTimeout(() => {
        debounceRef.current = null
        write(next, "replace")
      }, GRID_FILTER_DEBOUNCE_MS)
    },
    [write],
  )

  const onStateChange = useCallback<OnChangeFn<TableState>>(
    (updater) => {
      const next =
        typeof updater === "function"
          ? (updater as (previous: Partial<TableState>) => Partial<TableState>)(state)
          : updater

      if (transientRef.current) {
        pendingRef.current = next
        return
      }

      const previous = pickGridState(state)
      const resolved = pickGridState(next)

      if (sameExceptFilters(previous, resolved)) {
        write(next, "push")
      } else {
        scheduleFilterWrite(next)
      }
    },
    [scheduleFilterWrite, state, write],
  )

  const clearFilters = useCallback(() => {
    // Clears `q`, every `f.<colId>` and `sort`, and deliberately keeps the
    // arrangement (`cols`, `hide`, `size.*`): an operator who filtered their way
    // down to one view and cleared the filter text did not ask to lose it.
    const query = applyGridParams(
      searchParams,
      serializeGridViewState(
        {
          ...pickGridState(state),
          sorting: [],
          globalFilter: "",
          columnFilters: [],
        },
        columnIds,
      ),
    ).toString()

    const url = query.length > 0 ? `${pathname}?${query}` : pathname
    router.push(url, { scroll: false })
  }, [columnIds, pathname, router, searchParams, state])

  const beginTransientChange = useCallback(() => {
    transientRef.current = true
    pendingRef.current = null
  }, [])

  const commitTransientChange = useCallback(() => {
    transientRef.current = false
    const pending = pendingRef.current
    pendingRef.current = null

    if (pending) {
      write(pending, "push")
    }
  }, [write])

  const cancelTransientChange = useCallback(() => {
    transientRef.current = false
    pendingRef.current = null
  }, [])

  return {
    state,
    onStateChange,
    clearFilters,
    beginTransientChange,
    commitTransientChange,
    cancelTransientChange,
  }
}

/**
 * Holds the in-flight text of a URL-backed filter input.
 *
 * The committed filter lives in the URL behind a debounced write, so an input
 * bound straight to it drops every character typed inside the debounce window —
 * and once a write does land it overwrites the draft with a value the operator
 * has already typed past. The draft is therefore authoritative while the field
 * has focus, and reconciled from the URL as soon as focus leaves. That single
 * rule has no ambiguous case: it can never lose a keystroke, and Back, Forward,
 * a shared link and Clear filters all land because they all blur or empty the
 * field.
 */
export function useUrlBackedDraft(
  value: string,
  onCommit: (value: string) => void,
  focused: boolean,
): [string, (next: string) => void] {
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    if (!focused) {
      setDraft(value)
    }
  }, [focused, value])

  return [
    draft,
    (next: string) => {
      setDraft(next)
      onCommit(next)
    },
  ]
}
