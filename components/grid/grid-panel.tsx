"use client"

import type { ReactNode } from "react"
import { Inbox, RefreshCw, SearchX, TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import type { GridDensity, GridPanelState } from "@/components/grid/grid-types"
import { GRID_ROW_HEIGHT, GRID_SKELETON_ROWS } from "@/components/grid/grid-row"

const PANEL_MIN_HEIGHT = 232

/** Panel cells span the grid but stay pinned to the left edge while scrolled right. */
const PANEL_CELL_CLASS = "sticky left-0 z-10 border-b border-border bg-card p-0 align-top"

/**
 * A single marker for whichever variant is on screen, so the two empty flavours
 * stay distinguishable from each other and from the other three states.
 */
export function gridPanelKey(state: GridPanelState): string {
  return state.kind === "empty" ? `empty:${state.reason}` : state.kind
}

export interface GridPanelProps {
  state: GridPanelState
  density: GridDensity
  /** Visible leaf column count, used as the panel cells' colspan. */
  columnCount: number
  /** Clears `q`, `f.*` and `sort` from the URL. */
  onClearFilters?: () => void
  /** Replaces the default Clear-filters action in the filtered-empty variant. */
  emptyContent?: ReactNode
}

/**
 * CAP-9 rendered as a switch over a discriminated union, so "loading, empty and
 * error are each visually distinct" is a property of the types rather than of
 * three class strings kept apart by hand.
 *
 * Every variant renders inside the live grid frame, so the sticky header stays
 * visible while loading. A blank surface reads as broken, which is the whole
 * reason CAP-9 is P0. `ready` renders nothing: those rows are virtualized, and
 * grid.tsx emits their marker on the `<tbody>`.
 */
export function GridPanel({
  state,
  density,
  columnCount,
  onClearFilters,
  emptyContent,
}: GridPanelProps) {
  const rowHeight = GRID_ROW_HEIGHT[density]
  const colspan = Math.max(columnCount, 1)

  switch (state.kind) {
    case "ready":
      return null

    case "loading":
      return (
        <>
          {Array.from({ length: GRID_SKELETON_ROWS }, (_, index) => (
            <tr key={`grid-skeleton-${index}`} style={{ height: rowHeight }} aria-hidden="true">
              <td className={PANEL_CELL_CLASS} colSpan={colspan}>
                <Skeleton className="h-3 w-full max-w-[70%] rounded-[3px]" />
              </td>
            </tr>
          ))}
        </>
      )

    case "error":
      return (
        <tr style={{ height: PANEL_MIN_HEIGHT }}>
          <td className={PANEL_CELL_CLASS} colSpan={colspan}>
            <Empty className="gap-4 rounded-md border-0 p-8" role="alert">
              <EmptyHeader>
                <EmptyMedia variant="icon" className="bg-destructive/10 text-destructive">
                  <TriangleAlert aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle className="text-[13px] text-destructive">Could not load this table</EmptyTitle>
                <EmptyDescription className="text-[13px]">{state.message}</EmptyDescription>
              </EmptyHeader>
              {state.onRetry ? (
                <EmptyContent>
                  <Button type="button" variant="ghost" className="border" onClick={state.onRetry}>
                    <RefreshCw aria-hidden="true" />
                    Try again
                  </Button>
                </EmptyContent>
              ) : null}
            </Empty>
          </td>
        </tr>
      )

    case "empty":
      return state.reason === "no-records" ? (
        <tr style={{ height: PANEL_MIN_HEIGHT }}>
          <td className={PANEL_CELL_CLASS} colSpan={colspan}>
            <Empty className="gap-4 rounded-md border-0 p-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Inbox aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle className="text-[13px]">No records</EmptyTitle>
                <EmptyDescription className="text-[13px]">
                  Nothing is in scope for this table yet.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </td>
        </tr>
      ) : (
        <tr style={{ height: PANEL_MIN_HEIGHT }}>
          <td className={PANEL_CELL_CLASS} colSpan={colspan}>
            <Empty className="gap-4 rounded-md border-0 p-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchX aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle className="text-[13px]">No rows match the current filters</EmptyTitle>
                <EmptyDescription className="text-[13px]">
                  Narrow the search, clear a column filter, or reset the arrangement.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                {emptyContent ??
                  (onClearFilters ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="border"
                      onClick={onClearFilters}
                    >
                      Clear filters
                    </Button>
                  ) : null)}
              </EmptyContent>
            </Empty>
          </td>
        </tr>
      )
  }
}
