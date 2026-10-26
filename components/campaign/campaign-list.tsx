import Link from "next/link"

import { CampaignStatusPill } from "@/components/campaign/campaign-status-pill"
import { formatCampaignDate } from "@/components/campaign/campaign-format"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { CampaignRow } from "@/lib/dialer/campaigns"

/**
 * The campaign table (frame 32), carrying exactly the three columns this story
 * can fill.
 *
 * The frame also shows Assigned, Reached, Confirmed and Never attempted. Those
 * are `campaign_progress` counts owned by the reporting story, so they are
 * absent rather than rendered as `0`: a zero is a claim about a campaign, and
 * this surface cannot compute one yet.
 */
export function CampaignList({ campaigns }: { campaigns: CampaignRow[] }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-[var(--muted)] hover:bg-[var(--muted)]">
              <TableHead className="px-2 text-xs font-semibold tracking-[0.04em] text-[var(--muted-foreground)] uppercase sm:px-4">
                Campaign
              </TableHead>
              <TableHead className="px-2 text-xs font-semibold tracking-[0.04em] text-[var(--muted-foreground)] uppercase sm:px-4">
                End Date
              </TableHead>
              <TableHead className="px-2 text-xs font-semibold tracking-[0.04em] text-[var(--muted-foreground)] uppercase sm:px-4">
                Status
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns.map((campaign) => (
              <TableRow key={campaign.id}>
                <TableCell className="px-2 py-3 sm:px-4">
                  <Link
                    href={`/campaigns/${campaign.id}`}
                    className="text-[13px] font-medium text-[var(--program-text)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]"
                  >
                    {campaign.name}
                  </Link>
                </TableCell>
                <TableCell className="px-2 py-3 text-[13px] text-[var(--muted-foreground)] whitespace-nowrap sm:px-4">
                  {formatCampaignDate(campaign.campaign_date)}
                </TableCell>
                <TableCell className="px-2 py-3 sm:px-4">
                  <CampaignStatusPill status={campaign.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-[var(--muted-foreground)]">
        {campaigns.length} {campaigns.length === 1 ? "campaign" : "campaigns"}
      </p>
    </div>
  )
}
