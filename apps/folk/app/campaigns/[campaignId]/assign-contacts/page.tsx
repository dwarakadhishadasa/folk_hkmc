import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { notFound, redirect } from "next/navigation"

import { AssignContactsDesktopGate } from "@/components/campaign/assign-contacts-desktop-gate"
import { AuthzError } from "@/lib/authz"
import { listAllAssignableContacts, listAssignableCallers } from "@/lib/dialer/assignments"
import { getCampaign } from "@/lib/dialer/campaigns"
import { requireCampaignAdmin } from "@/lib/dialer/scope"
import { listLocations } from "@/lib/supabase/data"

import { getCampaignStaff } from "../../staff"

export const dynamic = "force-dynamic"

/**
 * Frame 324's assign-contacts surface.
 *
 * The page is the AD-2 gate and the reads the client cannot do itself: the
 * campaign (which turns a missing, malformed or other-program id into one 404),
 * AD-3's assignable caller set, the programme's location lexicon, and the whole
 * scoped contact set — the grid sorts, filters and selects across all of it, so
 * a page would make its toolbar and its footer describe different populations.
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
    const [contacts, callers, locations] = await Promise.all([
      listAllAssignableContacts(staff, campaign.id),
      listAssignableCallers(staff),
      listLocations(),
    ])

    return (
      <>
        <div className="flex h-[50px] items-center gap-4">
          <Link
            href={`/campaigns/${campaign.id}/edit`}
            aria-label="Back to campaign"
            className="flex size-10 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-card text-[var(--program-text)] transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]"
          >
            <ArrowLeft className="size-[18px]" aria-hidden="true" />
          </Link>

          <h1 className="font-[family-name:var(--font-poppins)] text-[22px] font-semibold leading-tight tracking-tight text-[var(--program-text)]">
            Assign contacts
          </h1>
        </div>

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
