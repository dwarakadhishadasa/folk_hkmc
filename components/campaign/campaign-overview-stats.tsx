import {
  CheckCircle2,
  PhoneCall,
  PhoneIncoming,
  UserX,
  Users,
  type LucideIcon,
} from "lucide-react"

import {
  StatTileIcon,
  STAT_TILE_CAPTION_CLASS,
  STAT_TILE_CLASS,
  STAT_TILE_LABEL_CLASS,
  STAT_TILE_VALUE_CLASS,
} from "@/components/stat-tile"
import { cn } from "@/lib/utils"
import type { CampaignOverviewEntry } from "@/lib/dialer/progress"

interface StatTile {
  label: string
  value: number
  caption: string
  icon: LucideIcon
  valueClassName?: string
  /**
   * The phone grid is two columns, so the frame's second row is Reached and
   * Never attempted with Confirmed alone beneath it. The desktop row is the
   * frame's own order, so these two tiles carry a phone-only order.
   */
  className?: string
}

function totalOf(entries: CampaignOverviewEntry[], key: keyof CampaignOverviewEntry["summary"]): number {
  return entries.reduce((sum, entry) => sum + entry.summary[key], 0)
}

/**
 * Frame 32's five tiles, each summed across the campaigns the page is showing.
 *
 * The counts are not recomputed here: every tile is the sum of the same
 * `campaign_progress` summaries the table below reads, so a tile can never
 * disagree with the rows it sits above. Never attempted keeps its own tile
 * because it is its own bucket (assigned minus attempted), not a remainder
 * folded into Attempted.
 *
 * The tiles are the shared `StatTile` ring, so Campaigns, Contacts, Sessions
 * and the Dashboard read as one set of figures. The captions are the AD-5
 * definitions in words. Deliberately no percentage: a ratio of two already-
 * rounded counts is a fifth number that could be wrong on its own, and none of
 * these five is a ratio.
 */
export function CampaignOverviewStats({ entries }: { entries: CampaignOverviewEntry[] }) {
  const tiles: StatTile[] = [
    {
      label: "Assigned",
      value: totalOf(entries, "assigned"),
      caption: `${entries.length} ${entries.length === 1 ? "campaign" : "campaigns"}`,
      icon: Users,
    },
    {
      label: "Attempted",
      value: totalOf(entries, "attempted"),
      caption: "With at least one call",
      icon: PhoneCall,
    },
    {
      label: "Reached",
      value: totalOf(entries, "reached"),
      caption: "Outside not-reachable",
      icon: PhoneIncoming,
    },
    {
      label: "Confirmed",
      value: totalOf(entries, "confirmed"),
      caption: "Latest reached is confirmed",
      icon: CheckCircle2,
      className: "order-5 md:order-none",
    },
    {
      label: "Never attempted",
      value: totalOf(entries, "neverAttempted"),
      caption: "Assigned − attempted",
      icon: UserX,
      valueClassName: "text-[var(--grid-warning-ink)]",
      className: "order-4 md:order-none",
    },
  ]

  return (
    <section aria-label="Campaign totals">
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-5 md:gap-4">
        {tiles.map((tile) => {
          const Icon = tile.icon

          return (
            <div
              key={tile.label}
              data-campaign-stat={tile.label}
              className={cn(STAT_TILE_CLASS, tile.className)}
            >
              <StatTileIcon icon={Icon} />
              <dt className={STAT_TILE_LABEL_CLASS}>{tile.label}</dt>
              <dd>
                <span className={cn(STAT_TILE_VALUE_CLASS, tile.valueClassName)}>{tile.value}</span>
                <span className={cn("mt-1.5", STAT_TILE_CAPTION_CLASS)}>{tile.caption}</span>
              </dd>
            </div>
          )
        })}
      </dl>
    </section>
  )
}
