"use client"

import {
  CalendarCheck2,
  CalendarDays,
  ClipboardCheck,
  UserRoundPlus,
  type LucideIcon,
} from "lucide-react"
import { motion, useReducedMotion } from "framer-motion"

import { AnimatedCount } from "@/components/dashboard/animated-count"
import {
  StatTileIcon,
  STAT_TILE_CAPTION_CLASS,
  STAT_TILE_CLASS,
  STAT_TILE_LABEL_CLASS,
  STAT_TILE_VALUE_CLASS,
} from "@/components/stat-tile"
import { formatCount } from "@/lib/dashboard/format"
import type { AttendanceTrendPoint, DashboardKpis } from "@/lib/dashboard/types"

interface KpiTile {
  key: string
  label: string
  value: number
  caption: string
  icon: LucideIcon
  /** Only the first tile carries the previous-period delta. */
  delta?: number | null
  sparkline?: number[]
}

function Sparkline({ values }: { values: number[] }) {
  const width = 84
  const height = 28
  const safe = values.length > 1 ? values : [0, 0]
  const max = Math.max(...safe, 1)
  const points = safe
    .map((value, index) => {
      const x = (index / (safe.length - 1)) * width
      const y = height - (value / max) * (height - 4) - 2
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-7 w-[84px] shrink-0 overflow-visible"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke="var(--chart-1)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
    </svg>
  )
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) {
    return <>No previous period</>
  }

  if (delta === 0) {
    return <>No change vs previous</>
  }

  const positive = delta > 0

  return (
    <span className={positive ? "text-[var(--chart-2)]" : "text-[var(--grid-warning-ink)]"}>
      {positive ? "+" : "−"}
      {formatCount(Math.abs(delta))} vs previous
    </span>
  )
}

/**
 * The headline counts, on the same `StatTile` ring as the Contacts and Sessions
 * Overviews: a gradient wash, an uppercase label, the Poppins figure and the
 * icon in the corner. A figure counts from its old value when the period
 * changes; the first paint is the final value so a read never catches a zero.
 */
export function DashboardKpiBand({
  kpis,
  trend,
}: {
  kpis: DashboardKpis
  trend?: AttendanceTrendPoint[]
}) {
  const reduceMotion = useReducedMotion()
  const attendanceSparkline = trend?.map((point) => point.attendees)

  const tiles: KpiTile[] = [
    {
      key: "contacts-collected",
      label: "Contacts collected",
      value: kpis.contactsCollected,
      caption: "",
      icon: UserRoundPlus,
      delta: kpis.contactsCollectedDelta,
    },
    {
      key: "sessions-held",
      label: "Sessions held",
      value: kpis.sessionsHeld,
      caption: "Sessions with a date in the period",
      icon: CalendarDays,
    },
    {
      key: "unique-attendees",
      label: "Attended",
      value: kpis.uniqueAttendees,
      caption: "People who attended at least once",
      icon: CalendarCheck2,
      sparkline: attendanceSparkline,
    },
    {
      key: "attendance-records",
      label: "Check-ins",
      value: kpis.attendanceRecords,
      caption: "Attendance rows in the period",
      icon: ClipboardCheck,
    },
  ]

  return (
    <section aria-label="Programme totals">
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {tiles.map((tile, index) => {
          const Icon = tile.icon

          return (
            <motion.div
              key={tile.key}
              data-dashboard-kpi={tile.key}
              className={STAT_TILE_CLASS}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, delay: index * 0.05, ease: "easeOut" }}
            >
              <StatTileIcon icon={Icon} />
              <dt className={STAT_TILE_LABEL_CLASS}>{tile.label}</dt>

              <dd className="flex items-end justify-between gap-2">
                <AnimatedCount value={tile.value} className={STAT_TILE_VALUE_CLASS} />
                {tile.sparkline && tile.sparkline.some((value) => value > 0) ? (
                  <Sparkline values={tile.sparkline} />
                ) : null}
              </dd>

              <dd className={STAT_TILE_CAPTION_CLASS}>
                {tile.delta !== undefined ? <DeltaBadge delta={tile.delta} /> : tile.caption}
              </dd>
            </motion.div>
          )
        })}
      </dl>
    </section>
  )
}
