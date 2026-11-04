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
 * | `f.<colId>`    | one condition, ANDed across columns                  |
 * | `fa.<colId>`   | one condition, ORed across columns                   |
 * | `fg`           | a complete filter tree, groups included (JSON)       |
 * | `cols`         | ordered, comma-joined column ids                     |
 * | `hide`         | COMPLETE hidden set, comma-joined — see below        |
 * | `size.<colId>` | committed column width in integer px                 |
 *
 * **`hide` is a complete description, not a delta.** `params.has("hide")`
 * decides, never emptiness: an ABSENT key means the consumer's
 * `defaultHiddenColumnIds` apply, and a PRESENT key means exactly the ids it
 * lists are hidden — including `hide=` with nothing after it, which is the one
 * state a bare list cannot otherwise express ("nothing hidden"). Serialization
 * writes the key whenever the effective set differs from the defaults, so
 * un-hiding a default-hidden column is reversible: `hide=booksRead,...` says
 * "these four", and dropping the key is what restores the defaults. A bare list
 * keyed on non-emptiness would make the default set a lock rather than a
 * default, and `hide=notes` would change meaning the moment a default appeared.
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
 *
 * **A FLAT filter's connective is carried by the prefix, not by a flag.** `f.`
 * means "all of these", `fa.` means "any of these", and match-any is on exactly
 * when some `fa.` key is present. A `fm=any` param would be a second way to say
 * the same thing and the two could disagree — a link could carry `fm=any` and
 * no `fa.` keys, which means nothing. A flat list has one connective, so both
 * cases are SETS of columns: nothing is order-sensitive, and no list is parsed.
 *
 * **A GROUPED filter travels as `fg`, because no flat encoding can express it.**
 * An OR inside an AND is not a set of columns; it is a tree. `fg` holds the
 * complete `{ conjunction, filterSet }` shape Airtable itself sends to
 * `updateFilters`, with `{ type: "nested" }` for a group. A grouped link never
 * writes `f.`/`fa.` keys, and a flat link never writes `fg`; reading prefers
 * `fg` when present, so the two forms cannot be silently merged into a filter
 * nobody composed. See `grid-filter-tree.ts` for the shape and its evaluator.
 *
 * **A condition token is never empty.** `f.<colId>` holds `<operator>:<value>`,
 * so `is empty` serializes as `isEmpty:` — eight characters — and survives the
 * length guards that used to drop it in both directions. See
 * `grid-filter-operators.ts` for the token grammar.
 */

import type {
  ColumnFiltersState,
  ColumnSizingState,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table"

import {
  decodeCondition,
  encodeCondition,
  type GridFilterCondition,
  type GridFilterConnective,
} from "@/components/grid/grid-filter-operators"
import {
  createFilterGroup,
  filterGroupFromConditions,
  filterGroupToSerialized,
  flattenConditions,
  hasNestedGroups,
  parseFilterTreeJson,
  type GridFilterGroup,
} from "@/components/grid/grid-filter-tree"
import type { GridFieldType } from "@/components/grid/grid-types"

/** Exact query keys the grid owns. */
export const GRID_PARAM_KEYS = ["q", "sort", "cols", "hide", "fg"] as const

/**
 * Query key prefixes the grid owns.
 *
 * `fa.` joins `f.` and `size.` because it is a filter prefix. Omitting it does not
 * merely fail to read — `applyGridParams` deletes every grid-owned key before
 * writing, so an unregistered prefix is silently erased on the first write.
 */
export const GRID_PARAM_PREFIXES = ["f.", "fa.", "size."] as const

export type { GridFilterCondition, GridFilterConnective }

export interface GridViewState {
  sorting: SortingState
  globalFilter: string
  columnFilters: ColumnFiltersState
  /**
   * The ROOT connective, derived from `filterTree`. Nested groups carry their
   * own in the tree; this field exists for the flat table path and for callers
   * that predate groups.
   */
  filterConnective: GridFilterConnective
  /**
   * The complete filter, groups included. A flat filter is a root whose
   * children are all conditions; see `grid-filter-tree.ts`. `columnFilters` is
   * its flattened projection and is what TanStack receives when the tree can
   * be evaluated by ANDing leaves.
   */
  filterTree: GridFilterGroup
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
  filterConnective: "all",
  filterTree: createFilterGroup(),
  columnOrder: [],
  columnVisibility: {},
  columnSizing: {},
}

/** Column ids to the field type that decides an operator-less token's meaning. */
export type GridColumnFieldTypes = Readonly<Record<string, GridFieldType | undefined>>

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

/**
 * Narrows a TanStack column-filter value to a condition.
 *
 * TanStack types that value as `unknown`, so anything can arrive here — including
 * the bare strings this module used to write. Anything without an operator is
 * treated as a legacy bare value and given the connective's default meaning by
 * `decodeCondition` on the next read, so a value that entered from outside the
 * popover is never silently dropped.
 */
function asCondition(value: unknown): GridFilterCondition | null {
  if (typeof value === "string") {
    return value.length > 0 ? { columnId: "", operator: "contains", value } : null
  }

  if (typeof value === "object" && value !== null) {
    const candidate = value as Partial<GridFilterCondition>

    if (typeof candidate.operator === "string" && candidate.operator.length > 0) {
      return {
        columnId: candidate.columnId ?? "",
        operator: candidate.operator,
        value: candidate.value ?? "",
      }
    }
  }

  return null
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
 *
 * `defaultHiddenColumnIds` is a per-consumer product decision, supplied by the
 * caller rather than fixed here: a grid with no defaults keeps every column
 * visible, which is exactly what `grid-preview.tsx` wants. The KEY decides
 * whether the defaults apply — see the `hide` note in this module's header.
 */
export function parseGridViewState(
  params: URLSearchParams,
  columnIds: readonly string[],
  fieldTypes: GridColumnFieldTypes = {},
  defaultHiddenColumnIds: readonly string[] = [],
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

    // For the FLAT fallback, match-any wins over match-all rather than merging:
    // one connective governs the whole flat list, so a link carrying both
    // prefixes is not two lists to reconcile — it is one list whose connective
    // is `any`. A valid `fg` replaces this list below.
    const columnFilters: ColumnFiltersState = []
    let filterConnective: GridFilterConnective = "all"

    /**
     * Conditions come back in the order they were ADDED, not in column order.
     *
     * Iterating `columnIds` here rebuilt the list in the grid's column order, so
     * a condition added for an early-sorted column landed near the TOP of the
     * stack instead of the bottom — the list appeared to insert itself in the
     * middle. The query string is written in condition order by
     * `serializeGridViewState`, and `URLSearchParams` preserves insertion order,
     * so reading the params back in key order recovers exactly that.
     */
    const order: string[] = []
    const byColumn = new Map<string, { raw: string; any: boolean }>()

    for (const key of params.keys()) {
      const any = key.startsWith("fa.")

      if (!any && !key.startsWith("f.")) {
        continue
      }

      const id = key.slice(any ? 3 : 2)
      const existing = byColumn.get(id)

      // `fa.` still wins over `f.` for the same column, but the position is the
      // first appearance of either — two entries for one column would also
      // collide on the popover's `key`, which is the column id.
      if (existing?.any) {
        continue
      }

      const raw = params.get(key)

      // The guard is on the TOKEN, not on the trimmed value. That is the whole
      // fix for the empty-value defect: `isEmpty:` is non-empty as a whole, so
      // `Notes · is empty` round-trips instead of vanishing on reload.
      if (raw === null || raw.length === 0) {
        continue
      }

      if (!existing) {
        order.push(id)
      }

      byColumn.set(id, { raw, any })
    }

    if ([...byColumn.values()].some((entry) => entry.any)) {
      filterConnective = "any"
    }

    for (const id of order) {
      const entry = byColumn.get(id)

      // A stale column id is dropped rather than thrown on: a shared link
      // outlives the column it names.
      if (!entry || !known.has(id)) {
        continue
      }

      const condition = decodeCondition(entry.raw, id, fieldTypes[id])

      if (condition) {
        columnFilters.push({ id, value: condition })
      }
    }

    /**
     * `fg` is the complete tree and WINS over the flat keys. A nested tree has
     * no faithful flat projection — `f.`/`fa.` cannot express an OR inside an
     * AND — so reading both and merging would invent a filter nobody wrote.
     * A flat tree is still written as `f.`/`fa.` for links that predate groups;
     * `fg` is the only form a grouped tree takes.
     */
    const flatConditions = columnFilters.map((entry) => ({
      ...(entry.value as GridFilterCondition),
      columnId: entry.id,
    }))
    const parsedTree = parseFilterTreeJson(params.get("fg"), known, fieldTypes)
    const filterTree =
      parsedTree ??
      filterGroupFromConditions(flatConditions, filterConnective)

    if (parsedTree) {
      filterConnective = parsedTree.connective
      columnFilters.length = 0

      for (const condition of flattenConditions(parsedTree)) {
        columnFilters.push({ id: condition.columnId, value: condition })
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

    // Presence, not emptiness. `hide=notes` keeps meaning "only Notes hidden"
    // whatever the defaults are, because a present key is a complete list; and
    // `hide=` is the only encoding that can say "nothing hidden" — a default set
    // that could not be un-hidden would be a lock, not a default.
    const columnVisibility: VisibilityState = {}

    if (params.has("hide")) {
      for (const id of splitList(params.get("hide") ?? "")) {
        if (known.has(id)) {
          columnVisibility[id] = false
        }
      }
    } else {
      for (const id of defaultHiddenColumnIds) {
        if (known.has(id)) {
          columnVisibility[id] = false
        }
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
      filterConnective,
      filterTree,
      columnOrder: ordered,
      columnVisibility,
      columnSizing,
    }
  } catch {
    // A malformed query string must never take the grid down. The defaults
    // still apply here: "no readable `hide` key" must mean the same thing on
    // the failure path as on the happy one, or a grid would jump from nine
    // columns to fifteen on exactly the render where something already broke.
    const columnVisibility: VisibilityState = {}

    for (const id of defaultHiddenColumnIds) {
      if (known.has(id)) {
        columnVisibility[id] = false
      }
    }

    return {
      ...EMPTY_VIEW_STATE,
      filterTree: createFilterGroup(),
      columnOrder: [...columnIds],
      columnVisibility,
    }
  }
}

/**
 * Projects grid state onto the query params worth writing. Keys whose value
 * equals the default are omitted, and `applyGridParams` deletes them.
 *
 * `defaultHiddenColumnIds` must be the SAME list the caller parsed with, or the
 * "unchanged, so write nothing" test below is measured against a set the grid
 * is not actually showing.
 */
export function serializeGridViewState(
  state: Partial<GridViewState>,
  columnIds: readonly string[],
  defaultHiddenColumnIds: readonly string[] = [],
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

  // The tree is authoritative when it is present. `columnFilters` is its
  // flattened projection, kept for TanStack and for callers that predate
  // groups; it is not read back into a different tree here.
  const flatConditions: GridFilterCondition[] = []

  for (const filter of state.columnFilters ?? []) {
    if (!known.has(filter.id) || filter.value === undefined || filter.value === null) {
      continue
    }

    // A condition that failed to decode is not written back. The old code wrote
    // any non-empty string, which is how a stale or foreign value became a URL
    // the next reload had to interpret again.
    const condition = asCondition(filter.value)

    if (condition) {
      flatConditions.push({ ...condition, columnId: filter.id })
    }
  }

  const filterTree =
    state.filterTree ?? filterGroupFromConditions(flatConditions, state.filterConnective ?? "all")
  const treeConditions = flattenConditions(filterTree).filter((condition) =>
    known.has(condition.columnId),
  )

  if (treeConditions.length > 0) {
    if (hasNestedGroups(filterTree)) {
      // Groups have no faithful flat encoding, so the whole tree travels as
      // `fg`. Its shape is Airtable's observed `filters` shape: conjunction +
      // filterSet, with `{ type: "nested" }` for a group.
      params.fg = JSON.stringify(filterGroupToSerialized(filterTree))
    } else {
      const conditionPrefix = filterTree.connective === "any" ? "fa." : "f."

      for (const condition of treeConditions) {
        params[`${conditionPrefix}${condition.columnId}`] = encodeCondition(condition)
      }
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

  // Compared as SETS against the defaults, not as "is there anything hidden".
  // `hidden` lists only what is hidden, so an un-hide has nowhere to go in a
  // delta encoding, and "hide nothing" is the one state a bare list cannot
  // express. Writing the complete set whenever it differs — `hide=` included —
  // is what keeps the defaults a default: deleting the key is the only way back,
  // and it happens automatically the moment the effective set equals them again.
  const defaultHidden = new Set(defaultHiddenColumnIds)
  const hiddenSet = new Set(hidden)
  const matchesDefault =
    hiddenSet.size === defaultHidden.size && [...hiddenSet].every((id) => defaultHidden.has(id))

  if (!matchesDefault) {
    // Deliberately emits `hide=` for the empty set rather than omitting the key.
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
