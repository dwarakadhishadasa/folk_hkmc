/**
 * URL codec for grid view state. Pure and React-free: no `"use client"`, no
 * runtime imports at all, so it is safe to consume from a server component, a
 * client component, or a script.
 *
 * Wire contract:
 *
 * | Param          | Meaning                                              |
 * | -------------- | ---------------------------------------------------- |
 * | `sort`         | `colId:asc[,colId:desc]` in priority order           |
 * | `q`            | global filter text                                   |
 * | `f.<colId>`    | per-column filter                                    |
 * | `cols`         | ordered, comma-joined column ids                     |
 * | `hide`         | hidden column ids, comma-joined                      |
 * | `size.<colId>` | committed column width in integer px                 |
 *
 * Two invariants matter more than the table above:
 *
 * 1. Only non-default values are written. A default-valued or malformed key is
 *    deleted rather than emitted, so the URL stays short and a stale
 *    `?size.phone=abc` cannot survive a reload.
 * 2. `applyGridParams` starts from a copy of the live params and touches only
 *    grid-owned keys. `?mode=admin|preacher` is the CAP-10 carrier; dropping it
 *    would silently promote a Preacher following a shared link into admin
 *    scope, and this grid is the one thing on a `/manage` page rewriting URLs.
 */

import type {
  ColumnFiltersState,
  ColumnSizingState,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table"

/** Exact query keys the grid owns. */
export const GRID_PARAM_KEYS = ["q", "sort", "cols", "hide"] as const

/** Query key prefixes the grid owns. */
export const GRID_PARAM_PREFIXES = ["f.", "size."] as const

export interface GridViewState {
  sorting: SortingState
  globalFilter: string
  columnFilters: ColumnFiltersState
  /** Always a complete permutation of the known column ids, in display order. */
  columnOrder: string[]
  /** Absent key means visible; only explicitly hidden ids are present. */
  columnVisibility: VisibilityState
  /** Absent key means the column's default width. */
  columnSizing: ColumnSizingState
}

const EMPTY_VIEW_STATE: GridViewState = {
  sorting: [],
  globalFilter: "",
  columnFilters: [],
  columnOrder: [],
  columnVisibility: {},
  columnSizing: {},
}

export function isGridParamKey(key: string): boolean {
  return (
    (GRID_PARAM_KEYS as readonly string[]).includes(key) ||
    GRID_PARAM_PREFIXES.some((prefix) => key.startsWith(prefix))
  )
}

/** Splits a comma list, dropping empties. Never throws on odd input. */
function splitList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

function parseSizingValue(raw: string | null): number | null {
  if (raw === null) {
    return null
  }

  const trimmed = raw.trim()

  if (!/^\d+$/.test(trimmed)) {
    return null
  }

  const parsed = Number.parseInt(trimmed, 10)

  return parsed > 0 ? parsed : null
}

/**
 * Reads grid state out of a live query string. Unknown column ids are dropped
 * and ids missing from `cols` are re-appended in `columnIds` order, so a stale
 * shared link degrades to a valid arrangement instead of throwing.
 */
export function parseGridViewState(
  params: URLSearchParams,
  columnIds: readonly string[],
): GridViewState {
  const known = new Set(columnIds)

  try {
    const sorting: SortingState = []
    const rawSort = params.get("sort")

    if (rawSort) {
      for (const entry of splitList(rawSort)) {
        const separator = entry.lastIndexOf(":")
        const id = separator === -1 ? entry : entry.slice(0, separator)
        const direction = separator === -1 ? "asc" : entry.slice(separator + 1)

        if (!known.has(id) || (direction !== "asc" && direction !== "desc")) {
          continue
        }

        if (sorting.some((item) => item.id === id)) {
          continue
        }

        sorting.push({ id, desc: direction === "desc" })
      }
    }

    const columnFilters: ColumnFiltersState = []
    for (const id of columnIds) {
      const raw = params.get(`f.${id}`)

      if (raw !== null && raw.trim().length > 0) {
        columnFilters.push({ id, value: raw })
      }
    }

    const ordered: string[] = []
    const seen = new Set<string>()
    for (const id of splitList(params.get("cols") ?? "")) {
      if (known.has(id) && !seen.has(id)) {
        seen.add(id)
        ordered.push(id)
      }
    }

    for (const id of columnIds) {
      if (!seen.has(id)) {
        seen.add(id)
        ordered.push(id)
      }
    }

    const columnVisibility: VisibilityState = {}
    for (const id of splitList(params.get("hide") ?? "")) {
      if (known.has(id)) {
        columnVisibility[id] = false
      }
    }

    const columnSizing: ColumnSizingState = {}
    for (const id of columnIds) {
      const size = parseSizingValue(params.get(`size.${id}`))

      if (size !== null) {
        columnSizing[id] = size
      }
    }

    return {
      sorting,
      globalFilter: params.get("q") ?? "",
      columnFilters,
      columnOrder: ordered,
      columnVisibility,
      columnSizing,
    }
  } catch {
    // A malformed query string must never take the grid down.
    return { ...EMPTY_VIEW_STATE, columnOrder: [...columnIds] }
  }
}

/**
 * Projects grid state onto the query params worth writing. Keys whose value
 * equals the default are omitted, and `applyGridParams` deletes them.
 */
export function serializeGridViewState(
  state: Partial<GridViewState>,
  columnIds: readonly string[],
): Record<string, string> {
  const known = new Set(columnIds)
  const params: Record<string, string> = {}

  const sorting = (state.sorting ?? []).filter((entry) => known.has(entry.id))

  if (sorting.length > 0) {
    params.sort = sorting.map((entry) => `${entry.id}:${entry.desc ? "desc" : "asc"}`).join(",")
  }

  const globalFilter = typeof state.globalFilter === "string" ? state.globalFilter : ""

  if (globalFilter.length > 0) {
    params.q = globalFilter
  }

  for (const filter of state.columnFilters ?? []) {
    if (!known.has(filter.id) || filter.value === undefined || filter.value === null) {
      continue
    }

    const value = String(filter.value)

    if (value.length > 0) {
      params[`f.${filter.id}`] = value
    }
  }

  const order = (state.columnOrder ?? []).filter((id) => known.has(id))
  const isDefaultOrder =
    order.length === columnIds.length && order.every((id, index) => columnIds[index] === id)

  if (order.length > 0 && !isDefaultOrder) {
    params.cols = order.join(",")
  }

  const hidden = Object.keys(state.columnVisibility ?? {})
    .filter((id) => known.has(id) && state.columnVisibility?.[id] === false)

  if (hidden.length > 0) {
    params.hide = hidden.join(",")
  }

  for (const [id, size] of Object.entries(state.columnSizing ?? {})) {
    if (!known.has(id)) {
      continue
    }

    const rounded = Math.round(size)

    if (Number.isFinite(rounded) && rounded > 0) {
      params[`size.${id}`] = String(rounded)
    }
  }

  return params
}

/**
 * Returns a copy of `existing` with every grid-owned key replaced by `next`.
 * Non-grid params are copied through verbatim, which is what keeps `?mode=`
 * and campaign params intact across a grid write.
 */
export function applyGridParams(
  existing: URLSearchParams,
  next: Record<string, string>,
): URLSearchParams {
  const params = new URLSearchParams(existing.toString())

  for (const key of [...params.keys()]) {
    if (isGridParamKey(key)) {
      params.delete(key)
    }
  }

  for (const [key, value] of Object.entries(next)) {
    if (isGridParamKey(key)) {
      params.set(key, value)
    }
  }

  return params
}
