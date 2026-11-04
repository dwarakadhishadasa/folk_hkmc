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
import { AuthzError, requireRole, type StaffContext } from "@/lib/authz"
import { listCampaigns } from "@/lib/dialer/campaigns"
import {
  getSessionsOverviewStats,
  getSessionsReport,
  getSessionsTopAttendees,
  listSessionsOverview,
} from "@/lib/sessions/data"
import { pluralise, reportRangeDates, reportRangeLabel } from "@/lib/sessions/format"
import { sessionsLocations, sessionsScope } from "@/lib/sessions/scope"
import { getServerProgramProfile } from "@hkmc/program-config/server"

import { getSessionsStaff } from "./staff"

export const dynamic = "force-dynamic"

const INSIGHT_RANGE = "90" as const

/**
 * The Campaign dropdown's options. The list is the reader's own scope-aware
 * campaign list, not a new trust boundary, and a programme without the Campaign
 * module offers nothing. An Assistant with no active assigned preacher has no
 * campaign scope; `/sessions` must still render, so that one refusal is `[]`.
 */
async function campaignOptions(staff: StaffContext) {
  if (!getServerProgramProfile(staff.programId).modules.dialer) {
    return []
  }

  try {
    const campaigns = await listCampaigns(staff)

    return campaigns
      .filter((campaign) => campaign.status !== "CANCELLED")
      .map((campaign) => ({
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        campaignDate: campaign.campaign_date,
      }))
  } catch (error) {
    if (error instanceof AuthzError && error.code === "campaign_scope_missing") {
      return []
    }

    throw error
  }
}

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
 * and rendered above the session list rather than behind a tab. The list itself
 * — the desktop table and its phone cards — is the page's last section.
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
    const [rows, stats, locationOptions, report, topAttendees, campaigns] = await Promise.all([
      listSessionsOverview(scope),
      getSessionsOverviewStats(scope),
      sessionsLocations(scope),
      getSessionsReport(scope, range.from, range.to),
      getSessionsTopAttendees(scope, range.from, range.to),
      campaignOptions(staff),
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
          action={<NewSessionPopover locations={locationOptions.create} campaigns={campaigns} />}
        />

        {stats.sessionsCount === 0 ? (
          <CampaignEmptyState
            title="No sessions yet"
            description="A session opens an attendance window for one location. Start the first one and it appears here as Live now."
            action={<NewSessionPopover locations={locationOptions.create} campaigns={campaigns} />}
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

            <SessionOverviewCharts
              rows={visible}
              report={report}
              topAttendees={topAttendees}
              rangeLabel={rangeLabel}
            />

            {/* The list is the page's last section: the phone cards and the
                desktop table are one surface in two shapes, with the count and
                status note beneath them. */}
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
