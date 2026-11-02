"use client"

import { useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { format, parseISO } from "date-fns"
import { CalendarDays, Check, ChevronDown, ChevronLeft } from "lucide-react"
import type { DateRange } from "react-day-picker"

import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  DASHBOARD_PERIOD_OPTIONS,
  type DashboardPeriod,
  type DashboardPeriodKey,
} from "@/lib/dashboard/period"
import { cn } from "@/lib/utils"

const ISO = "yyyy-MM-dd"
const DISPLAY = "d MMM yyyy"

const TRIGGER_CLASS =
  "relative flex h-10 w-full items-center gap-2 rounded-lg border border-[var(--border)] bg-card px-3 text-left text-[13px] text-[var(--program-text)] transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"

const ITEM_CLASS =
  "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-[var(--program-text)] transition-colors hover:bg-foreground/5 focus-visible:bg-foreground/5 focus-visible:outline-none"

/**
 * The one period control. The trigger looks like the other filters and names
 * the current window; the popover below it carries every preset **and** the
 * custom range, so `Custom…` swaps the list for the calendar in the same
 * surface rather than revealing a second select beside the first.
 *
 * A preset applies on click. A custom range applies when its second day is
 * chosen; the first click only drafts the start.
 */
export function DashboardPeriodControl({
  period,
  today,
}: {
  period: DashboardPeriod
  today: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<"list" | "range">("list")
  const [draft, setDraft] = useState<DateRange | undefined>()
  // The first click's day. Kept separately from `draft` because a controlled
  // range calendar reports an existing span's next click as a completed range;
  // this makes the first click after opening always start a new one.
  const [start, setStart] = useState<Date | null>(null)

  const apply = (next: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString())

    for (const [key, value] of Object.entries(next)) {
      if (value === null) {
        params.delete(key)
      } else {
        params.set(key, value)
      }
    }

    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  const triggerText =
    period.key === "custom" && period.from !== null && period.to !== null
      ? `${format(parseISO(period.from), DISPLAY)} – ${format(parseISO(period.to), DISPLAY)}`
      : period.label

  const committed: DateRange | undefined =
    period.key === "custom" && period.from !== null && period.to !== null
      ? { from: parseISO(period.from), to: parseISO(period.to) }
      : undefined
  const selected = draft ?? committed

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    setStart(null)
    setDraft(undefined)
    setView(period.key === "custom" ? "range" : "list")
  }

  const choose = (key: DashboardPeriodKey) => {
    if (key === "custom") {
      setStart(null)
      setDraft(undefined)
      setView("range")
      return
    }

    setOpen(false)
    apply({ period: key, from: null, to: null })
  }

  const handleRangeSelect = (range: DateRange | undefined) => {
    const day = range?.to ?? range?.from

    if (!day) {
      setStart(null)
      setDraft(undefined)
      return
    }

    if (!start) {
      setStart(day)
      setDraft({ from: day, to: undefined })
      return
    }

    const [lo, hi] = start <= day ? [start, day] : [day, start]

    setStart(null)
    setDraft(undefined)
    setOpen(false)
    apply({ period: "custom", from: format(lo, ISO), to: format(hi, ISO) })
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-dashboard-period
          data-period={period.key}
          aria-label={`Period: ${triggerText}`}
          className={cn(TRIGGER_CLASS, period.key === "custom" ? "sm:w-72" : "sm:w-44")}
        >
          <CalendarDays
            aria-hidden="true"
            className="size-4 shrink-0 text-[var(--muted-foreground)]"
          />
          <span className="truncate">{triggerText}</span>
          <ChevronDown
            aria-hidden="true"
            className="ml-auto size-3.5 shrink-0 text-[var(--muted-foreground)]"
          />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        side="bottom"
        collisionPadding={8}
        className={cn(
          "max-h-[var(--radix-popover-content-available-height)] overflow-y-auto p-0",
          view === "list" ? "w-56" : "w-auto",
        )}
      >
        {view === "list" ? (
          <div role="listbox" aria-label="Period" className="flex flex-col gap-0.5 p-1">
            {DASHBOARD_PERIOD_OPTIONS.map((option) => {
              const active = option.key === period.key

              return (
                <button
                  key={option.key}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => choose(option.key)}
                  className={cn(ITEM_CLASS, active && "bg-[var(--muted)] font-semibold")}
                >
                  {option.label}
                  {active ? <Check className="size-3.5" aria-hidden="true" /> : null}
                </button>
              )
            })}
          </div>
        ) : (
          <div data-dashboard-date-range="" className="flex flex-col">
            <button
              type="button"
              onClick={() => setView("list")}
              className="flex items-center gap-1 border-b border-[var(--border)] px-3 py-2 text-[12px] font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--program-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              <ChevronLeft className="size-3.5" aria-hidden="true" />
              Presets
            </button>
            <Calendar
              mode="range"
              defaultMonth={
                period.from ? parseISO(period.from) : parseISO(today)
              }
              selected={selected}
              onSelect={handleRangeSelect}
              disabled={{ after: parseISO(today) }}
              numberOfMonths={2}
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
