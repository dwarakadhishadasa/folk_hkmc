import { REPORT_FUNNEL_BUCKETS } from "@/lib/dialer/reports"

/**
 * The reports surfaces' series colours, in one place.
 *
 * The funnel and the outcome mix are two views of the same payload, so their
 * bars, the donut slices and the activity dots have to name the same palette;
 * a second map is how a "Confirmed" bar and a "Confirmed" slice drift apart.
 */
export type ReportFunnelKey = (typeof REPORT_FUNNEL_BUCKETS)[number]["key"]

export const REPORT_FUNNEL_COLORS: Record<ReportFunnelKey, string> = {
  assigned: "var(--chart-1)",
  attempted: "var(--chart-2)",
  reached: "var(--chart-4)",
  confirmed: "var(--tag-9)",
  neverAttempted: "var(--grid-warning-ink)",
}

/**
 * One colour per generated status group. The mix groups by `status_group`,
 * never by the thirteen chips, so these six entries are the whole vocabulary.
 */
export const REPORT_GROUP_COLORS: Record<string, string> = {
  CONFIRMED: "var(--chart-2)",
  MAY_COME: "var(--chart-1)",
  DEFERRED: "var(--chart-5)",
  NOT_REACHABLE: "var(--chart-4)",
  WRONG_NUMBER: "var(--chart-3)",
  NOT_INTERESTED: "var(--destructive)",
}
