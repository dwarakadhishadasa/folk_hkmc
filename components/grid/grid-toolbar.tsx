"use client"

import { useState } from "react"
import type { ReactNode } from "react"
import { ArrowUpDown, ListFilter, Lock, Search, SlidersHorizontal, X } from 'lucide-react'
import type { SortingState } from "@tanstack/react-table"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
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
import { GridSortPopover, type GridSortField } from "@/components/grid/grid-sort-popover"

export interface GridToolbarColumn {
  id: string
  label: string
  visible: boolean
  /**
   * Whether the column may be hidden at all.
   *
   * Resolved by `Grid` as `meta.grid.hideable !== false && column.getCanHide()`
   * — deliberately **not** "is this column in the pinned run". The pinned run is
   * a layout fact; hideability is a product fact, and the two do not coincide:
   * `actions` is not pinned and hiding it would take away the only delete
   * affordance. A consumer that means it declares `hideable: false`, and this
   * popover renders the column ticked, disabled and locked instead of dropping
   * it — a field that silently vanished from the list is a field nobody can get
   * back.
   */
  hideable: boolean
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
  /** Sortable columns for the sort popover's field dropdown — the one shared set. */
  sortFields: readonly GridSortField[]
  sorting: SortingState
  onSortingChange: (sorting: SortingState) => void
  /**
   * The grid's own row-lifecycle affordance, rendered immediately before the
   * row count. A consumer's selection chrome belongs below the frame — the
   * contacts table puts it in a footer status bar — rather than wedged into
   * this band, where it would cost every operator that never selects anything.
   */
  rowAction?: ReactNode
  /**
   * Consumer chrome rendered after the row count.
   *
   * Nothing in `/manage` uses it any more: the selection readout, the bulk
   * action and the status bar that carries them are the consumer's own footer
   * below the grid. Kept because the primitive is consumed by other tables and
   * a consumer with chrome that genuinely belongs *in* the band still needs it.
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
 *
 * **One band, one order: search · Filter · Sort · Hide fields · density ·
 * record creation · the count.** Every control is `h-8` and every surface is
 * `rounded-[6px]` at `text-[13px]`, transcribed from
 * `Visual-Design/contacts-toolbar-stitch-v1-corrected.html:136-207`; fifteen
 * columns at fifteen different weights was the hierarchy problem this replaced.
 * The comp also draws a view dropdown, which is **not** a control — there is no
 * view to save — and no `New contact` beside `Add record`, because two controls
 * doing one job is the same nonfunctional affordance.
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
  filterFields,
  conditions,
  onConditionsChange,
  filterConnective,
  onFilterConnectiveChange,
  filterOpen,
  onFilterOpenChange,
  sortFields,
  sorting,
  onSortingChange,
  rowAction,
  toolbarExtra,
}: GridToolbarProps) {
  const [searchFocused, setSearchFocused] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const [hideFieldsOpen, setHideFieldsOpen] = useState(false)
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
      // giving up the space. `px-3.5 py-2.5` and the `justify-between` split are
      // the comp's; the left group wraps so a narrow window takes the controls
      // onto a second line rather than pushing the count below the band.
      className={`${GRID_BASE_FONT_CLASS} bg-card flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-3.5 py-2.5`}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <div className="relative w-64 shrink-0">
          <span
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5"
          >
            <Search className="size-3.5" />
          </span>
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
            className="h-8 pl-8 pr-3 text-[13px]"
          />
          {draft.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute right-0.5 top-1/2 size-7 -translate-y-1/2"
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
              className="hover:bg-muted hover:text-foreground h-8 gap-1.5 rounded-[6px] px-2.5 text-[13px] font-medium"
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

        {/*
          The toolbar's third entry point onto the ONE sort popover, not a second
          surface. Its open state is local here and deliberately not lifted:
          `GridFilterPopover` needs lifting because a column menu has to open
          *that* instance, whereas the column menu's two sort items already reach
          the popover by writing `sorting` first and opening after — so this
          instance prefills from the same state for the same reason.
        */}
        <GridSortPopover
          open={sortOpen}
          onOpenChange={setSortOpen}
          fields={sortFields}
          sorting={sorting}
          onSortingChange={onSortingChange}
          anchor={
            <Button
              type="button"
              variant="outline"
              aria-expanded={sortOpen}
              aria-label="Sort"
              data-grid-sort-control=""
              className={`hover:bg-muted h-8 gap-1.5 rounded-[6px] px-3 text-[13px] font-medium ${
                sortOpen ? "border-royal bg-muted text-royal" : "text-foreground"
              }`}
            >
              <ArrowUpDown aria-hidden="true" className="size-3.5 text-royal" />
              <span className="font-semibold">Sort</span>
            </Button>
          }
        />

        <Popover open={hideFieldsOpen} onOpenChange={setHideFieldsOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              aria-expanded={hideFieldsOpen}
              aria-label="Hide fields"
              data-grid-hide-fields-control=""
              className={`hover:bg-muted h-8 gap-1.5 rounded-[6px] px-3 text-[13px] font-medium ${
                hideFieldsOpen ? "border-royal bg-muted text-royal" : "text-foreground"
              }`}
            >
              <SlidersHorizontal aria-hidden="true" className="size-3.5 text-royal" />
              <span className="font-semibold">Hide fields</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            data-grid-hide-fields-popover=""
            className="w-[260px] rounded-lg p-3"
          >
            <p className="text-muted-foreground pb-1 text-[12px] font-medium">Fields</p>
            {/* Transcribed from `contacts-overlays-stitch-v1-corrected.html:189-270`.
                Fourteen data fields: `select` never reaches this list at all — it
                is a control, not a field — and Name and Actions stay in it,
                ticked and locked. */}
            <div className="max-h-[380px] space-y-0.5 overflow-y-auto pr-1">
              {columns.map((column) => {
                const checkboxId = `grid-hide-field-${column.id}`

                return (
                  <label
                    key={column.id}
                    htmlFor={checkboxId}
                    onClick={(event) => {
                      // The lock is a real guard, not a style: a click on the row
                      // forwards to the disabled checkbox, and `preventDefault`
                      // here stops the label's activation behaviour from reaching
                      // it with a state write on the way past.
                      if (!column.hideable) {
                        event.preventDefault()
                      }
                    }}
                    className={`flex h-8 cursor-pointer items-center gap-2.5 rounded px-1.5 text-[13px] hover:bg-muted ${
                      column.hideable
                        ? ""
                        : "bg-muted/60 opacity-60 cursor-not-allowed"
                    }`}
                  >
                    <Checkbox
                      id={checkboxId}
                      checked={column.visible}
                      disabled={!column.hideable}
                      className="size-4 rounded"
                      onCheckedChange={(checked) => {
                        if (!column.hideable) {
                          return
                        }

                        onColumnVisibilityChange(column.id, checked === true)
                      }}
                    />
                    <span>{column.label}</span>
                    {column.hideable ? null : (
                      <Lock
                        aria-hidden="true"
                        data-grid-hide-field-lock={column.id}
                        className="text-muted-foreground ml-auto size-3.5"
                      />
                    )}
                  </label>
                )
              })}
            </div>
          </PopoverContent>
        </Popover>

        <Select value={density} onValueChange={(value) => onDensityChange(value as GridDensity)}>
          {/* `w-32 px-2`, not `w-28`: the trigger spends its width on chrome (padding +
            `gap-2` + a 16px chevron) and shadcn clips the value with
            `line-clamp-1`, so the widest label — "Default rows", measured at 80px
            — needed 128px and had 112. It rendered as "Default ro⌄". A density
            readout that is clipped cannot be checked by eye against the rendered
            height, which is the only thing it is for.

            **Story 7 compacted this band and the width stayed.** The composition
            draws 32px-tall buttons, not narrower ones, and nothing in it narrows
            the density control — so re-measuring it would be re-deciding a number
            a committed spec already measures
            (`grid-cell-metrics.spec.ts:138-148`). `h-7` → `h-8` is the band's
            rhythm; `w-32` is this control's own. `px-2` rather than shadcn's
            `px-3` buys the last 8px without widening the control past `w-32`, and
            matches the outline controls beside it. */}
          <SelectTrigger size="sm" aria-label="Row density" className="h-8 w-32 px-2 text-[13px]">
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
      </div>

      {toolbarExtra}

      {/* `N of M in scope`, not the comp's "41 of 226 shown". `inScopeCount`,
          `inScopeCounts` and about ten assertion sites key on this wording, and a
          changed vocabulary with no product gain is churn. The comp's
          `text-[12px] font-normal whitespace-nowrap pl-2` is transcribed as-is. */}
      <p className="text-muted-foreground shrink-0 pl-2 text-[12px] font-normal whitespace-nowrap tabular-nums">
        {visibleCount.toLocaleString("en-IN")} of {totalCount.toLocaleString("en-IN")} in scope
      </p>
    </div>
  )
}
