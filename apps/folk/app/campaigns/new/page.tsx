import { redirect } from "next/navigation"

import { NewCampaignForm } from "@/components/campaign/new-campaign-form"
import { AuthzError } from "@/lib/authz"
import { requireCampaignAdmin } from "@/lib/dialer/scope"

import { getCampaignStaff } from "../staff"

export const dynamic = "force-dynamic"

/**
 * Frame 212 — the one screen that names a campaign and its survey.
 *
 * AD-2's admin gate, the same refusal `/campaigns` applies: the server route
 * refuses a Volunteer again, so hiding this page would not be the boundary.
 * The form owns the frame's head (back control, title, Next) because the action
 * submits the same form the two panels belong to.
 */
export default async function NewCampaignPage() {
  try {
    const staff = await getCampaignStaff()
    requireCampaignAdmin(staff)

    return <NewCampaignForm />
  } catch (error) {
    if (error instanceof AuthzError && error.status === 401) {
      redirect("/login?redirect=/campaigns/new")
    }

    if (error instanceof AuthzError && error.status === 403) {
      redirect("/auth/error?code=staff-authorization-failed")
    }

    console.error("[campaigns] new campaign failed", error)
    throw error
  }
}
