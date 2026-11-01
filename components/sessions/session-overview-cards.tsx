import Link from "next/link"
import { ChevronRight } from "lucide-react"

import { SessionStatusPill } from "@/components/sessions/session-status-pill"
import { formatSessionDate } from "@/lib/sessions/format"
import type { SessionOverviewRow } from "@/lib/sessions/data"
import { sessionHref } from "@/lib/sessions/links"

/**
 * Frame 1752's phone Overview cards: name, date and location, the attendance
 * total and the status pill, with a chevron to the session.
 *
 * It is a `md:hidden` sibling of the table rather than a viewport check, so the
 * page stays a server component and both arrangements render the same rows.
 */
export function SessionOverviewCards({ rows }: { rows: SessionOverviewRow[] }) {
  return (
    <section aria-label="Recent and upcoming sessions" className="flex flex-col gap-2 md:hidden">
      <h2 className="text-[11px] font-semibold tracking-[0.04em] text-[var(--muted-foreground)] uppercase">
        Recent &amp; upcoming
      </h2>

      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              href={sessionHref(row)}
              data-session-card={row.name}
              data-session-status={row.status}
              className="block rounded-xl border border-[var(--border)] bg-card px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]"
            >
              <span className="flex items-start justify-between gap-2">
                <span className="text-[14px] font-semibold text-[var(--program-text)]">{row.name}</span>
                <ChevronRight className="mt-0.5 size-4 shrink-0 text-[#9195A0]" aria-hidden="true" />
              </span>

              <span className="mt-0.5 block text-[12px] text-[var(--muted-foreground)]">
                {formatSessionDate(row.sessionDate)} · {row.locationName ?? "—"}
              </span>

              <span className="mt-2 flex items-center justify-between gap-2">
                <span className="text-[14px] font-semibold tabular-nums text-[var(--program-text)]">
                  {row.attendanceCount}
                </span>
                <SessionStatusPill status={row.status} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
