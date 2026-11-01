"use client"

import { useCallback, useMemo, useState } from "react"
import { ChevronDown } from "lucide-react"

import {
  MONTH_OPTIONS,
  contactYears,
  monthYearLabel,
  monthYearWindow,
  type MetricContact,
  type PeriodWindow,
} from "@/lib/contacts/metrics"

export interface MonthYearFilter {
  year: string
  month: string
  years: string[]
  window: PeriodWindow | null
  label: string
  onYearChange: (value: string) => void
  onMonthChange: (value: string) => void
}

/**
 * The Month/Year state shared by the three filterable Overview cards.
 *
 * `all` is the absence of a boundary. A month is only offered once a year is
 * chosen, so a month can never mean "every year's November" — a window that
 * cannot be stated as one grid filter.
 */
export function useMonthYearFilter(contacts: readonly MetricContact[]): MonthYearFilter {
  const [year, setYear] = useState("all")
  const [month, setMonth] = useState("all")
  const years = useMemo(() => contactYears(contacts), [contacts])
  const selectedYear = year === "all" ? null : year
  const selectedMonth = month === "all" ? null : month

  const onYearChange = useCallback((next: string) => {
    setYear(next)

    if (next === "all") {
      setMonth("all")
    }
  }, [])

  const onMonthChange = useCallback((next: string) => {
    setMonth(next)
  }, [])

  return {
    year,
    month,
    years,
    window: monthYearWindow(selectedYear, selectedMonth),
    label: monthYearLabel(selectedYear, selectedMonth),
    onYearChange,
    onMonthChange,
  }
}

const SELECT_CLASS =
  "h-8 appearance-none rounded-md border border-[var(--border)] bg-card pl-2 pr-6 text-[11px] font-medium text-[var(--program-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)] disabled:cursor-not-allowed disabled:opacity-50"

export function ContactsMonthYearFilter({ filter }: { filter: MonthYearFilter }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <label className="relative">
        <span className="sr-only">Year</span>
        <select
          aria-label="Year"
          value={filter.year}
          onChange={(event) => filter.onYearChange(event.target.value)}
          className={SELECT_CLASS}
        >
          <option value="all">All years</option>
          {filter.years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 text-[var(--muted-foreground)]"
        />
      </label>

      <label className="relative">
        <span className="sr-only">Month</span>
        <select
          aria-label="Month"
          value={filter.month}
          disabled={filter.year === "all"}
          onChange={(event) => filter.onMonthChange(event.target.value)}
          className={SELECT_CLASS}
        >
          <option value="all">All months</option>
          {MONTH_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 text-[var(--muted-foreground)]"
        />
      </label>
    </div>
  )
}
