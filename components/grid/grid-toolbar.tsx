"use client"

import { useState } from "react"
import type { ReactNode } from "react"
import { ArrowUpDown, EyeOff, ListFilter, Lock, Search, X } from 'lucide-react'
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
   * a layout fact; hideability is a product fact, and the two do not coincide: a
   * column can be unpinned and still be the only route to a destructive action.
   * A consumer that means it declares `hideable: false`, and this popover
   * renders the column ticked, disabled and locked instead of dropping it — a
   * field that silently vanished from the list is a field nobody can get back.
   */
  hideable: boolean
}

export interface GridToolbarProps {
  columns: GridToolbarColumn[]
  onColumnVisibilityChange: (columnId: string, visible: boolean) => void
  /**
   * How many of the listed columns are currently hidden.
   *
   * Read off `columns` rather than passed separately, because a count the caller
   * computes is a second derivation of the same fact: it could disagree with the
   * list the popover renders, and the operator would be told one number while
   * looking at another. Counted over *every* listed column, not only the hideable
   * ones — the number an operator can check is the number of unticked boxes in
   * front of them, and a locked column that ships hidden is still one they see
   * unticked. Locked-and-visible columns (`name`) never count.
   */
  hiddenFieldCount: number
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
  hiddenFieldCount,
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
              // `hover:bg-accent`. `--accent` is a light neutral in this
              // palette, so the default hover would repaint the button in
              // roughly its own resting colour and the label would not read as
              // pressed. The composition hovers neutral (`hover:bg-slate-50`),
              // and `visual-design.md:80` sends slate-50 to `--muted` anyway.
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
              className={`hover:bg-muted hover:text-[var(--grid-accent-ink)] h-8 gap-1.5 rounded-[6px] px-3 text-[13px] font-medium ${
                sortOpen
                  ? "border-[var(--grid-accent-ink)] bg-muted text-[var(--grid-accent-ink)]"
                  : "text-foreground"
              }`}
            >
              <ArrowUpDown aria-hidden="true" className="size-3.5 text-[var(--grid-accent-ink)]" />
              <span className="font-semibold">Sort</span>
            </Button>
          }
        />

        {(() => {
          /*
           * The control says two different things, and which one is a fact about
           * the grid rather than a mode this component remembers.
           *
           * At rest, with nothing hidden, the label is the control's *name* —
           * "Hide fields" — and it stays plain. Once a field is hidden, the name
           * is a lie: the control is now as much a report as an action, because
           * a hidden field is the one piece of grid state an operator cannot see
           * on the grid itself. A field that is off is simply absent, so nothing
           * else in the frame reports it. Hence the count.
           *
           * The amber is that report, and it is deliberately not the accent ink:
           * the accent means "this control is open", which is a *transient* state
           * lasting as long as the pointer is over the control. A persistent
           * control that borrowed it would be claiming to be open for as long as
           * a field stayed hidden. `--grid-warning-ink` is its own token because
           * "something is off out here" and "you are looking at me" are different
           * statements.
           *
           * The colour lands on the **label only**, and is carried through
           * `style` rather than a class because it is a token value read at
           * runtime — `components/grid/` stays hex-free per `harness-guards`, and
           * a consumer can re-tint the report without touching this component.
           *
           * Counted over the listed columns rather than over all of them: the
           * selection column is not a field and never appears in the popover, so
           * counting it would put a number on screen the operator could not
           * reconcile with the list in front of them.
           */
          const hiddenCount = hiddenFieldCount
          const reporting = hiddenCount > 0
          const label = reporting
            ? `${hiddenCount} hidden ${hiddenCount === 1 ? "field" : "fields"}`
            : "Hide fields"

          return (
            <Popover open={hideFieldsOpen} onOpenChange={setHideFieldsOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  aria-expanded={hideFieldsOpen}
                  aria-label={label}
                  data-grid-hide-fields-control=""
                  data-grid-hidden-count={hiddenCount}
                  className={`hover:bg-muted h-8 gap-1.5 rounded-[6px] px-3 text-[13px] font-medium ${
                    hideFieldsOpen
                      ? "border-[var(--grid-accent-ink)] bg-muted"
                      : "border-border"
                  }`}
                >
                  {/*
                    * **One glyph in both states, and never the warning colour.**
                    * The icon names the control; the label reports the state. An
                    * icon that changed with the count would be a second signal
                    * saying the same thing in a place with no room to read it, and
                    * painting it amber would make the glyph unreadable beside an
                    * amber label at 14px. `--grid-accent-ink` is white on the dark
                    * canvas and the theme's own ink on paper, so the icon is legible
                    * in both without a second token.
                    */}
                  <EyeOff
                    aria-hidden="true"
                    className="size-3.5 text-[var(--grid-accent-ink)]"
                  />
                  <span
                    className="font-semibold"
                    style={{ color: reporting ? "var(--grid-warning-ink)" : undefined }}
                  >
                    {label}
                  </span>
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
          )
        })()}

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

      {/* Visually hidden, not deleted. `inScopeCount`, `inScopeCounts` and about
          ten assertion sites key on this wording, and a screen reader still
          needs the status the consumer footer states visually — so the node
          stays in the DOM as `sr-only` rather than going away. The toolbar no
          longer spends pixels on a count the footer already carries. */}
      <p className="sr-only tabular-nums">
        {visibleCount.toLocaleString("en-IN")} of {totalCount.toLocaleString("en-IN")} in scope
      </p>
    </div>
  )
}
