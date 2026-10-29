import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { notFound, redirect } from "next/navigation"

import { CampaignDetailsForm } from "@/components/campaign/campaign-details-form"
import { CampaignLifecycleActions } from "@/components/campaign/campaign-lifecycle-actions"
import { CampaignPageHeader } from "@/components/campaign/campaign-page-header"
import { CampaignStatusPill } from "@/components/campaign/campaign-status-pill"
import { CampaignSubNav } from "@/components/campaign/campaign-sub-nav"
import { CampaignSurveyBuilder } from "@/components/campaign/campaign-survey-builder"
import { Button } from "@/components/ui/button"
import { AuthzError } from "@/lib/authz"
import { getCampaign } from "@/lib/dialer/campaigns"
import { listCampaignQuestions } from "@/lib/dialer/surveys"

import { getCampaignStaff } from "../../staff"

export const dynamic = "force-dynamic"

/**
 * AD-12: a completed or cancelled campaign is terminal, so it takes no new
 * assignments. The entry point is absent there rather than disabled: a control
 * that can never succeed is not an affordance.
 */
function campaignAcceptsAssignments(status: string): boolean {
  return status === "DRAFT" || status === "ACTIVE"
}

/**
 * The campaign's edit surface: the same campaign frame as its detail page, with
 * the detail's two actions replaced by "Reassign contacts" and "Save".
 *
 * Save writes the campaign's own details (name, description, end date). The
 * survey below keeps its per-question writes — a question is created, edited or
 * retired on its own, and folding those into one page-wide Save would turn a
 * half-finished question into a silent discard.
 */
export default async function EditCampaignPage({
  params,
}: {
  params: Promise<{ campaignId: string }>
}) {
  const { campaignId } = await params

  try {
    const staff = await getCampaignStaff()
    const campaign = await getCampaign(staff, campaignId)
    const questions = await listCampaignQuestions(staff, campaignId, { includeRetired: true })

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

          <CampaignPageHeader title={campaign.name} subtitle="Campaign · folk programme" />
          <CampaignSubNav role={staff.role} />
        </div>

        <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-card">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold tracking-[0.04em] text-[var(--muted-foreground)] uppercase">
                Status
              </span>
              <CampaignStatusPill status={campaign.status} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {campaignAcceptsAssignments(campaign.status) ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/campaigns/${campaign.id}/assign-contacts`}>Reassign contacts</Link>
                </Button>
              ) : null}
              <Button type="submit" form="campaign-details-form" size="sm">
                Save
              </Button>
              {/*
                Start is the one lifecycle action this page replaces: a campaign
                is started by assigning it contacts on frame 324. Complete and
                Cancel are not replaced, so an ACTIVE campaign keeps them —
                without them the list's own link would have no route to either.
              */}
              {campaign.status === "ACTIVE" ? (
                <CampaignLifecycleActions campaignId={campaign.id} status={campaign.status} />
              ) : null}
            </div>
          </div>

          <CampaignDetailsForm
            campaign={{
              id: campaign.id,
              name: campaign.name,
              description: campaign.description,
              campaignDate: campaign.campaign_date,
            }}
          />
        </section>

        <CampaignSurveyBuilder
          campaignId={campaign.id}
          status={campaign.status}
          questions={questions}
        />
      </>
    )
  } catch (error) {
    if (error instanceof AuthzError && error.status === 401) {
      redirect(`/login?redirect=/campaigns/${campaignId}/edit`)
    }

    if (error instanceof AuthzError && error.status === 404) {
      notFound()
    }

    if (error instanceof AuthzError && error.status === 403) {
      redirect("/auth/error?code=staff-authorization-failed")
    }

    console.error("[campaigns] campaign edit failed", error)
    throw error
  }
}
