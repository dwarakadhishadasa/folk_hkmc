"use client"

import { Cell, Pie, PieChart } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { formatCount } from "@/lib/dashboard/format"

export interface ReportOutcomeSlice {
  group: string
  label: string
  count: number
  color: string
}

/**
 * The outcome mix as a donut, with the total number of calls in the hole.
 *
 * The legend beside it is the readable version of the same figures — and the
 * one the reports contract reads — so the chart is decorative for assistive
 * technology, exactly like the Contacts and Sessions trend charts.
 */
export function ReportOutcomeDonut({ rows }: { rows: ReportOutcomeSlice[] }) {
  const slices = rows.filter((row) => row.count > 0)
  const total = slices.reduce((sum, row) => sum + row.count, 0)

  const config = Object.fromEntries(
    rows.map((row) => [row.group, { label: row.label, color: row.color }]),
  ) satisfies ChartConfig

  if (total === 0) {
    return (
      <div className="flex size-[190px] shrink-0 items-center justify-center rounded-full border border-dashed border-[var(--border)] px-6 text-center text-[12px] leading-5 text-[var(--muted-foreground)]">
        No calls recorded yet
      </div>
    )
  }

  return (
    <div className="relative size-[190px] shrink-0">
      <ChartContainer config={config} className="aspect-square size-full">
        <PieChart>
          <ChartTooltip
            cursor={false}
            content={<ChartTooltipContent hideLabel nameKey="group" />}
          />
          <Pie
            data={slices}
            dataKey="count"
            nameKey="group"
            innerRadius={58}
            outerRadius={88}
            paddingAngle={2}
            strokeWidth={0}
            isAnimationActive={false}
          >
            {slices.map((row) => (
              <Cell key={row.group} fill={row.color} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-[family-name:var(--font-poppins)] text-[26px] leading-none font-bold tabular-nums text-[var(--program-text)]">
          {formatCount(total)}
        </span>
        <span className="mt-1 text-[10px] font-semibold tracking-[0.08em] text-[var(--muted-foreground)] uppercase">
          calls
        </span>
      </div>
    </div>
  )
}
