import Link from "next/link"

import { NewCampaignButton } from "@/components/campaign/new-campaign-button"
import { DashboardCard, DashboardInlineEmpty } from "@/components/dashboard/dashboard-card"
import { formatCount, formatPercentage, percentageOf } from "@/lib/dashboard/format"
import { PIPELINE_STAGE_LABELS, type DashboardCampaign, type DashboardKpis, type DashboardPipeline } from "@/lib/dashboard/types"

const LEAK_LABELS = ["Never assigned", "Never called", "Not reached", "Not confirmed"] as const

export function DashboardPipelineCard({
  pipeline,
  kpis,
  hasDialer,
  periodLabel,
  campaigns,
}: {
  pipeline: DashboardPipeline
  kpis: DashboardKpis
  hasDialer: boolean
  periodLabel: string
  campaigns: DashboardCampaign[]
}) {
  if (!hasDialer) {
    return (
      <DashboardCard title="Collection and attendance" subtitle={`Contacts collected in ${periodLabel}, with attendance in the same period`}>
        <dl className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-[var(--border)] p-4">
            <dt className="text-[11px] font-semibold text-[var(--muted-foreground)]">Collected</dt>
            <dd className="font-[family-name:var(--font-poppins)] text-[24px] leading-none font-bold tabular-nums text-[var(--program-text)]">
              {formatCount(kpis.contactsCollected)}
            </dd>
          </div>
          <div className="rounded-xl border border-[var(--border)] p-4">
            <dt className="text-[11px] font-semibold text-[var(--muted-foreground)]">Attended</dt>
            <dd className="font-[family-name:var(--font-poppins)] text-[24px] leading-none font-bold tabular-nums text-[var(--program-text)]">
              {formatCount(kpis.uniqueAttendees)}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-[var(--muted-foreground)]">
          These are two period totals, not a cohort. The programme has no Campaign module, so there is no
          invite-to-attendance conversion to draw.
        </p>
      </DashboardCard>
    )
  }

  const hasLinkedSession = campaigns.some((campaign) => campaign.sessionCount > 0)
  const noCohort = pipeline.cohort === 0
  const noCampaigns = !noCohort && pipeline.stages[1]?.count === 0 && campaigns.length === 0

  return (
    <DashboardCard
      title="Preaching pipeline"
      subtitle={`Contacts collected in ${periodLabel}, followed to today`}
      badge={`${formatCount(pipeline.cohort)} in cohort`}
    >
      {noCohort ? (
        <DashboardInlineEmpty href="/contact" action="Add a contact">
          No contacts were collected in this period.
        </DashboardInlineEmpty>
      ) : noCampaigns ? (
        <DashboardInlineEmpty actionNode={<NewCampaignButton label="Create a campaign" size="default" />}>
          No campaigns yet. A campaign is how collected contacts get called and invited.
        </DashboardInlineEmpty>
      ) : (
        <div className="flex flex-col gap-1">
          {pipeline.stages.map((stage, index) => {
            const percent = percentageOf(stage.count, pipeline.cohort)
            const leak = index === 0 ? null : pipeline.stages[index - 1]!.count - stage.count
            const leakLabel = index === 0 ? null : LEAK_LABELS[index - 1]!

            return (
              <div key={stage.key} className="py-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 font-medium text-[var(--program-text)]">
                    <span className="flex size-5 items-center justify-center rounded-full bg-[var(--muted)] text-[10px] font-bold text-[var(--muted-foreground)]">
                      {index + 1}
                    </span>
                    <span>{PIPELINE_STAGE_LABELS[stage.key]}</span>
                  </span>
                  <span className="tabular-nums text-[var(--muted-foreground)]">
                    {formatCount(stage.count)} · {percent}%
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[var(--muted)]" aria-hidden="true">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, Math.max(0, percent))}%`,
                      background: "linear-gradient(90deg, var(--chart-1), var(--chart-2))",
                    }}
                  />
                </div>
                {leakLabel && leak !== null && leak > 0 ? (
                  <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                    {leakLabel} {formatCount(leak)}
                  </p>
                ) : null}
              </div>
            )
          })}

          <div className="mt-3 border-t border-[var(--border)] pt-3">
            {pipeline.attended.invited > 0 ? (
              <>
                <p className="text-sm text-[var(--program-text)]">
                  Attended after invite: {formatCount(pipeline.attended.attended)} of{" "}
                  {formatCount(pipeline.attended.invited)} invited (
                  {formatPercentage(pipeline.attended.attended, pipeline.attended.invited)})
                </p>
                <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                  {formatCount(pipeline.attended.confirmed)} confirmed ·{" "}
                  {formatCount(pipeline.attended.unconfirmed)} arrived without confirming
                </p>
              </>
            ) : !hasLinkedSession ? (
              <p className="text-xs text-[var(--muted-foreground)]">
                No campaign is linked to a session yet.{" "}
                <Link
                  href="/campaigns"
                  className="font-semibold text-[var(--program-primary)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  Link a session on a campaign
                </Link>{" "}
                to measure invite-to-attendance.
              </p>
            ) : (
              <p className="text-xs text-[var(--muted-foreground)]">
                No one reached in this period was invited to a linked session yet.
              </p>
            )}

            {pipeline.unlinkedCampaigns > 0 ? (
              <p className="mt-2 text-xs text-[var(--destructive)]">
                {formatCount(pipeline.unlinkedCampaigns)} campaign
                {pipeline.unlinkedCampaigns === 1 ? "" : "s"} reached contacts but have no linked session.{" "}
                <Link
                  href="/campaigns"
                  className="font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  Review campaigns
                </Link>
              </p>
            ) : null}
          </div>
        </div>
      )}
    </DashboardCard>
  )
}
