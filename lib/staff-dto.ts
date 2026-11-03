import type { ProgramId, StaffRole } from "@hkmc/data-contracts"

import type { StaffContext } from "@/lib/authz"
import { CAMPAIGN_ADMIN_ROLES, OPERATIONAL_ROLES } from "@/lib/staff-roles"

/**
 * The client-safe staff projection.
 *
 * `patchOwner` is server-only and never reaches this shape: the browser gets
 * capability flags and the supervisor's display fields, not the owner's
 * location list. `role` remains the actor's staff role.
 */
export interface ClientStaff {
  programId: ProgramId
  supabaseUserId: string
  email: string
  userId: string
  name: string
  role: StaffRole
  status: "Active" | "Inactive" | "Suspended" | "Revoked"
  locationIds: string[]
  assignedPreacherUserId?: string
  hasActiveCallerProfile: boolean
  lastSyncedAt: string
  hasPatchScope: boolean
  supervisorName: string | null
  supervisorRole: "Admin" | "Preacher" | null
  canReadContacts: boolean
  canManage: boolean
  canInviteVolunteers: boolean
  canUseCampaignAdmin: boolean
  canUseCallerQueue: boolean
}

/** One projection for every auth route and every `StaffAuthShell`. */
export function toClientStaff(staff: StaffContext): ClientStaff {
  const hasPatchScope = staff.patchOwner !== null
  const isOperational = OPERATIONAL_ROLES.includes(staff.role)
  const canReadContacts = isOperational && (staff.role !== "Assistant" || hasPatchScope)

  return {
    programId: staff.programId,
    supabaseUserId: staff.supabaseUserId,
    email: staff.email,
    userId: staff.userId,
    name: staff.name,
    role: staff.role,
    status: staff.status,
    locationIds: [...staff.locationIds],
    assignedPreacherUserId: staff.assignedPreacherUserId,
    hasActiveCallerProfile: staff.hasActiveCallerProfile,
    lastSyncedAt: staff.lastSyncedAt,
    hasPatchScope,
    supervisorName: staff.role === "Assistant" ? (staff.patchOwner?.name ?? null) : null,
    supervisorRole: staff.role === "Assistant" ? (staff.patchOwner?.role ?? null) : null,
    canReadContacts,
    canManage: canReadContacts,
    canInviteVolunteers: staff.role === "Preacher",
    canUseCampaignAdmin: CAMPAIGN_ADMIN_ROLES.includes(staff.role),
    canUseCallerQueue: staff.hasActiveCallerProfile,
  }
}
