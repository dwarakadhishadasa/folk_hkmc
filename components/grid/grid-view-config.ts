/**
 * A grid configuration as a value, rather than as a query string.
 *
 * `grid-view-state.ts` is the wire codec: it turns the live URL into table state
 * and back. This module is the storage codec on top of it — the same settings
 * expressed as an object a saved view can hold, and converted to and from the
 * URL with the one codec that already exists.
 *
 * Keeping both directions on `serializeGridViewState` / `parseGridViewState` is
 * deliberate: a saved view and a shared link must mean the same thing, and two
 * encoders would eventually disagree about `hide` (a complete set, not a delta)
 * or about which filter keys count.
 *
 * Pure and React-free, like the wire codec, so the API can validate with it and
 * a server component can name it.
 */

import type { ColumnSizingState, SortingState } from "@tanstack/react-table"

import {
  createFilterGroup,
  filterGroupToSerialized,
  flattenConditions,
  parseFilterTreeJson,
  type GridFilterGroup,
  type SerializedFilterGroup,
} from "@/components/grid/grid-filter-tree"
import type { GridDensity } from "@/components/grid/grid-types"
import {
  parseGridViewState,
  serializeGridViewState,
  type GridColumnFieldTypes,
} from "@/components/grid/grid-view-state"

export interface GridViewConfig {
  sorting: SortingState
  globalFilter: string
  /** `null` when the view shows everything; never an empty condition list. */
  filter: SerializedFilterGroup | null
  /** Complete display order; unknown ids are dropped on read. */
  columnOrder: string[]
  /** Complete hidden set. An empty list means "nothing hidden", not "defaults". */
  hiddenColumnIds: string[]
  columnSizing: ColumnSizingState
  density: GridDensity
}

export const GRID_DENSITY_VALUES: readonly GridDensity[] = ["default", "dense"]

export const EMPTY_GRID_VIEW_CONFIG: GridViewConfig = {
  sorting: [],
  globalFilter: "",
  filter: null,
  columnOrder: [],
  hiddenColumnIds: [],
  columnSizing: {},
  density: "default",
}

const MAX_COLUMNS = 500
const MAX_STRING = 500

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  const seen = new Set<string>()
  const out: string[] = []

  for (const entry of value.slice(0, MAX_COLUMNS)) {
    if (typeof entry !== "string") {
      continue
    }

    const id = entry.trim()

    if (id.length === 0 || id.length > MAX_STRING || seen.has(id)) {
      continue
    }

    seen.add(id)
    out.push(id)
  }

  return out
}

function asSorting(value: unknown): SortingState {
  if (!Array.isArray(value)) {
    return []
  }

  const seen = new Set<string>()
  const out: SortingState = []

  for (const entry of value.slice(0, MAX_COLUMNS)) {
    const record = asRecord(entry)

    if (!record || typeof record.id !== "string" || record.id.length === 0) {
      continue
    }

    if (seen.has(record.id)) {
      continue
    }

    seen.add(record.id)
    out.push({ id: record.id, desc: record.desc === true })
  }

  return out
}

function asSizing(value: unknown): ColumnSizingState {
  const record = asRecord(value)

  if (!record) {
    return {}
  }

  const out: ColumnSizingState = {}

  for (const [id, size] of Object.entries(record).slice(0, MAX_COLUMNS)) {
    if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
      continue
    }

    out[id] = Math.round(size)
  }

  return out
}

/**
 * Reads a stored config defensively.
 *
 * A stored config outlives the columns it names and can arrive from a hand-made
 * request, so this never throws and never trusts a shape. What it cannot check —
 * that a filter names a column that still exists — the wire codec drops on the
 * way into the grid.
 */
export function normalizeGridViewConfig(value: unknown): GridViewConfig {
  const record = asRecord(value)

  if (!record) {
    return { ...EMPTY_GRID_VIEW_CONFIG }
  }

  const filterRecord = asRecord(record.filter)
  const filter =
    filterRecord &&
    Array.isArray(filterRecord.filterSet) &&
    (filterRecord.conjunction === "and" || filterRecord.conjunction === "or")
      ? (filterRecord as unknown as SerializedFilterGroup)
      : null

  const density =
    typeof record.density === "string" && GRID_DENSITY_VALUES.includes(record.density as GridDensity)
      ? (record.density as GridDensity)
      : EMPTY_GRID_VIEW_CONFIG.density

  return {
    sorting: asSorting(record.sorting),
    globalFilter: typeof record.globalFilter === "string" ? record.globalFilter.slice(0, MAX_STRING) : "",
    filter,
    columnOrder: asStringList(record.columnOrder),
    hiddenColumnIds: asStringList(record.hiddenColumnIds),
    columnSizing: asSizing(record.columnSizing),
    density,
  }
}

/** Column ids named anywhere in a serialized filter tree. */
function serializedColumnIds(node: SerializedFilterGroup): string[] {
  const out: string[] = []

  const walk = (value: unknown) => {
    if (!value || typeof value !== "object") {
      return
    }

    const record = value as Record<string, unknown>

    if (Array.isArray(record.filterSet)) {
      for (const child of record.filterSet) {
        walk(child)
      }

      return
    }

    if (typeof record.columnId === "string") {
      out.push(record.columnId)
    }
  }

  walk(node)

  return out
}

/**
 * Stored filter -> live tree.
 *
 * The condition set is used as the known-column universe so a view whose column
 * order has not caught up with its filter still opens with its conditions
 * intact. The field types are still required: they are what says whether
 * `equals` is a real operator for that column, and dropping that check here
 * would let storage and the URL disagree about which conditions exist.
 */
function configToFilterGroup(
  config: GridViewConfig,
  fieldTypes: GridColumnFieldTypes,
): GridFilterGroup {
  if (!config.filter) {
    return createFilterGroup()
  }

  const known = new Set([
    ...config.columnOrder,
    ...config.hiddenColumnIds,
    ...Object.keys(config.columnSizing),
    ...serializedColumnIds(config.filter),
  ])

  return parseFilterTreeJson(JSON.stringify(config.filter), known, fieldTypes) ?? createFilterGroup()
}

/** Stored config -> the query-string keys that reproduce it. */
export function gridViewConfigToParams(
  config: GridViewConfig,
  columnIds: readonly string[],
  options: {
    fieldTypes: GridColumnFieldTypes
    defaultHiddenColumnIds?: readonly string[]
  },
): Record<string, string> {
  const filterTree = configToFilterGroup(config, options.fieldTypes)

  return serializeGridViewState(
    {
      sorting: config.sorting,
      globalFilter: config.globalFilter,
      columnFilters: flattenConditions(filterTree).map((condition) => ({
        id: condition.columnId,
        value: condition,
      })),
      filterConnective: filterTree.connective,
      filterTree,
      columnOrder: config.columnOrder,
      columnVisibility: Object.fromEntries(
        config.hiddenColumnIds.map((id) => [id, false]),
      ),
      columnSizing: config.columnSizing,
    },
    columnIds,
    options.defaultHiddenColumnIds ?? [],
  )
}

/** The query string the grid is showing, as a config a view can store. */
export function gridViewConfigFromParams(
  params: URLSearchParams,
  columnIds: readonly string[],
  options: {
    fieldTypes?: GridColumnFieldTypes
    defaultHiddenColumnIds?: readonly string[]
    density: GridDensity
  },
): GridViewConfig {
  const parsed = parseGridViewState(
    params,
    columnIds,
    options.fieldTypes ?? {},
    options.defaultHiddenColumnIds ?? [],
  )

  const hasFilter = flattenConditions(parsed.filterTree).length > 0

  return {
    sorting: parsed.sorting,
    globalFilter: parsed.globalFilter,
    filter: hasFilter ? filterGroupToSerialized(parsed.filterTree) : null,
    columnOrder: parsed.columnOrder,
    hiddenColumnIds: Object.keys(parsed.columnVisibility).filter(
      (id) => parsed.columnVisibility[id] === false,
    ),
    columnSizing: parsed.columnSizing,
    density: options.density,
  }
}

/**
 * Stable identity for "is this the same configuration".
 *
 * Used to decide whether a state change is worth writing back to the saved view:
 * hydration writes the URL, the URL change looks like an edit, and comparing
 * keys is what keeps that echo from becoming a save. Sorting is order-sensitive
 * (it is a priority list); the hidden set and the column order are taken as
 * given because both are already ordered values.
 */
export function gridViewConfigKey(config: GridViewConfig): string {
  return JSON.stringify([
    config.sorting.map((entry) => [entry.id, entry.desc]),
    config.globalFilter,
    config.filter,
    config.columnOrder,
    config.hiddenColumnIds,
    Object.entries(config.columnSizing).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    config.density,
  ])
}
