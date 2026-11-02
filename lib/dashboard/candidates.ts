import "server-only"

import { parseCandidatePage } from "@/lib/dashboard/payload"
import type { CandidatePage, DashboardScope, FocusSegmentKey } from "@/lib/dashboard/types"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

function readFailure(operation: string, error: { message?: string; code?: string } | null): Error {
  console.error(`[dashboard] ${operation} failed`, error)
  return new Error(`Unable to read the dashboard (${operation}).`)
}

/**
 * One `dashboard_candidates` call per drill-down page. The predicate lives in
 * the same SQL function the overview's focus counts come from, so a card's
 * count and its list total cannot disagree.
 */
export async function loadDashboardCandidates(
  scope: DashboardScope,
  query: { segment: FocusSegmentKey; limit: number; offset: number; today: string },
): Promise<CandidatePage> {
  if (!scope.programScope && !scope.scopePreacherId) {
    throw new Error("The dashboard scope has no preacher id; refusing to widen to the programme.")
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin.rpc("dashboard_candidates", {
    p_program_id: scope.programId,
    p_scope_preacher_id: scope.scopePreacherId,
    p_program_scope: scope.programScope,
    p_has_dialer: scope.hasDialer,
    p_today: query.today,
    p_segment: query.segment,
    p_limit: query.limit,
    p_offset: query.offset,
  })

  if (error) {
    throw readFailure("candidates", error)
  }

  return parseCandidatePage(data, query.segment)
}
