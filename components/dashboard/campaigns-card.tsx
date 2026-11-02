import Link from "next/link"

import { DashboardCard, DashboardInlineEmpty } from "@/components/dashboard/dashboard-card"
import { formatCount, formatDay } from "@/lib/dashboard/format"
import type { DashboardCampaign } from "@/lib/dashboard/types"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const HEAD_CLASS = "h-11 px-2 text-[11px] font-semibold text-[var(--muted-foreground)] sm:px-4"

function SessionCell({ campaign }: { campaign: DashboardCampaign }) {
  if (campaign.sessionCount === 0 || !campaign.sessionId || !campaign.sessionName) {
    return <span className="text-[var(--muted-foreground)]">No session linked</span>
  }

  return (
    <span className="flex flex-col">
      <Link
        href={`/sessions/${campaign.sessionId}`}
        className="font-medium text-[var(--program-primary)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        {campaign.sessionName}
      </Link>
      {campaign.sessionCount > 1 ? (
        <span className="text-[11px] text-[var(--muted-foreground)]">+{campaign.sessionCount - 1} more</span>
      ) : null}
    </span>
  )
}

function AttendedCell({ campaign }: { campaign: DashboardCampaign }) {
  if (campaign.attended === null) {
    return <span title="No linked session, so there is no invitation to measure.">—</span>
  }

  return <>{formatCount(campaign.attended)}</>
}

/**
 * Active campaigns, campaign-lifetime rather than period-scoped — the one
 * section the period does not change. `attended` is `—`, never `0`, when no
 * linked session is visible.
 */
export function DashboardCampaignsCard({ campaigns }: { campaigns: DashboardCampaign[] }) {
  return (
    <DashboardCard title="Active campaigns" subtitle="Calling in this programme now">
      {campaigns.length === 0 ? (
        <DashboardInlineEmpty href="/campaigns" action="Open campaigns">
          No active campaigns.
        </DashboardInlineEmpty>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-[var(--border)] md:block">
            <Table>
              <caption className="sr-only">
                Active campaigns with their linked session, assigned and reached contacts, and invited
                attendance.
              </caption>
              <TableHeader>
                <TableRow className="border-b border-[var(--border)] bg-[var(--muted)]/50 hover:bg-[var(--muted)]/50">
                  <TableHead className={HEAD_CLASS} scope="col">
                    Campaign
                  </TableHead>
                  <TableHead className={HEAD_CLASS} scope="col">
                    Session
                  </TableHead>
                  <TableHead className={HEAD_CLASS} scope="col">
                    Assigned
                  </TableHead>
                  <TableHead className={HEAD_CLASS} scope="col">
                    Reached
                  </TableHead>
                  <TableHead className={HEAD_CLASS} scope="col">
                    Confirmed
                  </TableHead>
                  <TableHead className={HEAD_CLASS} scope="col">
                    Attended
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((campaign) => (
                  <TableRow
                    key={campaign.id}
                    data-dashboard-campaign={campaign.id}
                    data-dashboard-campaign-sessions={campaign.sessionCount}
                    className="border-b border-[var(--border)] transition-colors hover:bg-foreground/[0.02]"
                  >
                    <TableCell className="px-2 py-3 sm:px-4">
                      <Link
                        href={`/campaigns/${campaign.id}/assign-contacts`}
                        className="text-[14px] font-medium text-[var(--program-text)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                      >
                        {campaign.name}
                      </Link>
                      <span className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-success uppercase">
                          <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
                          Active
                        </span>
                        <span className="text-[11px] text-[var(--muted-foreground)]">
                          {formatDay(campaign.campaignDate)}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="px-2 py-3 text-[14px] sm:px-4">
                      <SessionCell campaign={campaign} />
                    </TableCell>
                    <TableCell
                      className="px-2 py-3 text-[14px] tabular-nums text-[var(--program-text)] sm:px-4"
                      data-dashboard-campaign-assigned={campaign.id}
                    >
                      {formatCount(campaign.assigned)}
                      {campaign.neverAttempted > 0 ? (
                        <span className="mt-0.5 block text-[11px] font-normal text-[var(--destructive)]">
                          {formatCount(campaign.neverAttempted)} never called
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="px-2 py-3 text-[14px] tabular-nums text-[var(--program-text)] sm:px-4">
                      {formatCount(campaign.reached)}
                    </TableCell>
                    <TableCell className="px-2 py-3 text-[14px] tabular-nums text-[var(--program-text)] sm:px-4">
                      {formatCount(campaign.confirmed)}
                    </TableCell>
                    <TableCell
                      className="px-2 py-3 text-[14px] tabular-nums text-[var(--program-text)] sm:px-4"
                      data-dashboard-campaign-attended={campaign.id}
                    >
                      <AttendedCell campaign={campaign} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="flex flex-col divide-y divide-[var(--border)] md:hidden">
            {campaigns.map((campaign) => (
              <li key={campaign.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/campaigns/${campaign.id}/assign-contacts`}
                    className="text-sm font-semibold text-[var(--program-text)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    {campaign.name}
                  </Link>
                  <span className="shrink-0 text-[11px] text-[var(--muted-foreground)]">
                    {formatDay(campaign.campaignDate)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                  <SessionCell campaign={campaign} />
                </p>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--muted-foreground)]">Assigned</dt>
                    <dd className="tabular-nums text-[var(--program-text)]">
                      {formatCount(campaign.assigned)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--muted-foreground)]">Reached</dt>
                    <dd className="tabular-nums text-[var(--program-text)]">
                      {formatCount(campaign.reached)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--muted-foreground)]">Confirmed</dt>
                    <dd className="tabular-nums text-[var(--program-text)]">
                      {formatCount(campaign.confirmed)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--muted-foreground)]">Attended</dt>
                    <dd className="tabular-nums text-[var(--program-text)]">
                      <AttendedCell campaign={campaign} />
                    </dd>
                  </div>
                </dl>
                {campaign.neverAttempted > 0 ? (
                  <p className="mt-1 text-[11px] text-[var(--destructive)]">
                    {formatCount(campaign.neverAttempted)} never called
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </DashboardCard>
  )
}
