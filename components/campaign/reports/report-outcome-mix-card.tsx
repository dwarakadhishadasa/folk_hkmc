import type { CampaignProgress } from "@/lib/dialer/progress"
import { REPORT_STATUS_GROUPS, reportGroupLabel } from "@/lib/dialer/reports"

import { ReportCard } from "./report-card"

/**
 * One bar colour per generated group. The mix groups by `status_group`, never by
 * the thirteen chips, so these six rows are the whole vocabulary — a chip that
 * shares a group must not become a seventh row.
 */
const GROUP_BARS: Record<string, string> = {
  CONFIRMED: "bg-[var(--chart-2)]",
  MAY_COME: "bg-[var(--chart-1)]",
  DEFERRED: "bg-[var(--chart-5)]",
  NOT_REACHABLE: "bg-[var(--chart-4)]",
  WRONG_NUMBER: "bg-[var(--chart-3)]",
  NOT_INTERESTED: "bg-[var(--destructive)]",
}

/**
 * Frame 790's Outcome mix. The counts are log-grain and scoped by the same
 * `campaign_progress` call as the funnel; the width is relative to the largest
 * group so a six-row card stays readable even when the totals are small. The
 * printed count is the fact, the bar only ranks them.
 */
export function ReportOutcomeMixCard({ outcomes }: { outcomes: CampaignProgress["outcomes"] }) {
  const counts = new Map(outcomes.map((outcome) => [outcome.statusGroup, outcome.count]))
  const rows = REPORT_STATUS_GROUPS.map((group) => ({
    group,
    label: reportGroupLabel(group),
    count: counts.get(group) ?? 0,
  }))
  const largest = Math.max(...rows.map((row) => row.count), 1)

  return (
    <ReportCard title="Outcome mix" subtitle="Every outcome is recorded by the caller, by hand.">
      <ul className="flex flex-col gap-3" aria-label="Outcome mix">
        {rows.map((row) => (
          <li
            key={row.group}
            data-report-outcome={row.group}
            data-report-outcome-count={row.count}
            className="grid grid-cols-[96px_minmax(0,1fr)_2.5rem] items-center gap-3 sm:grid-cols-[120px_minmax(0,1fr)_3rem]"
          >
            <span className="text-[13px] text-[var(--program-text)]">{row.label}</span>
            <span className="block h-4 overflow-hidden rounded-[3px] bg-[var(--muted)]">
              <span
                aria-hidden="true"
                className={`block h-full rounded-[3px] ${GROUP_BARS[row.group] ?? "bg-[var(--chart-5)]"}`}
                style={{ width: `${Math.round((row.count / largest) * 100)}%` }}
              />
            </span>
            <span className="text-right text-[13px] font-semibold tabular-nums text-[var(--program-text)]">
              {row.count}
            </span>
          </li>
        ))}
      </ul>
    </ReportCard>
  )
}
