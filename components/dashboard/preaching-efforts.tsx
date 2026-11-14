"use client"

import { motion, useReducedMotion } from "framer-motion"

import { AnimatedCount } from "@/components/dashboard/animated-count"
import { DashboardCard, DashboardInlineEmpty } from "@/components/dashboard/dashboard-card"
import { formatCount } from "@/lib/dashboard/format"
import type {
  DashboardPreacherBars,
  DashboardPreacherTotalsRow,
  DashboardSeriesSegment,
} from "@/lib/dashboard/types"

const LOCATION_PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
] as const

interface ColoredSegment extends DashboardSeriesSegment {
  color: string
}

function locationColorMap(
  sessions: DashboardPreacherBars,
  contacts: DashboardPreacherBars,
  totals: DashboardPreacherTotalsRow[],
): Map<string, string> {
  const colors = new Map<string, string>()
  const remember = (segments: DashboardSeriesSegment[]) => {
    for (const segment of segments) {
      if (segment.value > 0 && !colors.has(segment.key)) {
        colors.set(segment.key, LOCATION_PALETTE[colors.size % LOCATION_PALETTE.length]!)
      }
    }
  }

  for (const row of sessions.rows) remember(row.segments)
  for (const row of contacts.rows) remember(row.segments)
  for (const row of totals) remember(row.attendeeSegments)

  return colors
}

function coloredSegments(
  segments: DashboardSeriesSegment[],
  colors: Map<string, string>,
): ColoredSegment[] {
  return segments
    .filter((segment) => segment.value > 0)
    .map((segment) => ({
      ...segment,
      color: colors.get(segment.key) ?? LOCATION_PALETTE[0],
    }))
}

function segmentsFor(
  rows: DashboardPreacherBars,
  preacherId: string,
  colors: Map<string, string>,
): ColoredSegment[] {
  const row = rows.rows.find((entry) => entry.preacherId === preacherId)

  return coloredSegments(row?.segments ?? [], colors)
}

/**
 * One metric's bar: the track is the programme total, so its filled length is
 * this preacher's share of that total, split by the locations they served.
 */
function LocationBreakdown({
  kind,
  title,
  total,
  sectionTotal,
  segments,
  reduceMotion,
}: {
  kind: "sessions" | "contacts" | "attendees"
  title: string
  total: number
  sectionTotal: number
  segments: ColoredSegment[]
  reduceMotion: boolean | null
}) {
  return (
    <div data-dashboard-location-bar={kind}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] text-[var(--muted-foreground)]">{title}</span>
        <span className="font-[family-name:var(--font-poppins)] text-lg leading-none font-semibold tabular-nums text-[var(--program-text)]">
          {formatCount(total)}
        </span>
      </div>

      <div
        className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[var(--muted)]"
        aria-hidden="true"
      >
        <div className="flex h-full w-full">
          {segments.map((segment) => (
            <motion.div
              key={segment.key}
              style={{
                backgroundColor: segment.color,
                minWidth: segment.value > 0 ? 2 : 0,
              }}
              initial={reduceMotion ? false : { width: 0 }}
              animate={{
                width: `${
                  sectionTotal > 0 ? (segment.value / sectionTotal) * 100 : 0
                }%`,
              }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          ))}
        </div>
      </div>

      {segments.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] leading-4 text-[var(--muted-foreground)]">
          {segments.map((segment) => (
            <li key={segment.key} className="inline-flex items-center gap-1">
              <span
                className="size-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: segment.color }}
                aria-hidden="true"
              />
              <span>{segment.label}</span>
              <span className="tabular-nums font-semibold text-[var(--program-text)]">
                {formatCount(segment.value)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[11px] leading-4 text-[var(--muted-foreground)]">
          None in this period.
        </p>
      )}
    </div>
  )
}

/**
 * The Kiranism-style per-preacher card. Sessions, collected contacts and
 * attendees are each one location-segmented bar, with the total at the right
 * and a colour legend below — the reference's shape. Attendees are counted at
 * the first location they attended in the period, so the segments are a
 * partition of the preacher's own total; the bar itself is scaled against the
 * programme total, so its length is the preacher's share.
 */
export function DashboardPreachingEfforts({
  rows,
  sessionsByPreacher,
  contactsByPreacher,
}: {
  rows: DashboardPreacherTotalsRow[]
  sessionsByPreacher: DashboardPreacherBars
  contactsByPreacher: DashboardPreacherBars
}) {
  const reduceMotion = useReducedMotion()
  // A user with no collected contacts is not a preaching-effort card. This also
  // keeps an assistant who created a session on a preacher's behalf out of the
  // section when they have no contacts of their own.
  const visibleRows = rows.filter((row) => row.contacts > 0)
  const sectionTotals = {
    contacts: visibleRows.reduce((sum, row) => sum + row.contacts, 0),
    sessions: visibleRows.reduce((sum, row) => sum + row.sessions, 0),
    attendees: visibleRows.reduce((sum, row) => sum + row.attendees, 0),
  }
  const totals = [
    { key: "contacts", label: "Collected", value: sectionTotals.contacts },
    { key: "sessions", label: "Sessions", value: sectionTotals.sessions },
    { key: "attendees", label: "Attendees", value: sectionTotals.attendees },
  ]
  const maxAttendees = Math.max(1, ...visibleRows.map((row) => row.attendees))
  const scores = visibleRows.map((row) => ({
    id: row.preacherId,
    score:
      row.contacts / Math.max(1, ...visibleRows.map((entry) => entry.contacts)) +
      row.sessions / Math.max(1, ...visibleRows.map((entry) => entry.sessions)) +
      row.attendees / maxAttendees,
  }))
  const topScore = Math.max(0, ...scores.map((entry) => entry.score))
  const colors = locationColorMap(sessionsByPreacher, contactsByPreacher, visibleRows)

  if (visibleRows.length === 0 || totals.every((metric) => metric.value === 0)) {
    return (
      <DashboardCard
        title="Preaching effort"
        subtitle="Collected, sessions and attendees for each preacher in the period"
      >
        <DashboardInlineEmpty>No preacher activity in this period.</DashboardInlineEmpty>
      </DashboardCard>
    )
  }

  return (
    <DashboardCard
      title="Preaching effort"
      subtitle="Each bar is the preacher's share of the period total for that measure; colours are the locations served"
    >
      <dl className="grid grid-cols-3 gap-3">
        {totals.map((metric) => (
          <div
            key={metric.key}
            data-dashboard-scorecard-total={metric.key}
            className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/20 px-3 py-3 text-center"
          >
            <dd className="font-[family-name:var(--font-poppins)] text-xl leading-none font-bold tabular-nums text-[var(--program-text)]">
              <AnimatedCount value={metric.value} />
            </dd>
            <dt className="mt-1 text-[11px] text-[var(--muted-foreground)]">{metric.label}</dt>
          </div>
        ))}
      </dl>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {visibleRows.map((row) => {
          const isTop =
            topScore > 0 &&
            scores.find((entry) => entry.id === row.preacherId)?.score === topScore
          const sessions = segmentsFor(sessionsByPreacher, row.preacherId, colors)
          const contacts = segmentsFor(contactsByPreacher, row.preacherId, colors)
          const attendees = coloredSegments(row.attendeeSegments, colors)
          const repeatAttendees = Math.max(
            0,
            Math.min(row.attendees, row.repeatAttendees),
          )
          const newAttendees = Math.max(0, row.attendees - repeatAttendees)
          const repeatShare =
            row.attendees > 0 ? Math.round((repeatAttendees / row.attendees) * 100) : 0
          const newShare = row.attendees > 0 ? 100 - repeatShare : 0

          return (
            <article
              key={row.preacherId}
              data-dashboard-scorecard={row.preacherId}
              className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/10 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-[family-name:var(--font-poppins)] text-sm font-semibold text-[var(--program-text)]">
                  {row.preacherName}
                </h3>
                {isTop ? (
                  <span className="shrink-0 rounded-full bg-[var(--muted)] px-2.5 py-1 text-[10px] font-semibold tracking-wide text-[var(--muted-foreground)]">
                    Higher overall volume
                  </span>
                ) : null}
              </div>

              <div className="mt-3 flex flex-col gap-4">
                <LocationBreakdown
                  kind="sessions"
                  title="Sessions"
                  total={row.sessions}
                  sectionTotal={sectionTotals.sessions}
                  segments={sessions}
                  reduceMotion={reduceMotion}
                />
                <LocationBreakdown
                  kind="contacts"
                  title="Contacts collected"
                  total={row.contacts}
                  sectionTotal={sectionTotals.contacts}
                  segments={contacts}
                  reduceMotion={reduceMotion}
                />
                <LocationBreakdown
                  kind="attendees"
                  title="Attendees"
                  total={row.attendees}
                  sectionTotal={sectionTotals.attendees}
                  segments={attendees}
                  reduceMotion={reduceMotion}
                />

                <div
                  className="border-t border-[var(--border)] pt-3"
                  data-dashboard-repeat-bar={row.preacherId}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium text-[var(--program-text)]">
                        {formatCount(row.attendees)} attendees recorded
                      </p>
                      <p className="mt-0.5 text-[11px] leading-4 text-[var(--muted-foreground)]">
                        Repeat counts people who attended at least twice in the period
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-[family-name:var(--font-poppins)] text-lg leading-none font-semibold tabular-nums text-[var(--program-text)]">
                        {repeatShare}%
                      </p>
                      <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                        Repeat share
                      </p>
                    </div>
                  </div>

                  <div
                    className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--muted)]"
                    aria-hidden="true"
                  >
                    <motion.div
                      style={{ backgroundColor: "var(--chart-1)" }}
                      initial={reduceMotion ? false : { width: 0 }}
                      animate={{ width: `${newShare}%` }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                    <motion.div
                      style={{ backgroundColor: "var(--chart-2)" }}
                      initial={reduceMotion ? false : { width: 0 }}
                      animate={{ width: `${repeatShare}%` }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                  </div>

                  <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-[var(--muted-foreground)]">
                    <span className="inline-flex items-center gap-1">
                      <span
                        className="size-2 shrink-0 rounded-[2px]"
                        style={{ backgroundColor: "var(--chart-1)" }}
                        aria-hidden="true"
                      />
                      New:
                      <span className="font-semibold tabular-nums text-[var(--program-text)]">
                        {formatCount(newAttendees)}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span
                        className="size-2 shrink-0 rounded-[2px]"
                        style={{ backgroundColor: "var(--chart-2)" }}
                        aria-hidden="true"
                      />
                      Repeat:
                      <span className="font-semibold tabular-nums text-[var(--program-text)]">
                        {formatCount(repeatAttendees)}
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </DashboardCard>
  )
}
