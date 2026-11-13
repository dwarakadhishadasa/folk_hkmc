"use client"

import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts"

import { DashboardCard } from "@/components/dashboard/dashboard-card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { formatCount, formatMonth } from "@/lib/dashboard/format"
import type { AttendanceTrendPoint, DashboardKpis } from "@/lib/dashboard/types"

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

const CHART_CONFIG = {
  attendees: { label: "Unique attendees", color: "var(--chart-1)" },
  checkIns: { label: "Check-ins", color: "var(--chart-2)" },
} satisfies ChartConfig

function monthTick(month: string): string {
  const parsed = Number(month.slice(5, 7))
  return MONTH_SHORT[parsed - 1] ?? month
}

/**
 * Attendance health as the starter's large trend card: an area for unique
 * attendees and a line for check-ins over the twelve months ending this month.
 * The selected period's totals sit above the trend.
 */
export function DashboardAttendanceCard({
  trend,
  kpis,
}: {
  trend: AttendanceTrendPoint[]
  kpis: DashboardKpis
}) {
  const data = trend.map((point) => ({
    ...point,
    label: monthTick(point.month),
  }))
  const empty = data.every((point) => point.checkIns === 0 && point.sessions === 0)

  return (
    <DashboardCard
      title="Attendance"
      subtitle="Selected-period totals, with the last 12 months trend"
      badge="12 months"
    >
      <div className="flex flex-col gap-3">
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

        <div className="flex flex-wrap items-center gap-4 text-[11px] text-[var(--muted-foreground)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[var(--chart-1)]" aria-hidden="true" />
            Unique attendees
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[var(--chart-2)]" aria-hidden="true" />
            Check-ins
          </span>
          {empty ? <span className="text-[var(--muted-foreground)]">No attendance recorded in the last 12 months.</span> : null}
        </div>

        <ChartContainer config={CHART_CONFIG} className="aspect-auto h-64 w-full">
          <ComposedChart data={data} margin={{ left: 0, right: 4, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="dashboard-attendees-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
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
            <ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => String(value)} />} />
            <Area
              type="monotone"
              dataKey="attendees"
              stroke="var(--chart-1)"
              strokeWidth={2}
              fill="url(#dashboard-attendees-fill)"
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="checkIns"
              stroke="var(--chart-2)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ChartContainer>

        <ul className="sr-only">
          {data.map((point) => (
            <li key={point.month}>
              {formatMonth(point.month)}: {formatCount(point.attendees)} attendees,{" "}
              {formatCount(point.checkIns)} check-ins across {formatCount(point.sessions)} sessions
            </li>
          ))}
        </ul>
      </div>
    </DashboardCard>
  )
}
