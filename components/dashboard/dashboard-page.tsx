import Link from "next/link"

import { DashboardAttendanceCard } from "@/components/dashboard/attendance-card"
import { DashboardFocusSection } from "@/components/dashboard/focus-section"
import { DashboardHeader, DashboardScopeNotice } from "@/components/dashboard/dashboard-header"
import { DashboardKpiBand } from "@/components/dashboard/kpi-band"
import { DashboardLiveBand } from "@/components/dashboard/live-sessions-band"
import { DashboardPreacherAttendeeLines } from "@/components/dashboard/preacher-attendee-lines"
import { DashboardPreachingEfforts } from "@/components/dashboard/preaching-efforts"
import { DashboardRecentSessionsCard } from "@/components/dashboard/recent-sessions-card"
import { DashboardTeamTable } from "@/components/dashboard/team-table"
import type { DashboardLiveSession } from "@/lib/dashboard/live"
import type { DashboardPeriod } from "@/lib/dashboard/period"
import type {
  DashboardOverview,
  DashboardPeopleSeries,
  DashboardScope,
} from "@/lib/dashboard/types"

/**
 * The page's composition. Every figure arrives in `overview` or `series`; this
 * file only orders sections and passes values down.
 *
 * The order answers, in turn: how the period went, who carried it, where it
 * happened, who needs action, and what is coming. Call work lives on the
 * Campaigns and Sessions pages; this page is about preachers, sessions,
 * attendance and contact generation.
 */
export function DashboardPage({
  scope,
  period,
  today,
  overview,
  liveSessions,
  series,
}: {
  scope: DashboardScope
  period: DashboardPeriod
  today: string
  overview: DashboardOverview | null
  liveSessions: DashboardLiveSession[]
  series: DashboardPeopleSeries | null
}) {
  const unassigned = scope.assistantUnassigned || overview === null
  const programmeScope = scope.role === "Admin" && scope.mode === "admin"
  const showLiveBand =
    liveSessions.length > 0 && !(scope.role === "Admin" && scope.mode === "admin")

  return (
    <div className="flex flex-col gap-5">
      <DashboardHeader
        scope={scope}
        scopeCounts={overview?.scope ?? null}
        period={period}
        today={today}
        generatedAt={overview?.generatedAt ?? null}
      />

      <DashboardScopeNotice scope={scope} />

      {unassigned ? (
        <div className="rounded-lg border border-dashed border-[var(--border)] bg-card px-5 py-12 text-center">
          <p className="text-sm text-[var(--muted-foreground)]">
            {scope.role === "Assistant"
              ? "Ask an Admin to assign you to a preacher, then reload this page."
              : "There is no dashboard data to show yet."}
          </p>
          <Link
            href="/contact"
            className="mt-3 inline-flex text-sm font-semibold text-[var(--program-primary)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            Go to Contact Form
          </Link>
        </div>
      ) : (
        <>
          {showLiveBand ? <DashboardLiveBand sessions={liveSessions} /> : null}

          <DashboardKpiBand kpis={overview.kpis} trend={overview.attendanceTrend} />

          {programmeScope ? (
            <>
              {series ? (
                <DashboardPreachingEfforts
                  rows={series.totals.rows}
                  sessionsByPreacher={series.sessionsByPreacher}
                  contactsByPreacher={series.contactsByPreacher}
                />
              ) : null}

              {series ? (
                <DashboardPreacherAttendeeLines
                  months={series.attendeesByPreacher.months}
                  series={series.attendeesByPreacher.series}
                  kpis={overview.kpis}
                />
              ) : null}

              <DashboardTeamTable
                team={overview.team}
                role={scope.role}
                programScope={scope.programScope}
              />

              <DashboardRecentSessionsCard sessions={overview.recentSessions} />
            </>
          ) : (
            <>
              <DashboardAttendanceCard
                trend={overview.attendanceTrend}
                kpis={overview.kpis}
              />

              <DashboardFocusSection segments={overview.focus} mode={scope.mode} />

              <DashboardRecentSessionsCard sessions={overview.recentSessions} />
            </>
          )}
        </>
      )}
    </div>
  )
}
