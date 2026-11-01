"use client"

import { useId } from "react"
import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

export interface SessionPulsePoint {
  id: string
  label: string
  name: string
  attendance: number
}

const PULSE_CONFIG = {
  attendance: { label: "Attendees", color: "var(--chart-1)" },
} satisfies ChartConfig

/**
 * The last few sessions in scope as one trend line, oldest to newest.
 *
 * The dotted fill is the Kiranism overview's area treatment: the line carries
 * the exact series, while the pattern under it gives the chart weight without
 * turning it back into a bar comparison. Every point is the same
 * `attendance_count` the table row beside it carries.
 */
export function SessionAttendancePulse({ points }: { points: SessionPulsePoint[] }) {
  const patternId = `session-pulse-dots-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`

  if (points.length === 0) {
    return null
  }

  return (
    <div className="h-[196px] w-full">
      <ChartContainer config={PULSE_CONFIG} className="aspect-auto h-full w-full">
        <ComposedChart
          accessibilityLayer
          data={points}
          margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
        >
          <defs>
            <pattern
              id={patternId}
              x="0"
              y="0"
              width="7"
              height="7"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="5" cy="5" r="1.5" fill="var(--chart-1)" opacity={0.28} />
            </pattern>
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
          <ChartTooltip
            cursor={false}
            content={<ChartTooltipContent labelKey="name" indicator="dot" />}
          />
          <Area
            type="monotone"
            dataKey="attendance"
            fill={`url(#${patternId})`}
            stroke="none"
            tooltipType="none"
            activeDot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="attendance"
            stroke="var(--color-attendance)"
            strokeWidth={2}
            dot={{ r: 3, strokeWidth: 0, fill: "var(--color-attendance)" }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ChartContainer>
    </div>
  )
}
