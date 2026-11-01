import { redirect } from "next/navigation"
import { Info } from "lucide-react"

import { CampaignEmptyState } from "@/components/campaign/campaign-empty-state"
import { NewSessionPopover } from "@/components/sessions/new-session-popover"
import { SessionLiveStrip } from "@/components/sessions/session-live-strip"
import { SessionLocationFilter } from "@/components/sessions/session-location-filter"
import { SessionOverviewCards } from "@/components/sessions/session-overview-cards"
import { SessionOverviewCharts } from "@/components/sessions/session-overview-charts"
import { SessionOverviewStats } from "@/components/sessions/session-overview-stats"
import { SessionOverviewTable } from "@/components/sessions/session-overview-table"
import { SessionPageHeader } from "@/components/sessions/session-page-header"
import { SessionsAutoRefresh } from "@/components/sessions/session-auto-refresh"
import { AuthzError, requireRole } from "@/lib/authz"
import {
  getSessionsOverviewStats,
  getSessionsReport,
  listSessionsOverview,
} from "@/lib/sessions/data"
import { pluralise, reportRangeDates, reportRangeLabel } from "@/lib/sessions/format"
import { sessionsLocations, sessionsScope } from "@/lib/sessions/scope"

import { getSessionsStaff } from "./staff"

export const dynamic = "force-dynamic"

const INSIGHT_RANGE = "90" as const

function readLocationParam(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value
  return raw?.trim() ? raw.trim() : "all"
}

/**
 * The Sessions Overview: every session in the staff member's scope, newest
 * first, with its derived status and attendance total.
 *
 * The figures are the scope's, not the filter's — the design's footer is the
 * one place the filtered count appears ("48 sessions · showing 5"). A location
 * filter narrows the rows only.
 *
 * The reporting window's two charts live here now: the separate Reports route
 * was retired, so `sessions_report` is read once for the default 90-day window
 * and rendered beside the table rather than behind a tab.
 *
 * `SessionsAutoRefresh` is handed the rows' open/close boundaries so a page
 * left open flips a row at its own boundary without a reload or a write.
 */
export default async function SessionsOverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  try {
    const staff = await getSessionsStaff()
    requireRole(staff, ["Admin", "Preacher", "Assistant"])

    const params = await searchParams
    const locationFilter = readLocationParam(params.location)

    const scope = await sessionsScope(staff)
    const range = reportRangeDates(INSIGHT_RANGE)
    const rangeLabel = reportRangeLabel(INSIGHT_RANGE)
    const [rows, stats, locationOptions, report] = await Promise.all([
      listSessionsOverview(scope),
      getSessionsOverviewStats(scope),
      sessionsLocations(scope),
      getSessionsReport(scope, range.from, range.to),
    ])
    const locations = locationOptions.filter

    const visible = locationFilter === "all" ? rows : rows.filter((row) => row.locationId === locationFilter)
    const boundaries = JSON.stringify(rows.map(({ opensAt, closesAt }) => ({ opensAt, closesAt })))
    const subtitle = `${pluralise(stats.sessionsCount, "session")} · folk programme`

    return (
      <>
        <SessionPageHeader
          title="Sessions"
          subtitle={subtitle}
          filters={
            locations.length > 0 ? (
              <div className="hidden md:block">
                <SessionLocationFilter locations={locations} />
              </div>
            ) : null
          }
          action={<NewSessionPopover locations={locationOptions.create} />}
        />

        {stats.sessionsCount === 0 ? (
          <CampaignEmptyState
            title="No sessions yet"
            description="A session opens an attendance window for one location. Start the first one and it appears here as Live now."
            action={<NewSessionPopover locations={locationOptions.create} />}
          />
        ) : visible.length === 0 ? (
          <CampaignEmptyState
            title="No sessions at this location"
            description="This location holds no sessions in your scope. Choose another location or show them all."
            actionHref="/sessions"
            actionLabel="Show all sessions"
          />
        ) : (
          <>
            <SessionLiveStrip rows={visible} />
            <SessionOverviewStats stats={stats} />

            <SessionOverviewTable rows={visible} />
            <SessionOverviewCards rows={visible} />

            <div className="flex flex-col gap-1 text-[11px] text-[var(--muted-foreground)] sm:flex-row sm:items-center sm:justify-between">
              <p>
                {pluralise(stats.sessionsCount, "session")} · showing {visible.length}
              </p>
              <p className="flex items-start gap-1.5">
                <Info className="mt-px size-3 shrink-0" aria-hidden="true" />
                <span>
                  Status is automatic — a session completes once its duration elapses. Select one for its
                  attendees.
                </span>
              </p>
            </div>

            <SessionOverviewCharts rows={visible} report={report} rangeLabel={rangeLabel} />
            <SessionsAutoRefresh boundaries={boundaries} />
          </>
        )}
      </>
    )
  } catch (error) {
    if (error instanceof AuthzError && error.status === 401) {
      redirect("/login?redirect=/sessions")
    }

    if (error instanceof AuthzError && error.status === 403) {
      redirect("/auth/error?code=staff-authorization-failed")
    }

    console.error("[sessions] overview failed", error)
    throw error
  }
}
