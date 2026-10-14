"use client"

import { useId, useState } from "react"
import { format, isValid, parseISO } from "date-fns"
import type { DateRange } from "react-day-picker"

import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

/**
 * The date value control: a trigger that opens a calendar.
 *
 * **NO TEXT FIELD AND NO "SET" BUTTON.** Clicking a day is the whole
 * interaction. A typed ISO field next to a picker would give two ways to do one
 * thing and the two would disagree on what "empty" means — a half-typed
 * `2026-0` is not a date, and the row would sit `aria-invalid` waiting for a
 * keystroke that a picker makes unnecessary.
 *
 * **THE MONTH ARROWS ARE REACT-DAY-PICKER'S OWN.** `components/ui/calendar.tsx`
 * defaults `captionLayout="label"`, which renders `button_previous` and
 * `button_next`. Nothing here suppresses them, and nothing needs to reimplement
 * them — the one thing that silently kills them is a controlled `selected` that
 * pins the month, so `selected` here carries a date only and never a month.
 *
 * **NESTED INSIDE THE FILTER POPOVER, DELIBERATELY.** The outer popover
 * `preventDefault`s `onFocusOutside` precisely so a focus move into a child
 * surface is not read as a dismissal, and Radix registers a nested popover as a
 * branch of its parent, so clicking a day here does not close the popover the
 * day lives in.
 *
 * **`within` IS RANGE MODE, BUT RANGE MODE IS NOT WHAT FILLS THE SPAN.**
 * `pendingFrom` holds the first click. Only the second click commits, so a
 * half-built range is never serialized — an unparseable value matches no rows,
 * and writing `from` alone would have meant the condition filtered everything
 * out while looking finished. The span is ordered on commit, so picking the
 * later day first still produces the same `lo..hi`.
 */

const ISO_FORMAT = "yyyy-MM-dd"

/** Matches the date cell's own display, so a filtered row reads the same twice. */
const DISPLAY_FORMAT = "d MMM yyyy"

function toIso(date: Date): string {
  return format(date, ISO_FORMAT)
}

function parseBoundary(raw: string): { from?: Date; to?: Date } {
  const trimmed = raw.trim()
  const [head, tail] = trimmed.split("..")

  const from = parseISO(head.trim())
  const to = tail === undefined ? undefined : parseISO(tail.trim())

  return {
    from: isValid(from) ? from : undefined,
    to: isValid(to) ? to : undefined,
  }
}

export interface GridFilterDateControlProps {
  /** `YYYY-MM-DD`, or `YYYY-MM-DD..YYYY-MM-DD` for `is within`. May be empty. */
  value: string
  /** Whether the operator takes a span rather than a single day. */
  range: boolean
  invalid: boolean
  /** The column's label, for the trigger's accessible name. */
  label: string
  /** The visual language, built by the caller from its own slot constants. */
  className: string
  onCommit: (value: string) => void
}

export function GridFilterDateControl({
  value,
  range,
  invalid,
  label,
  className,
  onCommit,
}: GridFilterDateControlProps) {
  const [open, setOpen] = useState(false)
  // Stated rather than left to Radix's trigger contract, so the combobox points
  // at a popup whose id this file also owns.
  const calendarId = useId()
  // The first click of a span. Local, never committed — see the file note.
  const [pendingFrom, setPendingFrom] = useState<string | null>(null)

  const { from: committedFrom, to: committedTo } = parseBoundary(value)

  // Always a `DateRange`, even for a single day: the calendar runs in
  // `mode="range"` for both, so narrowing at the first click and widening at the
  // second is one component rather than two with different month state.
  const selected: DateRange | undefined = (() => {
    if (range) {
      if (pendingFrom) {
        return { from: parseISO(pendingFrom), to: undefined }
      }

      return committedFrom ? { from: committedFrom, to: committedTo } : undefined
    }

    return committedFrom ? { from: committedFrom, to: committedFrom } : undefined
  })()

  const text = range
    ? pendingFrom
      ? `${format(parseISO(pendingFrom), DISPLAY_FORMAT)} – …`
      : committedFrom && committedTo
        ? `${format(committedFrom, DISPLAY_FORMAT)} – ${format(committedTo, DISPLAY_FORMAT)}`
        : null
    : (committedFrom ? format(committedFrom, DISPLAY_FORMAT) : null)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Dropping the pending span on close keeps "first click, reopen, second
        // click" from silently completing a span that was abandoned halfway.
        setPendingFrom(null)
        setOpen(next)
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          // `combobox`, not `button`: this opens a popup that sets a value, which
          // is what a combobox IS, and it is the only role on this element that
          // permits `aria-invalid`. Radix supplies `aria-haspopup="dialog"`,
          // `aria-expanded` and `aria-controls` from the trigger contract.
          role="combobox"
          aria-expanded={open}
          aria-controls={calendarId}
          aria-label={range ? `${label} date range` : `${label} value`}
          aria-invalid={invalid || undefined}
          data-grid-filter-value=""
          data-grid-filter-calendar-trigger=""
          className={`${className} text-left ${text ? "" : "text-muted-foreground"}`}
        >
          <span className="truncate">{text ?? (range ? "Choose a range" : "Choose a date")}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        id={calendarId}
        align="start"
        side="bottom"
        data-grid-filter-calendar=""
        className="w-auto p-0"
        // The calendar is wider than the slot it serves and must not be clipped
        // by it, so it is allowed to overflow rather than being sized to the
        // trigger's 154px column.
      >
        <Calendar
          mode="range"
          selected={selected}
          onSelect={(next) => {
            const day = next?.from

            // react-day-picker reports a cleared range as `from: undefined`.
            // Clearing is not an operation here — `Clear all` is.
            if (!day || !isValid(day)) {
              return
            }

            const iso = toIso(day)

            if (!range) {
              onCommit(iso)
              setOpen(false)

              return
            }

            if (pendingFrom === null) {
              setPendingFrom(iso)

              return
            }

            const [lo, hi] = pendingFrom <= iso ? [pendingFrom, iso] : [iso, pendingFrom]

            setPendingFrom(null)
            onCommit(`${lo}..${hi}`)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}