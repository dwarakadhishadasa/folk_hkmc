import { SectionCard } from "@/components/section-card"
import { SessionAttendancePulse } from "@/components/sessions/charts/session-attendance-pulse"
import { SessionBySessionCard, SessionWeeklyCard } from "@/components/sessions/session-report-cards"
import { SessionTopAttendeesCard } from "@/components/sessions/session-top-attendees-card"
import { formatSessionDayMonth } from "@/lib/sessions/format"
import type { SessionOverviewRow, SessionTopAttendee, SessionsReport } from "@/lib/sessions/data"

const PULSE_SIZE = 8

/**
 * The Overview's charts. Two rows, one shell:
 *
 * - the recent trend (the last eight sessions in view) beside the five
 *   best-attended sessions in view;
 * - the reporting window's top sessions and weekly trend, moved here when the
 *   separate Reports route was retired.
 *
 * Every series is derived from data the page already read: the trend and the
 * top five from the visible rows, the two window charts from `sessions_report`.
 */
export function SessionOverviewCharts({
  rows,
  report,
  topAttendees,
  rangeLabel,
}: {
  rows: SessionOverviewRow[]
  report: SessionsReport
  topAttendees: SessionTopAttendee[]
  rangeLabel: string
}) {
  if (rows.length === 0) {
    return null
  }

  const recent = [...rows]
    .slice(0, PULSE_SIZE)
    .reverse()
    .map((row) => ({
      id: row.id,
      label: formatSessionDayMonth(row.sessionDate),
      name: row.name,
      attendance: row.attendanceCount,
    }))

  return (
    <div data-session-report-surface="dashboard" className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-stretch">
        <SectionCard
          title="Attendance trend"
          subtitle="Check-ins across the most recent sessions in view."
          badge={`Last ${recent.length}`}
          className="min-w-0"
        >
          <SessionAttendancePulse points={recent} />
        </SectionCard>

        <SessionTopAttendeesCard attendees={topAttendees} rangeLabel={rangeLabel} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
        <SessionBySessionCard rows={report.bySession} rangeLabel={rangeLabel} />
        <SessionWeeklyCard weeks={report.weekly} rangeLabel={rangeLabel} />
      </div>
    </div>
  )
}
