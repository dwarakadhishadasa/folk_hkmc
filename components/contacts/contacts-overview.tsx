import Link from "next/link"

import {
  ContactsCardEmpty,
  ContactsMetricCard,
} from "@/components/contacts/contacts-metric-card"
import type { OverviewMetrics } from "@/lib/contacts/metrics"
import { cn } from "@/lib/utils"

/**
 * The Overview: five tiles, then four cards.
 *
 * Every figure that has a narrower row set is a link into the grid. The tile
 * that is the whole scope is not a link, because there is no narrower set for
 * it to mean. Percentages are captions beside their exact count, never the
 * value itself.
 */
export function ContactsOverview({ metrics }: { metrics: OverviewMetrics }) {
  const delta =
    metrics.newThisMonthDelta > 0
      ? `+${metrics.newThisMonthDelta}`
      : metrics.newThisMonthDelta < 0
        ? `−${Math.abs(metrics.newThisMonthDelta)}`
        : "0"

  const tiles = [
    {
      key: "total",
      label: "Total contacts",
      value: metrics.total,
      caption: `Across ${metrics.locationsHeld.toLocaleString("en-IN")} location${metrics.locationsHeld === 1 ? "" : "s"}`,
      valueClassName: "text-[var(--program-text)]",
      href: undefined,
      phoneHidden: false,
      warningBorder: false,
    },
    {
      key: "new",
      label: "New this month",
      value: metrics.newThisMonth,
      caption: `${delta} vs last month`,
      valueClassName: "text-[var(--chart-2)]",
      href: metrics.months.rows.at(-1)?.href,
      phoneHidden: false,
      warningBorder: false,
    },
    {
      key: "active",
      label: "Active in 60 days",
      value: metrics.activeIn60Days,
      caption: `${metrics.activeIn60DaysPercentage}% of all contacts`,
      valueClassName: "text-[var(--program-text)]",
      href: metrics.activeIn60DaysHref,
      phoneHidden: true,
      warningBorder: false,
    },
    {
      key: "never",
      label: "Never attended",
      value: metrics.neverAttended,
      caption: `${metrics.neverAttendedPercentage}% — worth a first session`,
      valueClassName: "text-[var(--grid-warning-ink)]",
      href: metrics.neverAttendedHref,
      phoneHidden: false,
      warningBorder: false,
    },
    {
      key: "no-location",
      label: "No location",
      value: metrics.noLocation,
      caption: `${metrics.noLocationPercentage}% — unresolved`,
      valueClassName: "text-[var(--grid-warning-ink)]",
      href: metrics.noLocationHref,
      phoneHidden: false,
      warningBorder: true,
    },
  ]

  const monthMax = Math.max(...metrics.months.rows.map((row) => row.count), 1)
  const sourceMax = Math.max(...metrics.sources.rows.map((row) => row.count), 1)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-4">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5 md:gap-4">
          {tiles.map((tile) => {
            const body = (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)] md:text-[11px]">
                  {tile.label}
                </p>
                <p
                  className={cn(
                    "mt-2 font-[family-name:var(--font-poppins)] text-[26px] font-semibold leading-none tabular-nums md:text-[30px]",
                    tile.valueClassName,
                  )}
                >
                  {tile.value.toLocaleString("en-IN")}
                </p>
                <p className="mt-2.5 hidden text-[11px] leading-4 text-[var(--muted-foreground)] md:block md:text-xs">
                  {tile.caption}
                </p>
              </>
            )

            const className = cn(
              "rounded-xl border bg-card p-5 text-left transition-colors",
              tile.warningBorder
                ? "border-[var(--grid-warning-ink)]"
                : "border-[var(--border)]",
              tile.phoneHidden && "hidden md:block",
              tile.href && "hover:border-[var(--program-primary)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]",
            )

            return tile.href ? (
              <Link
                key={tile.key}
                href={tile.href}
                data-metric-link=""
                data-metric-count={tile.value}
                className={className}
              >
                {body}
              </Link>
            ) : (
              <div key={tile.key} className={className}>
                {body}
              </div>
            )
          })}
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,860fr)_minmax(0,480fr)] xl:gap-5">
          <div className="flex min-w-0 flex-col gap-4">
            <ContactsMetricCard
              title="New contacts collected"
              subtitle="First-contact date, by month."
              mobileSubtitle=""
            >
              {metrics.months.empty ? (
                <ContactsCardEmpty>
                  No contacts were collected in the last six months.
                </ContactsCardEmpty>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-2.5">
                    {metrics.months.rows.map((row, index) => {
                      const phoneHidden = index < metrics.months.rows.length - 2

                      return (
                        <Link
                          key={row.key}
                          href={row.href}
                          data-metric-link=""
                          data-metric-count={row.count}
                          className={cn(
                            "grid grid-cols-[46px_minmax(0,1fr)_56px] items-center gap-3 rounded-sm text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]",
                            phoneHidden && "hidden md:grid",
                          )}
                        >
                          <span className="text-[var(--program-text)]">{row.label}</span>
                          <span className="h-[18px] overflow-hidden rounded-full bg-[var(--muted)]">
                            <span
                              className={cn(
                                "block h-full rounded-full",
                                row.current ? "bg-[var(--chart-2)]" : "bg-[var(--chart-1)]",
                              )}
                              style={{ width: `${row.count === 0 ? 0 : Math.max(2, (row.count / monthMax) * 100)}%` }}
                            />
                          </span>
                          <span className="text-right tabular-nums text-[var(--program-text)]">
                            {row.count.toLocaleString("en-IN")}
                          </span>
                        </Link>
                      )
                    })}
                  </div>
                  <p className="text-[11px] leading-4 text-[var(--muted-foreground)]">
                    <span className="md:hidden">The current month is still filling.</span>
                    <span className="hidden md:inline">
                      The last column is the current month and is still filling. Twelve months on
                      Reports.
                    </span>
                  </p>
                </div>
              )}
            </ContactsMetricCard>

            <ContactsMetricCard
              title="Where contacts came from"
              subtitle="The source field — hidden in the grid by default."
              className="hidden md:block"
            >
              {metrics.sources.rows.length === 0 ? (
                <ContactsCardEmpty>No source has been recorded.</ContactsCardEmpty>
              ) : (
                <div className="flex flex-col gap-3">
                  {metrics.sources.rows.map((row) => (
                    <Link
                      key={row.key || "not-recorded"}
                      href={row.href}
                      data-metric-link=""
                      data-metric-count={row.count}
                      className="grid grid-cols-[190px_minmax(0,1fr)_56px] items-center gap-4 rounded-sm text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]"
                    >
                      <span className="truncate text-[var(--program-text)]">{row.label}</span>
                      <span className="h-[18px] overflow-hidden rounded-full bg-[var(--muted)]">
                        <span
                          className={cn(
                            "block h-full rounded-full",
                            row.key.length === 0
                              ? "bg-[var(--muted-foreground)]"
                              : "bg-[var(--chart-1)]",
                          )}
                          style={{ width: `${Math.max(2, (row.count / sourceMax) * 100)}%` }}
                        />
                      </span>
                      <span className="text-right tabular-nums text-[var(--program-text)]">
                        {row.count.toLocaleString("en-IN")}
                      </span>
                    </Link>
                  ))}
                  {metrics.sources.more > 0 ? (
                    <p className="text-[12px] text-[var(--muted-foreground)]">
                      + {metrics.sources.more} more
                    </p>
                  ) : null}
                </div>
              )}
            </ContactsMetricCard>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <ContactsMetricCard
              title="Contacts by location"
              subtitle="The first resolved location on each contact."
              mobileSubtitle=""
            >
              <div className="flex flex-col gap-3">
                {metrics.locations.rows.map((row) => (
                  <Link
                    key={`${row.kind}-${row.label}`}
                    href={row.href}
                    data-metric-link=""
                    data-metric-count={row.count}
                    className="grid grid-cols-[8px_minmax(0,1fr)_auto] items-center gap-x-3 rounded-sm text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)] md:grid-cols-[8px_minmax(0,1fr)_auto_48px]"
                  >
                    <span
                      className={cn(
                        "size-2 rounded-full",
                        row.kind === "resolved"
                          ? "bg-[var(--chart-1)]"
                          : "bg-[var(--grid-warning-ink)]",
                      )}
                    />
                    <span className="truncate text-[var(--program-text)]">{row.label}</span>
                    <span
                      className={cn(
                        "text-right tabular-nums",
                        row.kind === "resolved"
                          ? "text-[var(--program-text)]"
                          : "text-[var(--grid-warning-ink)]",
                      )}
                    >
                      {row.count.toLocaleString("en-IN")}
                    </span>
                    <span className="hidden text-right tabular-nums text-[var(--muted-foreground)] md:inline">
                      {row.percentage}%
                    </span>
                  </Link>
                ))}

                {metrics.locations.more > 0 ? (
                  <p className="pl-[20px] text-[12px] text-[var(--muted-foreground)]">
                    + {metrics.locations.more} more
                  </p>
                ) : null}
              </div>
            </ContactsMetricCard>

            <ContactsMetricCard title="Engagement" className="hidden md:block">
              <div className="flex flex-col gap-4">
                {metrics.engagement.map((row, index) => (
                  <Link
                    key={row.key}
                    href={row.href}
                    data-metric-link=""
                    data-metric-count={row.count}
                    className="grid grid-cols-[4px_minmax(0,1fr)_auto] items-center gap-x-3 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]"
                  >
                    <span
                      className={cn(
                        "h-8 rounded-full",
                        index === 1 ? "bg-[var(--chart-2)]" : "bg-[var(--chart-1)]",
                      )}
                    />
                    <span className="text-[13px] text-[var(--program-text)]">{row.label}</span>
                    <span className="flex items-baseline gap-2">
                      <span
                        className={cn(
                          "font-[family-name:var(--font-poppins)] text-[20px] font-semibold tabular-nums",
                          index === 1 ? "text-[var(--chart-2)]" : "text-[var(--chart-1)]",
                        )}
                      >
                        {row.count.toLocaleString("en-IN")}
                      </span>
                      <span className="text-[11px] text-[var(--muted-foreground)]">
                        {row.caption}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </ContactsMetricCard>
          </div>
        </div>
      </div>
    </div>
  )
}
