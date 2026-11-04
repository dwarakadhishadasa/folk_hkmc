/**
 * The grid's filter functions, extracted from `grid.tsx` so a second primitive
 * can reuse them without importing the table.
 *
 * `grid.tsx` re-exports these, so the public surface under `@/components/grid`
 * is unchanged. They live here because they are pure functions over a TanStack
 * `Row` — no React, no table, no DOM, no dnd-kit, no virtualizer — and the
 * record-review primitive needs exactly the same global and per-column
 * semantics. Importing them from `grid.tsx` would have pulled the whole table
 * into the record review's bundle for three functions that are twenty lines in
 * total.
 *
 * The semantics are the grid's, unchanged:
 *
 * - the global filter is a normalized substring test, applied once per
 *   globally-filterable leaf column and ORed by TanStack;
 * - every filterable column resolves through the same condition evaluation, so
 *   the operator travels inside the condition rather than beside it.
 *
 * This is the FLAT path: `Grid` hands TanStack one column filter per leaf when
 * the tree is a flat all-of list. A nested group or a match-any root cannot be
 * expressed as an AND chain, so those trees are evaluated by
 * `evaluateFilterGroup` in `grid-filter-tree.ts` instead.
 */

import type { Row, RowData } from "@tanstack/react-table"

import { evaluateCondition, type GridFilterCondition } from "@/components/grid/grid-filter-operators"
import type { GridFieldType } from "@/components/grid/grid-types"

/** Trim + casefold. One normalization, shared by the global and per-column paths. */
export function normalizeFilterValue(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
}

/**
 * The grid's global filter.
 *
 * TanStack applies the global filter function once per globally-filterable leaf
 * column and ORs the results, so this returns a normalized substring test for
 * the column it was handed and the caller unions them. Supplying it explicitly
 * rather than relying on `'auto'` keeps the behaviour independent of which
 * built-in `getGlobalAutoFilterFn` the installed version resolves to, and keeps
 * the normalization (trim + casefold) in one place that per-column filters share.
 */
export function gridGlobalFilterFn<TData extends RowData>(
  row: Row<TData>,
  columnId: string,
  value: unknown,
): boolean {
  const needle = normalizeFilterValue(value)

  if (needle.length === 0) {
    return true
  }

  const cellValue = row.getValue(columnId)

  if (Array.isArray(cellValue)) {
    return cellValue.some((entry) => normalizeFilterValue(entry).includes(needle))
  }

  return normalizeFilterValue(cellValue).includes(needle)
}

/**
 * Builds a column's filter fn. Every filterable column resolves through this and
 * no longer chooses its own comparison — the operator travels inside the
 * condition, so the comparison is decided by the condition, not the column.
 *
 * The field type is bound here rather than read off the row per row: `Row` does
 * not expose its column, and a per-row lookup to reach one would be a map access
 * on the hottest path in the table for a value that never changes.
 */
export function gridConditionFilter<TData extends RowData>(
  fieldType: GridFieldType | undefined,
): (row: Row<TData>, columnId: string, value: unknown) => boolean {
  return (row, columnId, value) => {
    const condition = value as GridFilterCondition | undefined

    if (!condition || typeof condition.operator !== "string") {
      return true
    }

    return evaluateCondition(row.getValue(columnId), condition, fieldType)
  }
}
