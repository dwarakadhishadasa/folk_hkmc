"use client"

import { useEffect, useId, useState } from "react"
import { format, isValid, parseISO } from "date-fns"
import type { DateRange } from "react-day-picker"

import { Calendar } from "@/components/ui/calendar"
import { Checkbox } from "@/components/ui/checkbox"
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

export interface GridFilterMultiSelectControlProps {
  /** The selected options. A list, never a single value. */
  value: readonly string[]
  options: readonly string[]
  invalid: boolean
  /** The column's label, for the trigger's accessible name. */
  label: string
  /** The visual language, built by the caller from its own slot constants. */
  className: string
  onCommit: (value: string[]) => void
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
          {/* `block`, because `truncate` does nothing on an inline element. See
           * the same note on the multi-select trigger. */}
          <span className="block truncate">{text ?? (range ? "Choose a range" : "Choose a date")}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        id={calendarId}
        align="start"
        side="bottom"
        collisionPadding={8}
        data-grid-filter-calendar=""
        // Same clamp as the multi-select list, and for the same reason: a
        // calendar on a low row must scroll inside the room Radix has rather
        // than flip upward and run off the top of the viewport.
        className="max-h-[var(--radix-popover-content-available-height)] w-auto overflow-y-auto p-0"
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

/**
 * The multi-value control: a DROPDOWN of checkboxes, not an inline list.
 *
 * The first build rendered the options straight into the row, which gave a
 * checkbox list taller than its own 154px slot and pushed the condition's other
 * controls out of alignment. A dropdown keeps the row one line tall and leaves
 * the option list room to be long.
 *
 * **NO APPLY BUTTON.** The commit is each tick, because the count in the
 * toolbar is the feedback — a button would mean the value on screen and the
 * value being filtered could disagree, which is the same class of bug as a
 * field showing something other than what it holds.
 *
 * Membership is EXACT. Substring-per-element is what made "EC" match "ECE".
 */

/**
 * Keeps the ticked set on screen while the URL catches up with it.
 *
 * This is the list-shaped twin of `useConditionValueDraft` in
 * `grid-filter-popover.tsx`, and it is a deliberate sibling rather than a shared
 * generic: that hook compares with `===`, and a list needs a key, and one
 * caller does not justify the equality parameter a generic would have to thread
 * through. Keep them in step by hand.
 *
 * **WITHOUT THIS, TICKING SEVERAL OPTIONS LOSES ALL BUT THE LAST.** Each tick
 * committed `new Set(value) ± one`, where `value` is the URL-backed prop. The
 * commit reaches the URL behind the 250 ms debounce plus a `router.replace`, so
 * for a quarter second after a tick `value` is still the PREVIOUS set — and
 * ticking four options in under a second made every tick build on a stale
 * empty set, each overwriting the last, leaving exactly one option chosen. The
 * list showed four boxes ticked while the URL held one, which is the worst
 * shape this surface has: the control and the filter disagreeing, with the
 * count in the toolbar agreeing with neither until the last write landed.
 *
 * So: the draft is authoritative, surrendered only once the committed set has
 * caught up with it. A focus flag is not enough — closing the list can beat the
 * write — and neither is "reconcile whenever they differ", because during that
 * 250 ms they legitimately differ. Identical reasoning to the text draft; read
 * that hook's comment for the full argument.
 */
function useMultiSelectDraft(
  committed: readonly string[],
  onCommit: (value: string[]) => void,
): [Set<string>, (next: Set<string>) => void] {
  // Order is part of the identity: `encodeCondition` joins the array in order,
  // so a reorder is a real change to the committed token and must not be
  // mistaken for the write having caught up. A NUL cannot appear in an option.
  const committedKey = committed.join("\u0000")

  const [draft, setDraft] = useState<Set<string>>(() => new Set(committed))
  const [draftKey, setDraftKey] = useState(committedKey)
  const [pending, setPending] = useState(false)

  // Catch up on anything that arrived from OUTSIDE this control — Back, Forward,
  // a shared link, `Clear all`, a URL edit — while nothing of ours is in flight.
  //
  // Reconstructed from the KEY rather than from `committed`, so the dependency
  // list is exactly what this reads. `committed` is a fresh array on every
  // render, and depending on its identity would reconcile the draft away on
  // every render instead of only when the committed set actually changed — and
  // an empty key is unambiguously the empty set, because an empty option cannot
  // survive the codec (`splitList` drops empty entries).
  useEffect(() => {
    if (!pending) {
      setDraft(new Set(committedKey.length === 0 ? [] : committedKey.split("\u0000")))
      setDraftKey(committedKey)
    }
  }, [committedKey, pending])

  // Our own write landed. Dropping the flag is what hands the display back to
  // the committed set instead of leaving two sources of truth in step.
  useEffect(() => {
    if (pending && committedKey === draftKey) {
      setPending(false)
    }
  }, [committedKey, draftKey, pending])

  return [
    draft,
    (next: Set<string>) => {
      const value = [...next]

      setDraft(next)
      setDraftKey(value.join("\u0000"))
      setPending(true)
      onCommit(value)
    },
  ]
}

export function GridFilterMultiSelectControl({
  value,
  options,
  invalid,
  label,
  className,
  onCommit,
}: GridFilterMultiSelectControlProps) {
  const [selected, commitSelected] = useMultiSelectDraft(value, onCommit)
  const text = options.filter((option) => selected.has(option)).join(", ")
  const [open, setOpen] = useState(false)
  const listId = useId()

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={`${label} values`}
          aria-invalid={invalid || undefined}
          data-grid-filter-value=""
          data-grid-filter-multi-trigger=""
          className={`${className} text-left ${text.length > 0 ? "" : "text-muted-foreground"}`}
          // The full list is always reachable, because the visible one is
          // truncated to whatever fits the slot.
          title={text.length > 0 ? text : undefined}
        >
          {/* `block` is load-bearing, not decoration. `truncate` is
           * `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`, and
           * none of those do anything on an INLINE element — the text simply
           * spilled out of the 154px slot and over its neighbours as soon as a
           * few books were ticked. */}
          <span className="block truncate">{text.length > 0 ? text : "Choose values"}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        id={listId}
        align="start"
        side="bottom"
        collisionPadding={8}
        data-grid-filter-multi=""
        // The height clamp is load-bearing. Radix flips this list upward when the
        // row sits low, but flipping alone does not make it FIT: a 15-option list
        // is ~480px and only ~400px was above the trigger, so it ran off the top
        // of the viewport and its first options could not be clicked at all.
        // `--radix-popover-content-available-height` is the room Radix actually
        // has, so the list scrolls inside it instead of escaping the screen.
        className="max-h-[var(--radix-popover-content-available-height)] w-56 overflow-y-auto p-1"
      >
        {options.map((option) => (
          <label
            key={option}
            className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-[13px]"
          >
            <Checkbox
              checked={selected.has(option)}
              onCheckedChange={(checked) => {
                // `selected` is the DRAFT, not the URL-backed prop, so a second
                // tick in the same tick-window builds on the first instead of
                // overwriting it. See `useMultiSelectDraft`.
                const next = new Set(selected)

                if (checked === true) {
                  next.add(option)
                } else {
                  next.delete(option)
                }

                commitSelected(next)
              }}
            />
            <span className="truncate">{option}</span>
          </label>
        ))}
      </PopoverContent>
    </Popover>
  )
}