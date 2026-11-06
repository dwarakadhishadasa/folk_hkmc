import { CheckCircle2, PhoneIncoming, PhoneOutgoing, TriangleAlert, Users } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import {
  StatTileIcon,
  STAT_TILE_CAPTION_CLASS,
  STAT_TILE_CLASS,
  STAT_TILE_LABEL_CLASS,
  STAT_TILE_VALUE_CLASS,
} from "@/components/stat-tile"
import { formatCount, formatPercentage } from "@/lib/dashboard/format"
import type { CampaignProgress } from "@/lib/dialer/progress"
import { cn } from "@/lib/utils"

interface ReportKpi {
  key: keyof CampaignProgress["summary"]
  label: string
  caption: string
  icon: LucideIcon
  /** The last tile spans both phone columns rather than leaving an orphan. */
  wide?: boolean
}

/**
 * The report's headline counts, on the same `StatTile` ring as the Dashboard,
 * Contacts and Sessions Overviews: gradient wash, uppercase label, Poppins
 * figure, icon in the corner.
 *
 * Every figure is `campaign_progress`'s own bucket. The caption is the bucket
 * divided by the one above it — assigned for the funnel stages, reached for
 * Confirmations — so no card invents a second denominator.
 */
export function ReportKpis({ summary }: { summary: CampaignProgress["summary"] }) {
  const tiles: ReportKpi[] = [
    {
      key: "assigned",
      label: "Assigned",
      caption: "contacts in this campaign",
      icon: Users,
    },
    {
      key: "attempted",
      label: "Attempted",
      caption: `${formatPercentage(summary.attempted, summary.assigned)} of assigned`,
      icon: PhoneOutgoing,
    },
    {
      key: "reached",
      label: "Reached",
      caption: `${formatPercentage(summary.reached, summary.assigned)} of assigned`,
      icon: PhoneIncoming,
    },
    {
      key: "confirmed",
      label: "Confirmed",
      caption:
        summary.reached === 0
          ? "no conversations yet"
          : `${formatPercentage(summary.confirmed, summary.reached)} of reached`,
      icon: CheckCircle2,
    },
    {
      key: "neverAttempted",
      label: "Never attempted",
      caption: `${formatPercentage(summary.neverAttempted, summary.assigned)} of assigned`,
      icon: TriangleAlert,
      wide: true,
    },
  ]

  return (
    <section aria-label="Campaign totals">
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-5">
        {tiles.map((tile) => {
          const Icon = tile.icon

          return (
            <div
              key={tile.key}
              data-report-kpi={tile.key}
              data-report-kpi-value={summary[tile.key]}
              className={cn(STAT_TILE_CLASS, tile.wide && "col-span-2 md:col-span-1")}
            >
              <StatTileIcon icon={Icon} />
              <dt className={STAT_TILE_LABEL_CLASS}>{tile.label}</dt>
              <dd className={STAT_TILE_VALUE_CLASS}>{formatCount(summary[tile.key])}</dd>
              <dd className={STAT_TILE_CAPTION_CLASS}>{tile.caption}</dd>
            </div>
          )
        })}
      </dl>
    </section>
  )
}
