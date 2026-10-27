import { redirect } from "next/navigation"

import { CallerRoster } from "@/components/campaign/caller-roster"
import { CampaignEmptyState } from "@/components/campaign/campaign-empty-state"
import { CampaignPageHeader } from "@/components/campaign/campaign-page-header"
import { CampaignSubNav } from "@/components/campaign/campaign-sub-nav"
import { AuthzError } from "@/lib/authz"
import { listRoster } from "@/lib/dialer/callers"
import { getRosterProgress } from "@/lib/dialer/progress"
import { requireCampaignAdmin } from "@/lib/dialer/scope"

import { getCampaignStaff } from "../staff"

export const dynamic = "force-dynamic"

/**
 * The Callers screen: AD-3's scoped roster, and no way to add to it.
 *
 * `listRoster` is the scope — Admin sees the programme, Preacher and Assistant
 * their own set plus themselves — so this page applies no filter of its own. The
 * counts in the subtitle are the returned rows', which is why they are computed
 * here rather than in a second read.
 *
 * `getRosterProgress` is the roster's performance columns: one aggregation of
 * `campaign_progress` across every campaign the same reader can see, so a
 * Preacher's column is narrowed by the same predicate as the campaign table.
 *
 * There is deliberately no add, invite, import or manage-user control (UX-DR32):
 * a caller is a staff user promoted on their first assignment (Story 1.8), and
 * the header's two design buttons were removed on purpose.
 */
export default async function CampaignCallersPage() {
  try {
    const staff = await getCampaignStaff()
    requireCampaignAdmin(staff)

    const callers = await listRoster(staff)
    const progress = await getRosterProgress(staff)
    const active = callers.filter((caller) => caller.isActive).length
    const inactive = callers.filter((caller) => caller.deactivated).length

    return (
      <>
        <CampaignPageHeader
          title="Callers"
          subtitle={`${active} active · ${inactive} inactive · folk programme`}
        />
        <CampaignSubNav role={staff.role} hasActiveCallerProfile={staff.hasActiveCallerProfile} />

        {callers.length === 0 ? (
          <CampaignEmptyState
            title="No callers in your scope yet"
            description="Callers are staff users promoted on their first assignment. Assign contacts to a staff member from a campaign, and they appear here."
            actionHref="/campaigns"
            actionLabel="View campaigns"
          />
        ) : (
          <CallerRoster entries={callers} progress={progress} canManage={staff.role === "Admin"} />
        )}
      </>
    )
  } catch (error) {
    if (error instanceof AuthzError && error.status === 401) {
      redirect("/login?redirect=/campaigns/callers")
    }

    // Only the gate's refusal is an authorization failure. A read error keeps
    // its own status and belongs on the error page, not on a redirect that would
    // blame the reader's role for a database fault.
    if (error instanceof AuthzError && error.status === 403) {
      redirect("/auth/error?code=staff-authorization-failed")
    }

    console.error("[campaigns] callers failed", error)
    throw error
  }
}
