"use client"

import { useId } from "react"
import { Area, AreaChart, CartesianGrid, ReferenceDot, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { useWideViewport } from "@/components/contacts/use-wide-viewport"

export interface ContactsMonthPoint {
  key: string
  label: string
  count: number
  current: boolean
}

const CHART_CONFIG = {
  count: { label: "Contacts", color: "var(--chart-1)" },
} satisfies ChartConfig

/**
 * The six-month collection trend. The month tiles beneath the chart are the
 * linked, readable version of the same figures, so the chart itself is
 * decorative for assistive technology.
 */
export function ContactsMonthChart({ points }: { points: ContactsMonthPoint[] }) {
  const isWide = useWideViewport()
  const gradientId = `contacts-month-fill-${useId().replace(/:/g, "")}`
  const current = points.find((point) => point.current)

  if (!isWide) {
    return null
  }

  return (
    <ChartContainer config={CHART_CONFIG} className="aspect-auto h-[132px] w-full">
      <AreaChart data={points} margin={{ left: 18, right: 18, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.28} />
            <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval={0} />
        <YAxis hide domain={[0, "dataMax + 1"]} allowDecimals={false} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
        <Area
          type="monotone"
          dataKey="count"
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={{ r: 3, fill: "var(--chart-1)", strokeWidth: 0 }}
          activeDot={{ r: 4 }}
        />
        {current ? (
          <ReferenceDot
            x={current.label}
            y={current.count}
            r={4}
            fill="var(--chart-2)"
            stroke="var(--card)"
            strokeWidth={2}
          />
        ) : null}
      </AreaChart>
    </ChartContainer>
  )
}
