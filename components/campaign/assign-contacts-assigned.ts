import type { AssignableContactView } from "@/components/campaign/assign-contacts-types"

/**
 * A draft campaign has assignments prepared but no calls yet, so its split is
 * a plan; once the campaign is live the same rows are work already handed out.
 */
export function assignedBarHeading(campaignStatus: string): string {
  return campaignStatus === "DRAFT" ? "Planned assignments" : "Already assigned"
}

export interface AssignedCallerRow {
  callerName: string
  count: number
  /** Share of every contact in scope, so the bar's remainder is unassigned. */
  percentage: number
}

/**
 * The contacts already held in this campaign, grouped by their caller.
 *
 * The denominator is the whole scoped set, not just the assigned rows: the bar
 * is read against "how much of the campaign is assigned", and the muted track
 * behind the segments is exactly the unassigned remainder.
 */
export function assignedCallerRows(
  contacts: readonly Pick<AssignableContactView, "assignedCallerName">[],
): { rows: AssignedCallerRow[]; assignedCount: number; total: number } {
  const total = contacts.length
  const counts = new Map<string, number>()

  for (const contact of contacts) {
    const callerName = contact.assignedCallerName?.trim()

    if (!callerName) {
      continue
    }

    counts.set(callerName, (counts.get(callerName) ?? 0) + 1)
  }

  const rows = [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([callerName, count]) => ({
      callerName,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    }))

  return {
    rows,
    assignedCount: rows.reduce((sum, row) => sum + row.count, 0),
    total,
  }
}
