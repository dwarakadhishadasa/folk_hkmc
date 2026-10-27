import { redirect } from "next/navigation"

import { CampaignEmptyState } from "@/components/campaign/campaign-empty-state"
import { CampaignPageHeader } from "@/components/campaign/campaign-page-header"
import { CampaignSubNav } from "@/components/campaign/campaign-sub-nav"
import { AuthzError } from "@/lib/authz"
import { requireDialerCaller } from "@/lib/dialer/scope"

import { getCampaignStaff } from "../staff"

export const dynamic = "force-dynamic"

/**
 * The caller's assignments.
 *
 * AD-2's caller gate: `requireDialerCaller` admits any staff member holding
 * an active `dialer_callers` profile and refuses a staff member with no
 * profile, or with a deactivated one. The queue itself is the next story's
 * read, so this page shows the empty state — actionable, never blank.
 */
export default async function CampaignAssignmentsPage() {
  try {
    const staff = await getCampaignStaff()
    await requireDialerCaller(staff)

    return (
      <>
        <CampaignPageHeader title="Assignments" subtitle="Your call queue" />
        <CampaignSubNav role={staff.role} hasActiveCallerProfile={staff.hasActiveCallerProfile} />
        <CampaignEmptyState
          title="No calls assigned yet"
          description="An Admin or Preacher assigns contacts to you. Your next call appears here as soon as one is assigned."
        />
      </>
    )
  } catch (error) {
    if (error instanceof AuthzError && error.status === 401) {
      redirect("/login?redirect=/campaigns/assignments")
    }

    if (error instanceof AuthzError) {
      redirect("/auth/error?code=staff-authorization-failed")
    }

    console.error("[campaigns] assignments failed", error)
    throw error
  }
}
