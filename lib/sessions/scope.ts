import "server-only"

import { AuthzError, type StaffContext } from "@/lib/authz"
import { listLocations, type LocationRecord } from "@/lib/supabase/data"

/** The three roles `/sessions` admits. A Volunteer is refused by the page. */
export type SessionsRole = "Admin" | "Preacher" | "Assistant"

/**
 * The scope every sessions read passes to the SQL functions.
 *
 * `userId`/`role` are the actor; `ownerId`/`locationIds` are the patch owner.
 * An Admin or Preacher owns their own patch; an Assistant's owner is the
 * assigned Active Admin or Preacher. A null owner yields zero rows, never the
 * programme and never the actor's own creations.
 */
export interface SessionsScope {
  programId: string
  /** The signed-in staff member. */
  userId: string
  role: SessionsRole
  /** The patch owner, or `null` when an Assistant has no eligible assignment. */
  ownerId: string | null
  /** The locations the new-session form may offer, and every personal write check. */
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
      ownerId: staff.userId,
      locationIds: staff.locationIds,
    }
  }

  const owner = staff.patchOwner
  if (!owner) {
    return {
      programId: staff.programId,
      userId: staff.userId,
      role: "Assistant",
      ownerId: null,
      locationIds: [],
    }
  }

  return {
    programId: staff.programId,
    userId: staff.userId,
    role: "Assistant",
    ownerId: owner.userId,
    locationIds: owner.locationIds,
  }
}

export interface SessionsLocations {
  /** What the desktop filter may list: an Admin's is the programme. */
  filter: LocationRecord[]
  /**
   * What the creation form may offer. It is deliberately narrower than the
   * filter for an Admin: `POST /api/sessions` still refuses a location outside
   * the patch owner's `location_ids`, so offering one would be a control that
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
