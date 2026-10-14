"use client"

import { useState } from "react"
import type { ReactNode } from "react"
import { Columns3, ListFilter, Search, X } from 'lucide-react'

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { GridDensity } from "@/components/grid/grid-types"
import { GRID_BASE_FONT_CLASS, GRID_DENSITY_OPTIONS } from "@/components/grid/grid-row"
import { useUrlBackedDraft } from "@/components/grid/use-grid-view-state"
import { GridFilterPopover, type GridFilterField } from "@/components/grid/grid-filter-popover"
import type { GridFilterCondition, GridFilterConnective } from "@/components/grid/grid-filter-operators"

export interface GridToolbarColumn {
  id: string
  label: string
  visible: boolean
}

export interface GridToolbarProps {
  columns: GridToolbarColumn[]
  onColumnVisibilityChange: (columnId: string, visible: boolean) => void
  globalFilter: string
  onGlobalFilterChange: (value: string) => void
  density: GridDensity
  onDensityChange: (density: GridDensity) => void
  /** Rows currently passing filters, and rows in the source set. */
  visibleCount: number
  totalCount: number
  /** Ids of the pinned columns, so none can be hidden out from under itself. */
  frozenColumnIds: readonly string[]
  /** Every column a condition may name, with the type that picks its operators. */
  filterFields: readonly GridFilterField[]
  conditions: readonly GridFilterCondition[]
  onConditionsChange: (conditions: GridFilterCondition[]) => void
  filterConnective: GridFilterConnective
  onFilterConnectiveChange: (connective: GridFilterConnective) => void
  /**
   * Open state lives in `Grid`, not here, because the column menu's Filter item
   * opens this same popover. Local state would give the menu no way in.
   */
  filterOpen: boolean
  onFilterOpenChange: (open: boolean) => void
  /**
   * The grid's own row-lifecycle affordance, rendered immediately before
   * `toolbarExtra` so a consumer's bulk-action chrome sits beside it rather than
   * in a second band above the table.
   */
  rowAction?: ReactNode
  /**
   * Consumer chrome rendered between the density control and the row count.
   * A selection-aware action surface belongs in the grid's own chrome rather
   * than in a second band above it, so the two never disagree about layout.
   */
  toolbarExtra?: ReactNode
}

/**
 * Grid-level controls. Density is a controlled prop pair rather than URL state
 * on purpose: the URL contract names sort, filters, order, visibility and size,
 * and inventing a seventh key would be a contract nobody asked for.
 *
 * The search box holds an in-flight draft rather than reading the URL directly;
 * see `useUrlBackedDraft` for why, and for how Back and a shared link still
 * update the field.
 */
export function GridToolbar({
  columns,
  onColumnVisibilityChange,
  globalFilter,
  onGlobalFilterChange,
  density,
  onDensityChange,
  visibleCount,
  totalCount,
  frozenColumnIds,
  filterFields,
  conditions,
  onConditionsChange,
  filterConnective,
  onFilterConnectiveChange,
  filterOpen,
  onFilterOpenChange,
  rowAction,
  toolbarExtra,
}: GridToolbarProps) {
  const [searchFocused, setSearchFocused] = useState(false)
  const [draft, handleGlobalFilterChange] = useUrlBackedDraft(
    globalFilter,
    onGlobalFilterChange,
    searchFocused,
  )
  // ONE indicator, naming the columns it is filtering, in saffron. There is
  // deliberately no second indicator on the affected headers: that rule came from
  // the withdrawn inline bar, whose toolbar could only show a count, and it went
  // with it. A permanently visible per-column funnel is separately forbidden.
  const indicator = columns
    .filter((column) => conditions.some((condition) => condition.columnId === column.id))
    .map((column) => column.label)
    .join(", ")

  return (
    <div
      data-grid-toolbar=""
      // `shrink-0` because the frame is a bounded flex column now: a flex item
      // defaults to `flex-shrink: 1`, so a short row set would otherwise
      // compress the toolbar's own controls instead of the scroll container
      // giving up the space.
      className={`${GRID_BASE_FONT_CLASS} bg-card flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-2 py-1.5`}
    >
      <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
        <Search
          aria-hidden="true"
          className="text-muted-foreground pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2"
        />
        <Input
          type="search"
          value={draft}
          onFocus={() => {
            setSearchFocused(true)
          }}
          onBlur={() => {
            setSearchFocused(false)
          }}
          onChange={(event) => handleGlobalFilterChange(event.target.value)}
          placeholder="Search every column"
          aria-label="Search every column"
          className="h-7 pl-7 pr-7 text-[13px]"
        />
        {draft.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute right-0.5 top-0.5 size-6"
            onClick={() => handleGlobalFilterChange("")}
            aria-label="Clear search"
          >
            <X aria-hidden="true" className="size-3.5" />
          </Button>
        ) : null}
      </div>

      <GridFilterPopover
        open={filterOpen}
        onOpenChange={onFilterOpenChange}
        fields={filterFields}
        conditions={conditions}
        connective={filterConnective}
        onConditionsChange={onConditionsChange}
        onConnectiveChange={onFilterConnectiveChange}
        anchor={
          <Button
            type="button"
            variant="outline"
            aria-label={indicator ? `Filter conditions. Filtered by ${indicator}` : "Filter conditions"}
            aria-expanded={filterOpen}
            data-grid-filter-control=""
            // `hover:bg-muted` rather than the `outline` variant's default
            // `hover:bg-accent`: this design system's `--accent` IS saffron, so
            // the default hover repaints the button in the same colour as the
            // indicator text and the label vanishes. The composition hovers
            // neutral (`hover:bg-slate-50`), and `visual-design.md:80` sends
            // slate-50 to `--muted` anyway.
            className="hover:bg-muted hover:text-foreground h-7 gap-1.5 rounded-md px-2 text-[13px] font-medium"
          >
            <ListFilter
              aria-hidden="true"
              className={`size-3.5 ${indicator ? "text-saffron" : "text-muted-foreground"}`}
            />
            {indicator ? (
              <span className="text-saffron font-semibold">Filtered by {indicator}</span>
            ) : (
              <span>Filter</span>
            )}
          </Button>
        }
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" className="h-7 gap-1.5 px-2 text-[13px]">
            <Columns3 aria-hidden="true" className="size-3.5" />
            Columns
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuLabel className="text-[13px]">Visible columns</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {columns.map((column) => (
            <DropdownMenuCheckboxItem
              key={column.id}
              checked={column.visible}
              disabled={frozenColumnIds.includes(column.id)}
              onCheckedChange={(checked) => onColumnVisibilityChange(column.id, checked === true)}
              onSelect={(event) => {
                if (frozenColumnIds.includes(column.id)) {
                  event.preventDefault()
                }
              }}
              className="text-[13px]"
            >
              {column.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Select value={density} onValueChange={(value) => onDensityChange(value as GridDensity)}>
        {/* `w-32 px-2`, not `w-28`: the trigger spends its width on chrome (padding +
            `gap-2` + a 16px chevron) and shadcn clips the value with
            `line-clamp-1`, so the widest label — "Default rows", measured at 80px
            — needed 128px and had 112. It rendered as "Default ro⌄". A density
            readout that is clipped cannot be checked by eye against the rendered
            height, which is the only thing it is for. `px-2` rather than shadcn's
            `px-3` buys the last 8px without widening the control past `w-32`, and
            matches the Columns and Add record buttons beside it. Story 7
            compacts this band and may re-tune it. */}
        <SelectTrigger size="sm" aria-label="Row density" className="h-7 w-32 px-2 text-[13px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {/* One option per record entry, so adding a density is one line in
              `GRID_DENSITY_OPTIONS` rather than a fourth place to remember. */}
          {GRID_DENSITY_OPTIONS.map((option) => (
            <SelectItem key={option.density} value={option.density}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {rowAction}

      {toolbarExtra}

      <p className="text-muted-foreground ml-auto text-[13px] tabular-nums">
        {visibleCount.toLocaleString("en-IN")} of {totalCount.toLocaleString("en-IN")} in scope
      </p>
    </div>
  )
}
