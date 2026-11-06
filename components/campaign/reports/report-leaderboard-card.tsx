import { Info } from "lucide-react"

import type { CampaignProgress } from "@/lib/dialer/progress"
import { leaderboardRows } from "@/lib/dialer/reports"

import { ReportCard } from "./report-card"

/**
 * Two letters for the avatar circle: the first letter of the first two words,
 * or of the one word available. A name that is only an email keeps its local
 * part, so the circle is never blank.
 */
function initialsFor(name: string): string {
  const words = name
    .split(/[\s@._-]+/)
    .map((word) => word.trim())
    .filter(Boolean)

  if (words.length === 0) {
    return "?"
  }

  const first = words[0]![0] ?? "?"
  const second = words.length > 1 ? (words[1]![0] ?? "") : ""

  return `${first}${second}`.toUpperCase()
}

/**
 * Frame 790's Caller leaderboard: ranked on completed attempts, with the
 * design's own disclaimer that a click-to-call outcome is self-reported and
 * therefore claims no quality signal.
 *
 * `callsMade` is the rank because the story ranks completed attempts; `reached`
 * stays beside the name because a high attempt count with no conversation is
 * the thing an operator needs to see. Both are log-grain, so a caller with no
 * assignments is absent rather than ranked last.
 */
export function ReportLeaderboardCard({ callers }: { callers: CampaignProgress["callers"] }) {
  const rows = leaderboardRows(callers)
  const busiest = Math.max(...rows.map((row) => row.callsMade), 1)

  return (
    <ReportCard title="Caller leaderboard" badge="Ranked by attempts">
      <p className="hidden items-start gap-2 text-[12px] leading-4 text-[var(--muted-foreground)] md:flex">
        <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
        <span>
          Ranked on completed attempts only. Under click-to-call every outcome is self-reported, so
          no quality signal is claimed.
        </span>
      </p>

      {rows.length === 0 ? (
        <p className="mt-4 text-[13px] text-[var(--muted-foreground)]">
          No caller has attempted a call in this campaign yet.
        </p>
      ) : (
        <ol className="mt-4 flex flex-col gap-3" aria-label="Caller leaderboard">
          {rows.map((caller, index) => (
            <li
              key={caller.callerId}
              data-report-caller={caller.callerName}
              data-report-caller-calls={caller.callsMade}
              data-report-caller-reached={caller.reached}
              className="flex flex-col gap-1.5"
            >
              <div className="flex items-center gap-3">
                <span className="w-4 shrink-0 text-[12px] tabular-nums text-[var(--muted-foreground)]">
                  {index + 1}
                </span>
                <span
                  aria-hidden="true"
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--chart-1)_12%,var(--card))] text-[10px] font-semibold text-[var(--chart-1)]"
                >
                  {initialsFor(caller.callerName)}
                </span>
                <span className="flex min-w-0 flex-1 items-baseline gap-2">
                  <span className="truncate text-[13px] text-[var(--program-text)]">
                    {caller.callerName}
                  </span>
                  <span className="hidden shrink-0 text-[11px] text-[var(--muted-foreground)] md:inline">
                    {caller.reached} reached
                  </span>
                </span>
                <span className="shrink-0 text-[13px] font-semibold tabular-nums text-[var(--chart-1)]">
                  {caller.callsMade}
                </span>
              </div>

              <span
                aria-hidden="true"
                className="ml-7 block h-1.5 overflow-hidden rounded-full bg-[var(--muted)]"
              >
                <span
                  className="block h-full rounded-full bg-[var(--chart-1)]"
                  style={{ width: `${Math.max(6, Math.round((caller.callsMade / busiest) * 100))}%` }}
                />
              </span>
            </li>
          ))}
        </ol>
      )}
    </ReportCard>
  )
}
