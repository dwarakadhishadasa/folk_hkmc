"use client"

import { useState } from "react"
import type { ReactNode } from "react"
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Filter,
  MoreHorizontal,
  MoveLeft,
  MoveRight,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { GRID_BASE_FONT_CLASS } from "@/components/grid/grid-row"
import { useUrlBackedDraft } from "@/components/grid/use-grid-view-state"

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
  onSortToggle: () => void
  filterKind: "text" | "number" | null
  filterValue: string
  onFilterChange: (value: string) => void
  canHide: boolean
  canMoveLeft: boolean
  canMoveRight: boolean
  onMoveLeft: () => void
  onMoveRight: () => void
  onHide: () => void
  /** `Header.getResizeHandler()`, attached to mouse and touch start. */
  resizeHandler: (event: unknown) => void
  /**
   * The consumer's own `columnDef.header` output, when it supplied one — a
   * select-all control, typically. Supplying it turns the cell into a plain
   * container: sort, filter, column menu and resize are suppressed, because a
   * header that is a control must not also be a sort button.
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

interface GridColumnFilterInputProps {
  columnId: string
  label: string
  kind: "text" | "number"
  value: string
  onChange: (value: string) => void
}

/**
 * The per-column filter text. The field keeps an in-flight draft; see
 * `useUrlBackedDraft` for why it is not bound straight to the URL.
 */
function GridColumnFilterInput({ columnId, label, kind, value, onChange }: GridColumnFilterInputProps) {
  const [focused, setFocused] = useState(false)
  const [draft, handleChange] = useUrlBackedDraft(value, onChange, focused)

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={`grid-filter-${columnId}`} className="text-muted-foreground text-[13px] font-medium">
        Filter {label}
      </label>
      <Input
        id={`grid-filter-${columnId}`}
        value={draft}
        onFocus={() => {
          setFocused(true)
        }}
        onBlur={() => {
          setFocused(false)
        }}
        onChange={(event) => handleChange(event.target.value)}
        placeholder={kind === "number" ? "Minimum value" : "Contains…"}
        inputMode={kind === "number" ? "numeric" : "text"}
        className="h-8 text-[13px]"
      />
      <p className="text-muted-foreground text-xs">
        {kind === "number" ? "Keeps rows at or above this value." : "Keeps rows containing this text."}
      </p>
    </div>
  )
}

/**
 * Sticky header cell: sortable label, per-column filter popover, column menu and
 * resize handle — or, when `render` is supplied, just the consumer's node.
 *
 * Column order moves through Move left / Move right rather than drag-and-drop:
 * it is deterministic, keyboard-operable, and serializes straight to `cols`
 * with no new dependency.
 */
export function GridHeaderCell({
  label,
  columnId,
  width,
  rowHeight,
  stickyLeft,
  sortDirection,
  isSortable,
  onSortToggle,
  filterKind,
  filterValue,
  onFilterChange,
  canHide,
  canMoveLeft,
  canMoveRight,
  onMoveLeft,
  onMoveRight,
  onHide,
  resizeHandler,
  render,
}: GridHeaderCellProps) {
  const isFrozen = stickyLeft !== null
  const hasCustomHeader = render !== undefined && render !== null
  const isFiltered = filterKind !== null && filterValue.trim().length > 0
  const ariaSort = sortDirection === "asc" ? "ascending" : sortDirection === "desc" ? "descending" : "none"

  return (
    <th
      scope="col"
      data-grid-column={columnId}
      aria-sort={ariaSort}
      style={{ width, height: rowHeight, left: stickyLeft ?? undefined }}
      className={cn(
        GRID_BASE_FONT_CLASS,
        "bg-card text-muted-foreground sticky top-0 border-b border-r border-border p-0 font-medium",
        isFrozen ? "z-30" : "z-20",
      )}
    >
      {hasCustomHeader ? (
        <div className="flex h-full items-center justify-center px-1">{render}</div>
      ) : (
        <>
          <div className="flex h-full items-center gap-0.5 px-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!isSortable}
              onClick={onSortToggle}
              aria-label={`Sort by ${label}`}
              className={cn(
                "h-6 min-w-0 flex-1 justify-start gap-1 px-1 text-[13px] font-medium",
                sortDirection && "text-foreground",
              )}
            >
              <span className="truncate">{label}</span>
              {isSortable ? <SortIndicator direction={sortDirection} /> : null}
            </Button>

            {filterKind !== null ? (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-6"
                    aria-label={isFiltered ? `Edit filter for ${label}` : `Filter ${label}`}
                  >
                    <Filter
                      aria-hidden="true"
                      className={cn("size-3.5", isFiltered ? "text-foreground" : "opacity-50")}
                    />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-64 p-3">
                  <GridColumnFilterInput
                    columnId={columnId}
                    label={label}
                    kind={filterKind}
                    value={filterValue}
                    onChange={onFilterChange}
                  />
                </PopoverContent>
              </Popover>
            ) : null}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-6"
                  aria-label={`Column options for ${label}`}
                >
                  <MoreHorizontal aria-hidden="true" className="size-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuItem disabled={!canMoveLeft} onSelect={onMoveLeft}>
                  <MoveLeft aria-hidden="true" />
                  Move left
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canMoveRight} onSelect={onMoveRight}>
                  <MoveRight aria-hidden="true" />
                  Move right
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={!canHide} onSelect={onHide}>
                  Hide column
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
