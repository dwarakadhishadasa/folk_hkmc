import { redirect } from "next/navigation"

import { CampaignEmptyState } from "@/components/campaign/campaign-empty-state"
import { CampaignPageHeader } from "@/components/campaign/campaign-page-header"
import { CampaignSubNav } from "@/components/campaign/campaign-sub-nav"
import { ReportActivityCard } from "@/components/campaign/reports/report-activity-card"
import { formatCampaignDate } from "@/components/campaign/reports/report-format"
import { ReportKpis } from "@/components/campaign/reports/report-kpis"
import { ReportLeaderboardCard } from "@/components/campaign/reports/report-leaderboard-card"
import { ReportOutcomeMixCard } from "@/components/campaign/reports/report-outcome-mix-card"
import { ReportCampaignPicker, ReportExportButton } from "@/components/campaign/reports/report-toolbar"
import { AuthzError } from "@/lib/authz"
import { listCampaigns } from "@/lib/dialer/campaigns"
import { getCampaignProgress } from "@/lib/dialer/progress"
import { requireCampaignAdmin } from "@/lib/dialer/scope"

import { getCampaignStaff } from "../staff"

export const dynamic = "force-dynamic"

function readCampaignParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  return raw?.trim() ? raw : null
}

/**
 * The reports screen — frame 790 on a desktop and frame 1968 on a phone, with
 * Story 3.3's Confirmed bucket and its reduced-view statement.
 *
 * One campaign is selected at a time because `campaign_progress` answers one
 * campaign at a time and the design's subtitle names one. The URL carries the
 * choice; an absent or unknown id falls back to the newest ACTIVE campaign and
 * then to the newest campaign, so a stale link still lands on a report rather
 * than a 404. A campaign that exists outside this program is never a fallback:
 * `listCampaigns` is the program's own list.
 *
 * Every number on this page is the RPC's. The page does not total a roster row,
 * derive a percentage for display or recount a call log; the KPI band, the
 * mix, the leaderboard and the activity list are four views of one payload.
 */
export default async function CampaignReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  try {
    const staff = await getCampaignStaff()
    requireCampaignAdmin(staff)

    const params = await searchParams
    const requestedId = readCampaignParam(params.campaign)
    const campaigns = await listCampaigns(staff)

    if (campaigns.length === 0) {
      return (
        <>
          <CampaignPageHeader title="Reports" subtitle="folk programme" />
          <CampaignSubNav role={staff.role} />
          <CampaignEmptyState
            title="No campaigns yet"
            description="A report starts with a campaign, its contacts and a caller who works the queue. Create the first campaign to begin."
            actionHref="/campaigns/new"
            actionLabel="Create campaign"
          />
        </>
      )
    }

    const campaign =
      campaigns.find((entry) => entry.id === requestedId) ??
      campaigns.find((entry) => entry.status === "ACTIVE") ??
      campaigns[0]!

    const progress = await getCampaignProgress(staff, campaign.id)
    const subtitle = `${campaign.name} · ${formatCampaignDate(campaign.campaign_date)}`
    const hasAssignments = progress.summary.assigned > 0
    const assignmentActionHref =
      campaign.status === "DRAFT" || campaign.status === "ACTIVE"
        ? `/campaigns/${campaign.id}/assign-contacts`
        : "/campaigns"

    const toolbar = (
      <div className="flex flex-wrap items-center gap-2">
        <ReportCampaignPicker
          campaigns={campaigns.map((entry) => ({
            id: entry.id,
            name: entry.name,
            status: entry.status,
          }))}
          selectedId={campaign.id}
        />
        <div data-report-export="desktop" className="hidden md:block">
          <ReportExportButton campaignId={campaign.id} campaignName={campaign.name} />
        </div>
      </div>
    )

    return (
      <>
        <CampaignPageHeader title="Reports" subtitle={subtitle} filters={toolbar} />
        <CampaignSubNav role={staff.role} />

        {hasAssignments ? (
          <>
            <ReportKpis summary={progress.summary} />

            <p className="text-xs text-[var(--muted-foreground)]">
              Queued dispositions are not counted until their replay lands.
            </p>

            {progress.summary.attempted === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--border)] bg-card px-4 py-3 text-[13px] text-[var(--muted-foreground)]">
                No calls have been recorded in this campaign yet.
                {campaign.status === "DRAFT"
                  ? " Start the campaign so callers can work the queue."
                  : " The queue is ready for its first caller."}
              </p>
            ) : null}

            <div className="hidden gap-5 md:grid md:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] md:items-start">
              <div className="flex flex-col gap-5">
                <ReportOutcomeMixCard outcomes={progress.outcomes} />
              </div>
              <div className="flex flex-col gap-5">
                <ReportLeaderboardCard callers={progress.callers} />
                <ReportActivityCard recent={progress.recent} campaignName={campaign.name} />
              </div>
            </div>

            <div className="flex flex-col gap-5 md:hidden">
              <ReportLeaderboardCard callers={progress.callers} />
              <p className="rounded-xl border border-[var(--border)] bg-card px-4 py-3 text-[13px] text-[var(--muted-foreground)]">
                Outcome mix and recent activity are available on desktop.
              </p>
            </div>

            <div
              data-report-export="mobile"
              className="sticky bottom-[var(--mobile-app-nav-inset,0px)] z-20 -mx-6 mt-auto border-t border-[var(--border)] bg-card px-4 py-4 md:hidden"
            >
              <ReportExportButton
                campaignId={campaign.id}
                campaignName={campaign.name}
                fullWidth
                variant="outline"
              />
            </div>
          </>
        ) : (
          <CampaignEmptyState
            title="Nothing to report yet"
            description={
              campaign.status === "DRAFT"
                ? "Assign contacts to this campaign, then start it. The funnel fills as callers work the queue."
                : campaign.status === "ACTIVE"
                  ? "Assign contacts to this campaign to create the first report. Never attempted is its own bucket, so a campaign that has not been worked is visible as one."
                  : "This campaign is terminal and holds no assignments, so there is no reporting history to show."
            }
            actionHref={assignmentActionHref}
            actionLabel={campaign.status === "DRAFT" || campaign.status === "ACTIVE" ? "Assign contacts" : "View campaigns"}
          />
        )}
      </>
    )
  } catch (error) {
    if (error instanceof AuthzError && error.status === 401) {
      redirect("/login?redirect=/campaigns/reports")
    }

    // Only the gate's refusal is an authorization failure. A read error keeps
    // its own status and belongs on the error page, not on a redirect that
    // would blame the reader's role for a database fault.
    if (error instanceof AuthzError && error.status === 403) {
      redirect("/auth/error?code=staff-authorization-failed")
    }

    console.error("[campaigns] reports failed", error)
    throw error
  }
}
