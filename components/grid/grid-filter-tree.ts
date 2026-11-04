/**
 * The filter tree (CAP-12 extension): conditions and condition groups.
 *
 * Airtable's filter state, observed live on 2026-10-29, is one recursive
 * structure — `{ conjunction, filterSet }` at the root, a leaf
 * `{ columnId, operator, value }`, and a group `{ type: "nested", conjunction,
 * filterSet }`. The filter UI sends the WHOLE tree on every edit to
 * `POST /v0.3/view/<viewId>/updateFilters`, with no Apply button. This module
 * mirrors that shape so a grouped filter is one value rather than a list plus a
 * parallel group list that can disagree with it.
 *
 * Pure and React-free, like `grid-filter-operators.ts`, so the URL codec, the
 * table, and unit tests can read it without pulling React in.
 *
 * **The root is a group too.** A flat filter is the degenerate case: a root
 * group whose children are all conditions. That is what lets every writer in
 * the popover be one recursive operation, and it is why an existing `f.<colId>`
 * link keeps working — it parses into exactly that degenerate root.
 *
 * **One condition per column, across the whole tree.** The current grid treats
 * `columnId` as a condition's identity (see `grid-filter-operators.ts:60`), so a
 * duplicate would collide on React keys and in the URL writer. Airtable itself
 * allows the same field twice; the grid does not, and grouping does not change
 * that product rule. `filterGroupFromSerialized` drops later duplicates rather
 * than letting a malformed link build one.
 *
 * **An empty group is inert.** `all` over nothing is vacuously true, and `any`
 * over nothing must NOT be false — an empty group the operator just added would
 * then filter every row out. Both connectives return `true` for an empty group.
 */

import type { GridFieldType } from "@/components/grid/grid-types"
import {
  encodeCondition,
  evaluateCondition,
  findFilterOperator,
  isConditionUnfilled,
  type GridFilterCondition,
  type GridFilterConnective,
} from "@/components/grid/grid-filter-operators"

/**
 * How deeply condition groups may nest. Airtable enforces its own limit and
 * says so in `maxDepthReachedMessage`; three is enough for the mixed expressions
 * this grid needs and keeps the URL and the recursive render bounded.
 */
export const GRID_FILTER_MAX_GROUP_DEPTH = 3

/** A condition, or a nested group. The discriminant is `type`. */
export type GridFilterNode =
  | { type: "condition"; condition: GridFilterCondition }
  | { type: "group"; group: GridFilterGroup }

export interface GridFilterGroup {
  /** `all` = AND, `any` = OR. Applies to this group's direct children only. */
  connective: GridFilterConnective
  children: GridFilterNode[]
}

export function createFilterGroup(
  connective: GridFilterConnective = "all",
  children: GridFilterNode[] = [],
): GridFilterGroup {
  return { connective, children }
}

export function conditionNode(condition: GridFilterCondition): GridFilterNode {
  return { type: "condition", condition }
}

export function groupNode(group: GridFilterGroup): GridFilterNode {
  return { type: "group", group }
}

export function isGroupNode(node: GridFilterNode): node is { type: "group"; group: GridFilterGroup } {
  return node.type === "group"
}

/** Every condition in display order, depth-first. */
export function flattenConditions(group: GridFilterGroup): GridFilterCondition[] {
  const conditions: GridFilterCondition[] = []

  for (const node of group.children) {
    if (node.type === "group") {
      conditions.push(...flattenConditions(node.group))
    } else {
      conditions.push(node.condition)
    }
  }

  return conditions
}

export function collectColumnIds(group: GridFilterGroup): Set<string> {
  return new Set(flattenConditions(group).map((condition) => condition.columnId))
}

/** Whether any group is nested below the root. */
export function hasNestedGroups(group: GridFilterGroup): boolean {
  return group.children.some((node) => node.type === "group")
}

/**
 * Whether TanStack can evaluate this filter on its own.
 *
 * The table ANDs every `columnFilters` entry and has no notion of groups or of
 * a per-group OR, so anything nested or match-any must be evaluated against the
 * source rows here instead.
 */
export function needsManualEvaluation(group: GridFilterGroup): boolean {
  return group.connective === "any" || hasNestedGroups(group)
}

/** The deepest nested-group level below `group`; a flat group is 0. */
export function nestedGroupDepth(group: GridFilterGroup): number {
  let deepest = 0

  for (const node of group.children) {
    if (node.type === "group") {
      deepest = Math.max(deepest, 1 + nestedGroupDepth(node.group))
    }
  }

  return deepest
}

/**
 * Updates the group at `path` (indices of groups to descend through; `[]` is
 * the root). Returns the original tree when the path does not name a group, so
 * callers can compare by identity and skip a write.
 */
export function updateGroupAt(
  group: GridFilterGroup,
  path: readonly number[],
  updater: (group: GridFilterGroup) => GridFilterGroup,
): GridFilterGroup {
  if (path.length === 0) {
    return updater(group)
  }

  const [index, ...rest] = path
  const child = group.children[index]

  if (!child || child.type !== "group") {
    return group
  }

  const nextGroup = updateGroupAt(child.group, rest, updater)

  if (nextGroup === child.group) {
    return group
  }

  const children = [...group.children]
  children[index] = groupNode(nextGroup)

  return { ...group, children }
}

export function addNode(
  group: GridFilterGroup,
  path: readonly number[],
  node: GridFilterNode,
): GridFilterGroup {
  return updateGroupAt(group, path, (target) => ({
    ...target,
    children: [...target.children, node],
  }))
}

export function removeNodeAt(
  group: GridFilterGroup,
  path: readonly number[],
  index: number,
): GridFilterGroup {
  return updateGroupAt(group, path, (target) => {
    if (index < 0 || index >= target.children.length) {
      return target
    }

    return { ...target, children: target.children.filter((_, childIndex) => childIndex !== index) }
  })
}

export function replaceNodeAt(
  group: GridFilterGroup,
  path: readonly number[],
  index: number,
  node: GridFilterNode,
): GridFilterGroup {
  return updateGroupAt(group, path, (target) => {
    if (index < 0 || index >= target.children.length) {
      return target
    }

    const children = [...target.children]
    children[index] = node

    return { ...target, children }
  })
}

/** Replaces a condition by column id anywhere in the tree. */
export function replaceCondition(
  group: GridFilterGroup,
  condition: GridFilterCondition,
): GridFilterGroup {
  const children = group.children.map((node) => {
    if (node.type === "group") {
      return groupNode(replaceCondition(node.group, condition))
    }

    return node.condition.columnId === condition.columnId ? conditionNode(condition) : node
  })

  return { ...group, children }
}

export function removeCondition(group: GridFilterGroup, columnId: string): GridFilterGroup {
  const children: GridFilterNode[] = []

  for (const node of group.children) {
    if (node.type === "group") {
      children.push(groupNode(removeCondition(node.group, columnId)))
      continue
    }

    if (node.condition.columnId !== columnId) {
      children.push(node)
    }
  }

  return { ...group, children }
}

export function setGroupConnective(
  group: GridFilterGroup,
  path: readonly number[],
  connective: GridFilterConnective,
): GridFilterGroup {
  return updateGroupAt(group, path, (target) => ({ ...target, connective }))
}

/**
 * Drops conditions the operator started and never finished, and groups that are
 * left with nothing to govern. The root is never removed; an empty root is the
 * "no filter" state.
 */
export function pruneFilterTree(
  group: GridFilterGroup,
  fieldTypeById: ReadonlyMap<string, GridFieldType | undefined>,
  options: { removeEmptyGroups: boolean } = { removeEmptyGroups: true },
): GridFilterGroup {
  const children: GridFilterNode[] = []

  for (const node of group.children) {
    if (node.type === "group") {
      const nested = pruneFilterTree(node.group, fieldTypeById, options)

      if (nested.children.length > 0 || !options.removeEmptyGroups) {
        children.push(groupNode(nested))
      }

      continue
    }

    if (!isConditionUnfilled(node.condition, fieldTypeById.get(node.condition.columnId))) {
      children.push(node)
    }
  }

  return { ...group, children }
}

/** Whether a group contains a condition anywhere below it. */
function hasCondition(group: GridFilterGroup): boolean {
  return group.children.some(
    (node) => node.type === "condition" || hasCondition(node.group),
  )
}

/**
 * Whether one row satisfies the whole tree.
 *
 * **An empty group is IGNORED, not treated as a true operand.** Returning
 * `true` for the group itself would make it satisfy a match-any parent on its
 * own, so adding an empty group to an OR list would suddenly match every row —
 * the "my filter stopped working" shape. It contributes nothing; if the whole
 * group has no conditions, the group is inert and passes.
 */
export function evaluateFilterGroup(
  group: GridFilterGroup,
  readColumn: (columnId: string) => unknown,
  fieldTypeById: ReadonlyMap<string, GridFieldType | undefined>,
): boolean {
  const results: boolean[] = []

  for (const node of group.children) {
    if (node.type === "group") {
      if (hasCondition(node.group)) {
        results.push(evaluateFilterGroup(node.group, readColumn, fieldTypeById))
      }

      continue
    }

    results.push(
      evaluateCondition(
        readColumn(node.condition.columnId),
        node.condition,
        fieldTypeById.get(node.condition.columnId),
      ),
    )
  }

  if (results.length === 0) {
    return true
  }

  return group.connective === "all" ? results.every(Boolean) : results.some(Boolean)
}

/** Builds a flat tree from the old `f.`/`fa.` list. */
export function filterGroupFromConditions(
  conditions: readonly GridFilterCondition[],
  connective: GridFilterConnective = "all",
): GridFilterGroup {
  return createFilterGroup(
    connective,
    conditions.map((condition) => conditionNode(condition)),
  )
}

// ---------------------------------------------------------------------------
// Wire shape
// ---------------------------------------------------------------------------

/**
 * The JSON written into `fg`, deliberately the same shape Airtable sends in
 * `filters`: `{ conjunction: "and" | "or", filterSet: [...] }`, with nested
 * groups carrying `type: "nested"`.
 *
 * IDs are Airtable's stable handles for drag/drop. This grid does not reorder
 * conditions (a same-level reorder cannot change the result of an AND/OR set),
 * so it does not need them, and leaving them out keeps shareable URLs shorter.
 */
export interface SerializedFilterGroup {
  conjunction: "and" | "or"
  filterSet: SerializedFilterNode[]
}

export type SerializedFilterNode =
  | { type: "nested"; conjunction: "and" | "or"; filterSet: SerializedFilterNode[] }
  | { columnId: string; operator: string; value: string | string[] }

function toWireConnective(connective: GridFilterConnective): "and" | "or" {
  return connective === "any" ? "or" : "and"
}

function fromWireConnective(value: unknown): GridFilterConnective {
  return value === "or" ? "any" : "all"
}

export function filterGroupToSerialized(group: GridFilterGroup): SerializedFilterGroup {
  const filterSet: SerializedFilterNode[] = group.children.map((node) => {
    if (node.type === "group") {
      return {
        type: "nested",
        conjunction: toWireConnective(node.group.connective),
        filterSet: filterGroupToSerialized(node.group).filterSet,
      }
    }

    return {
      columnId: node.condition.columnId,
      operator: node.condition.operator,
      value: node.condition.value,
    }
  })

  return { conjunction: toWireConnective(group.connective), filterSet }
}

/**
 * The key a mirror uses to decide whether the committed value has caught up.
 *
 * Built from `encodeCondition`, not from the raw value, because the flat URL
 * codec normalizes `[]` and `""` for a single-valued select (`is:` is the same
 * token either way) and the mirror must treat that round trip as the same value.
 * A raw-list key would make the mirror decide its own write never landed and
 * leave `Clear all` and Back showing rows the URL had already thrown away.
 */
export function filterGroupKey(group: GridFilterGroup): string {
  return JSON.stringify(keyOfGroup(group))
}

function keyOfGroup(group: GridFilterGroup): unknown {
  return [
    group.connective,
    group.children.map((node) =>
      node.type === "group"
        ? ["g", keyOfGroup(node.group)]
        : ["c", node.condition.columnId, encodeCondition(node.condition)],
    ),
  ]
}

function readValue(value: unknown): string | string[] | null {
  if (value === null || value === undefined) {
    return ""
  }

  if (Array.isArray(value)) {
    return value.map((entry) => String(entry ?? ""))
  }

  if (typeof value === "string") {
    return value
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }

  // Airtable's date values are objects (`{ mode, exactDate, timeZone }`). This
  // grid stores dates as the ISO string its own picker writes, so an object
  // that is not a string is not a value this codec can round-trip.
  return null
}

function parseGroup(
  raw: unknown,
  depth: number,
  knownColumns: ReadonlySet<string>,
  fieldTypes: Readonly<Record<string, GridFieldType | undefined>>,
  seenColumns: Set<string>,
): GridFilterGroup | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null
  }

  const candidate = raw as { conjunction?: unknown; filterSet?: unknown }

  if (!Array.isArray(candidate.filterSet)) {
    return null
  }

  const children: GridFilterNode[] = []

  for (const entry of candidate.filterSet) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      continue
    }

    const node = entry as {
      type?: unknown
      columnId?: unknown
      operator?: unknown
      value?: unknown
      filterSet?: unknown
      conjunction?: unknown
    }

    const isNested = node.type === "nested" || Array.isArray(node.filterSet)

    if (isNested) {
      if (depth >= GRID_FILTER_MAX_GROUP_DEPTH) {
        continue
      }

      const nested = parseGroup(node, depth + 1, knownColumns, fieldTypes, seenColumns)

      if (nested) {
        children.push(groupNode(nested))
      }

      continue
    }

    const columnId = typeof node.columnId === "string" ? node.columnId : ""
    const operator = typeof node.operator === "string" ? node.operator : ""

    if (columnId.length === 0 || operator.length === 0) {
      continue
    }

    // A column with no `fieldType` is not filterable in this grid, so a shared
    // `fg` that names one is dropped rather than evaluated with text semantics
    // the rest of the surface cannot produce.
    if (!knownColumns.has(columnId) || !fieldTypes[columnId] || seenColumns.has(columnId)) {
      continue
    }

    if (!findFilterOperator(fieldTypes[columnId], operator)) {
      continue
    }

    const value = readValue(node.value)

    if (value === null) {
      continue
    }

    seenColumns.add(columnId)
    children.push(conditionNode({ columnId, operator, value }))
  }

  return createFilterGroup(fromWireConnective(candidate.conjunction), children)
}

/**
 * Reads the `fg` query value. Returns `null` when the value is absent, too
 * large, not JSON, or not a group — in which case the caller falls back to the
 * flat `f.`/`fa.` keys exactly as before.
 */
export function parseFilterTreeJson(
  raw: string | null,
  knownColumns: ReadonlySet<string>,
  fieldTypes: Readonly<Record<string, GridFieldType | undefined>>,
): GridFilterGroup | null {
  if (raw === null || raw.length === 0 || raw.length > 32_768) {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(raw)

    return parseGroup(parsed, 0, knownColumns, fieldTypes, new Set<string>())
  } catch {
    return null
  }
}
