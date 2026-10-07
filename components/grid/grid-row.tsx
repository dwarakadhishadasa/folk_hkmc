"use client"

import type { Row } from "@tanstack/react-table"

import type { GridCellView, GridDensity } from "@/components/grid/grid-types"
import { GRID_EMPTY_TEXT, gridCellKey } from "@/components/grid/use-grid-keyboard"
import { cn } from "@/lib/utils"

/**
 * Design-contract geometry, owned here rather than added to either app's
 * `globals.css`: the two themes already diverge and the grid is shared by both,
 * so a token added to one file would break the other app's build of this
 * component. `text-[13px]` plus inline heights keep both apps byte-identical.
 */
export const GRID_BASE_FONT_CLASS = "text-[13px]"

export const GRID_ROW_HEIGHT: Record<GridDensity, number> = {
  default: 32,
  dense: 28,
}

export const GRID_SKELETON_ROWS = 8

const ALIGN_CLASS: Record<GridCellView["align"], string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
}

export interface GridRowProps<TData> {
  row: Row<TData>
  cells: GridCellView[]
  /** Column id of the frozen first column, or null when nothing is frozen. */
  frozenColumnId: string | null
  density: GridDensity
  isFocused: boolean
  isEditing: boolean
  /** DOM id referenced by the container's `aria-activedescendant`. */
  domId?: string
  onCellPointerDown: (rowId: string, columnId: string) => void
}

/**
 * One virtualized row.
 *
 * Height is fixed at 32px / 28px because the design constraint states those
 * numbers and the virtualizer estimates from them — `measureElement` would let
 * the DOM and the estimate disagree. The consequence is that cells truncate to
 * a single line; a port that needs wrapping must not reintroduce it.
 *
 * Selection is expressed through `data-state="selected"` so a consumer's select
 * column and the `hover`/`selected` idioms from `components/ui/table.tsx` land
 * without re-styling this component.
 */
export function GridRow<TData>({
  row,
  cells,
  frozenColumnId,
  density,
  isFocused,
  isEditing,
  domId,
  onCellPointerDown,
}: GridRowProps<TData>) {
  return (
    <tr
      id={domId}
      data-grid-row={row.id}
      data-state={row.getIsSelected() ? "selected" : undefined}
      data-grid-row-focused={isFocused ? "true" : undefined}
      style={{ height: GRID_ROW_HEIGHT[density] }}
      className={cn(
        GRID_BASE_FONT_CLASS,
        "bg-card transition-colors",
        // The row owns the hairline and the hover/selected surfaces; the sticky
        // frozen cell needs an opaque background of its own to cover what
        // scrolls beneath it, so the states are driven per-cell.
        "[&>td]:border-b [&>td]:border-border",
        "[&>td]:bg-card [&:hover>td]:bg-muted/50",
        "data-[state=selected]:[&>td]:bg-muted",
        isFocused && "[&>td]:bg-muted/40",
        isEditing && "[&>td]:bg-accent/40",
      )}
    >
      {cells.map((cell) => {
        const isFrozen = cell.columnId === frozenColumnId

        return (
          <td
            key={cell.columnId}
            data-grid-cell={gridCellKey(row.id, cell.columnId)}
            tabIndex={-1}
            title={cell.text === GRID_EMPTY_TEXT ? undefined : (cell.error ?? cell.text)}
            onPointerDown={() => onCellPointerDown(row.id, cell.columnId)}
            className={cn(
              "truncate px-2 align-middle text-[13px]",
              ALIGN_CLASS[cell.align],
              cell.tabular && "tabular-nums",
              cell.isFocused && "ring-ring relative z-[5] ring-1 ring-inset",
              cell.error && "text-destructive",
              // 1px divider instead of a scroll shadow, which design-constraints.md bans.
              isFrozen && "sticky left-0 z-10 border-r border-border bg-card",
            )}
          >
            {cell.editing ? (
              <input
                autoFocus
                value={cell.draft}
                onChange={(event) => cell.onDraftChange(event.target.value)}
                onKeyDown={cell.onDraftKeyDown}
                onPointerDown={(event) => event.stopPropagation()}
                aria-label="Edit cell value"
                className="border-ring bg-card focus-visible:ring-ring/50 h-full w-full rounded-[3px] border bg-transparent px-1 text-[13px] outline-none focus-visible:ring-[2px]"
              />
            ) : (
              cell.text
            )}
          </td>
        )
      })}
    </tr>
  )
}
