import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { notFound, redirect } from "next/navigation"

import { CampaignLifecycleActions } from "@/components/campaign/campaign-lifecycle-actions"
import { CampaignPageHeader } from "@/components/campaign/campaign-page-header"
import { CampaignSubNav } from "@/components/campaign/campaign-sub-nav"
import { CampaignStatusPill } from "@/components/campaign/campaign-status-pill"
import { CampaignSurveyBuilder } from "@/components/campaign/campaign-survey-builder"
import { formatCampaignDate, formatGapDuration } from "@/components/campaign/campaign-format"
import { Button } from "@/components/ui/button"
import { AuthzError } from "@/lib/authz"
import { getCampaign } from "@/lib/dialer/campaigns"
import { listCampaignQuestions } from "@/lib/dialer/surveys"

import { getCampaignStaff } from "../staff"

export const dynamic = "force-dynamic"

function DetailField({ label, value, wide = false }: { label: string; value: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-[11px] font-semibold tracking-[0.04em] text-[var(--muted-foreground)] uppercase">{label}</dt>
      <dd className="mt-1 text-[13px] whitespace-pre-line text-[var(--program-text)]">{value}</dd>
    </div>
  )
}

/**
 * AD-12: a completed or cancelled campaign is terminal, so it takes no new
 * assignments. The entry point is absent there rather than disabled: a control
 * that can never succeed is not an affordance.
 */
function campaignAcceptsAssignments(status: string): boolean {
  return status === "DRAFT" || status === "ACTIVE"
}

/**
 * One campaign, its settings, exactly the lifecycle actions AD-12 allows and
 * the call-outcome survey builder that Story 1.5 owns.
 *
 * A missing id, a malformed id and another program's campaign are one 404 —
 * the service's own answer — and land on Next's not-found page rather than a
 * blank surface. A role outside AD-2's admin set is refused before the read, so
 * a Volunteer learns nothing about whether the campaign exists.
 */
export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ campaignId: string }>
}) {
  const { campaignId } = await params

  try {
    const staff = await getCampaignStaff()
    const campaign = await getCampaign(staff, campaignId)
    // Retired questions are history this surface shows read-only; the service's
    // live-only default is for new call outcomes, not for the builder.
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
                  <Link href={`/campaigns/${campaign.id}/assign-contacts`}>Assign contacts</Link>
                </Button>
              ) : null}
              <CampaignLifecycleActions campaignId={campaign.id} status={campaign.status} />
            </div>
          </div>

          <dl className="grid gap-4 p-4 sm:grid-cols-2">
            <DetailField label="Description" value={campaign.description ?? "—"} wide />
            <DetailField label="Campaign end date" value={formatCampaignDate(campaign.campaign_date)} />
            <DetailField label="Time" value={campaign.campaign_time ?? "—"} />
            <DetailField label="Gap duration" value={formatGapDuration(campaign.gap_duration)} />
            <DetailField
              label="Max attempts"
              value={`${campaign.max_attempts} ${campaign.max_attempts === 1 ? "attempt" : "attempts"}`}
            />
          </dl>
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
      redirect(`/login?redirect=/campaigns/${campaignId}`)
    }

    if (error instanceof AuthzError && error.status === 404) {
      notFound()
    }

    // Only the gate's refusal is an authorization failure; a read or write
    // error keeps its own status and surfaces as an error, not as a role
    // refusal.
    if (error instanceof AuthzError && error.status === 403) {
      redirect("/auth/error?code=staff-authorization-failed")
    }

    console.error("[campaigns] campaign detail failed", error)
    throw error
  }
}
