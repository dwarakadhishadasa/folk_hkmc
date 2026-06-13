export const PROGRAM_IDS = ["folk", "gita-life"] as const
export type ProgramId = (typeof PROGRAM_IDS)[number]

export const STAFF_ROLES = ["Admin", "Preacher", "Volunteer"] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

export const STAFF_MEMBERSHIP_STATUSES = ["Active", "Inactive", "Suspended", "Revoked"] as const
export type StaffMembershipStatus = (typeof STAFF_MEMBERSHIP_STATUSES)[number]

export interface StaffMembershipContext {
  programId: ProgramId
  supabaseUserId: string
  email: string
  airtableUserId: string
  name: string
  role: StaffRole
  status: StaffMembershipStatus
  locationIds: string[]
  assignedPreacherAirtableUserId?: string
  lastSyncedAt: string
}

export interface ApiErrorResponse {
  error: string
  code?: string
}

export interface QueuedResponse {
  queued: true
  message: string
}

export function isProgramId(value: string): value is ProgramId {
  return (PROGRAM_IDS as readonly string[]).includes(value)
}

export function isStaffRole(value: string): value is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(value)
}

export function isStaffMembershipStatus(value: string): value is StaffMembershipStatus {
  return (STAFF_MEMBERSHIP_STATUSES as readonly string[]).includes(value)
}
