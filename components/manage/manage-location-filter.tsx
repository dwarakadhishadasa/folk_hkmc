"use client"

import { ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/**
 * The Attendance tab's location filter: a dropdown of the program's locations,
 * each one tickable.
 *
 * **A dropdown, not a condition builder.** The tab this belongs to filters on
 * one thing — the location — and a filter surface that also asks for a field,
 * an operator and a value is a surface that answers a question nobody asked.
 * The list of locations IS the filter; picking one is the whole act.
 *
 * **THE CHECKBOX LIST STAYS OPEN WHILE IT IS TICKED.** Radix closes a menu on
 * select, and `onSelect`'s `preventDefault` is what stops it — the checkbox's
 * own toggle runs either way, because Radix composes it without checking
 * `defaultPrevented`. Without the `preventDefault` the operator would have to
 * reopen the list for every location, which is the difference between a filter
 * that takes one click and one that takes one per option.
 *
 * **MULTI-SELECT IS THE POINT, NOT AN ACCIDENT.** A contact sits in AT MOST
 * ONE location — `contacts.location_ids` carries a `CHECK (cardinality(…)) <= 1`
 * bound — so the filter's question is not "which locations is this contact in".
 * It is "which of the ticked locations is this contact's location", and the
 * condition that asks it is "has any of". Ticking three locations says "show me
 * the contacts in ANY of these three", which is one roster the operator can
 * read, not three rosters.
 */
export function ManageLocationFilter({
  locations,
  selected,
  onChange,
}: {
  /** The location names on offer, already de-duplicated and ordered. */
  locations: readonly string[]
  /** The location names currently narrowing the roster. */
  selected: readonly string[]
  /** Called with the new selection. An empty array clears the filter. */
  onChange: (selected: string[]) => void
}) {
  const selectedNames = new Set(selected)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          data-manage-location-filter=""
          // The count is in the accessible NAME, not only in the badge: a label
          // on the button replaces its content, so a badge alone is never
          // announced.
          aria-label={
            selected.length > 0
              ? `Filter by location. Filtered by ${selected.length}`
              : "Filter by location"
          }
          disabled={locations.length === 0}
          title={
            selected.length > 0 ? `Locations: ${selected.join(", ")}` : "Filter by location"
          }
          className="h-8 gap-1.5 rounded-[6px] px-2.5 text-[13px] font-medium hover:text-foreground"
        >
          Location
          {selected.length > 0 ? (
            <span className="text-saffron font-semibold">{selected.length}</span>
          ) : null}
          <ChevronDown aria-hidden="true" className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        // The popover this replaced carried a visible heading and, with it, an
        // accessible name for the surface. A menu needs one too.
        aria-label="Filter by location"
        className="min-w-[11rem] text-[13px]"
      >
        {locations.map((name) => (
          <DropdownMenuCheckboxItem
            key={name}
            checked={selectedNames.has(name)}
            className="text-[13px]"
            onSelect={(event) => {
              // Keeps the list open while the operator ticks several
              // locations. See this file's note on Radix's select handling.
              event.preventDefault()
            }}
            onCheckedChange={(checked) => {
              const next = new Set(selectedNames)

              if (checked === true) {
                next.add(name)
              } else {
                next.delete(name)
              }

              onChange([...next])
            }}
          >
            {name}
          </DropdownMenuCheckboxItem>
        ))}

        {locations.length > 0 ? <DropdownMenuSeparator /> : null}

        <DropdownMenuItem
          className="text-[13px]"
          onSelect={() => {
            onChange([])
          }}
        >
          All locations
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
