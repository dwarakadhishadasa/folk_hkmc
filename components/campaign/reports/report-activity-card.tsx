import type { CampaignProgress } from "@/lib/dialer/progress"
import { reportGroupLabel } from "@/lib/dialer/reports"

import { ReportCard } from "./report-card"
import { formatReportTime } from "./report-format"

/**
 * Frame 790's Recent activity: log-grain rows, newest first, scoped to the
 * reader's people by the same `campaign_progress` call. The campaign name in
 * the middle cell is the page's selected campaign — a call log belongs to one
 * campaign, and this screen never blends two.
 */
export function ReportActivityCard({
  recent,
  campaignName,
}: {
  recent: CampaignProgress["recent"]
  campaignName: string
}) {
  return (
    <ReportCard title="Recent activity">
      {recent.length === 0 ? (
        <p className="text-[13px] text-[var(--muted-foreground)]">
          No calls have been recorded in this campaign yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Recent activity">
          {recent.map((call) => (
            <li
              key={call.id}
              data-report-activity={call.id}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] items-center gap-2 text-[12px]"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-1.5 shrink-0 rounded-full bg-[var(--chart-1)]"
                />
                <span className="truncate text-[var(--program-text)]">{call.callerName}</span>
              </span>
              <span className="truncate text-[var(--muted-foreground)]">
                {reportGroupLabel(call.statusGroup)} · {campaignName}
              </span>
              <time
                dateTime={call.calledAt}
                className="shrink-0 tabular-nums text-[var(--program-text)]"
              >
                {formatReportTime(call.calledAt)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </ReportCard>
  )
}
