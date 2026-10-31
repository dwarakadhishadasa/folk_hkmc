/**
 * The reports surface's vocabulary and its CSV, in one place.
 *
 * Every number comes from `campaign_progress` (`CampaignProgress`). This module
 * only arranges what that function returned: it never counts an assignment, a
 * call log or a caller, so a CSV row and an on-screen number cannot disagree.
 *
 * The CSV deliberately carries no `call_duration` column. The product does not
 * record a duration, and the source app's export header promised one it could
 * never fill.
 */

import type { CampaignRow } from "@/lib/dialer/campaigns"
import {
  STATUS_GROUP_LABELS,
  type DispositionStatusGroup,
} from "@/lib/dialer/disposition"
import type { CampaignProgress } from "@/lib/dialer/progress"

/** The six generated groups, in the order the reports cards list them. */
export const REPORT_STATUS_GROUPS = [
  "CONFIRMED",
  "MAY_COME",
  "DEFERRED",
  "NOT_REACHABLE",
  "WRONG_NUMBER",
  "NOT_INTERESTED",
] as const satisfies readonly DispositionStatusGroup[]

/** A group's short display label, or the stored value if a new group ever lands. */
export function reportGroupLabel(group: string): string {
  return Object.prototype.hasOwnProperty.call(STATUS_GROUP_LABELS, group)
    ? STATUS_GROUP_LABELS[group as DispositionStatusGroup]
    : group
}

/** The five funnel buckets, in AD-5's order. `key` addresses the summary. */
export const REPORT_FUNNEL_BUCKETS = [
  { key: "assigned", label: "Assigned" },
  { key: "attempted", label: "Attempted" },
  { key: "reached", label: "Reached" },
  { key: "confirmed", label: "Confirmed" },
  { key: "neverAttempted", label: "Never attempted" },
] as const

/**
 * A leaderboard ordered the way the story ranks it: completed attempts first.
 * The RPC orders by assignments, which is a different question, so the screen
 * and the CSV share this one sort.
 */
export function leaderboardRows(
  callers: CampaignProgress["callers"],
): CampaignProgress["callers"] {
  return [...callers].sort(
    (left, right) =>
      right.callsMade - left.callsMade ||
      right.reached - left.reached ||
      left.callerName.localeCompare(right.callerName) ||
      left.callerId.localeCompare(right.callerId),
  )
}

/**
 * A filesystem-safe file name. An empty slug (a campaign named entirely with
 * punctuation) falls back to `campaign-report.csv` rather than `-report.csv`.
 */
export function reportFileName(campaignName: string): string {
  const slug = campaignName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)

  return `${slug || "campaign"}-report.csv`
}

/**
 * One CSV cell. A quote doubles, and a value holding a comma, quote or newline
 * is quoted — a contact name with a comma must not become a second column.
 */
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return ""
  }

  const text = String(value)

  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`
  }

  return text
}

function csvLine(cells: Array<string | number | null | undefined>): string {
  return cells.map(csvCell).join(",")
}

/**
 * The file the `Export CSV` control downloads, with the same sections, rows
 * and order the screen renders.
 *
 * Sections are separated by a blank line: the four answers have different
 * columns, and forcing them into one table would invent a column that means
 * nothing for two of the sections. The four headings are the screen's own
 * card titles.
 */
export function buildCampaignReportCsv(
  campaign: Pick<CampaignRow, "name" | "campaign_date" | "status">,
  progress: CampaignProgress,
): string {
  const lines: string[] = []

  lines.push(csvLine(["Campaign", campaign.name]))
  lines.push(csvLine(["Campaign date", campaign.campaign_date]))
  lines.push(csvLine(["Status", campaign.status]))
  lines.push("")

  lines.push("Funnel")
  lines.push(csvLine(["Metric", "Value"]))
  for (const bucket of REPORT_FUNNEL_BUCKETS) {
    lines.push(csvLine([bucket.label, progress.summary[bucket.key]]))
  }
  lines.push("")

  lines.push("Outcome mix")
  lines.push(csvLine(["Outcome", "Count"]))
  const outcomesByGroup = new Map(progress.outcomes.map((outcome) => [outcome.statusGroup, outcome.count]))
  for (const group of REPORT_STATUS_GROUPS) {
    lines.push(csvLine([reportGroupLabel(group), outcomesByGroup.get(group) ?? 0]))
  }
  lines.push("")

  lines.push("Caller rollup")
  lines.push(
    csvLine([
      "Caller",
      "Assigned",
      "Attempted",
      "Reached",
      "Confirmed",
      "Never attempted",
      "Calls made",
    ]),
  )
  for (const caller of leaderboardRows(progress.callers)) {
    lines.push(
      csvLine([
        caller.callerName,
        caller.assigned,
        caller.attempted,
        caller.reached,
        caller.confirmed,
        caller.neverAttempted,
        caller.callsMade,
      ]),
    )
  }
  lines.push("")

  lines.push("Recent activity")
  lines.push(csvLine(["Called at", "Caller", "Contact", "Outcome"]))
  for (const call of progress.recent) {
    lines.push(csvLine([call.calledAt, call.callerName, call.contactName, reportGroupLabel(call.statusGroup)]))
  }

  return `${lines.join("\n")}\n`
}
