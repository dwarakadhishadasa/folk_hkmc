"use client"

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { SessionReportWeek } from "@/lib/sessions/data"
import { reportWeekLabel } from "@/lib/sessions/format"

const CONFIG = {
  attendance: { label: "Check-ins", color: "var(--chart-1)" },
} satisfies ChartConfig

/**
 * The weekly trend, as an area rather than four bars: the shape matters more
 * than each bucket's exact height, and the tooltip still gives the number.
 *
 * Every attendance row of an in-range session is clamped into the range before
 * it is bucketed, so these points sum to Total attendance.
 */
export function SessionWeeklyChart({ weeks }: { weeks: SessionReportWeek[] }) {
  if (weeks.length === 0) {
    return <p className="text-[13px] text-[var(--muted-foreground)]">No check-ins in this range.</p>
  }

  const data = weeks.map((week, index) => ({
    label: reportWeekLabel(index),
    attendance: week.attendanceCount,
  }))

  return (
    <>
      <div className="h-[216px] w-full">
        <ChartContainer config={CONFIG} className="aspect-auto h-full w-full">
          <AreaChart accessibilityLayer data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="session-weekly-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} width={30} allowDecimals={false} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
            <Area
              type="monotone"
              dataKey="attendance"
              stroke="var(--color-attendance)"
              strokeWidth={2}
              fill="url(#session-weekly-fill)"
              dot={{ r: 3, strokeWidth: 0, fill: "var(--color-attendance)" }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>
      </div>

      <ul className="sr-only" aria-label="Attendance trend, data">
        {weeks.map((week, index) => (
          <li key={week.weekStart ?? index} data-report-week={index + 1} data-report-week-count={week.attendanceCount}>
            {reportWeekLabel(index)}: {week.attendanceCount}
          </li>
        ))}
      </ul>
    </>
  )
}
