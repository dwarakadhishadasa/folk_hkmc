import Link from "next/link"

import { DashboardAttendanceCard } from "@/components/dashboard/attendance-card"
import { DashboardCampaignsCard } from "@/components/dashboard/campaigns-card"
import { DashboardFocusSection } from "@/components/dashboard/focus-section"
import { DashboardHeader, DashboardScopeNotice } from "@/components/dashboard/dashboard-header"
import { DashboardKpiBand } from "@/components/dashboard/kpi-band"
import { DashboardLiveBand } from "@/components/dashboard/live-sessions-band"
import { DashboardPipelineCard } from "@/components/dashboard/pipeline-card"
import { DashboardRecentSessionsCard } from "@/components/dashboard/recent-sessions-card"
import { DashboardTeamTable } from "@/components/dashboard/team-table"
import type { DashboardLiveSession } from "@/lib/dashboard/live"
import type { DashboardPeriod } from "@/lib/dashboard/period"
import type { DashboardOverview, DashboardScope } from "@/lib/dashboard/types"

/**
 * The page's composition. Every figure arrives in `overview`; this file only
 * orders sections and passes values down.
 *
 * The order answers, in turn: how the period went, who carried it, where the
 * pipeline leaks, who needs action, and what is coming. The live band is the
 * one exception to the order: it is now, not the period, and an Admin reading
 * the whole programme already has the Sessions page for it.
 */
export function DashboardPage({
  scope,
  period,
  today,
  overview,
  liveSessions,
}: {
  scope: DashboardScope
  period: DashboardPeriod
  today: string
  overview: DashboardOverview | null
  liveSessions: DashboardLiveSession[]
}) {
  const unassigned = scope.assistantUnassigned || overview === null
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

          <DashboardKpiBand
            kpis={overview.kpis}
            hasDialer={scope.hasDialer}
            trend={overview.attendanceTrend}
          />

          <DashboardAttendanceCard trend={overview.attendanceTrend} kpis={overview.kpis} />

          <DashboardTeamTable
            team={overview.team}
            role={scope.role}
            programScope={scope.programScope}
            hasDialer={scope.hasDialer}
          />

          <DashboardPipelineCard
            pipeline={overview.pipeline}
            kpis={overview.kpis}
            hasDialer={scope.hasDialer}
            periodLabel={period.label.toLowerCase()}
            campaigns={overview.campaigns}
          />

          <DashboardFocusSection segments={overview.focus} hasDialer={scope.hasDialer} mode={scope.mode} />

          {scope.hasDialer ? (
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <DashboardCampaignsCard campaigns={overview.campaigns} />
              <DashboardRecentSessionsCard sessions={overview.recentSessions} />
            </div>
          ) : (
            <DashboardRecentSessionsCard sessions={overview.recentSessions} />
          )}
        </>
      )}
    </div>
  )
}
