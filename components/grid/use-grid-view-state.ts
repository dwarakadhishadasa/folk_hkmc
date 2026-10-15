"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import type { OnChangeFn, TableState } from "@tanstack/react-table"

import {
  applyGridParams,
  parseGridViewState,
  serializeGridViewState,
  type GridColumnFieldTypes,
  type GridFilterConnective,
  type GridViewState,
} from "@/components/grid/grid-view-state"

export const GRID_FILTER_DEBOUNCE_MS = 250

export interface GridViewStateController {
  /** URL-derived table state. The URL is the only source of truth. */
  state: Partial<TableState>
  /** Governs the whole condition list — one connective, never per condition. */
  filterConnective: GridFilterConnective
  /** TanStack's controlled `onStateChange`, accepting both updater forms. */
  onStateChange: OnChangeFn<TableState>
  /** Writes a connective without disturbing the conditions it governs. */
  setFilterConnective: (connective: GridFilterConnective) => void
  /** Clears `q`, every `f.<colId>`, every `fa.<colId>` and `sort`. */
  clearFilters: () => void
  /**
   * Escape hatch for in-flight interaction. A column-resize drag holds its
   * width in component state and defers the URL write to pointer-up, and a
   * column-reorder drag buffers its drop the same way, so a drag does not
   * emit hundreds of router transitions and hundreds of history entries.
   * Committed state is always the URL: `commit` writes the final value once,
   * and `cancel` restores the URL-derived width.
   */
  beginTransientChange: () => void
  commitTransientChange: () => void
  cancelTransientChange: () => void
}

export interface UseGridViewStateOptions {
  /** Column ids in default display order. The URL codec validates against this. */
  columnIds: readonly string[]
  /**
   * Column ids to their `meta.grid.fieldType`. The codec needs it to read a bare,
   * operator-less token: `contains` for text and `gte` for a number are different
   * readings of the same legacy link.
   */
  fieldTypes?: GridColumnFieldTypes
  /**
   * Column ids hidden when the URL carries no `hide` key at all.
   *
   * A per-consumer product decision, deliberately not a constant here: the
   * primitive has no opinion about which of a table's fields matter, and a
   * default baked into the codec would apply to `/dev/grid-preview` too. The
   * list is compared and parsed as a SET, so order carries no meaning.
   */
  defaultHiddenColumnIds?: readonly string[]
}

const COLUMN_KEY_SEPARATOR = "\u0000"

function joinColumnKey(columnIds: readonly string[]): string {
  return columnIds.join(COLUMN_KEY_SEPARATOR)
}

function splitColumnKey(columnKey: string): string[] {
  return columnKey.length === 0 ? [] : columnKey.split(COLUMN_KEY_SEPARATOR)
}

/** Only the grid-owned slice of the table state survives a URL round trip. */
function pickGridState(state: Partial<TableState>, connective: GridFilterConnective): GridViewState {
  return {
    sorting: state.sorting ?? [],
    globalFilter: typeof state.globalFilter === "string" ? state.globalFilter : "",
    columnFilters: state.columnFilters ?? [],
    filterConnective: connective,
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
  fieldTypes,
  defaultHiddenColumnIds,
}: UseGridViewStateOptions): GridViewStateController {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // `columnIds` is usually a fresh array literal each render; the joined key is
  // a stable identity for it, so the parse only re-runs when the query or the
  // column set actually changes.
  const columnKey = joinColumnKey(columnIds)

  // Same reason, same fix: a consumer passing `defaultHiddenColumnIds: [...]`
  // inline must not invalidate the parse on every render, and `columnKey` is
  // what both the parse and the write below are keyed on.
  const hiddenDefaultKey = joinColumnKey(defaultHiddenColumnIds ?? [])

  const parsed = useMemo(
    () =>
      parseGridViewState(
        searchParams,
        splitColumnKey(columnKey),
        fieldTypes,
        splitColumnKey(hiddenDefaultKey),
      ),
    // `columnKey` rather than `columnIds`: consumers pass a fresh array literal
    // each render, and re-parsing the query on every render would make the parse
    // outrun the debounced write that is meant to feed it.
    [searchParams, columnKey, hiddenDefaultKey, fieldTypes],
  )

  // The connective is not table state — TanStack has no such field — so it is
  // read here and threaded into every write explicitly rather than smuggled
  // through the state object the table also receives.
  const { filterConnective, ...tableState } = parsed
  const state: Partial<TableState> = tableState

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const transientRef = useRef(false)
  const pendingRef = useRef<Partial<TableState> | null>(null)
  /**
   * The connective a debounced filter write must carry when it fires.
   *
   * Read at fire time, not at schedule time: a connective switch inside the
   * 250 ms window moves every condition to the `fa.` family, and a write
   * carrying the old one would flip the URL — and the grid — back to `and`.
   * `setFilterConnective` owns it; the effect below follows external changes
   * (Back, Forward, a shared link) so a keystroke after one carries what the
   * URL actually shows.
   */
  const connectiveRef = useRef<GridFilterConnective>(filterConnective)
  /** The filter edit a pending debounce holds, for the connective switch to fold in. */
  const pendingFilterRef = useRef<Partial<TableState> | null>(null)

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  const write = useCallback(
    (next: Partial<TableState>, mode: "push" | "replace", connective: GridFilterConnective) => {
      const query = applyGridParams(
        searchParams,
        serializeGridViewState(
          pickGridState(next, connective),
          columnIds,
          splitColumnKey(hiddenDefaultKey),
        ),
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
    [columnIds, hiddenDefaultKey, pathname, router, searchParams],
  )

  const scheduleFilterWrite = useCallback(
    (next: Partial<TableState>) => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current)
      }

      pendingFilterRef.current = next

      debounceRef.current = setTimeout(() => {
        debounceRef.current = null
        const pending = pendingFilterRef.current
        pendingFilterRef.current = null
        write(pending ?? next, "replace", connectiveRef.current)
      }, GRID_FILTER_DEBOUNCE_MS)
    },
    [write],
  )

  // External connective changes — Back, Forward, a shared link — move the ref
  // the debounced write reads, so a keystroke after one carries the connective
  // the URL actually shows rather than a superseded pick.
  useEffect(() => {
    connectiveRef.current = filterConnective
  }, [filterConnective])

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

      const previous = pickGridState(state, filterConnective)
      const resolved = pickGridState(next, filterConnective)

      if (sameExceptFilters(previous, resolved)) {
        write(next, "push", filterConnective)
      } else {
        scheduleFilterWrite(next)
      }
    },
    [filterConnective, scheduleFilterWrite, state, write],
  )

  const setFilterConnective = useCallback(
    (next: GridFilterConnective) => {
      // A `push`, not a debounced `replace`: switching the connective is a
      // discrete act that moves every condition between the `f.` and `fa.` key
      // families at once, so it belongs in history rather than in a typing-style
      // debounce window.
      connectiveRef.current = next

      // A debounced filter edit still in flight was built against the old
      // connective and the pre-keystroke list. It is folded into this push —
      // the just-typed value travels with the switch — instead of firing
      // later and flipping the URL back to the family it came from.
      let base = state

      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null

        if (pendingFilterRef.current !== null) {
          base = pendingFilterRef.current
          pendingFilterRef.current = null
        }
      }

      write(base, "push", next)
    },
    [state, write],
  )

  const clearFilters = useCallback(() => {
    // Clears `q`, every `f.<colId>`, every `fa.<colId>` and `sort`, and
    // deliberately keeps the arrangement (`cols`, `hide`, `size.*`): an operator
    // who filtered their way down to one view and cleared the filter text did not
    // ask to lose it. Back to match-all for the same reason — the connective
    // governs a list that no longer exists.
    //
    // A debounced filter edit still in flight is dropped with it: letting it
    // fire afterwards would resurrect the conditions just cleared.
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }

    pendingFilterRef.current = null
    const query = applyGridParams(
      searchParams,
      serializeGridViewState(
        {
          ...pickGridState(state, "all"),
          sorting: [],
          globalFilter: "",
          columnFilters: [],
        },
        columnIds,
        splitColumnKey(hiddenDefaultKey),
      ),
    ).toString()

    const url = query.length > 0 ? `${pathname}?${query}` : pathname
    router.push(url, { scroll: false })
  }, [columnIds, hiddenDefaultKey, pathname, router, searchParams, state])

  const beginTransientChange = useCallback(() => {
    transientRef.current = true
    pendingRef.current = null
  }, [])

  const commitTransientChange = useCallback(() => {
    transientRef.current = false
    const pending = pendingRef.current
    pendingRef.current = null

    if (pending) {
      write(pending, "push", filterConnective)
    }
  }, [filterConnective, write])

  const cancelTransientChange = useCallback(() => {
    transientRef.current = false
    pendingRef.current = null
  }, [])

  return {
    state,
    filterConnective,
    onStateChange,
    setFilterConnective,
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
