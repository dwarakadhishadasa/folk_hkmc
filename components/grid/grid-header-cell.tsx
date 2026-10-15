"use client"

import { useState } from "react"
import type { ReactNode } from "react"
import { useDraggable, useDroppable } from "@dnd-kit/core"
import type { SortingState } from "@tanstack/react-table"
import {
  ArrowDown,
  ArrowDownWideNarrow,
  ArrowUp,
  ArrowUpNarrowWide,
  ChevronsUpDown,
  ListFilter,
  MoreHorizontal,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { GRID_BASE_FONT_CLASS } from "@/components/grid/grid-row"
import { GridSortPopover, type GridSortField } from "@/components/grid/grid-sort-popover"

export interface GridHeaderCellProps {
  label: string
  columnId: string
  width: number
  /** Height of the header row; matches the body row height for a tight grid. */
  rowHeight: number
  /** `left` offset inside the pinned run, or null when the column scrolls away. */
  stickyLeft: number | null
  sortDirection: "asc" | "desc" | false
  isSortable: boolean
  canHide: boolean
  onHide: () => void
  /**
   * Opens the ONE toolbar-anchored filter popover with this column's condition
   * pre-filled. It deliberately does not open a popover of its own: the thirteen
   * per-column funnels this replaces must not come back.
   */
  onFilter: (columnId: string) => void
  /**
   * Whether this header carries a drag activator. False for every column in
   * the pinned run: a pinned column is not draggable — no handle, no
   * activator — because moving it would undo the reason the run exists.
   */
  canDrag: boolean
  /**
   * Whether the menu control is withheld. True for the selection column; a
   * header supplying its own control (`render`) never reaches the menu at all.
   */
  suppressMenu: boolean
  /** Sortable columns for the sort popover's field dropdown. */
  sortableColumns: readonly GridSortField[]
  /** The grid's live sorting, shared with the sort popover. */
  sorting: SortingState
  onSortingChange: (sorting: SortingState) => void
  /** `Header.getResizeHandler()`, attached to mouse and touch start. */
  resizeHandler: (event: unknown) => void
  /**
   * The consumer's own `columnDef.header` output, when it supplied one — a
   * select-all control, typically. Supplying it turns the cell into a plain
   * container: column menu and resize are suppressed, because a header that is
   * a control must not also be a sort button.
   */
  render?: ReactNode
}

function SortIndicator({ direction }: { direction: "asc" | "desc" | false }) {
  if (direction === "asc") {
    return <ArrowUp aria-hidden="true" className="size-3.5" />
  }

  if (direction === "desc") {
    return <ArrowDown aria-hidden="true" className="size-3.5" />
  }

  return <ChevronsUpDown aria-hidden="true" className="size-3.5 opacity-40" />
}

/**
 * Sticky header cell: label, sort indicator, column menu and resize handle —
 * or, when `render` is supplied, just the consumer's node.
 *
 * Column order moves by drag-and-drop via `@dnd-kit/core` (pointer, touch and
 * keyboard sensors, committed once on drop through the transient handle — see
 * `grid.tsx`). The label is deliberately not a sort button: sorting lives in the
 * one global sort popover, opened from this menu's two sort items and from the
 * toolbar's Sort control, so a header is never both a control and a sort button.
 *
 * The menu control reveals on hover and keyboard focus through an
 * opacity treatment that leaves it focusable and tappable at rest — never
 * `display:none`, which would lock touch users out of a header with no hover.
 */
export function GridHeaderCell({
  label,
  columnId,
  width,
  rowHeight,
  stickyLeft,
  sortDirection,
  isSortable,
  canHide,
  onHide,
  onFilter,
  canDrag,
  suppressMenu,
  sortableColumns,
  sorting,
  onSortingChange,
  resizeHandler,
  render,
}: GridHeaderCellProps) {
  const isFrozen = stickyLeft !== null
  const hasCustomHeader = render !== undefined && render !== null
  const showMenu = !hasCustomHeader && !suppressMenu
  const ariaSort = sortDirection === "asc" ? "ascending" : sortDirection === "desc" ? "descending" : "none"

  const [sortPopoverOpen, setSortPopoverOpen] = useState(false)

  // Called under `DndContext` (see `grid.tsx`); disabled — never absent — for
  // pinned columns and custom headers, so hook order stays stable.
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: columnId,
    disabled: !canDrag || hasCustomHeader,
  })
  const { setNodeRef: setDropRef } = useDroppable({
    id: columnId,
    disabled: hasCustomHeader,
  })

  const openSortPopover = (direction: "asc" | "desc") => {
    // The menu item both applies and prefills: the popover then shows exactly
    // what the grid is doing, and its selects adjust from there.
    onSortingChange([{ id: columnId, desc: direction === "desc" }])
    // Deferred past the menu's close, which returns focus into the closing
    // menu and then to its trigger — both outside this popover. Opening on the
    // next frame lets that settle before the popover mounts; the popover's own
    // `onFocusOutside` prevention (see `grid-sort-popover.tsx`) covers the
    // stragglers, so the surface survives its own entry instead of flashing
    // open and vanishing with the sort applied but unreachable.
    requestAnimationFrame(() => {
      setSortPopoverOpen(true)
    })
  }

  return (
    <th
      ref={hasCustomHeader ? undefined : setDropRef}
      scope="col"
      data-grid-column={columnId}
      aria-sort={ariaSort}
      style={{
        width,
        height: rowHeight,
        left: stickyLeft ?? undefined,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      }}
      className={cn(
        GRID_BASE_FONT_CLASS,
        // `bg-muted`, not the body's `bg-card`: the header row was the same
        // surface as the data, so the sticky row had nothing to read against
        // while the body scrolled under it. Token-only — a comparison of two
        // elements' computed backgrounds is what a spec asserts, never a hex.
        "bg-muted text-muted-foreground sticky top-0 border-b border-r border-border p-0 font-medium",
        isFrozen ? "z-30" : "z-20",
        isDragging && "z-40 opacity-80",
      )}
    >
      {hasCustomHeader ? (
        <div className="flex h-full items-center justify-center px-1">{render}</div>
      ) : (
        <>
          <div className="group relative flex h-full items-center gap-0.5 px-1">
            {canDrag ? (
              <span
                ref={setNodeRef}
                {...attributes}
                {...listeners}
                role="button"
                tabIndex={0}
                aria-label={`Drag to reorder ${label}`}
                data-grid-drag-handle={columnId}
                className="flex h-6 min-w-0 flex-1 cursor-grab items-center gap-1 rounded-sm px-1 text-[13px] font-medium outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring/50 active:cursor-grabbing"
              >
                <span className="truncate">{label}</span>
                <SortIndicator direction={sortDirection} />
              </span>
            ) : (
              <span className="flex h-6 min-w-0 flex-1 items-center gap-1 px-1 text-[13px] font-medium">
                <span className="truncate">{label}</span>
                <SortIndicator direction={sortDirection} />
              </span>
            )}

            {showMenu ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Column options for ${label}`}
                    className="size-6 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                  >
                    <MoreHorizontal aria-hidden="true" className="size-3.5 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44">
                  <DropdownMenuItem disabled={!isSortable} onSelect={() => openSortPopover("asc")}>
                    <ArrowUpNarrowWide aria-hidden="true" />
                    Sort ascending
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={!isSortable} onSelect={() => openSortPopover("desc")}>
                    <ArrowDownWideNarrow aria-hidden="true" />
                    Sort descending
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled={!canHide} onSelect={onHide}>
                    Hide column
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onFilter(columnId)}>
                    <ListFilter aria-hidden="true" />
                    Filter
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}

            {showMenu ? (
              <GridSortPopover
                open={sortPopoverOpen}
                onOpenChange={setSortPopoverOpen}
                anchor={<span aria-hidden="true" className="absolute bottom-0 left-0 size-0" />}
                fields={sortableColumns}
                sorting={sorting}
                onSortingChange={onSortingChange}
              />
            ) : null}
          </div>

          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={`Resize ${label}`}
            onMouseDown={resizeHandler}
            onTouchStart={resizeHandler}
            className="border-ring/40 hover:bg-ring/60 absolute right-0 top-0 h-full w-1 cursor-col-resize touch-none border-l bg-transparent select-none"
          />
        </>
      )}
    </th>
  )
}
