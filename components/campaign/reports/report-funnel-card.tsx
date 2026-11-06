import { AlertTriangle } from "lucide-react"

import type { CampaignProgress } from "@/lib/dialer/progress"
import { REPORT_FUNNEL_BUCKETS } from "@/lib/dialer/reports"

import { ReportCard } from "./report-card"
import { REPORT_FUNNEL_COLORS } from "./report-colors"

/**
 * Frame 790's Campaign funnel, plus the Confirmed bucket the four-row frame
 * omits (Story 3.1's AC; the phone frame omits it too, Story 3.3 answers that).
 *
 * Every width is the bucket over the assigned count, so the five rows measure
 * the same question: "of the people we assigned, how many got here?". The
 * number beside the bar is the count itself; the bar is only a comparison.
 */
export function ReportFunnelCard({ summary }: { summary: CampaignProgress["summary"] }) {
  const assigned = summary.assigned
  const neverCalled =
    summary.neverAttempted === 1
      ? "1 assigned contact was never called."
      : `${summary.neverAttempted} assigned contacts were never called.`

  return (
    <ReportCard
      title="Campaign funnel"
      // The design's note changes with the data on the professional stage; the
      // sentence here is the frame's own.
      subtitle="The fourth bucket is the one that makes a stalled caller visible."
    >
      <ul className="flex flex-col gap-3" aria-label="Campaign funnel">
        {REPORT_FUNNEL_BUCKETS.map((bucket) => {
          const value = summary[bucket.key]
          const percentage = assigned === 0 ? 0 : Math.round((value / assigned) * 100)

          return (
            <li
              key={bucket.key}
              data-report-funnel={bucket.label}
              data-report-funnel-value={value}
              className="grid grid-cols-[104px_minmax(0,1fr)_2rem] items-center gap-2 sm:grid-cols-[120px_minmax(0,1fr)_3rem] sm:gap-3"
            >
              <span className="text-[13px] text-[var(--program-text)]">{bucket.label}</span>
              <span className="block h-4 overflow-hidden rounded-[3px] bg-[var(--muted)]">
                <span
                  aria-hidden="true"
                  className="block h-full rounded-[3px]"
                  style={{ width: `${percentage}%`, backgroundColor: REPORT_FUNNEL_COLORS[bucket.key] }}
                />
              </span>
              <span className="text-right text-[13px] font-semibold tabular-nums text-[var(--program-text)]">
                {value}
              </span>
            </li>
          )
        })}
      </ul>

      {summary.neverAttempted > 0 ? (
        <p className="mt-4 hidden items-start gap-2 text-[12px] leading-4 text-[var(--destructive)] md:flex">
          <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          <span>
            {neverCalled} Assigning is not the same as reaching somebody — this bucket is the
            difference.
          </span>
        </p>
      ) : null}
    </ReportCard>
  )
}
