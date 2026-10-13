"use client"

import type { ReactNode } from "react"
import type { SortingState } from "@tanstack/react-table"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/** One sortable column the popover's field dropdown can name. Table-agnostic. */
export interface GridSortField {
  id: string
  label: string
}

export interface GridSortPopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The node the popover anchors to. Rendered where the caller puts it. */
  anchor: ReactNode
  /** Sortable columns only — the grid filters these with `column.getCanSort()`. */
  fields: readonly GridSortField[]
  /** The grid's live sorting. Only the first entry is shown; this surface is one field plus one direction. */
  sorting: SortingState
  onSortingChange: (sorting: SortingState) => void
}

/**
 * The one global sort surface (CAP-17).
 *
 * Exactly two controls — a field dropdown and a direction select — plus a
 * quiet Clear. Both controls apply on change rather than behind an Apply
 * button, so opening the popover from a column-menu item with a sort already
 * applied (the menu item writes first, then opens) leaves the popover showing
 * exactly what the grid is doing. A cleared sort is `[]`, which the URL codec
 * serializes as no `sort` param at all — a valid empty state, not an error.
 *
 * In this story the only entry points are the column menu's Sort items, which
 * open it programmatically. The toolbar Sort control opening this same popover
 * lands in story 7.
 *
 * Focus moves into the popover on open (the default autofocus) rather than
 * staying on the menu item that opened it. That is load-bearing, not polish:
 * the menu's close returns focus to its trigger, which is outside this
 * popover, and Radix dismisses on focus-outside — so a popover that does not
 * take focus is dismissed the instant the menu closes.
 */
export function GridSortPopover({
  open,
  onOpenChange,
  anchor,
  fields,
  sorting,
  onSortingChange,
}: GridSortPopoverProps) {
  const current = sorting[0]
  const fieldId =
    current && fields.some((field) => field.id === current.id) ? current.id : fields[0]?.id
  const descending = current?.desc === true

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{anchor}</PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        data-grid-sort-popover=""
        className="w-60 p-3"
        onFocusOutside={(event) => {
          // The column menu's close returns focus to its trigger — outside
          // this popover — and that focus return lands *after* this popover
          // opens (observed: field focused, then focus yanked back into the
          // closing menu, then to the trigger). Without this, Radix reads that
          // yank as a focus-outside dismiss and the popover flashes open and
          // vanishes with the sort applied but the surface gone. Pointer-down
          // outside and Escape still dismiss; only the focus yank is ignored.
          event.preventDefault()
        }}
      >
        <p className="text-muted-foreground pb-2 text-xs font-medium">Sort by</p>
        <Select
          value={fieldId ?? ""}
          onValueChange={(next) => {
            onSortingChange([{ id: next, desc: descending }])
          }}
        >
          <SelectTrigger aria-label="Sort field" className="h-8 w-full text-[13px]">
            <SelectValue placeholder="Choose a field" />
          </SelectTrigger>
          <SelectContent>
            {fields.map((field) => (
              <SelectItem key={field.id} value={field.id} className="text-[13px]">
                {field.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="border-border my-2 border-t" />

        <Select
          value={descending ? "desc" : "asc"}
          onValueChange={(next) => {
            if (fieldId) {
              onSortingChange([{ id: fieldId, desc: next === "desc" }])
            }
          }}
        >
          <SelectTrigger aria-label="Sort direction" className="h-8 w-full text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="asc" className="text-[13px]">
              Ascending
            </SelectItem>
            <SelectItem value="desc" className="text-[13px]">
              Descending
            </SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground h-7 px-2 text-xs font-medium"
            onClick={() => {
              onSortingChange([])
            }}
          >
            Clear sort
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
