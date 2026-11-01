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
  buildOverviewMetrics,
  contactsInMonthYear,
  type MetricContact,
} from "@/lib/contacts/metrics"
import { cn } from "@/lib/utils"

const LOCATION_PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
] as const

export function ContactsOverviewLocationsCard({
  contacts,
  locations,
  today,
}: {
  contacts: readonly MetricContact[]
  locations: readonly ManageLocation[]
  today: string
}) {
  const filter = useMonthYearFilter(contacts)
  const locationNameById = useMemo(
    () => new Map(locations.map((location) => [location.id, location.name])),
    [locations],
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
  const metrics = useMemo(
    () =>
      buildOverviewMetrics({
        contacts: periodContacts,
        locationNameById,
        today,
        window: filter.window,
      }),
    [periodContacts, locationNameById, today, filter.window],
  )

  const locationColours = new Map<string, string>()
  let resolvedIndex = 0

  for (const row of metrics.locations.rows) {
    const colour =
      row.kind === "resolved"
        ? LOCATION_PALETTE[resolvedIndex++ % LOCATION_PALETTE.length]
        : row.kind === "unknown"
          ? "color-mix(in oklab, var(--grid-warning-ink) 55%, var(--card))"
          : "var(--grid-warning-ink)"

    locationColours.set(`${row.kind}-${row.label}`, colour)
  }

  const knownLocationCount = metrics.locations.rows.reduce((sum, row) => sum + row.count, 0)
  const otherLocationCount = Math.max(0, metrics.total - knownLocationCount)

  return (
    <ContactsMetricCard
      title="Contacts by location"
      subtitle={`The first resolved location on each contact. · ${filter.label}`}
      action={<ContactsMonthYearFilter filter={filter} />}
      className="h-full"
    >
      {metrics.total === 0 ? (
        <ContactsCardEmpty>
          No contacts were collected in {filter.label === "All time" ? "this scope" : filter.label}.
        </ContactsCardEmpty>
      ) : (
        <div className="@container flex flex-col gap-3">
          <div
            className="flex h-2.5 overflow-hidden rounded-full bg-[var(--muted)]"
            aria-hidden="true"
          >
            {metrics.locations.rows.map((row) => (
              <span
                key={`${row.kind}-${row.label}`}
                className="h-full"
                style={{
                  flexBasis: 0,
                  flexGrow: row.count,
                  backgroundColor:
                    locationColours.get(`${row.kind}-${row.label}`) ?? "var(--chart-1)",
                }}
              />
            ))}
            {otherLocationCount > 0 ? (
              <span
                className="h-full bg-[var(--muted-foreground)]"
                style={{ flexBasis: 0, flexGrow: otherLocationCount }}
              />
            ) : null}
          </div>

          <div className="flex flex-col gap-0.5">
            {metrics.locations.rows.map((row) => {
              const colour =
                locationColours.get(`${row.kind}-${row.label}`) ?? "var(--chart-1)"

              return (
                <Link
                  key={`${row.kind}-${row.label}`}
                  href={row.href}
                  data-metric-link=""
                  data-metric-count={row.count}
                  className="group -mx-2 flex flex-col gap-1.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--grid-row-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]"
                >
                  <span className="flex items-center gap-2.5 text-[13px]">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: colour }}
                    />
                    <span
                      className="min-w-0 flex-1 truncate text-[var(--program-text)]"
                      title={row.label}
                    >
                      {row.label}
                    </span>
                    <span
                      className={cn(
                        "text-right tabular-nums",
                        row.kind === "resolved"
                          ? "font-semibold text-[var(--program-text)]"
                          : "font-semibold text-[var(--grid-warning-ink)]",
                      )}
                    >
                      {row.count.toLocaleString("en-IN")}
                    </span>
                    <span className="hidden w-10 text-right text-[11px] tabular-nums text-[var(--muted-foreground)] @[360px]:inline">
                      {row.percentage}%
                    </span>
                  </span>
                  <span className="ml-[18px] h-1 overflow-hidden rounded-full bg-[var(--muted)]">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${Math.max(row.count === 0 ? 0 : 2, row.percentage)}%`,
                        backgroundColor: colour,
                      }}
                    />
                  </span>
                </Link>
              )
            })}

            {metrics.locations.more > 0 ? (
              <p className="flex items-center gap-2.5 pl-[18px] text-[12px] text-[var(--muted-foreground)]">
                <span className="size-2 shrink-0 rounded-full bg-[var(--muted-foreground)]" />
                + {metrics.locations.more} more locations
              </p>
            ) : null}
          </div>
        </div>
      )}
    </ContactsMetricCard>
  )
}
