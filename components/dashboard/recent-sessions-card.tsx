import Link from "next/link"

import { DashboardCard, DashboardInlineEmpty } from "@/components/dashboard/dashboard-card"
import { dateParts, formatCount } from "@/lib/dashboard/format"
import type { RecentSession } from "@/lib/dashboard/types"

function DateBlock({ value }: { value: string | null }) {
  const parts = dateParts(value)
  if (!parts) {
    return (
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 text-[var(--muted-foreground)]">
        —
      </span>
    )
  }

  return (
    <span className="flex size-10 shrink-0 flex-col items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--muted)]/30">
      <span className="text-[13px] leading-none font-bold text-[var(--program-text)]">{parts.day}</span>
      <span className="mt-0.5 text-[9px] font-semibold tracking-wide text-[var(--muted-foreground)] uppercase">
        {parts.month}
      </span>
    </span>
  )
}

/**
 * The last five sessions as an activity list rather than a five-column table:
 * the card sits in the narrow column of the bottom row, and a table there
 * clipped its own columns. Each row names the session, its preacher, its
 * location and how many people attended.
 */
export function DashboardRecentSessionsCard({ sessions }: { sessions: RecentSession[] }) {
  return (
    <DashboardCard title="Recent sessions" subtitle="Preacher and attendance for the last five in scope">
      {sessions.length === 0 ? (
        <DashboardInlineEmpty href="/sessions" action="Start a session">
          No sessions yet.
        </DashboardInlineEmpty>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--border)]">
          {sessions.map((session) => (
            <li
              key={session.id}
              data-dashboard-recent-session={session.id}
              className="flex items-start gap-3 py-3 transition-colors first:pt-0 last:pb-0 hover:bg-foreground/[0.02]"
            >
              <DateBlock value={session.sessionDate} />

              <div className="min-w-0 flex-1">
                <Link
                  href={`/sessions/${session.id}`}
                  className="block truncate text-sm font-semibold text-[var(--program-text)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  {session.name}
                </Link>
                <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2 gap-y-0.5 text-[11px]">
                  <dt className="text-[var(--muted-foreground)]">Preacher</dt>
                  <dd className="truncate text-[var(--program-text)]">
                    {session.preacherName ?? "—"}
                  </dd>
                  <dt className="text-[var(--muted-foreground)]">Location</dt>
                  <dd className="truncate text-[var(--program-text)]">
                    {session.locationName ?? "—"}
                  </dd>
                </dl>
              </div>

              <span className="shrink-0 text-right">
                <span className="block font-[family-name:var(--font-poppins)] text-lg leading-none font-bold tabular-nums text-[var(--program-text)]">
                  {formatCount(session.attendees)}
                </span>
                <span className="mt-0.5 block text-[10px] text-[var(--muted-foreground)]">attendees</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  )
}
