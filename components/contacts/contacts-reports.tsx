import type { ReactNode } from "react"
import Link from "next/link"
import { AlertTriangle, Info } from "lucide-react"

import {
  ContactsCardEmpty,
  ContactsMetricCard,
} from "@/components/contacts/contacts-metric-card"
import type { ReportsMetrics } from "@/lib/contacts/metrics"
import { cn } from "@/lib/utils"

/**
 * Reports: the collection funnel, the twelve-month chart, the collectors, and
 * the whole-scope quality list.
 *
 * The period select moves the funnel and the collectors together. Neither the
 * month chart nor the quality list follows it, and each card says so in its own
 * subtitle — rule 5 in `metrics.md`.
 */
export function ContactsReports({
  metrics,
  periodSelect,
}: {
  metrics: ReportsMetrics
  /** The phone's full-width period control; the desktop one lives in the title row. */
  periodSelect?: ReactNode
}) {
  const collected = metrics.funnel.stages[0]?.count ?? 0
  const monthMax = Math.max(...metrics.months.rows.map((row) => row.count), 1)

  const stageColours = [
    "bg-[var(--chart-1)]",
    "bg-[var(--chart-2)]",
    "bg-[var(--chart-4)]",
    "bg-[var(--chart-2)]",
  ]

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-4" data-contact-reports="">
      {periodSelect ? <div className="mb-4 md:hidden">{periodSelect}</div> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,860fr)_minmax(0,480fr)] xl:gap-5">
        <div className="flex min-w-0 flex-col gap-4">
          <ContactsMetricCard
            title="Collection funnel"
            subtitle={`From first contact to an active member of the community. · ${metrics.periodLabel}`}
            mobileSubtitle={`Period: ${metrics.periodLabel}`}
          >
            {metrics.funnel.empty ? (
              <ContactsCardEmpty>
                No contacts were collected in this period.
              </ContactsCardEmpty>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3">
                  {metrics.funnel.stages.map((stage, index) => {
                    const row = (
                      <>
                        <span className="truncate text-[13px] text-[var(--program-text)]">
                          {stage.label}
                        </span>
                        <span className="h-6 overflow-hidden rounded-full bg-[var(--muted)]">
                          <span
                            className={cn(
                              "block h-full rounded-full",
                              stageColours[index] ?? "bg-[var(--program-primary)]",
                            )}
                            style={{
                              width: `${collected > 0 ? Math.max(2, (stage.count / collected) * 100) : 0}%`,
                            }}
                          />
                        </span>
                        <span className="text-right text-[13px] tabular-nums text-[var(--program-text)]">
                          {stage.count.toLocaleString("en-IN")}
                        </span>
                      </>
                    )

                    const className =
                      "grid grid-cols-[112px_minmax(0,1fr)_44px] items-center gap-3 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)] md:grid-cols-[160px_minmax(0,1fr)_56px]"

                    return stage.href ? (
                      <Link
                        key={stage.key}
                        href={stage.href}
                        data-metric-link=""
                        data-metric-count={stage.count}
                        data-report-stage={stage.key}
                        className={className}
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
                </div>

                {metrics.funnel.warning ? (
                  <p className="hidden items-start gap-2 border-t border-[var(--border)] pt-3 text-[12px] leading-5 text-[var(--muted-foreground)] md:flex">
                    <AlertTriangle
                      aria-hidden="true"
                      className="mt-0.5 size-3.5 shrink-0 text-[var(--grid-warning-ink)]"
                    />
                    <span>{metrics.funnel.warning}</span>
                  </p>
                ) : null}
              </div>
            )}
          </ContactsMetricCard>

          <ContactsMetricCard
            title="New contacts collected"
            subtitle="First-contact date, by month. The last twelve months, whatever the period select says."
            className="hidden md:block"
          >
            {metrics.months.empty ? (
              <ContactsCardEmpty>
                No contacts have a first-contact date in the last twelve months.
              </ContactsCardEmpty>
            ) : (
              <div className="grid grid-cols-12 items-end gap-2">
                {metrics.months.rows.map((row) => (
                  <Link
                    key={row.key}
                    href={row.href}
                    data-metric-link=""
                    data-metric-count={row.count}
                    className="flex flex-col items-center gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]"
                  >
                    <span className="text-[11px] tabular-nums text-[var(--muted-foreground)]">
                      {row.count.toLocaleString("en-IN")}
                    </span>
                    <span className="flex h-[128px] w-full items-end">
                      <span
                        className={cn(
                          "mx-auto block w-[62%] rounded-t-[3px]",
                          row.current ? "bg-[var(--chart-2)]" : "bg-[var(--chart-1)]",
                        )}
                        style={{
                          height: `${row.count === 0 ? 0 : Math.max(4, (row.count / monthMax) * 100)}%`,
                        }}
                      />
                    </span>
                    <span className="text-[11px] text-[var(--muted-foreground)]">
                      {row.label}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </ContactsMetricCard>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <ContactsMetricCard
            title="Who collects contacts"
            subtitle={`Contacts whose first contact was recorded by that staff member. · ${metrics.periodLabel}`}
            className="hidden md:block"
          >
            {metrics.collectors.empty ? (
              <ContactsCardEmpty>
                No contact in this period has a collector.
              </ContactsCardEmpty>
            ) : (
              <div className="flex flex-col gap-3">
                {metrics.collectors.rows.map((row) => (
                  <Link
                    key={row.id}
                    href={row.href}
                    data-metric-link=""
                    data-metric-count={row.count}
                    className="grid grid-cols-[32px_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-sm text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]"
                  >
                    <span className="flex size-8 items-center justify-center rounded-full bg-[var(--muted)] text-[10px] font-semibold text-[var(--program-text)]">
                      {row.initials}
                    </span>
                    <span className="truncate text-[var(--program-text)]">{row.name}</span>
                    <span className="text-right tabular-nums text-[var(--muted-foreground)]">
                      {row.percentage}%
                    </span>
                    <span className="text-right font-semibold tabular-nums text-[var(--program-text)]">
                      {row.count.toLocaleString("en-IN")}
                    </span>
                  </Link>
                ))}

                <p className="flex items-start gap-2 border-t border-[var(--border)] pt-3 text-[11px] leading-4 text-[var(--muted-foreground)]">
                  <Info
                    aria-hidden="true"
                    className="mt-0.5 size-3.5 shrink-0 text-[var(--muted-foreground)]"
                  />
                  <span>
                    Counts are contacts whose first contact was recorded by that staff member. A
                    contact with no collector is not counted here. Percentages are of the period&apos;s
                    contacts, so the rows sum to 100% only when every contact in the period has a
                    collector.
                  </span>
                </p>
              </div>
            )}
          </ContactsMetricCard>

          <ContactsMetricCard
            title="Needs attention"
            subtitle="Whole scope — this list does not move with the period."
            mobileSubtitle="Whole scope"
          >
            <div className="flex flex-col gap-3" data-contact-quality="">
              {metrics.quality.rows.map((row) => (
                <div
                  key={row.key}
                  className="grid grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-3 text-[13px] md:grid-cols-[16px_minmax(0,1fr)_auto_122px]"
                >
                  <AlertTriangle
                    aria-hidden="true"
                    className="size-3.5 text-[var(--grid-warning-ink)]"
                  />
                  <span className="truncate text-[var(--program-text)]">{row.label}</span>
                  <Link
                    href={row.href}
                    data-metric-link=""
                    data-metric-count={row.count}
                    className="text-right font-semibold tabular-nums text-[var(--grid-warning-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]"
                  >
                    {row.count.toLocaleString("en-IN")}
                  </Link>
                  <Link
                    href={row.href}
                    className="hidden text-right text-[12px] text-[var(--muted-foreground)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)] md:inline"
                  >
                    {row.action}
                  </Link>
                </div>
              ))}
            </div>
          </ContactsMetricCard>
        </div>
      </div>
    </div>
  )
}
