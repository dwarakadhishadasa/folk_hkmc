import Link from "next/link"
import {
  ArrowRight,
  CalendarX2,
  HeartHandshake,
  Phone,
  Send,
  TrendingDown,
  UserPlus,
  type LucideIcon,
} from "lucide-react"

import { ContactRecordTrigger } from "@/components/contacts/contact-record-trigger"
import { DashboardCard } from "@/components/dashboard/dashboard-card"
import { formatCount } from "@/lib/dashboard/format"
import {
  FOCUS_SEGMENTS,
  type DashboardMode,
  type FocusRow,
  type FocusSegment,
  type FocusSegmentKey,
} from "@/lib/dashboard/types"

const FOCUS_ICONS: Record<FocusSegmentKey, LucideIcon> = {
  confirmed_not_attended: CalendarX2,
  ready_to_invite: Send,
  committed_not_invited: HeartHandshake,
  new_untouched: UserPlus,
  fading: TrendingDown,
}

const FOCUS_ACCENTS: Record<FocusSegmentKey, string> = {
  confirmed_not_attended: "var(--chart-3)",
  ready_to_invite: "var(--chart-1)",
  committed_not_invited: "var(--chart-2)",
  new_untouched: "var(--chart-5)",
  fading: "var(--chart-4)",
}

function phoneHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

function CandidateRow({
  row,
  accent,
  sequence,
}: {
  row: FocusRow
  accent: string
  sequence: readonly string[]
}) {
  return (
    <li
      data-dashboard-focus-row={row.contactId}
      className="border-t border-[var(--border)] py-2.5 first:border-t-0 first:pt-0"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <span
            className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
            style={{
              backgroundColor: `color-mix(in oklab, ${accent} 14%, var(--card))`,
              color: accent,
            }}
            aria-hidden="true"
          >
            {initials(row.name)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--program-text)]">
              <ContactRecordTrigger
                contactId={row.contactId}
                name={row.name}
                sequence={sequence}
                className="max-w-full truncate"
              >
                {row.name}
              </ContactRecordTrigger>
            </p>
            <p className="mt-0.5 text-[11px] leading-4 text-[var(--muted-foreground)]">{row.reason}</p>
          </div>
        </div>
        <a
          href={phoneHref(row.phone)}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] font-semibold text-[var(--program-primary)] transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          aria-label={`Call ${row.name}`}
        >
          <Phone className="size-3" aria-hidden="true" />
          Call {row.name}
        </a>
      </div>
    </li>
  )
}

export function DashboardFocusSection({
  segments,
  hasDialer,
  mode,
}: {
  segments: FocusSegment[]
  hasDialer: boolean
  mode: DashboardMode
}) {
  const byKey = new Map(segments.map((segment) => [segment.key, segment]))
  const visible = FOCUS_SEGMENTS.filter((segment) => hasDialer || !segment.requiresDialer)
  const modeQuery = mode === "preacher" ? "&mode=preacher" : ""

  return (
    <DashboardCard title="Focus now" subtitle="People to act on today, independent of the selected period">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {visible.map((definition) => {
          const segment = byKey.get(definition.key)
          const rows = segment?.rows ?? []
          const count = segment?.count ?? 0
          const Icon = FOCUS_ICONS[definition.key]
          const accent = FOCUS_ACCENTS[definition.key]
          // The card renders only the first three rows; the sequence must be the
          // same list, or Previous/Next would step to a contact the card never
          // showed.
          const sequence = rows.slice(0, 3).map((row) => row.contactId)

          return (
            <article
              key={definition.key}
              data-dashboard-focus={definition.key}
              className="relative flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-card p-4 transition-shadow duration-200 hover:shadow-[0_12px_30px_rgba(45,10,10,0.06)]"
            >
              <span
                className="absolute inset-y-0 left-0 w-1"
                style={{ backgroundColor: accent }}
                aria-hidden="true"
              />
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-xl"
                    style={{
                      backgroundColor: `color-mix(in oklab, ${accent} 12%, var(--card))`,
                      color: accent,
                    }}
                    aria-hidden="true"
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-[family-name:var(--font-poppins)] text-sm font-semibold text-[var(--program-text)]">
                      {definition.label}
                    </h3>
                    <p className="mt-0.5 text-[11px] leading-4 text-[var(--muted-foreground)]">
                      {definition.rule}
                    </p>
                  </div>
                </div>
                <span
                  data-dashboard-focus-count={definition.key}
                  className="shrink-0 font-[family-name:var(--font-poppins)] text-2xl leading-none font-bold tabular-nums text-[var(--program-text)]"
                >
                  {formatCount(count)}
                </span>
              </div>

              {count === 0 ? (
                <p className="mt-4 rounded-lg bg-[var(--muted)]/30 px-3 py-2 text-xs text-[var(--muted-foreground)]">
                  Nothing here right now
                </p>
              ) : (
                <ul className="mt-3 flex flex-col">
                  {rows.slice(0, 3).map((row) => (
                    <CandidateRow key={row.contactId} row={row} accent={accent} sequence={sequence} />
                  ))}
                </ul>
              )}

              <div className="mt-auto pt-3">
                <Link
                  href={`/dashboard/candidates?segment=${definition.key}${modeQuery}`}
                  className="group/link inline-flex items-center gap-1 text-xs font-semibold text-[var(--program-primary)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  View all
                  <ArrowRight
                    className="size-3 transition-transform group-hover/link:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
              </div>
            </article>
          )
        })}
      </div>

      <p className="mt-3 text-xs text-[var(--muted-foreground)]">
        A person can appear in more than one list; counts are not a total.
      </p>
    </DashboardCard>
  )
}
