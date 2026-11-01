"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { CalendarDays, ChevronDown } from "lucide-react"

import {
  DEFAULT_METRIC_PERIOD,
  METRIC_PERIOD_LABEL,
  METRIC_PERIODS,
  parseMetricPeriod,
  type MetricPeriod,
} from "@/lib/contacts/metrics"
import { cn } from "@/lib/utils"

/**
 * The Reports period control.
 *
 * A `select` rather than a popover: the control has four fixed options and one
 * job, and the phone shape is the same control full-width under the title.
 *
 * The chosen period is a URL parameter, not local state, so a reader can share
 * the window they are looking at and Back returns to the previous one. The
 * default is omitted from the URL, which keeps a fresh Reports link short.
 */
export function ContactsPeriodSelect({ className }: { className?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const period = parseMetricPeriod(searchParams.get("period"))

  const handleChange = (next: MetricPeriod) => {
    const params = new URLSearchParams(searchParams.toString())

    if (next === DEFAULT_METRIC_PERIOD) {
      params.delete("period")
    } else {
      params.set("period", next)
    }

    const query = params.toString()

    router.push(query.length > 0 ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  return (
    <label
      className={cn(
        "relative flex h-10 w-full items-center gap-2 rounded-lg border border-[var(--border)] bg-card px-3 md:w-auto",
        className,
      )}
    >
      <CalendarDays
        aria-hidden="true"
        className="size-4 shrink-0 text-[var(--muted-foreground)]"
      />
      <span className="sr-only">Period</span>
      <select
        aria-label="Period"
        value={period}
        onChange={(event) => handleChange(event.target.value as MetricPeriod)}
        className="h-full w-full appearance-none bg-transparent pr-6 text-left text-[13px] text-[var(--program-text)] focus-visible:outline-none md:w-40"
      >
        {METRIC_PERIODS.map((option) => (
          <option key={option} value={option}>
            {METRIC_PERIOD_LABEL[option]}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 size-3.5 text-[var(--muted-foreground)]"
      />
    </label>
  )
}
