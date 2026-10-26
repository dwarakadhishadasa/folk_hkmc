import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { redirect } from "next/navigation"

import { NewCampaignForm } from "@/components/campaign/new-campaign-form"
import { AuthzError } from "@/lib/authz"
import { requireCampaignAdmin } from "@/lib/dialer/scope"

import { getCampaignStaff } from "../staff"

export const dynamic = "force-dynamic"

/**
 * The new-campaign surface (frame 212).
 *
 * AD-2's admin gate, the same refusal `/campaigns` applies — the server route
 * refuses a Volunteer again, so hiding this page would not be the boundary.
 * The survey step in the frame belongs to Story 1.5, so this page ends at the
 * form's submit and the campaign it creates.
 */
export default async function NewCampaignPage() {
  try {
    const staff = await getCampaignStaff()
    requireCampaignAdmin(staff)

    return (
      <>
        <div className="flex flex-col gap-3">
          <Link
            href="/campaigns"
            className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--program-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to campaigns
          </Link>

          <div>
            <h1 className="font-[family-name:var(--font-poppins)] text-[22px] font-semibold leading-tight tracking-tight text-[var(--program-text)]">
              New campaign
            </h1>
            <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
              Name it, choose when it ends, and set the calling pace.
            </p>
          </div>
        </div>

        <NewCampaignForm />
      </>
    )
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
