"use client"

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { DashboardCard, DashboardInlineEmpty } from "@/components/dashboard/dashboard-card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { formatCount, formatMonth } from "@/lib/dashboard/format"
import type { DashboardAttendeeSeries, DashboardKpis } from "@/lib/dashboard/types"

const CHART_PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "#64748b",
  "#0f766e",
  "#b45309",
] as const

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function monthTick(month: string): string {
  const parsed = Number(month.slice(5, 7))
  return MONTH_SHORT[parsed - 1] ?? month
}

/**
 * One line per preacher over the same twelve months the attendance card uses.
 * The selected period's totals sit above the lines, so the card answers both
 * "how many" and "who" without a second attendance card.
 */
export function DashboardPreacherAttendeeLines({
  months,
  series,
  kpis,
}: {
  months: string[]
  series: DashboardAttendeeSeries[]
  kpis: DashboardKpis
}) {
  const total = series.reduce((sum, entry) => sum + entry.values.reduce((a, b) => a + b, 0), 0)
  const hasTrend = months.length > 0 && series.length > 0 && total > 0

  const data = months.map((month, monthIndex) => {
    const point: Record<string, string | number> = { month, label: monthTick(month) }

    series.forEach((entry, index) => {
      point[`series-${index}`] = entry.values[monthIndex] ?? 0
    })

    return point
  })

  const config = Object.fromEntries(
    series.map((entry, index) => [
      `series-${index}`,
      {
        label: entry.preacherName,
        color: CHART_PALETTE[index % CHART_PALETTE.length]!,
      },
    ]),
  ) satisfies ChartConfig

  return (
    <DashboardCard
      title="Attendees by preacher"
      subtitle="Selected-period totals, with the last 12 months by preacher"
      badge="12 months"
    >
      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/20 px-2 py-2">
          <dd className="font-[family-name:var(--font-poppins)] text-lg leading-none font-bold tabular-nums text-[var(--program-text)]">
            {formatCount(kpis.sessionsHeld)}
          </dd>
          <dt className="mt-1 text-[11px] text-[var(--muted-foreground)]">sessions</dt>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/20 px-2 py-2">
          <dd className="font-[family-name:var(--font-poppins)] text-lg leading-none font-bold tabular-nums text-[var(--program-text)]">
            {kpis.averageAttendance}
          </dd>
          <dt className="mt-1 text-[11px] text-[var(--muted-foreground)]">avg per session</dt>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/20 px-2 py-2">
          <dd className="font-[family-name:var(--font-poppins)] text-lg leading-none font-bold tabular-nums text-[var(--program-text)]">
            {kpis.repeatRate}%
          </dd>
          <dt className="mt-1 text-[11px] text-[var(--muted-foreground)]">attended twice</dt>
        </div>
      </dl>

      {hasTrend ? (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-[var(--muted-foreground)]">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[var(--chart-1)]" aria-hidden="true" />
              Unique attendees
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[var(--chart-2)]" aria-hidden="true" />
              Check-ins
            </span>
          </div>

          <div className="mt-2 h-80 w-full" data-dashboard-people-chart="attendees">
            <ChartContainer config={config} className="aspect-auto h-full w-full">
              <LineChart
                accessibilityLayer
                data={data}
                margin={{ left: 0, right: 12, top: 8, bottom: 0 }}
              >
                <CartesianGrid vertical={false} strokeDasharray="4 4" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={16}
                  padding={{ left: 2, right: 12 }}
                />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
                <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                <ChartLegend content={<ChartLegendContent />} />
                {series.map((entry, index) => (
                  <Line
                    key={entry.preacherId}
                    type="monotone"
                    dataKey={`series-${index}`}
                    stroke={`var(--color-series-${index})`}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ChartContainer>
          </div>

          <ul className="sr-only">
            {months.map((month, index) => (
              <li key={month}>
                {formatMonth(month)}:{" "}
                {series
                  .map((entry) => `${entry.preacherName} ${formatCount(entry.values[index] ?? 0)}`)
                  .join(", ")}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="mt-3">
          <DashboardInlineEmpty>No attendance was recorded in the last 12 months.</DashboardInlineEmpty>
        </div>
      )}

      <p className="mt-3 text-xs text-[var(--muted-foreground)]">
        {formatCount(kpis.newAttendees)} new · {formatCount(kpis.returningAttendees)} returning ·{" "}
        {formatCount(kpis.invitedAttendees)} invited · {formatCount(kpis.organicAttendees)} came without an
        invite
      </p>
    </DashboardCard>
  )
}
