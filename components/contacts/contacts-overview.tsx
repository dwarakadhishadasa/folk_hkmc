import Link from "next/link"
import {
  Activity,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
  UserX,
  type LucideIcon,
} from "lucide-react"

import {
  ContactsCardEmpty,
  ContactsMetricCard,
} from "@/components/contacts/contacts-metric-card"
import { ContactsMonthChart } from "@/components/contacts/contacts-month-chart"
import { ContactsOverviewCollectorsCard } from "@/components/contacts/contacts-overview-collectors-card"
import { ContactsOverviewFunnelCard } from "@/components/contacts/contacts-overview-funnel-card"
import { ContactsOverviewLocationsCard } from "@/components/contacts/contacts-overview-locations-card"
import type { ManageLocation } from "@/components/manage/manage-types"
import type { MetricContact, OverviewMetrics } from "@/lib/contacts/metrics"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type TileTone = "neutral" | "growth" | "warning"

const TONE_COLOUR: Record<TileTone, string> = {
  neutral: "var(--chart-1)",
  growth: "var(--chart-2)",
  warning: "var(--grid-warning-ink)",
}

const TONE_TEXT: Record<TileTone, string> = {
  neutral: "text-[var(--chart-1)]",
  growth: "text-[var(--chart-2)]",
  warning: "text-[var(--grid-warning-ink)]",
}

const ENGAGEMENT_PALETTE: Record<string, string> = {
  attended: "var(--chart-1)",
  attended60: "var(--chart-2)",
  attended3: "var(--chart-4)",
}

interface OverviewTile {
  key: string
  label: string
  value: number
  caption: string
  valueClassName: string
  href?: string
  tone: TileTone
  icon: LucideIcon
  badge?: string
  trend?: "up" | "down"
  sparkline?: number[]
}

function toneTint(colour: string): string {
  return `color-mix(in oklab, ${colour} 12%, transparent)`
}

function TileBadge({
  tone,
  trend,
  children,
}: {
  tone: TileTone
  trend?: "up" | "down"
  children: string
}) {
  const colour = TONE_COLOUR[tone]

  return (
    <Badge
      variant="outline"
      className="gap-1 border-transparent px-2 py-0.5 text-[10px] font-semibold tabular-nums"
      style={{ backgroundColor: toneTint(colour), color: colour }}
    >
      {trend === "up" ? <TrendingUp aria-hidden="true" /> : null}
      {trend === "down" ? <TrendingDown aria-hidden="true" /> : null}
      {children}
    </Badge>
  )
}

/** A six-point trend line. Decorative: the month chips below carry the figures. */
function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) {
    return null
  }

  const width = 64
  const height = 24
  const max = Math.max(...values, 1)
  const step = width / (values.length - 1)
  const points = values
    .map((value, index) => {
      const x = index * step
      const y = height - (value / max) * (height - 2) - 1

      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("h-6 w-16 shrink-0", className)}
      aria-hidden="true"
      focusable="false"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * The Overview: four collection tiles, then two rows of equal-width cards.
 *
 * New contacts collected and Who collects contacts share the first row; the
 * funnel, locations and engagement share the second. The Month/Year filters on
 * the funnel, locations and collector cards are local to their card: they narrow
 * that card and its links without moving the whole-scope tiles above them.
 */
export function ContactsOverview({
  metrics,
  contacts,
  locations,
  staffNames,
  today,
}: {
  metrics: OverviewMetrics
  contacts: readonly MetricContact[]
  locations: readonly ManageLocation[]
  staffNames: Readonly<Record<string, string>>
  today: string
}) {
  const delta =
    metrics.newThisMonthDelta > 0
      ? `+${metrics.newThisMonthDelta}`
      : metrics.newThisMonthDelta < 0
        ? `−${Math.abs(metrics.newThisMonthDelta)}`
        : "0"

  const monthDeltaTone: TileTone =
    metrics.newThisMonthDelta > 0
      ? "growth"
      : metrics.newThisMonthDelta < 0
        ? "warning"
        : "neutral"

  const tiles: OverviewTile[] = [
    {
      key: "total",
      label: "Total contacts",
      value: metrics.total,
      caption: `Across ${metrics.locationsHeld.toLocaleString("en-IN")} location${metrics.locationsHeld === 1 ? "" : "s"}`,
      valueClassName: "text-[var(--program-text)]",
      tone: "neutral",
      icon: Users,
    },
    {
      key: "new",
      label: "New this month",
      value: metrics.newThisMonth,
      caption: metrics.newThisMonthDelta === 0 ? "no change vs last month" : "vs last month",
      valueClassName: "text-[var(--chart-2)]",
      href: metrics.months.rows.at(-1)?.href,
      tone: monthDeltaTone,
      icon: UserPlus,
      badge: delta,
      trend:
        metrics.newThisMonthDelta > 0
          ? "up"
          : metrics.newThisMonthDelta < 0
            ? "down"
            : undefined,
      sparkline: metrics.months.empty
        ? undefined
        : metrics.months.rows.map((row) => row.count),
    },
    {
      key: "active",
      label: "Active in 60 days",
      value: metrics.activeIn60Days,
      caption: "of all contacts",
      valueClassName: "text-[var(--program-text)]",
      href: metrics.activeIn60DaysHref,
      tone: "neutral",
      icon: Activity,
      badge: `${metrics.activeIn60DaysPercentage}%`,
    },
    {
      key: "never",
      label: "Never attended",
      value: metrics.neverAttended,
      caption: "worth a first session",
      valueClassName: "text-[var(--grid-warning-ink)]",
      href: metrics.neverAttendedHref,
      tone: "warning",
      icon: UserX,
      badge: `${metrics.neverAttendedPercentage}%`,
    },
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-4">
      <div className="grid shrink-0 grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {tiles.map((tile) => {
          const Icon = tile.icon
          const body = (
            <>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-8 -top-10 size-28 rounded-full opacity-10 blur-2xl"
                style={{ backgroundColor: TONE_COLOUR[tile.tone] }}
              />

              <div className="relative flex items-start justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)] md:text-[11px]">
                  {tile.label}
                </p>
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--muted)]",
                    TONE_TEXT[tile.tone],
                  )}
                >
                  <Icon aria-hidden="true" className="size-4" />
                </span>
              </div>

              <div className="relative mt-2 flex items-end justify-between gap-2">
                <p
                  className={cn(
                    "font-[family-name:var(--font-poppins)] text-[26px] font-semibold leading-none tabular-nums md:text-[30px]",
                    tile.valueClassName,
                  )}
                >
                  {tile.value.toLocaleString("en-IN")}
                </p>
                {tile.sparkline ? (
                  <Sparkline values={tile.sparkline} className={TONE_TEXT[tile.tone]} />
                ) : null}
              </div>

              <div className="relative mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                {tile.badge ? (
                  <TileBadge tone={tile.tone} trend={tile.trend}>
                    {tile.badge}
                  </TileBadge>
                ) : null}
                <p className="text-[10px] leading-3 text-[var(--muted-foreground)] md:text-xs md:leading-4">
                  {tile.caption}
                </p>
              </div>
            </>
          )

          const className = cn(
            "group relative flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-card p-5 text-left transition-[border-color,box-shadow,transform] duration-200",
            tile.href &&
              "hover:-translate-y-0.5 hover:border-[var(--program-primary)]/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]",
          )

          return tile.href ? (
            <Link
              key={tile.key}
              href={tile.href}
              data-metric-link=""
              data-metric-count={tile.value}
              aria-label={`${tile.label}: ${tile.value.toLocaleString("en-IN")}. ${
                tile.badge ? `${tile.badge} ` : ""
              }${tile.caption} — open the matching rows`}
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

      <div className="grid gap-4 xl:grid-cols-2">
        <ContactsMetricCard
          title="New contacts collected"
          subtitle="First-contact date, by month."
          mobileSubtitle=""
          className="h-full"
        >
          {metrics.months.empty ? (
            <ContactsCardEmpty>
              No contacts were collected in the last six months.
            </ContactsCardEmpty>
          ) : (
            <div className="@container flex flex-1 flex-col gap-4">
              <div className="hidden md:block" aria-hidden="true">
                <ContactsMonthChart points={metrics.months.rows} />
              </div>

              <div className="grid grid-cols-3 gap-1.5 @[420px]:grid-cols-6">
                {metrics.months.rows.map((row) => (
                  <Link
                    key={row.key}
                    href={row.href}
                    data-metric-link=""
                    data-metric-count={row.count}
                    className={cn(
                      "group flex flex-col gap-1 rounded-lg border px-2.5 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]",
                      row.current
                        ? "border-[var(--chart-2)]"
                        : "border-[var(--border)] hover:border-[var(--program-primary)]/40 hover:bg-[var(--grid-row-hover)]",
                    )}
                    style={
                      row.current
                        ? { backgroundColor: toneTint("var(--chart-2)") }
                        : undefined
                    }
                  >
                    <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
                      {row.label}
                      {row.current ? (
                        <span
                          className="size-1.5 rounded-full bg-[var(--chart-2)]"
                          aria-hidden="true"
                        />
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        "font-[family-name:var(--font-poppins)] text-[18px] font-semibold leading-none tabular-nums",
                        row.current
                          ? "text-[var(--chart-2)]"
                          : "text-[var(--program-text)]",
                      )}
                    >
                      {row.count.toLocaleString("en-IN")}
                    </span>
                  </Link>
                ))}
              </div>

              <p className="mt-auto border-t border-[var(--border)] pt-3 text-[11px] leading-4 text-[var(--muted-foreground)]">
                The current month is still filling.
              </p>
            </div>
          )}
        </ContactsMetricCard>

        <ContactsOverviewCollectorsCard
          contacts={contacts}
          locations={locations}
          staffNames={staffNames}
          today={today}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ContactsOverviewFunnelCard
          contacts={contacts}
          locations={locations}
          staffNames={staffNames}
          today={today}
        />

        <ContactsOverviewLocationsCard
          contacts={contacts}
          locations={locations}
          today={today}
        />

        <ContactsMetricCard
          title="Engagement"
          subtitle="Whole scope."
          className="hidden h-full md:flex"
        >
          <div className="flex flex-1 flex-col gap-1">
            {metrics.engagement.map((row) => {
              const colour = ENGAGEMENT_PALETTE[row.key] ?? "var(--chart-1)"

              return (
                <Link
                  key={row.key}
                  href={row.href}
                  data-metric-link=""
                  data-metric-count={row.count}
                  className="group -mx-2 flex flex-col gap-2 rounded-lg px-2 py-2.5 transition-colors hover:bg-[var(--grid-row-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]"
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] font-medium text-[var(--program-text)]">
                      {row.label}
                    </span>
                    <span className="flex shrink-0 items-baseline gap-2">
                      <span
                        className="font-[family-name:var(--font-poppins)] text-[22px] font-semibold leading-none tabular-nums"
                        style={{ color: colour }}
                      >
                        {row.count.toLocaleString("en-IN")}
                      </span>
                      <span className="text-[11px] text-[var(--muted-foreground)]">
                        {row.caption}
                      </span>
                    </span>
                  </span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-[var(--muted)]">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${row.count === 0 ? 0 : Math.max(2, (row.count / metrics.total) * 100)}%`,
                        backgroundColor: colour,
                      }}
                    />
                  </span>
                </Link>
              )
            })}
          </div>
        </ContactsMetricCard>
      </div>
    </div>
  )
}
