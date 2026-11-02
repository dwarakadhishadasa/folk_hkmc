import "server-only"

import { type StaffContext } from "@/lib/authz"
import type { DashboardScope } from "@/lib/dashboard/types"
import { isSessionLive, parseSessionTime } from "@/lib/sessions/live"
import { sessionsScope } from "@/lib/sessions/scope"
import { listVisibleSessions } from "@/lib/sessions/data"
import {
  findStaffUserById,
  getAttendanceBySessionRecord,
  listLocations,
} from "@/lib/supabase/data"

export interface DashboardLiveSession {
  id: string
  name: string
  preacherName: string | null
  locationNames: string[]
  closesAt: string | null
  checkIns: number
}

/**
 * The live band's seed payload.
 *
 * Visibility reuses the Sessions scope (`sessionsScope` + `listVisibleSessions`)
 * so a session a reader cannot open never appears; the dashboard's own scope
 * then narrows an Admin in `?mode=preacher`. The live predicate is the one in
 * `lib/sessions/live.ts`. The check-in counts are only the seed: the band polls
 * the session's attendance URL every 20 seconds while the tab is visible.
 */
export async function loadDashboardLiveSessions(
  staff: StaffContext,
  scope: DashboardScope,
): Promise<DashboardLiveSession[]> {
  if (scope.assistantUnassigned || (!scope.programScope && !scope.scopePreacherId)) {
    return []
  }

  const sessionScope = await sessionsScope(staff)
  const sessions = await listVisibleSessions(sessionScope)
  const now = Date.now()
  const scopePreacherId = scope.scopePreacherId

  const live = sessions
    .filter((session) =>
      isSessionLive(
        {
          publicAttendanceEnabled: session.publicAttendanceEnabled,
          attendanceOpensAt: session.attendanceOpensAt ?? null,
          attendanceClosesAt: session.attendanceClosesAt ?? null,
        },
        now,
      ),
    )
    .filter(
      (session) =>
        scope.programScope ||
        (scopePreacherId !== null &&
          (session.preacherIds.includes(scopePreacherId) || session.createdBy.includes(scopePreacherId))),
    )
    .sort(
      (left, right) =>
        (parseSessionTime(right.attendanceOpensAt) ?? 0) - (parseSessionTime(left.attendanceOpensAt) ?? 0),
    )

  if (live.length === 0) {
    return []
  }

  const locations = await listLocations()
  const locationNameById = new Map(locations.map((location) => [location.id, location.name]))
  const preacherIds = [...new Set(live.flatMap((session) => session.preacherIds))].filter(Boolean)
  const preacherRows = await Promise.all(preacherIds.map((id) => findStaffUserById(id)))
  const preacherNameById = new Map(
    preacherRows
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .map((row) => [row.id, row.name] as const),
  )
  const counts = await Promise.all(
    live.map((session) => getAttendanceBySessionRecord({ id: session.id })),
  )

  return live.map((session, index) => ({
    id: session.id,
    name: session.name,
    preacherName: session.preacherIds.map((id) => preacherNameById.get(id)).find(Boolean) ?? null,
    locationNames: session.locationIds
      .map((id) => locationNameById.get(id))
      .filter((name): name is string => Boolean(name)),
    closesAt: session.attendanceClosesAt ?? null,
    checkIns: counts[index]?.length ?? 0,
  }))
}
