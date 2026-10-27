import { redirect } from "next/navigation"

import { CampaignEmptyState } from "@/components/campaign/campaign-empty-state"
import { CampaignList } from "@/components/campaign/campaign-list"
import { CampaignOverviewCards } from "@/components/campaign/campaign-overview-cards"
import { CampaignOverviewStats } from "@/components/campaign/campaign-overview-stats"
import { CampaignPageHeader } from "@/components/campaign/campaign-page-header"
import { CampaignStatusFilter } from "@/components/campaign/campaign-status-filter"
import { CampaignSubNav } from "@/components/campaign/campaign-sub-nav"
import { AuthzError } from "@/lib/authz"
import { listCampaignsWithProgress } from "@/lib/dialer/progress"
import { requireCampaignAdmin } from "@/lib/dialer/scope"

import { getCampaignStaff } from "./staff"

export const dynamic = "force-dynamic"

const STATUS_FILTERS = ["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]

function pluralise(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`
}

function readStatusFilter(value: string | string[] | undefined): StatusFilter | "all" {
  const raw = Array.isArray(value) ? value[0] : value
  return STATUS_FILTERS.find((status) => status === raw) ?? "all"
}

/**
 * The Campaign Overview: AD-2's admin gate, then each visible campaign with its
 * scoped `campaign_progress` summary.
 *
 * Campaign rows are program-level (AD-3), so every admin role reads the same
 * list; a Preacher's rows are not filtered, only their counts are narrowed, and
 * a campaign holding none of their contacts reads a true zero rather than
 * disappearing. The tiles and the table are both summed from the same summaries,
 * so no number here is computed a second time.
 *
 * Zero campaigns renders the empty state **instead of** the tiles: a screen of
 * five zeroes is not an answer, and UX-DR24's action is.
 */
export default async function CampaignsOverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  try {
    const staff = await getCampaignStaff()
    requireCampaignAdmin(staff)

    const params = await searchParams
    const statusFilter = readStatusFilter(params.status)

    const { campaigns } = await listCampaignsWithProgress(staff)
    const visible =
      statusFilter === "all" ? campaigns : campaigns.filter((entry) => entry.campaign.status === statusFilter)
    const draft = visible.filter((entry) => entry.campaign.status === "DRAFT").length
    const cancelled = visible.filter((entry) => entry.campaign.status === "CANCELLED").length

    return (
      <>
        <CampaignPageHeader
          title="Overview"
          subtitle={`${campaigns.length} ${campaigns.length === 1 ? "campaign" : "campaigns"} · folk programme`}
          actionHref="/campaigns/new"
          actionLabel="New campaign"
          filters={<CampaignStatusFilter value={statusFilter === "all" ? "all" : statusFilter} />}
        />
        <CampaignSubNav role={staff.role} hasActiveCallerProfile={staff.hasActiveCallerProfile} />
        {campaigns.length === 0 ? (
          <CampaignEmptyState
            title="No campaigns yet"
            description="Create a campaign to start reaching contacts in this programme."
            actionHref="/campaigns/new"
            actionLabel="Create campaign"
          />
        ) : visible.length === 0 ? (
          <CampaignEmptyState
            title={`No ${statusFilter.toLowerCase()} campaigns`}
            description="No campaign in this programme holds that status right now."
            actionHref="/campaigns"
            actionLabel="Show all campaigns"
          />
        ) : (
          <div className="flex flex-col gap-4">
            <CampaignOverviewStats entries={visible} />

            {/*
              AD-5: a queued disposition has no call log until its replay lands,
              so it is not in any count above. There is no queue yet and no
              number to show; the line qualifies the totals rather than counting
              a queue.
            */}
            <p className="text-xs text-[var(--muted-foreground)]">
              Queued dispositions are not counted until their replay lands.
            </p>

            <CampaignList entries={visible} />
            <CampaignOverviewCards entries={visible} />

            <p className="text-xs text-[var(--muted-foreground)]">
              {pluralise(visible.length, "campaign")} · {draft} draft · {cancelled} cancelled
            </p>
          </div>
        )}
      </>
    )
  } catch (error) {
    if (error instanceof AuthzError && error.status === 401) {
      redirect("/login?redirect=/campaigns")
    }

    // Only the gate's refusal is an authorization failure. A read error is a
    // 500 and belongs on the error page, not on a redirect that would blame the
    // reader's role for a database fault.
    if (error instanceof AuthzError && error.status === 403) {
      redirect("/auth/error?code=staff-authorization-failed")
    }

    console.error("[campaigns] overview failed", error)
    throw error
  }
}
