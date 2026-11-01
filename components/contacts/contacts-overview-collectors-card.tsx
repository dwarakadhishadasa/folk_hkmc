"use client"

import { useMemo } from "react"
import Link from "next/link"

import {
  ContactsCardEmpty,
  ContactsMetricCard,
} from "@/components/contacts/contacts-metric-card"
import {
  ContactsMonthYearFilter,
  useMonthYearFilter,
} from "@/components/contacts/contacts-month-year-filter"
import type { ManageLocation } from "@/components/manage/manage-types"
import {
  buildReportsMetrics,
  contactsInMonthYear,
  type MetricContact,
} from "@/lib/contacts/metrics"

const COLLECTOR_COLOURS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-4)",
  "var(--chart-3)",
  "var(--chart-5)",
] as const

function toneTint(colour: string): string {
  return `color-mix(in oklab, ${colour} 12%, transparent)`
}

export function ContactsOverviewCollectorsCard({
  contacts,
  locations,
  staffNames,
  today,
}: {
  contacts: readonly MetricContact[]
  locations: readonly ManageLocation[]
  staffNames: Readonly<Record<string, string>>
  today: string
}) {
  const filter = useMonthYearFilter(contacts)
  const locationNameById = useMemo(
    () => new Map(locations.map((location) => [location.id, location.name])),
    [locations],
  )
  const staffNameById = useMemo(
    () => new Map(Object.entries(staffNames)),
    [staffNames],
  )
  const periodContacts = useMemo(
    () =>
      contactsInMonthYear(
        contacts,
        filter.year === "all" ? null : filter.year,
        filter.month === "all" ? null : filter.month,
      ),
    [contacts, filter.year, filter.month],
  )
  const reports = useMemo(
    () =>
      buildReportsMetrics({
        contacts: periodContacts,
        locationNameById,
        staffNameById,
        today,
        period: "all",
        window: filter.window,
      }),
    [periodContacts, locationNameById, staffNameById, today, filter.window],
  )

  return (
    <ContactsMetricCard
      title="Who collects contacts"
      subtitle={`Contacts whose first contact was recorded by that staff member. · ${filter.label}`}
      action={<ContactsMonthYearFilter filter={filter} />}
      className="h-full"
    >
      {reports.collectors.empty ? (
        <ContactsCardEmpty>
          No contact was collected in {filter.label === "All time" ? "this scope" : filter.label}.
        </ContactsCardEmpty>
      ) : (
        <div className="flex flex-1 flex-col gap-1">
          {reports.collectors.rows.map((row, index) => {
            const colour = COLLECTOR_COLOURS[index % COLLECTOR_COLOURS.length]

            return (
              <Link
                key={row.id}
                href={row.href}
                data-metric-link=""
                data-metric-count={row.count}
                className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-[var(--grid-row-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]"
              >
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-[var(--program-text)]"
                  style={{ backgroundColor: toneTint(colour) }}
                >
                  {row.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span
                      className="truncate text-[13px] text-[var(--program-text)]"
                      title={row.name}
                    >
                      {row.name}
                    </span>
                    <span className="flex shrink-0 items-baseline gap-2">
                      <span
                        className="font-[family-name:var(--font-poppins)] text-[18px] font-semibold leading-none tabular-nums"
                        style={{ color: colour }}
                      >
                        {row.count.toLocaleString("en-IN")}
                      </span>
                      <span className="w-9 text-right text-[11px] tabular-nums text-[var(--muted-foreground)]">
                        {row.percentage}%
                      </span>
                    </span>
                  </span>
                  <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-[var(--muted)]">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${row.count === 0 ? 0 : Math.max(2, row.percentage)}%`,
                        backgroundColor: colour,
                      }}
                    />
                  </span>
                </span>
              </Link>
            )
          })}

          <p className="mt-auto border-t border-[var(--border)] pt-3 text-[11px] leading-4 text-[var(--muted-foreground)]">
            Counts are contacts whose first contact was recorded by that staff member. Percentages
            are of this period.
          </p>
        </div>
      )}
    </ContactsMetricCard>
  )
}
