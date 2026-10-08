"use client"

import { useState } from "react"
import type { ReactNode } from "react"
import { Columns3, Search, X } from 'lucide-react'

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
import { GRID_BASE_FONT_CLASS } from "@/components/grid/grid-row"
import { useUrlBackedDraft } from "@/components/grid/use-grid-view-state"

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
  toolbarExtra,
}: GridToolbarProps) {
  const [searchFocused, setSearchFocused] = useState(false)
  const [draft, handleGlobalFilterChange] = useUrlBackedDraft(
    globalFilter,
    onGlobalFilterChange,
    searchFocused,
  )

  return (
    <div
      data-grid-toolbar=""
      className={`${GRID_BASE_FONT_CLASS} bg-card flex flex-wrap items-center gap-2 border-b border-border px-2 py-1.5`}
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
        <SelectTrigger size="sm" aria-label="Row density" className="h-7 w-28 text-[13px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="default">Default rows</SelectItem>
          <SelectItem value="dense">Dense rows</SelectItem>
        </SelectContent>
      </Select>

      {toolbarExtra}

      <p className="text-muted-foreground ml-auto text-[13px] tabular-nums">
        {visibleCount.toLocaleString("en-IN")} of {totalCount.toLocaleString("en-IN")} in scope
      </p>
    </div>
  )
}
