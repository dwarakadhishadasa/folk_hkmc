import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { notFound, redirect } from "next/navigation"

import { AssignContactsDesktopGate } from "@/components/campaign/assign-contacts-desktop-gate"
import { CampaignPageHeader } from "@/components/campaign/campaign-page-header"
import { AuthzError } from "@/lib/authz"
import { listAssignableCallers } from "@/lib/dialer/assignments"
import { getCampaign } from "@/lib/dialer/campaigns"
import { requireCampaignAdmin } from "@/lib/dialer/scope"
import { listLocations } from "@/lib/supabase/data"

import { getCampaignStaff } from "../../staff"

export const dynamic = "force-dynamic"

/**
 * Frame 324's assign-contacts surface.
 *
 * The page is the AD-2 gate and the two reads the client cannot do itself: the
 * campaign (which turns a missing, malformed or other-program id into one 404),
 * AD-3's assignable caller set, and the programme's location lexicon so the
 * grid can print a location name instead of the stored id. Paging, selection,
 * facets and the split preview are the client surface's state, because they
 * change without a navigation.
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
    const callers = await listAssignableCallers(staff)
    const locations = (await listLocations()).map((location) => ({ id: location.id, name: location.name }))

    return (
      <>
        <div className="flex flex-col gap-3">
          <Link
            href={`/campaigns/${campaign.id}`}
            className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--program-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to campaign
          </Link>

          <CampaignPageHeader title="Assign contacts" subtitle={`${campaign.name} · folk programme`} />
        </div>

        <AssignContactsDesktopGate campaignId={campaign.id} callers={callers} locations={locations} />
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
