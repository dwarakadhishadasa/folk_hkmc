import { cn } from "@/lib/utils"
import type { CampaignOverviewEntry } from "@/lib/dialer/progress"

interface StatTile {
  label: string
  value: number
  caption: string
  /** The frame gives Never attempted its own amber edge, as a distinct bucket. */
  accent?: boolean
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
 * The captions are the AD-5 definitions in words. Deliberately no
 * percentage: a ratio of two already-rounded counts is a fifth number that
 * could be wrong on its own, and none of these five is a ratio.
 */
export function CampaignOverviewStats({ entries }: { entries: CampaignOverviewEntry[] }) {
  const tiles: StatTile[] = [
    {
      label: "Assigned",
      value: totalOf(entries, "assigned"),
      caption: `${entries.length} ${entries.length === 1 ? "campaign" : "campaigns"}`,
    },
    {
      label: "Attempted",
      value: totalOf(entries, "attempted"),
      caption: "With at least one call",
    },
    {
      label: "Reached",
      value: totalOf(entries, "reached"),
      caption: "Outside not-reachable",
    },
    {
      label: "Confirmed",
      value: totalOf(entries, "confirmed"),
      caption: "Latest reached is confirmed",
      className: "order-5 md:order-none",
    },
    {
      label: "Never attempted",
      value: totalOf(entries, "neverAttempted"),
      caption: "Assigned − attempted",
      accent: true,
      className: "order-4 md:order-none",
    },
  ]

  return (
    <section aria-label="Campaign totals">
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-5 md:gap-4">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            data-campaign-stat={tile.label}
            className={cn(
              "flex flex-col gap-1.5 rounded-xl border bg-card p-5",
              tile.accent ? "border-[#f97f29]" : "border-[var(--border)]",
              tile.className,
            )}
          >
            <dt className="text-[11px] font-semibold text-[#64748b] dark:text-[var(--muted-foreground)]">
              {tile.label}
            </dt>
            <dd className="flex flex-col gap-1.5">
              <span className="block font-[family-name:var(--font-poppins)] text-[32px] leading-none font-bold text-[var(--program-text)]">
                {tile.value}
              </span>
              <span className="block text-[12px] text-[#64748b] dark:text-[var(--muted-foreground)]">
                {tile.caption}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
