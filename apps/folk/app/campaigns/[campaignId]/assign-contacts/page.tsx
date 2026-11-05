import { notFound, redirect } from "next/navigation"

import { AssignContactsDesktopGate } from "@/components/campaign/assign-contacts-desktop-gate"
import { CampaignAssignHeader } from "@/components/campaign/campaign-assign-header"
import { CampaignCompletedReport } from "@/components/campaign/campaign-completed-report"
import { AuthzError } from "@/lib/authz"
import { listAllAssignableContacts, listAssignableCallers } from "@/lib/dialer/assignments"
import { getCampaign } from "@/lib/dialer/campaigns"
import { getCampaignProgress } from "@/lib/dialer/progress"
import { requireCampaignAdmin } from "@/lib/dialer/scope"
import { listLocations } from "@/lib/supabase/data"

import { getCampaignStaff } from "../../staff"

export const dynamic = "force-dynamic"

/**
 * Frame 324's assign-contacts surface, now also the campaign's property sheet.
 *
 * The page is the AD-2 gate and the reads the client cannot do itself: the
 * campaign (which turns a missing, malformed or other-program id into one 404),
 * AD-3's assignable caller set, the programme's location lexicon, and the whole
 * scoped contact set — the grid sorts, filters and selects across all of it.
 *
 * A COMPLETED campaign takes no assignments, so it is not shown the grid at all:
 * it is a finished campaign, and the page reads as its report. That is also the
 * only place a closed campaign is opened from, since the list's action is Open.
 */
export default async function AssignContactsPage({
  params,
}: {
  params: Promise<{ campaignId: string }>
}) {
  const { campaignId } = await params

  try {
    const staff = await getCampaignStaff()
    requireCampaignAdmin(staff)
    const campaign = await getCampaign(staff, campaignId)

    if (campaign.status === "COMPLETED") {
      const progress = await getCampaignProgress(staff, campaign.id)

      return (
        <>
          <CampaignAssignHeader
            campaign={{
              id: campaign.id,
              name: campaign.name,
              description: campaign.description,
              campaignDate: campaign.campaign_date,
              status: campaign.status,
            }}
          />

          <CampaignCompletedReport summary={progress.summary} callers={progress.callers} />
        </>
      )
    }

    const [contacts, callers, locations] = await Promise.all([
      listAllAssignableContacts(staff, campaign.id),
      listAssignableCallers(staff),
      listLocations(),
    ])

    return (
      <>
        <CampaignAssignHeader
          campaign={{
            id: campaign.id,
            name: campaign.name,
            description: campaign.description,
            campaignDate: campaign.campaign_date,
            status: campaign.status,
          }}
        />

        <AssignContactsDesktopGate
          campaignId={campaign.id}
          campaignStatus={campaign.status}
          contacts={contacts}
          callers={callers.map((caller) => ({
            userId: caller.userId,
            name: caller.name,
            email: caller.email,
            role: caller.role,
            ...(caller.callerId ? { callerId: caller.callerId } : {}),
          }))}
          locations={locations.map((location) => ({ id: location.id, name: location.name }))}
        />
      </>
    )
  } catch (error) {
    if (error instanceof AuthzError && error.status === 401) {
      redirect(`/login?redirect=/campaigns/${campaignId}/assign-contacts`)
    }

    if (error instanceof AuthzError && error.status === 404) {
      notFound()
    }

    // Only the gate's refusal is an authorization failure; a read error keeps
    // its own status and surfaces as an error, not as a role refusal.
    if (error instanceof AuthzError && error.status === 403) {
      redirect("/auth/error?code=staff-authorization-failed")
    }

    console.error("[campaigns] assign contacts failed", error)
    throw error
  }
}
