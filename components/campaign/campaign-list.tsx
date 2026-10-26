import Link from "next/link"

import { CampaignStatusPill } from "@/components/campaign/campaign-status-pill"
import { formatCampaignDate } from "@/components/campaign/campaign-format"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { CampaignOverviewEntry } from "@/lib/dialer/progress"

const HEAD_CLASS =
  "px-2 text-xs font-semibold tracking-[0.04em] text-[var(--muted-foreground)] uppercase sm:px-4"

/**
 * Frame 32's campaign table, on the `campaign_progress` summary each row was
 * given. Every count is that campaign's own scoped number, so the row cannot
 * disagree with the tile beside it or with the detail page behind the link.
 *
 * Desktop only: frame 1752 replaces the table with cards below `md`, and the
 * hidden table is not in the accessibility tree there.
 */
export function CampaignList({ entries }: { entries: CampaignOverviewEntry[] }) {
  return (
    <div className="hidden overflow-hidden rounded-xl border border-[var(--border)] bg-card md:block">
      <Table>
        <TableHeader>
          <TableRow className="bg-[var(--muted)] hover:bg-[var(--muted)]">
            <TableHead className={HEAD_CLASS}>Campaign</TableHead>
            <TableHead className={HEAD_CLASS}>End Date</TableHead>
            <TableHead className={HEAD_CLASS}>Status</TableHead>
            <TableHead className={HEAD_CLASS}>Assigned</TableHead>
            <TableHead className={HEAD_CLASS}>Reached</TableHead>
            <TableHead className={HEAD_CLASS}>Confirmed</TableHead>
            <TableHead className={HEAD_CLASS}>Never attempted</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map(({ campaign, summary }) => (
            <TableRow key={campaign.id}>
              <TableCell className="px-2 py-3 sm:px-4">
                <Link
                  href={`/campaigns/${campaign.id}`}
                  className="text-[13px] font-medium text-[var(--program-text)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]"
                >
                  {campaign.name}
                </Link>
              </TableCell>
              <TableCell className="px-2 py-3 text-[13px] whitespace-nowrap text-[var(--muted-foreground)] sm:px-4">
                {formatCampaignDate(campaign.campaign_date)}
              </TableCell>
              <TableCell className="px-2 py-3 sm:px-4">
                <CampaignStatusPill status={campaign.status} />
              </TableCell>
              <TableCell className="px-2 py-3 text-[13px] text-[var(--program-text)] tabular-nums sm:px-4">
                {summary.assigned}
              </TableCell>
              <TableCell className="px-2 py-3 text-[13px] text-[var(--muted-foreground)] tabular-nums sm:px-4">
                {summary.reached}
              </TableCell>
              <TableCell className="px-2 py-3 text-[13px] text-[var(--program-text)] tabular-nums sm:px-4">
                {summary.confirmed}
              </TableCell>
              <TableCell className="px-2 py-3 text-[13px] text-[var(--program-text)] tabular-nums sm:px-4">
                {summary.neverAttempted}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
