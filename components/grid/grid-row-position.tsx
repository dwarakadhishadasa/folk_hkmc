"use client"

import { createContext, useContext } from "react"

/**
 * The row's 1-based position **in the current view** — the number the gutter
 * shows.
 *
 * It has to come from the grid rather than from the row: TanStack's
 * `row.index` is the index in the original data and survives sorting, so a
 * sorted grid numbered from it reads 1, 5, 9. What the operator expects — and
 * what the source product does — is 1..N over whatever is on screen, which is
 * the virtual row's index into the sorted, filtered row model.
 *
 * The source product's sort is a view setting (`applySorts` writes the view's
 * sort spec, not the records), so its row numbers are positions in that view
 * rather than stored ranks. Ours sorts the same way — a URL-level view
 * setting — so the numbers are derived the same way.
 */
export const GridRowPositionContext = createContext<number | null>(null)

export function useGridRowPosition(): number | null {
  return useContext(GridRowPositionContext)
}
