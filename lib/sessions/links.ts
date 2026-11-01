/**
 * Where a session row points.
 *
 * A live session belongs on its attendance dashboard; the designed detail
 * screen is for a window that has not opened or has closed. The detail page
 * applies the same rule to a direct visit, so the two cannot disagree.
 */
export function sessionHref(row: { id: string; status: string }): string {
  return row.status === "Live now" ? `/sessions/${row.id}/live` : `/sessions/${row.id}`
}
