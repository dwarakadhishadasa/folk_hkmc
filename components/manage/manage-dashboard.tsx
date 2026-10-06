"use client"

import { useMemo, useState } from "react"
import type { ReactNode } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts"
import type {
  ManageMonthlySeries,
  ManagePortalPayload,
  ManageStackedBarSeries,
} from "@/components/manage/manage-types"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const ALL_PERIODS_KEY = "all"
const CHART_PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "#64748b",
] as const

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const

const QUARTER_CHART_CONFIG: ChartConfig = {
  contacts: { label: "New contacts", color: "var(--chart-1)" },
}

const PIE_CHART_CONFIG: ChartConfig = {
  sessions: { label: "Sessions", color: "var(--chart-1)" },
}

interface StackedRow {
  label: string
  [key: string]: string | number
}

function seriesConfig(series: ManageStackedBarSeries): ChartConfig {
  const config: ChartConfig = {}

  series.seriesKeys.forEach((name, index) => {
    config[`location-${index}`] = {
      label: name,
      color: CHART_PALETTE[index % CHART_PALETTE.length],
    }
  })

  return config
}

function ChartFrame({
  title,
  subtitle,
  controls,
  children,
}: {
  title: string
  subtitle: string
  controls?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-card shadow-[0_18px_50px_rgba(45,10,10,0.08)]">
      <div className="bg-[var(--program-primary)] px-5 py-4 text-white">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-[family-name:var(--font-poppins)] text-lg font-semibold">{title}</h2>
            <p className="text-sm text-white/70">{subtitle}</p>
          </div>
          {controls ? <div className="flex flex-wrap items-center gap-2">{controls}</div> : null}
        </div>
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

function PeriodControls({
  series,
  period,
  onPeriodChange,
}: {
  series: ManageMonthlySeries
  period: string
  onPeriodChange: (next: string) => void
}) {
  const years = series.years.length > 0 ? series.years : []
  const isFiltered = period !== ALL_PERIODS_KEY
  const [year, month] = isFiltered ? period.split("-") : [years[years.length - 1]?.toString() ?? "", "01"]

  const handleYearChange = (nextYear: string) => {
    const nextMonth = isFiltered ? month : "01"
    onPeriodChange(`${nextYear}-${nextMonth}`)
  }

  const handleMonthChange = (nextMonth: string) => {
    if (!year) {
      return
    }

    onPeriodChange(`${year}-${nextMonth}`)
  }

  return (
    <>
      <Select value={year || undefined} onValueChange={handleYearChange}>
        <SelectTrigger size="sm" className="w-[110px] bg-white/95" aria-label="Year">
          <SelectValue placeholder="Year" />
        </SelectTrigger>
        <SelectContent>
          {years.map((candidate) => (
            <SelectItem key={candidate} value={candidate.toString()}>
              {candidate}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={month} onValueChange={handleMonthChange}>
        <SelectTrigger size="sm" className="w-[140px] bg-white/95" aria-label="Month">
          <SelectValue placeholder="Month" />
        </SelectTrigger>
        <SelectContent>
          {MONTH_NAMES.map((name, index) => {
            const value = String(index + 1).padStart(2, "0")
            return (
              <SelectItem key={value} value={value}>
                {name}
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>

      <button
        type="button"
        onClick={() => onPeriodChange(ALL_PERIODS_KEY)}
        disabled={!isFiltered}
        className="rounded-full bg-white/10 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-white/20 disabled:opacity-40"
      >
        Reset
      </button>
    </>
  )
}

function StackedBarChart({ series }: { series: ManageStackedBarSeries }) {
  const chartData: StackedRow[] = series.points.map((point) => {
    const row: StackedRow = { label: point.label }
    series.seriesKeys.forEach((name, index) => {
      row[`location-${index}`] = point.values[name] ?? 0
    })
    return row
  })

  return (
    <div className="h-72 w-full">
      <ChartContainer config={seriesConfig(series)} className="aspect-auto h-full w-full">
        <BarChart data={chartData} margin={{ left: 4, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval={0} />
          <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
          <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
          <ChartLegend content={<ChartLegendContent />} />
          {series.seriesKeys.map((name, index) => (
            <Bar
              key={name}
              dataKey={`location-${index}`}
              stackId="manage"
              fill={`var(--color-location-${index})`}
              radius={index === series.seriesKeys.length - 1 ? [4, 4, 0, 0] : undefined}
            />
          ))}
        </BarChart>
      </ChartContainer>
    </div>
  )
}

function StackedChartPanel({
  title,
  subtitle,
  series,
}: {
  title: string
  subtitle: string
  series: ManageMonthlySeries
}) {
  const [period, setPeriod] = useState(ALL_PERIODS_KEY)
  // Resolved strictly: falling back to the all-time series would show
  // program-wide totals under a Month/Year label claiming a single month.
  const selected = series.byPeriod[period]

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      controls={
        <PeriodControls series={series} period={period} onPeriodChange={setPeriod} />
      }
    >
      {selected ? (
        <StackedBarChart series={selected} />
      ) : (
        <p className="py-12 text-center text-sm text-[var(--muted-foreground)]">
          No data for this period.
        </p>
      )}
    </ChartFrame>
  )
}

export function ManageDashboard({ payload }: { payload: ManagePortalPayload }) {
  const { charts, contacts, sessions } = payload

  const quarterData = useMemo(
    () => charts.contactsPerQuarter.map((point) => ({ quarter: point.quarter, contacts: point.contacts })),
    [charts.contactsPerQuarter],
  )

  const statusQuoData = useMemo(
    () => charts.statusQuo.map((point) => ({ bucket: point.bucket, sessions: point.sessions })),
    [charts.statusQuo],
  )

  const totalStatusQuoSessions = statusQuoData.reduce((sum, point) => sum + point.sessions, 0)
  const totalSessionAttendees = sessions.reduce((sum, session) => sum + session.attendees.length, 0)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Total Contacts" value={contacts.length.toLocaleString("en-IN")} />
        <StatTile label="Sessions" value={sessions.length.toLocaleString("en-IN")} />
        <StatTile label="Attendance records" value={totalSessionAttendees.toLocaleString("en-IN")} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartFrame title="Contact Generation" subtitle="New contacts per quarter">
          {quarterData.length === 0 ? (
            <p className="py-12 text-center text-sm text-[var(--muted-foreground)]">
              No initial-contact dates recorded yet.
            </p>
          ) : (
            <div className="h-72 w-full">
              <ChartContainer config={QUARTER_CHART_CONFIG} className="aspect-auto h-full w-full">
                <LineChart data={quarterData} margin={{ left: 4, right: 8, top: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="quarter" tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    type="monotone"
                    dataKey="contacts"
                    stroke="var(--color-contacts)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ChartContainer>
            </div>
          )}
        </ChartFrame>

        <ChartFrame
          title="Recent sessions"
          subtitle={`Status Quo buckets across the past 60 days (${totalStatusQuoSessions} sessions)`}
        >
          {totalStatusQuoSessions === 0 ? (
            <p className="py-12 text-center text-sm text-[var(--muted-foreground)]">
              No sessions with attendance in the past 60 days.
            </p>
          ) : (
            <>
              <div className="h-72 w-full">
                <ChartContainer config={PIE_CHART_CONFIG} className="aspect-auto h-full w-full">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="bucket" />} />
                    <Pie
                      data={statusQuoData}
                      dataKey="sessions"
                      nameKey="bucket"
                      innerRadius={48}
                      outerRadius={90}
                      paddingAngle={2}
                    >
                      {statusQuoData.map((point, index) => (
                        <Cell
                          key={point.bucket}
                          fill={CHART_PALETTE[index % CHART_PALETTE.length]}
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
              </div>
              <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
                {statusQuoData.map((point, index) => (
                  <li key={point.bucket} className="flex items-center gap-2 text-sm">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: CHART_PALETTE[index % CHART_PALETTE.length] }}
                    />
                    <span className="text-[var(--muted-foreground)]">{point.bucket}</span>
                    <span className="font-mono font-medium tabular-nums text-[var(--program-text)]">
                      {point.sessions}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </ChartFrame>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <StackedChartPanel
          title="Sessions"
          subtitle="Sessions by preacher, stacked by location"
          series={charts.sessionsByPreacherLocation}
        />
        <StackedChartPanel
          title="Attendance"
          subtitle="Attendance by preacher, stacked by location"
          series={charts.attendanceByPreacherLocation}
        />
      </div>
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-card px-5 py-4 shadow-[0_18px_50px_rgba(45,10,10,0.08)]">
      <p className="text-sm font-medium uppercase tracking-wide text-[var(--muted-foreground)]">{label}</p>
      <p className="mt-1 font-[family-name:var(--font-poppins)] text-3xl font-bold text-[var(--program-text)]">
        {value}
      </p>
    </div>
  )
}