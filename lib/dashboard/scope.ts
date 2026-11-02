import "server-only"

import { resolveManageMode } from "@/components/manage/manage-types"
import { AuthzError, requireRole, type StaffContext } from "@/lib/authz"
import type { DashboardScope } from "@/lib/dashboard/types"
import { findStaffUserById } from "@/lib/supabase/data"
import { getServerProgramProfile } from "@hkmc/program-config/server"

/**
 * Resolve the one scope every dashboard section reads.
 *
 * An Admin may narrow to their own rows with `?mode=preacher`; anything else
 * is the programme. A Preacher and an Assistant have a fixed scope and the
 * parameter is ignored, so it can never widen them. An Assistant resolves
 * through an Active Preacher in the same programme; a missing, inactive or
 * non-Preacher assignment is an empty scope with an explanation, not a
 * refusal and not the programme.
 */
export async function resolveDashboardScope(
  staff: StaffContext,
  rawMode: string | undefined,
): Promise<DashboardScope> {
  requireRole(staff, ["Admin", "Preacher", "Assistant"])

  const hasDialer = getServerProgramProfile(staff.programId).modules.dialer

  if (staff.role === "Admin") {
    const mode = resolveManageMode(rawMode)

    return {
      programId: staff.programId,
      role: "Admin",
      userId: staff.userId,
      mode,
      programScope: mode === "admin",
      scopePreacherId: mode === "preacher" ? staff.userId : null,
      displayName: staff.name,
      assistantPreacherName: null,
      assistantUnassigned: false,
      hasDialer,
    }
  }

  if (staff.role === "Preacher") {
    return {
      programId: staff.programId,
      role: "Preacher",
      userId: staff.userId,
      mode: "preacher",
      programScope: false,
      scopePreacherId: staff.userId,
      displayName: staff.name,
      assistantPreacherName: null,
      assistantUnassigned: false,
      hasDialer,
    }
  }

  const assignedId = staff.assignedPreacherUserId?.trim()
  if (!assignedId) {
    return unassignedAssistant(staff, hasDialer)
  }

  const preacher = await findStaffUserById(assignedId)
  if (!preacher || preacher.role !== "Preacher" || preacher.status !== "Active") {
    return unassignedAssistant(staff, hasDialer)
  }

  return {
    programId: staff.programId,
    role: "Assistant",
    userId: staff.userId,
    mode: "preacher",
    programScope: false,
    scopePreacherId: preacher.id,
    displayName: staff.name,
    assistantPreacherName: preacher.name,
    assistantUnassigned: false,
    hasDialer,
  }
}

function unassignedAssistant(staff: StaffContext, hasDialer: boolean): DashboardScope {
  return {
    programId: staff.programId,
    role: "Assistant",
    userId: staff.userId,
    mode: "preacher",
    programScope: false,
    scopePreacherId: null,
    displayName: staff.name,
    assistantPreacherName: null,
    assistantUnassigned: true,
    hasDialer,
  }
}

/** The role gate the page applies before any read. */
export function requireDashboardRole(staff: StaffContext): void {
  if (staff.role !== "Admin" && staff.role !== "Preacher" && staff.role !== "Assistant") {
    throw new AuthzError(403, "forbidden", "The dashboard is not available to this staff role.")
  }
}
