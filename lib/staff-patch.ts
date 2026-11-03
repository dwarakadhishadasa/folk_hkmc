/**
 * The patch owner: the staff member whose personal rows a signed-in staff
 * member reads. An Admin or Preacher is their own owner; an Assistant's owner
 * is the assigned Preacher, which may be an Admin or a Preacher.
 *
 * The stored column and the UI label stay "Preacher"; `owner` is internal
 * vocabulary for the relationship, never a user-facing word.
 */
export interface PatchOwner {
  userId: string
  role: "Admin" | "Preacher"
  name: string
  locationIds: string[]
}

export interface PatchOwnerRow {
  id: string
  programId: string
  name: string
  role: string
  status: string
  locationIds: string[]
}

/**
 * An eligible assigned Preacher is Active, in the caller's programme, and role
 * Admin or Preacher. Anything else yields `null`, never a widening.
 */
export function isEligiblePatchOwnerRow(row: PatchOwnerRow | null, programId: string): row is PatchOwnerRow {
  return Boolean(
    row &&
      row.status === "Active" &&
      row.programId === programId &&
      (row.role === "Admin" || row.role === "Preacher"),
  )
}

function ownerFromRow(row: PatchOwnerRow): PatchOwner {
  return {
    userId: row.id,
    role: row.role === "Admin" ? "Admin" : "Preacher",
    name: row.name,
    locationIds: row.locationIds,
  }
}

/**
 * Resolve the patch owner once, at the staff boundary.
 *
 * - Admin or Preacher: themselves.
 * - Assistant: the assigned row, only when it is eligible.
 * - Volunteer or an Assistant without an eligible assignment: `null`.
 */
export function resolvePatchOwner(caller: PatchOwnerRow, assigned: PatchOwnerRow | null): PatchOwner | null {
  if (caller.role === "Admin" || caller.role === "Preacher") {
    return ownerFromRow(caller)
  }

  if (caller.role !== "Assistant") {
    return null
  }

  if (!isEligiblePatchOwnerRow(assigned, caller.programId)) {
    return null
  }

  return ownerFromRow(assigned)
}
