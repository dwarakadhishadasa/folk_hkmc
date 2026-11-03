import type { StaffRole } from "@hkmc/data-contracts"

/**
 * The AD-3 patch predicate, split into pure pieces so the app and its tests
 * read one definition. A null owner yields no rows anywhere.
 */
export function contactInPatch(assignedPreacherId: string | null, ownerId: string | null): boolean {
  return ownerId !== null && assignedPreacherId === ownerId
}

export interface SessionPatchRow {
  preacherId: string | null
  createdById: string | null
}

export interface SessionPatchVector {
  actorId: string
  actorRole: StaffRole
  ownerId: string | null
}

/**
 * Sessions in the patch: the owner's own sessions, plus the actor's own
 * creations. A Preacher also sees sessions created by the active staff
 * assigned to them.
 */
export function sessionInPatch(
  row: SessionPatchRow,
  vector: SessionPatchVector,
  assistantIds: readonly string[] = [],
): boolean {
  if (!vector.ownerId) {
    return false
  }

  if (row.preacherId === vector.ownerId || row.createdById === vector.ownerId) {
    return true
  }

  if (row.createdById === vector.actorId) {
    return true
  }

  return (
    vector.actorRole === "Preacher" &&
    row.createdById !== null &&
    assistantIds.includes(row.createdById)
  )
}

export function locationInPatch(locationId: string, ownerLocationIds: readonly string[]): boolean {
  return ownerLocationIds.includes(locationId)
}

export type CampaignScopeKind =
  | { kind: "program" }
  | { kind: "preacher"; userId: string }
  | null

/**
 * A Campaign scope is the programme for an Admin and the owner's patch for a
 * Preacher or Assistant. A null owner is refused, never widened.
 */
export function campaignScopeKind(role: StaffRole, ownerId: string | null): CampaignScopeKind {
  if (role === "Admin") {
    return { kind: "program" }
  }

  if ((role === "Preacher" || role === "Assistant") && ownerId) {
    return { kind: "preacher", userId: ownerId }
  }

  return null
}

/**
 * A grid create stamps ownership and attribution separately: the contact
 * belongs to the owner, and the actor is recorded as its collector. An edit is
 * not a reassignment, so this is create-only.
 */
export function contactWriteAttribution(params: {
  actorId: string
  ownerId: string | null
}): { assignedPreacherId: string; collectedById: string } | null {
  if (!params.ownerId) {
    return null
  }

  return { assignedPreacherId: params.ownerId, collectedById: params.actorId }
}
