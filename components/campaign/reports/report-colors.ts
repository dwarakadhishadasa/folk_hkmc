/**
 * The reports surfaces' series colours, in one place.
 *
 * The outcome mix's donut slices, its legend dots and the activity pills are
 * three views of the same status group, so they have to name the same palette;
 * a second map is how a "Confirmed" slice and a "Confirmed" pill drift apart.
 */
export const REPORT_GROUP_COLORS: Record<string, string> = {
  CONFIRMED: "var(--chart-2)",
  MAY_COME: "var(--chart-1)",
  DEFERRED: "var(--chart-5)",
  NOT_REACHABLE: "var(--chart-4)",
  WRONG_NUMBER: "var(--chart-3)",
  NOT_INTERESTED: "var(--destructive)",
}
