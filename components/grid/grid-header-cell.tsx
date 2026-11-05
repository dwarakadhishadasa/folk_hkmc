"use client"

import { useState } from "react"
import type { ReactNode } from "react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import type { SortingState } from "@tanstack/react-table"
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
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
import { resolveGridFieldIcon } from "@/components/grid/grid-field-icons"
import { GridSortPopover, type GridSortField } from "@/components/grid/grid-sort-popover"
import type { GridFieldType } from "@/components/grid/grid-types"

export interface GridHeaderCellProps {
  label: string
  columnId: string
  /**
   * The column's declared `meta.grid.fieldType`, which is what decides the glyph
   * in front of the label. Absent for a column that is a control rather than a
   * field — the selection column, a favourite star, the row actions — and those
   * correctly render no icon.
   *
   * The glyph itself is resolved by `grid-field-icons.ts`, so this component never
   * names one; that module is the whole of the icon surface.
   */
  fieldType?: GridFieldType
  /**
   * The cell's rendered width in px, which is `column.getSize()` scaled by the
   * frame's stretch — so it is *not* the size a resize drag writes, and reading
   * it as one would make the boundary jump the moment the frame width changed.
   * `resolveColumnLayout` in `grid.tsx` is the only thing that computes it.
   */
  width: number
  /**
   * True for the last visible column, which drops its own right divider — the
   * frame's border is the edge there, and a second line just inside it reads as
   * a doubled edge. Nothing else about it is special: its width is a share of
   * the frame's slack like every other column's, which is the point.
   */
  isLast?: boolean
  /** Height of the header row; matches the body row height for a tight grid. */
  rowHeight: number
  /**
   * `left` offset inside the pinned run, in px, or null when the column scrolls
   * away. Summed from the rendered widths, so the run stays flush with the
   * columns to its right however far the frame is stretching them.
   */
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

/**
 * Sticky header cell: label, column menu and resize handle — or, when `render`
 * is supplied, just the consumer's node.
 *
 * Column order moves by drag-and-drop via `@dnd-kit/core` (pointer, touch and
 * keyboard sensors, committed once on drop through the transient handle — see
 * `grid.tsx`). The label is deliberately not a sort button and carries no
 * sort icon: sorting lives in the one global sort popover, opened from this
 * menu's two sort items and from the toolbar's Sort control, and `aria-sort`
 * on the cell keeps the state exposed to assistive tech — so a header is
 * never both a control and a sort button.
 *
 * The menu control reveals on hover and keyboard focus through an
 * opacity treatment that leaves it focusable and tappable at rest — never
 * `display:none`, which would lock touch users out of a header with no hover.
 */
export function GridHeaderCell({
  label,
  columnId,
  fieldType,
  width,
  isLast = false,
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
  /*
   * Sortable, not a bare draggable/droppable pair: the example this matches
   * slides the neighbours out of the way while the column is in hand, which
   * needs the strategy's per-item transform. The drop still resolves through
   * `resolveColumnDropOrder`, so the commit and the preview agree.
   */
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: columnId,
    disabled: !canDrag || hasCustomHeader,
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
      ref={setNodeRef}
      scope="col"
      data-grid-column={columnId}
      // The same attribute `grid-row.tsx` puts on every body cell, so a column's
      // declared type is readable off its header and its cells by one selector —
      // and a header that declares none (a control column) is absent from
      // `[data-grid-field-type]` rather than present with an empty value.
      data-grid-field-type={fieldType}
      // Mirrors the row cell's `data-grid-frozen` (`grid-row.tsx`): the same
      // pinned region, marked on the same rule, so the pinned region's laid-out
      // width is addressable from the header rather than inferred from column
      // sizes that are not what is on screen.
      data-grid-frozen={stickyLeft === null ? undefined : "true"}
      aria-sort={ariaSort}
      style={{
        width,
        height: rowHeight,
        left: stickyLeft ?? undefined,
        // The source example's header style, minus `position: relative` and
        // an inline `zIndex`: our header is `sticky` and layer-ordered by
        // class, and either would fight the pinned run. `transform` is
        // `CSS.Translate` (translate3d) exactly as the example builds it.
        opacity: isDragging ? 0.8 : 1,
        transform: CSS.Translate.toString(transform),
        // The example animates `width` too, because resizing there is a
        // discrete commit. Ours writes a width per pointer frame, so animating
        // it would make every resize lag the pointer; the slide is what the
        // drag is for.
        transition: isDragging ? undefined : (transition ?? "transform 0.2s ease-in-out"),
        whiteSpace: "nowrap",
      }}
      className={cn(
        GRID_BASE_FONT_CLASS,
        // `bg-muted`, not the body's `bg-card`: the header row was the same
        // surface as the data, so the sticky row had nothing to read against
        // while the body scrolled under it. Token-only — a comparison of two
        // elements' computed backgrounds is what a spec asserts, never a hex.
        //
        // `text-foreground` rather than `text-muted-foreground`: the header is the
        // one row that has to be read *while* a body row slides under it, so it
        // carries the theme's highest-contrast foreground — which is the near-
        // white of the dark canvas and its light-canvas counterpart in light,
        // because a literal light value would be unreadable on `bg-muted` in one
        // of the two themes. The guard bans that literal under this directory
        // anyway, and a theme token is the answer it wants.
        //
        // `font-semibold` for the same reason: the header is a row of *names*,
        // and at 13px against a muted surface the labels needed the extra step to
        // read as a row rather than as a strip of clipped text.
        "bg-muted text-foreground sticky top-0 border-b border-border p-0 font-semibold",
        !isLast && "border-r",
        isFrozen ? "z-30" : "z-20",
        isDragging && "z-40 opacity-80",
      )}
    >
      {hasCustomHeader ? (
        <div className="flex h-full items-center justify-center px-1">{render}</div>
      ) : (
        <>
          <div className="group relative flex h-full items-center gap-0.5 px-1">
            {/*
              The type glyph, ahead of the label and outside the drag activator.

              **Outside it deliberately.** Inside, the icon would be a child of the
              activator whose `aria-label` is "Drag to reorder <label>" — announced
              as part of a control's name, and dragged as though it were the label
              rather than the thing being dragged. As a sibling it is decoration,
              and the glyph itself is `aria-hidden`: the field type is announced
              through the column's own affordances, and a glyph has no accessible
              name worth having.
            */}
            {resolveGridFieldIcon(fieldType)}

            {canDrag ? (
              <span
                // The activator is the label, not the item: `setNodeRef` on the
                // `<th>` is what moves, and giving the same node both refs would
                // slide the label out of its own cell.
                ref={setActivatorNodeRef}
                {...attributes}
                {...listeners}
                role="button"
                tabIndex={0}
                aria-label={`Drag to reorder ${label}`}
                data-grid-drag-handle={columnId}
                className="flex h-6 min-w-0 flex-1 cursor-grab items-center rounded-sm px-1 text-[13px] font-medium outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring/50 active:cursor-grabbing"
              >
                <span className="truncate">{label}</span>
              </span>
            ) : (
              <span className="flex h-6 min-w-0 flex-1 items-center px-1 text-[13px] font-medium">
                <span className="truncate">{label}</span>
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
            className="absolute right-0 top-0 h-full w-3 cursor-col-resize touch-none select-none before:absolute before:inset-y-0 before:right-0 before:w-px before:bg-border before:transition-colors hover:before:bg-ring"
          />
        </>
      )}
    </th>
  )
}
