import "server-only"

import type { DashboardWindow } from "@/lib/dashboard/period"
import { parseDashboardOverview } from "@/lib/dashboard/payload"
import type { DashboardOverview, DashboardScope } from "@/lib/dashboard/types"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

function readFailure(operation: string, error: { message?: string; code?: string } | null): Error {
  console.error(`[dashboard] ${operation} failed`, error)
  return new Error(`Unable to read the dashboard (${operation}).`)
}

/**
 * One `dashboard_overview` call per page load. No component counts rows; the
 * payload is parsed strictly so a missing figure is a 500 rather than a zero.
 */
export async function loadDashboardOverview(
  scope: DashboardScope,
  window: DashboardWindow,
): Promise<DashboardOverview> {
  if (!scope.programScope && !scope.scopePreacherId) {
    throw new Error("The dashboard scope has no preacher id; refusing to widen to the programme.")
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin.rpc("dashboard_overview", {
    p_program_id: scope.programId,
    p_scope_preacher_id: scope.scopePreacherId,
    p_program_scope: scope.programScope,
    p_start: window.start,
    p_end: window.end,
    p_today: window.today,
    p_prev_start: window.prevStart,
    p_prev_end: window.prevEnd,
    p_has_dialer: scope.hasDialer,
  })

  if (error) {
    throw readFailure("overview", error)
  }

  return parseDashboardOverview(data)
}
