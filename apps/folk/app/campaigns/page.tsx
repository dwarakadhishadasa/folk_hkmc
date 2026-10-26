import { redirect } from "next/navigation"

import { CampaignEmptyState } from "@/components/campaign/campaign-empty-state"
import { CampaignList } from "@/components/campaign/campaign-list"
import { CampaignPageHeader } from "@/components/campaign/campaign-page-header"
import { AuthzError } from "@/lib/authz"
import { listCampaigns } from "@/lib/dialer/campaigns"
import { requireCampaignAdmin } from "@/lib/dialer/scope"

import { getCampaignStaff } from "./staff"

export const dynamic = "force-dynamic"

/**
 * The Campaign overview: AD-2's admin gate, then the program's campaigns.
 *
 * Campaign rows are program-level (AD-3), so every admin role reads the same
 * list and no preacher scope narrows it. The table carries only the columns
 * this story can compute — the frame's Assigned / Reached / Confirmed / Never
 * attempted counts belong to the reporting story and are absent, not zeroed.
 */
export default async function CampaignsOverviewPage() {
  try {
    const staff = await getCampaignStaff()
    requireCampaignAdmin(staff)

    const campaigns = await listCampaigns(staff)

    return (
      <>
        <CampaignPageHeader
          title="Overview"
          subtitle="Campaigns · folk programme"
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
          <CampaignList campaigns={campaigns} />
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
