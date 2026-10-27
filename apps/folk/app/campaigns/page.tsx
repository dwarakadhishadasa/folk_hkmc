import { redirect } from "next/navigation"

import { CampaignEmptyState } from "@/components/campaign/campaign-empty-state"
import { CampaignList } from "@/components/campaign/campaign-list"
import { CampaignOverviewCards } from "@/components/campaign/campaign-overview-cards"
import { CampaignOverviewStats } from "@/components/campaign/campaign-overview-stats"
import { CampaignPageHeader } from "@/components/campaign/campaign-page-header"
import { AuthzError } from "@/lib/authz"
import { listCampaignsWithProgress } from "@/lib/dialer/progress"
import { requireCampaignAdmin } from "@/lib/dialer/scope"

import { getCampaignStaff } from "./staff"

export const dynamic = "force-dynamic"

function pluralise(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`
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
export default async function CampaignsOverviewPage() {
  try {
    const staff = await getCampaignStaff()
    requireCampaignAdmin(staff)

    const { campaigns } = await listCampaignsWithProgress(staff)
    const draft = campaigns.filter((entry) => entry.campaign.status === "DRAFT").length
    const cancelled = campaigns.filter((entry) => entry.campaign.status === "CANCELLED").length

    return (
      <>
        <CampaignPageHeader
          title="Overview"
          subtitle={`${campaigns.length} ${campaigns.length === 1 ? "campaign" : "campaigns"} · folk programme`}
          actionHref="/campaigns/new"
          actionLabel="New campaign"
        />
        {campaigns.length === 0 ? (
          <CampaignEmptyState
            title="No campaigns yet"
            description="Create a campaign to start reaching contacts in this programme."
            actionHref="/campaigns/new"
            actionLabel="Create campaign"
          />
        ) : (
          <div className="flex flex-col gap-4">
            <CampaignOverviewStats entries={campaigns} />

            {/*
              AD-5: a queued disposition has no call log until its replay lands,
              so it is not in any count above. There is no queue yet and no
              number to show; the line qualifies the totals rather than counting
              a queue.
            */}
            <p className="text-xs text-[var(--muted-foreground)]">
              Queued dispositions are not counted until their replay lands.
            </p>

            <CampaignList entries={campaigns} />
            <CampaignOverviewCards entries={campaigns} />

            <p className="text-xs text-[var(--muted-foreground)]">
              {pluralise(campaigns.length, "campaign")} · {draft} draft · {cancelled} cancelled
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
