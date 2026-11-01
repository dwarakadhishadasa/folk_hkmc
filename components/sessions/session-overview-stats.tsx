import {
  CalendarDays,
  Minus,
  Radio,
  Repeat2,
  TrendingDown,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react"

import { formatPercent, formatSignedDelta } from "@/lib/sessions/format"
import type { SessionsOverviewStats } from "@/lib/sessions/data"

const TILE_CLASS =
  "relative flex flex-col gap-1.5 overflow-hidden rounded-xl border border-[var(--border)] bg-gradient-to-t from-[color-mix(in_oklab,var(--primary)_6%,var(--card))] to-card p-4 md:p-5"
const LABEL_CLASS =
  "text-[11px] font-semibold tracking-[0.04em] text-[#64748b] uppercase md:pr-9 dark:text-[var(--muted-foreground)]"
const VALUE_CLASS =
  "block font-[family-name:var(--font-poppins)] text-[24px] leading-none font-bold text-[var(--program-text)] md:text-[32px]"
const CAPTION_CLASS = "block text-[12px] text-[#64748b] dark:text-[var(--muted-foreground)]"
const ICON_CLASS =
  "absolute top-3 right-3 hidden size-8 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--primary)_10%,var(--card))] text-[var(--primary)] md:top-4 md:right-4 md:flex"

interface Tile {
  label: string
  value: string | number
  caption?: string
  icon: LucideIcon
  captionClassName?: string
}

function StatTiles({ tiles, label }: { tiles: Tile[]; label: string }) {
  return (
    <dl aria-label={label} className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
      {tiles.map((tile) => {
        const Icon = tile.icon

        return (
          <div key={tile.label} data-session-stat={tile.label} className={TILE_CLASS}>
            <span className={ICON_CLASS} aria-hidden="true">
              <Icon className="size-4" />
            </span>
            <dt className={LABEL_CLASS}>{tile.label}</dt>
            <dd>
              <span className={VALUE_CLASS} data-session-stat-value={tile.value}>
                {tile.value}
              </span>
              {tile.caption ? (
                <span className={`mt-1.5 ${CAPTION_CLASS} ${tile.captionClassName ?? ""}`}>
                  {tile.caption}
                </span>
              ) : null}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

/**
 * The Overview's four figures.
 *
 * Desktop keeps the design's fourth card, Repeat attendees; the phone's 2×2
 * grid puts Upcoming there instead (frame 1752), so the two surfaces show the
 * same first three figures and the fourth each frame draws. Every number comes
 * from `sessions_overview_stats`, so a tile cannot disagree with the table's
 * rows.
 */
export function SessionOverviewStats({ stats }: { stats: SessionsOverviewStats }) {
  const repeatShare = stats.attendeesTotal === 0 ? 0 : stats.repeatAttendees / stats.attendeesTotal
  const delta = stats.avgAttendanceCurrent - stats.avgAttendancePrevious
  const deltaTone =
    delta > 0
      ? "text-[#15803d] dark:text-[#7ee2a3]"
      : delta < 0
        ? "text-[var(--destructive)]"
        : "text-[#64748b] dark:text-[var(--muted-foreground)]"

  const desktop: Tile[] = [
    {
      label: "Sessions",
      value: stats.sessionsCount,
      caption: `${stats.upcomingCount} upcoming`,
      icon: CalendarDays,
    },
    { label: "Attendees", value: stats.attendeesTotal, caption: "Across all sessions", icon: Users },
    {
      label: "Avg attendance",
      value: Math.round(stats.avgAttendanceCurrent),
      caption: `${formatSignedDelta(stats.avgAttendanceCurrent, stats.avgAttendancePrevious)} vs last month`,
      icon: delta >= 0 ? TrendingUp : TrendingDown,
      captionClassName: deltaTone,
    },
    {
      label: "Repeat attendees",
      value: stats.repeatAttendees,
      caption: `${formatPercent(repeatShare)} of attendees`,
      icon: Repeat2,
    },
  ]

  const mobile: Tile[] = [
    { label: "Sessions", value: stats.sessionsCount, icon: CalendarDays },
    { label: "Attendees", value: stats.attendeesTotal, icon: Users },
    {
      label: "Avg attendance",
      value: Math.round(stats.avgAttendanceCurrent),
      icon: delta >= 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus,
    },
    { label: "Upcoming", value: stats.upcomingCount, icon: Radio },
  ]

  return (
    <section aria-label="Session totals">
      <div className="hidden md:block">
        <StatTiles tiles={desktop} label="Session totals" />
      </div>
      <div className="md:hidden">
        <StatTiles tiles={mobile} label="Session totals" />
      </div>
    </section>
  )
}
