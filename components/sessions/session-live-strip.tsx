import Link from "next/link"
import { ArrowUpRight } from "lucide-react"

import type { SessionOverviewRow } from "@/lib/sessions/data"
import { formatSessionDayMonth, formatSessionTime, pluralise } from "@/lib/sessions/format"

/**
 * The live sessions in the current view, pulled out of the table and given the
 * dashboard affordance they deserve. A live window is the one row a staff
 * member acts on immediately; it should not be one line among forty.
 *
 * The strip is server-rendered and disappears when nothing is live, so a page
 * with no attendance windows open carries no empty chrome.
 */
export function SessionLiveStrip({ rows }: { rows: SessionOverviewRow[] }) {
  const live = rows.filter((row) => row.status === "Live now")

  if (live.length === 0) {
    return null
  }

  return (
    <section aria-label="Live sessions" className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="relative flex size-2.5" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#15803d] opacity-60" />
          <span className="relative inline-flex size-2.5 rounded-full bg-[#15803d]" />
        </span>
        <h2 className="text-[11px] font-semibold tracking-[0.04em] text-[var(--muted-foreground)] uppercase">
          Live now
        </h2>
        <span className="rounded-full bg-[#e8f5ec] px-2 py-0.5 text-[11px] font-semibold text-[#15803d] dark:bg-[#10331c] dark:text-[#7ee2a3]">
          {live.length}
        </span>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:overflow-x-auto md:pb-1">
        {live.map((row) => (
          <Link
            key={row.id}
            href={`/sessions/${row.id}/live`}
            data-session-live={row.name}
            className="group w-full min-w-0 rounded-xl border border-[color-mix(in_oklab,var(--chart-2)_32%,var(--border))] bg-gradient-to-br from-[color-mix(in_oklab,var(--chart-2)_10%,var(--card))] to-card p-4 transition-colors hover:border-[var(--chart-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)] md:min-w-[248px] md:flex-1"
          >
            <span className="flex items-start justify-between gap-2">
              <span className="min-w-0 truncate text-[13px] font-semibold text-[var(--program-text)]">
                {row.name}
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#15803d] px-2 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase">
                Live
              </span>
            </span>

            <span className="mt-1 block text-[11px] text-[var(--muted-foreground)]">
              {formatSessionDayMonth(row.sessionDate)} · {formatSessionTime(row.opensAt)} ·{" "}
              {row.locationName ?? "—"}
            </span>

            <span className="mt-3 flex items-end justify-between gap-2">
              <span>
                <span className="font-[family-name:var(--font-poppins)] text-[24px] leading-none font-bold text-[var(--program-text)]">
                  {row.attendanceCount}
                </span>
                <span className="ml-1 text-[11px] text-[var(--muted-foreground)]">
                  {row.attendanceCount === 1 ? "check-in" : "check-ins"}
                </span>
              </span>
              <span className="inline-flex items-center gap-1 text-[12px] font-medium text-[#15803d] dark:text-[#7ee2a3]">
                Open dashboard
                <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </span>
            </span>
          </Link>
        ))}
      </div>

      <p className="sr-only">{pluralise(live.length, "live session")}</p>
    </section>
  )
}
