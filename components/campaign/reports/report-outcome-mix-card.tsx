import { formatPercentage } from "@/lib/dashboard/format"
import type { CampaignProgress } from "@/lib/dialer/progress"
import { REPORT_STATUS_GROUPS, reportGroupLabel } from "@/lib/dialer/reports"

import { ReportCard } from "./report-card"
import { REPORT_GROUP_COLORS } from "./report-colors"
import { ReportOutcomeDonut } from "./report-outcome-donut"

/**
 * Frame 790's Outcome mix, as the dashboard's donut widget: the six status
 * groups become slices, the call total sits in the hole, and the legend beside
 * it carries the readable count and share.
 *
 * The mix groups by `status_group`, never by the thirteen chips, so these six
 * rows are the whole vocabulary — a chip that shares a group must not become a
 * seventh row. The legend keeps the `data-report-outcome*` contract the reports
 * specs read; the donut is decorative for assistive technology.
 */
export function ReportOutcomeMixCard({ outcomes }: { outcomes: CampaignProgress["outcomes"] }) {
  const counts = new Map(outcomes.map((outcome) => [outcome.statusGroup, outcome.count]))
  const rows = REPORT_STATUS_GROUPS.map((group) => ({
    group,
    label: reportGroupLabel(group),
    count: counts.get(group) ?? 0,
    color: REPORT_GROUP_COLORS[group] ?? "var(--chart-5)",
  }))
  const total = rows.reduce((sum, row) => sum + row.count, 0)

  return (
    <ReportCard title="Outcome mix" subtitle="Every outcome is recorded by the caller, by hand.">
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <ReportOutcomeDonut rows={rows} />

        <ul className="flex w-full min-w-0 flex-col gap-2.5" aria-label="Outcome mix">
          {rows.map((row) => (
            <li
              key={row.group}
              data-report-outcome={row.group}
              data-report-outcome-count={row.count}
              className="flex items-center gap-2.5"
            >
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: row.color }}
              />
              <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--program-text)]">
                {row.label}
              </span>
              <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-[var(--muted-foreground)]">
                {formatPercentage(row.count, total)}
              </span>
              <span className="w-8 shrink-0 text-right text-[13px] font-semibold tabular-nums text-[var(--program-text)]">
                {row.count}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </ReportCard>
  )
}
