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
import { cn } from "@/lib/utils"

const FUNNEL_COLOURS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-4)",
] as const

export function ContactsOverviewFunnelCard({
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

  const collected =
    reports.funnel.stages.find((stage) => stage.key === "collected")?.count ?? 0
  const stages = reports.funnel.stages.filter((stage) => stage.key !== "locationResolved")

  return (
    <ContactsMetricCard
      title="Collection funnel"
      subtitle={`From first contact to an active member. · ${filter.label}`}
      action={<ContactsMonthYearFilter filter={filter} />}
      className="h-full"
    >
      {reports.funnel.empty ? (
        <ContactsCardEmpty>
          No contacts were collected in {filter.label === "All time" ? "this scope" : filter.label}.
        </ContactsCardEmpty>
      ) : (
        <div className="flex flex-1 flex-col gap-1">
          {stages.map((stage, index) => {
            const colour = FUNNEL_COLOURS[index] ?? "var(--chart-1)"
            const percentage = collected > 0 ? Math.round((stage.count / collected) * 100) : 0
            const row = (
              <>
                <span className="flex min-w-0 items-baseline justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--muted)] text-[11px] font-semibold tabular-nums"
                      style={{ color: colour }}
                    >
                      {index + 1}
                    </span>
                    <span className="truncate text-[13px] font-medium text-[var(--program-text)]">
                      {stage.label}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-baseline gap-2">
                    <span
                      className="font-[family-name:var(--font-poppins)] text-[22px] font-semibold leading-none tabular-nums"
                      style={{ color: colour }}
                    >
                      {stage.count.toLocaleString("en-IN")}
                    </span>
                    <span className="w-9 text-right text-[11px] tabular-nums text-[var(--muted-foreground)]">
                      {percentage}%
                    </span>
                  </span>
                </span>
                <span className="ml-[38px] block h-2 overflow-hidden rounded-full bg-[var(--muted)]">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${stage.count === 0 ? 0 : Math.max(2, percentage)}%`,
                      backgroundColor: colour,
                    }}
                  />
                </span>
              </>
            )

            const className =
              "group -mx-2 flex flex-col gap-2 rounded-lg px-2 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]"

            return stage.href ? (
              <Link
                key={stage.key}
                href={stage.href}
                data-metric-link=""
                data-metric-count={stage.count}
                className={cn(className, "hover:bg-[var(--grid-row-hover)]")}
              >
                {row}
              </Link>
            ) : (
              <div
                key={stage.key}
                data-report-stage={stage.key}
                data-metric-count={stage.count}
                className={className}
              >
                {row}
              </div>
            )
          })}

          <p className="mt-auto border-t border-[var(--border)] pt-3 text-[11px] leading-4 text-[var(--muted-foreground)]">
            Collected is every contact in this period; each later stage is a subset of it.
          </p>
        </div>
      )}
    </ContactsMetricCard>
  )
}
