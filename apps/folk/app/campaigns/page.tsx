import { redirect } from "next/navigation"

import { CampaignEmptyState } from "@/components/campaign/campaign-empty-state"
import { CampaignPageHeader } from "@/components/campaign/campaign-page-header"
import { AuthzError } from "@/lib/authz"
import { requireCampaignAdmin } from "@/lib/dialer/scope"

import { getCampaignStaff } from "./staff"

export const dynamic = "force-dynamic"

/**
 * The Campaign overview.
 *
 * AD-2's admin gate and nothing else: `requireCampaignAdmin` admits an admin,
 * preacher or assistant and refuses a volunteer. The scope helpers that would
 * narrow the page to a preacher's own campaigns belong to the story that
 * lists campaigns, so this page shows the shell and the empty state only.
 */
export default async function CampaignsOverviewPage() {
  try {
    const staff = await getCampaignStaff()
    requireCampaignAdmin(staff)

    return (
      <>
        <CampaignPageHeader
          title="Overview"
          subtitle="Campaigns · folk programme"
          actionHref="/campaigns/new"
          actionLabel="New campaign"
        />
        <CampaignEmptyState
          title="No campaigns yet"
          description="Create a campaign to start reaching contacts in this programme."
          actionHref="/campaigns/new"
          actionLabel="Create campaign"
        />
      </>
    )
  } catch (error) {
    if (error instanceof AuthzError && error.status === 401) {
      redirect("/login?redirect=/campaigns")
    }

    if (error instanceof AuthzError) {
      redirect("/auth/error?code=staff-authorization-failed")
    }

    console.error("[campaigns] overview failed", error)
    throw error
  }
}
