import "server-only"

import { parseDashboardPeopleSeries } from "@/lib/dashboard/payload"
import type { DashboardWindow } from "@/lib/dashboard/period"
import type { DashboardPeopleSeries, DashboardScope } from "@/lib/dashboard/types"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

/**
 * The preacher-first charts: sessions and collected contacts by preacher and
 * location, plus the twelve-month attendee lines. One RPC call, parsed strictly
 * for the same reason `dashboard_overview` is.
 */
export async function loadDashboardPeopleSeries(
  scope: DashboardScope,
  window: DashboardWindow,
): Promise<DashboardPeopleSeries> {
  if (!scope.programScope && !scope.scopePreacherId) {
    throw new Error("The dashboard scope has no preacher id; refusing to widen to the programme.")
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin.rpc("dashboard_people_series", {
    p_program_id: scope.programId,
    p_scope_preacher_id: scope.scopePreacherId,
    p_program_scope: scope.programScope,
    p_start: window.start,
    p_end: window.end,
    p_today: window.today,
  })

  if (error) {
    console.error("[dashboard] people series failed", error)
    throw new Error("Unable to read the dashboard (people series).")
  }

  return parseDashboardPeopleSeries(data)
}
