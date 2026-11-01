"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  XAxis,
  YAxis,
} from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { SessionReportRow } from "@/lib/sessions/data"

const BAR_COLOURS = ["var(--chart-2)", "var(--chart-1)", "var(--chart-4)", "var(--chart-3)"] as const

const CONFIG = {
  attendance: { label: "Attendees", color: "var(--chart-1)" },
} satisfies ChartConfig

function shortLabel(value: string): string {
  return value.length > 16 ? `${value.slice(0, 15)}…` : value
}

/**
 * Frame 790's "Attendance by session", drawn as a horizontal bar chart. The
 * four rows are the top four by check-ins in the range, each scaled against the
 * chart's own axis. The hidden list keeps the same numbers readable to a screen
 * reader and to the e2e assertions, which do not depend on SVG geometry.
 */
export function SessionBySessionChart({ rows }: { rows: SessionReportRow[] }) {
  if (rows.length === 0) {
    return <p className="text-[13px] text-[var(--muted-foreground)]">No check-ins in this range.</p>
  }

  const data = rows.map((row) => ({
    id: row.id,
    name: row.name,
    label: shortLabel(row.name),
    attendance: row.attendanceCount,
  }))

  return (
    <>
      <div className="h-[228px] w-full">
        <ChartContainer config={CONFIG} className="aspect-auto h-full w-full">
          <BarChart
            accessibilityLayer
            data={data}
            layout="vertical"
            margin={{ left: 4, right: 36, top: 4, bottom: 4 }}
          >
            <CartesianGrid horizontal={false} />
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="label"
              width={136}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12 }}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent labelKey="name" nameKey="attendance" indicator="dot" />}
            />
            <Bar dataKey="attendance" barSize={18} radius={[0, 6, 6, 0]} isAnimationActive={false}>
              {data.map((row, index) => (
                <Cell key={row.id} fill={BAR_COLOURS[index % BAR_COLOURS.length]} />
              ))}
              <LabelList
                dataKey="attendance"
                position="right"
                className="fill-[var(--program-text)]"
                fontSize={12}
                fontWeight={600}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      </div>

      <ul className="sr-only" aria-label="Attendance by session, data">
        {rows.map((row) => (
          <li
            key={row.id}
            data-report-session={row.name}
            data-report-session-count={row.attendanceCount}
          >
            {row.name}: {row.attendanceCount}
          </li>
        ))}
      </ul>
    </>
  )
}
