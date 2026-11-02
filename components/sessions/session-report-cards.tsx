import { Info } from "lucide-react"

import { SectionCard } from "@/components/section-card"
import { SessionBySessionChart } from "@/components/sessions/charts/session-by-session-chart"
import { SessionWeeklyChart } from "@/components/sessions/charts/session-weekly-chart"
import type { SessionReportRow, SessionReportWeek } from "@/lib/sessions/data"

/**
 * The top four sessions by check-ins in the reporting window, drawn as
 * horizontal bars. It is deliberately not a total — the KPI tiles own the
 * totals.
 */
export function SessionBySessionCard({
  rows,
  rangeLabel,
}: {
  rows: SessionReportRow[]
  rangeLabel: string
}) {
  return (
    <SectionCard
      title="Attendance by session"
      subtitle={`Programme-wide · top sessions over the ${rangeLabel.toLowerCase()}.`}
      badge="Top 4"
      className="h-full"
    >
      <SessionBySessionChart rows={rows} />
    </SectionCard>
  )
}

/**
 * The weekly trend. Every attendance row of an in-range session is clamped into
 * the window before it is bucketed, so the shape sums back to the range total.
 */
export function SessionWeeklyCard({
  weeks,
  rangeLabel,
}: {
  weeks: SessionReportWeek[]
  rangeLabel: string
}) {
  return (
    <SectionCard
      title="Weekly trend"
      subtitle={`Programme-wide · check-ins by week over the ${rangeLabel.toLowerCase()}.`}
      badge="Weekly"
      className="h-full"
    >
      <SessionWeeklyChart weeks={weeks} />

      <p className="mt-4 flex items-start gap-2 text-[12px] leading-4 text-[var(--muted-foreground)]">
        <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
        <span>Check-ins only; a session with none counts as zero.</span>
      </p>
    </SectionCard>
  )
}
