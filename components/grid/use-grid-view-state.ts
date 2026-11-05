"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import type { ColumnFiltersState, OnChangeFn, TableState } from "@tanstack/react-table"

import {
  applyGridParams,
  parseGridViewState,
  serializeGridViewState,
  type GridColumnFieldTypes,
  type GridFilterConnective,
  type GridViewState,
} from "@/components/grid/grid-view-state"
import {
  createFilterGroup,
  filterGroupFromConditions,
  flattenConditions,
  type GridFilterGroup,
} from "@/components/grid/grid-filter-tree"
import type { GridFilterCondition } from "@/components/grid/grid-filter-operators"

export const GRID_FILTER_DEBOUNCE_MS = 250

export interface GridViewStateController {
  /** URL-derived table state. The URL is the only source of truth. */
  state: Partial<TableState>
  /**
   * The root connective, kept for callers that only need the flat list.
   * `filterTree.connective` is the authoritative value.
   */
  filterConnective: GridFilterConnective
  /** The complete filter, groups included. */
  filterTree: GridFilterGroup
  /** TanStack's controlled `onStateChange`, accepting both updater forms. */
  onStateChange: OnChangeFn<TableState>
  /**
   * Writes the complete filter tree. `immediate` pushes a discrete structural
   * change (add/delete/connective); without it the write is debounced like a
   * keystroke, so typing does not emit a router transition per character.
   */
  onFilterTreeChange: (next: GridFilterGroup, immediate?: boolean) => void
  /**
   * Root-connective compatibility wrapper over `onFilterTreeChange`. Kept for
   * callers that predate groups; a nested group's own connective goes through
   * `onFilterTreeChange` with the updated tree.
   */
  setFilterConnective: (connective: GridFilterConnective) => void
  /** Clears `q`, every `f.<colId>`, every `fa.<colId>`, `fg` and `sort`. */
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
  /**
   * Keys that belong to the surface, not to the grid, and must survive every
   * grid write.
   *
   * `applyGridParams` already preserves non-grid keys, but it preserves the ones
   * in the `searchParams` snapshot — and a navigation started a moment ago (a
   * saved view being opened) may not have reached that snapshot yet. Carrying the
   * value here means a sort or filter applied in that window cannot drop it.
   */
  stickyParams?: Readonly<Record<string, string | null>>
}

const COLUMN_KEY_SEPARATOR = "\u0000"

function joinColumnKey(columnIds: readonly string[]): string {
  return columnIds.join(COLUMN_KEY_SEPARATOR)
}

function splitColumnKey(columnKey: string): string[] {
  return columnKey.length === 0 ? [] : columnKey.split(COLUMN_KEY_SEPARATOR)
}

/** Only the grid-owned slice of the table state survives a URL round trip. */
function pickGridState(
  state: Partial<TableState>,
  filterTree: GridFilterGroup,
): GridViewState {
  const conditions = flattenConditions(filterTree)

  return {
    sorting: state.sorting ?? [],
    globalFilter: typeof state.globalFilter === "string" ? state.globalFilter : "",
    // The flat projection is derived from the tree, never adopted from the
    // table. In manual-evaluation mode the table is handed `[]` on purpose, and
    // reading that back would erase every condition on the next sort or hide.
    columnFilters: conditions.map((condition) => ({
      id: condition.columnId,
      value: condition,
    })),
    filterConnective: filterTree.connective,
    filterTree,
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

/** The flat conditions a legacy caller may still write through `columnFilters`. */
function conditionsFromColumnFilters(filters: ColumnFiltersState): GridFilterCondition[] {
  return filters.flatMap((entry) => {
    const value = entry.value as GridFilterCondition

    return value && typeof value.operator === "string"
      ? [{ ...value, columnId: entry.id }]
      : []
  })
}

/** The flat list's identity, so a legacy write is not mistaken for a no-op. */
function conditionsSignature(conditions: readonly GridFilterCondition[]): string {
  return JSON.stringify(
    conditions.map((condition) => [condition.columnId, condition.operator, condition.value]),
  )
}

export function useGridViewState({
  columnIds,
  fieldTypes,
  defaultHiddenColumnIds,
  stickyParams,
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

  // The filter tree is not table state — TanStack has no such field — so it is
  // read here and threaded into every write explicitly rather than smuggled
  // through the state object the table also receives.
  const { filterConnective, filterTree, ...tableState } = parsed
  const state: Partial<TableState> = tableState

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const transientRef = useRef(false)
  const pendingRef = useRef<Partial<TableState> | null>(null)
  /**
   * The tree a debounced filter write must carry when it fires.
   *
   * Read at fire time, not at schedule time: a field change inside the 250 ms
   * window can move the condition between columns, and a write carrying the old
   * tree would undo it. `onFilterTreeChange` owns the ref; the effect below
   * follows external changes (Back, Forward, a shared link) so a later
   * keystroke carries what the URL actually shows.
   */
  const filterTreeRef = useRef<GridFilterGroup>(filterTree)
  /** The filter edit a pending debounce holds, for a structural write to fold in. */
  const pendingFilterRef = useRef<{
    state: Partial<TableState>
    filterTree: GridFilterGroup
  } | null>(null)

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  const write = useCallback(
    (next: Partial<TableState>, mode: "push" | "replace", tree: GridFilterGroup) => {
      const params = applyGridParams(
        searchParams,
        serializeGridViewState(
          pickGridState(next, tree),
          columnIds,
          splitColumnKey(hiddenDefaultKey),
        ),
      )

      for (const [key, value] of Object.entries(stickyParams ?? {})) {
        if (value === null) {
          params.delete(key)
        } else {
          params.set(key, value)
        }
      }

      const query = params.toString()

      // Compared against the snapshot this write was computed from: a push to
      // the same query is a no-op, and comparing with the address bar instead
      // would re-push on every render until the router caught up.
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
    [columnIds, hiddenDefaultKey, pathname, router, searchParams, stickyParams],
  )

  const scheduleFilterWrite = useCallback(
    (next: Partial<TableState>, tree: GridFilterGroup) => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current)
      }

      pendingFilterRef.current = { state: next, filterTree: tree }

      debounceRef.current = setTimeout(() => {
        debounceRef.current = null
        const pending = pendingFilterRef.current
        pendingFilterRef.current = null
        write(
          pending?.state ?? next,
          "replace",
          pending?.filterTree ?? tree,
        )
      }, GRID_FILTER_DEBOUNCE_MS)
    },
    [write],
  )

  // External tree changes — Back, Forward, a shared link — move the ref the
  // debounced write reads, so a keystroke after one carries the tree the URL
  // actually shows rather than a superseded edit.
  useEffect(() => {
    filterTreeRef.current = filterTree
  }, [filterTree])

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

      const tree = filterTreeRef.current
      // A caller that still writes the flat `columnFilters` list (the path
      // before `filterTree`) is adopted here. In manual-evaluation mode the
      // table was handed `[]`, so an empty incoming list is not a clear; only a
      // non-empty list that differs from the tree is a legacy filter edit.
      let effectiveTree = tree
      const incoming = next.columnFilters

      if (incoming && incoming.length > 0) {
        const incomingConditions = conditionsFromColumnFilters(incoming)
        const committedConditions = conditionsFromColumnFilters(state.columnFilters ?? [])

        // Differing from the URL-derived list means the caller intentionally
        // wrote a new flat list. A sort/hide refresh carries the committed list
        // unchanged, so it must not overwrite a tree edit that is still in its
        // debounce window.
        if (
          conditionsSignature(incomingConditions) !== conditionsSignature(committedConditions) &&
          conditionsSignature(incomingConditions) !==
            conditionsSignature(flattenConditions(effectiveTree))
        ) {
          effectiveTree = filterGroupFromConditions(incomingConditions, effectiveTree.connective)
          filterTreeRef.current = effectiveTree
        }
      }

      const previous = pickGridState(state, effectiveTree)
      const resolved = pickGridState(next, effectiveTree)

      if (sameExceptFilters(previous, resolved)) {
        write(next, "push", effectiveTree)
      } else {
        scheduleFilterWrite(next, effectiveTree)
      }
    },
    [scheduleFilterWrite, state, write],
  )

  const onFilterTreeChange = useCallback(
    (next: GridFilterGroup, immediate = false) => {
      filterTreeRef.current = next

      if (immediate) {
        // A `push`, not a debounced `replace`: adding a group or switching a
        // connective is a discrete act that changes the meaning of the whole
        // filter at once, so it belongs in history rather than in a typing-style
        // debounce window.
        let base = state

        if (debounceRef.current !== null) {
          clearTimeout(debounceRef.current)
          debounceRef.current = null

          if (pendingFilterRef.current !== null) {
            // A just-typed value travels with the structural change instead of
            // firing later and restoring the tree it was typed into.
            base = pendingFilterRef.current.state
            pendingFilterRef.current = null
          }
        }

        write(base, "push", next)
        return
      }

      // Fold in a filter edit already waiting on the debounce, so a value typed
      // just before this one does not get overwritten by the URL-derived state
      // that has not caught up yet.
      scheduleFilterWrite(pendingFilterRef.current?.state ?? state, next)
    },
    [scheduleFilterWrite, state, write],
  )

  const setFilterConnective = useCallback(
    (next: GridFilterConnective) => {
      onFilterTreeChange({ ...filterTreeRef.current, connective: next }, true)
    },
    [onFilterTreeChange],
  )

  const clearFilters = useCallback(() => {
    // Clears `q`, every `f.<colId>`, every `fa.<colId>`, `fg` and `sort`, and
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
    const emptyTree = createFilterGroup()
    filterTreeRef.current = emptyTree

    const params = applyGridParams(
      searchParams,
      serializeGridViewState(
        {
          ...pickGridState(state, emptyTree),
          sorting: [],
          globalFilter: "",
        },
        columnIds,
        splitColumnKey(hiddenDefaultKey),
      ),
    )

    for (const [key, value] of Object.entries(stickyParams ?? {})) {
      if (value === null) {
        params.delete(key)
      } else {
        params.set(key, value)
      }
    }

    const query = params.toString()
    const url = query.length > 0 ? `${pathname}?${query}` : pathname
    router.push(url, { scroll: false })
  }, [columnIds, hiddenDefaultKey, pathname, router, searchParams, state, stickyParams])

  const beginTransientChange = useCallback(() => {
    transientRef.current = true
    pendingRef.current = null
  }, [])

  const commitTransientChange = useCallback(() => {
    transientRef.current = false
    const pending = pendingRef.current
    pendingRef.current = null

    if (pending) {
      write(pending, "push", filterTreeRef.current)
    }
  }, [write])

  const cancelTransientChange = useCallback(() => {
    transientRef.current = false
    pendingRef.current = null
  }, [])

  return {
    state,
    filterConnective,
    filterTree,
    onStateChange,
    onFilterTreeChange,
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
