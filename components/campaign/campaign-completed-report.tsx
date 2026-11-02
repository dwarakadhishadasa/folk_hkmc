import {
  CheckCircle2,
  PhoneCall,
  PhoneIncoming,
  UserX,
  Users,
  type LucideIcon,
} from "lucide-react"

import {
  STAT_TILE_CAPTION_CLASS,
  STAT_TILE_CLASS,
  STAT_TILE_LABEL_CLASS,
  STAT_TILE_VALUE_CLASS,
  StatTileIcon,
} from "@/components/stat-tile"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { CampaignProgressCaller, CampaignProgressSummary } from "@/lib/dialer/progress"
import { cn } from "@/lib/utils"

/**
 * The five funnel buckets, in the Overview's order and with its definitions.
 * A campaign that is over is read as a report, so the labels are the same words
 * the tile row above the campaign table uses.
 */
const TILES: Array<{ key: keyof CampaignProgressSummary; label: string; caption: string; icon: LucideIcon }> = [
  { key: "assigned", label: "Assigned", caption: "Contacts in this campaign", icon: Users },
  { key: "attempted", label: "Attempted", caption: "With at least one call", icon: PhoneCall },
  { key: "reached", label: "Reached", caption: "Outside not-reachable", icon: PhoneIncoming },
  { key: "confirmed", label: "Confirmed", caption: "Latest reached is confirmed", icon: CheckCircle2 },
  { key: "neverAttempted", label: "Never attempted", caption: "Assigned − attempted", icon: UserX },
]

const HEAD_CLASS = "h-11 px-2 text-[13px] font-semibold text-[var(--program-text)] sm:px-4"

function formatCount(value: number): string {
  return value.toLocaleString("en-IN")
}

/**
 * A finished campaign, read as a report: the campaign's own funnel, then one row
 * per caller who held work in it.
 *
 * Both halves come from `campaign_progress`, so the tiles and the caller rows
 * cannot disagree — this component sums nothing it did not receive.
 *
 * The caller table is the Dashboard's `By location` table: the same header
 * treatment, row height and numeric alignment. The tiles are the shared
 * `StatTile` ring, which is the style the Campaigns overview uses.
 */
export function CampaignCompletedReport({
  summary,
  callers,
}: {
  summary: CampaignProgressSummary
  callers: CampaignProgressCaller[]
}) {
  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Campaign results">
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-5 md:gap-4">
          {TILES.map((tile) => {
            const Icon = tile.icon

            return (
              <div key={tile.label} data-campaign-stat={tile.label} className={cn(STAT_TILE_CLASS)}>
                <StatTileIcon icon={Icon} />
                <dt className={STAT_TILE_LABEL_CLASS}>{tile.label}</dt>
                <dd>
                  <span
                    className={cn(
                      STAT_TILE_VALUE_CLASS,
                      tile.key === "neverAttempted" && "text-[var(--grid-warning-ink)]",
                    )}
                  >
                    {formatCount(summary[tile.key])}
                  </span>
                  <span className={cn("mt-1.5", STAT_TILE_CAPTION_CLASS)}>{tile.caption}</span>
                </dd>
              </div>
            )
          })}
        </dl>
      </section>

      <section
        aria-labelledby="campaign-callers-heading"
        className="overflow-hidden rounded-xl border border-[var(--border)] bg-card"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
          <h2
            id="campaign-callers-heading"
            className="text-[13px] font-semibold text-[var(--program-text)]"
          >
            Callers
          </h2>
          <p className="text-[11px] tabular-nums text-[var(--muted-foreground)]">
            {callers.length} {callers.length === 1 ? "caller" : "callers"}
          </p>
        </div>

        {callers.length === 0 ? (
          <p className="px-4 py-6 text-[13px] text-[var(--muted-foreground)]">
            No caller held work in this campaign.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <caption className="sr-only">
                Callers in this campaign, with their assigned, attempted, reached, confirmed and never
                attempted counts.
              </caption>
              <TableHeader>
                <TableRow className="border-b border-[var(--border)] bg-[var(--muted)]/50 hover:bg-[var(--muted)]/50">
                  <TableHead className={HEAD_CLASS} scope="col">
                    Name
                  </TableHead>
                  <TableHead className={HEAD_CLASS} scope="col">
                    Assigned
                  </TableHead>
                  <TableHead className={HEAD_CLASS} scope="col">
                    Attempted
                  </TableHead>
                  <TableHead className={HEAD_CLASS} scope="col">
                    Reached
                  </TableHead>
                  <TableHead className={HEAD_CLASS} scope="col">
                    Confirmed
                  </TableHead>
                  <TableHead className={HEAD_CLASS} scope="col">
                    Never attempted
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {callers.map((caller) => (
                  <TableRow
                    key={caller.callerId}
                    data-campaign-caller={caller.callerId}
                    className="h-12 border-b border-[var(--border)] transition-colors hover:bg-foreground/[0.02]"
                  >
                    <TableCell className="px-2 py-3 text-[14px] font-medium text-[var(--program-text)] sm:px-4">
                      {caller.callerName}
                    </TableCell>
                    <TableCell className="px-2 py-3 text-[14px] tabular-nums text-[var(--program-text)] sm:px-4">
                      {formatCount(caller.assigned)}
                    </TableCell>
                    <TableCell className="px-2 py-3 text-[14px] tabular-nums text-[var(--program-text)] sm:px-4">
                      {formatCount(caller.attempted)}
                    </TableCell>
                    <TableCell className="px-2 py-3 text-[14px] tabular-nums text-[var(--program-text)] sm:px-4">
                      {formatCount(caller.reached)}
                    </TableCell>
                    <TableCell className="px-2 py-3 text-[14px] tabular-nums text-[var(--program-text)] sm:px-4">
                      {formatCount(caller.confirmed)}
                    </TableCell>
                    <TableCell className="px-2 py-3 text-[14px] tabular-nums text-[var(--program-text)] sm:px-4">
                      {formatCount(caller.neverAttempted)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  )
}
