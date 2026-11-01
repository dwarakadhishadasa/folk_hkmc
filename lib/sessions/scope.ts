import "server-only"

import { AuthzError, type StaffContext } from "@/lib/authz"
import { findStaffUserById, listLocations, type LocationRecord } from "@/lib/supabase/data"

/** The three roles `/sessions` admits. A Volunteer is refused by the page. */
export type SessionsRole = "Admin" | "Preacher" | "Assistant"

/**
 * The scope every sessions read passes to the SQL functions.
 *
 * An Assistant's assigned preacher is resolved only while that preacher is
 * still an Active Preacher. Otherwise `assignedPreacherId` is null and the
 * Assistant keeps only the sessions they created — never the programme.
 */
export interface SessionsScope {
  programId: string
  userId: string
  role: SessionsRole
  assignedPreacherId: string | null
  /**
   * The locations the new-session form may offer. An Admin's read filter may
   * also list the rest of the programme; creation still refuses those.
   */
  locationIds: string[]
}

export async function sessionsScope(staff: StaffContext): Promise<SessionsScope> {
  if (staff.role !== "Admin" && staff.role !== "Preacher" && staff.role !== "Assistant") {
    throw new AuthzError(403, "forbidden", "Sessions are not available to this staff role.")
  }

  if (staff.role !== "Assistant") {
    return {
      programId: staff.programId,
      userId: staff.userId,
      role: staff.role,
      assignedPreacherId: null,
      locationIds: staff.locationIds,
    }
  }

  const assignedId = staff.assignedPreacherUserId?.trim()
  if (!assignedId) {
    return {
      programId: staff.programId,
      userId: staff.userId,
      role: "Assistant",
      assignedPreacherId: null,
      locationIds: [],
    }
  }

  const preacher = await findStaffUserById(assignedId)
  if (!preacher || preacher.role !== "Preacher" || preacher.status !== "Active") {
    return {
      programId: staff.programId,
      userId: staff.userId,
      role: "Assistant",
      assignedPreacherId: null,
      locationIds: [],
    }
  }

  return {
    programId: staff.programId,
    userId: staff.userId,
    role: "Assistant",
    assignedPreacherId: preacher.id,
    locationIds: preacher.locationIds,
  }
}

export interface SessionsLocations {
  /** What the desktop filter may list: an Admin's is the programme. */
  filter: LocationRecord[]
  /**
   * What the creation form may offer. It is deliberately narrower than the
   * filter for an Admin: `POST /api/sessions` still refuses a location outside
   * the caller's own `location_ids`, so offering one would be a control that
   * can only fail.
   */
  create: LocationRecord[]
}

export async function sessionsLocations(scope: SessionsScope): Promise<SessionsLocations> {
  const all = await listLocations()
  const owned = all.filter((location) => scope.locationIds.includes(location.id))

  return {
    filter: scope.role === "Admin" ? all : owned,
    create: owned,
  }
}
