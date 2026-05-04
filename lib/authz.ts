import "server-only"

import { findStaffUserByEmail, syncStaffSupabaseUserId, type StaffRole, type StaffUser } from "@/lib/airtable"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export type { StaffRole, StaffStatus, StaffUser } from "@/lib/airtable"

export interface StaffContext {
  supabaseUserId: string
  email: string
  airtableUserId: string
  name: string
  role: StaffRole
  locationIds: string[]
  assignedPreacherAirtableUserId?: string
}

export class AuthzError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = "AuthzError"
    this.status = status
    this.code = code
  }
}

export function isRoleAllowed(role: StaffRole, allowedRoles: StaffRole[]): boolean {
  return allowedRoles.includes(role)
}

export function requireRole(context: StaffContext, allowedRoles: StaffRole[]): void {
  if (!isRoleAllowed(context.role, allowedRoles)) {
    throw new AuthzError(403, "forbidden", "You do not have access to this staff action.")
  }
}

function mapStaffContext(supabaseUserId: string, staffUser: StaffUser): StaffContext {
  return {
    supabaseUserId,
    email: staffUser.email,
    airtableUserId: staffUser.id,
    name: staffUser.name,
    role: staffUser.role,
    locationIds: staffUser.locationIds,
    assignedPreacherAirtableUserId: staffUser.assignedPreacherAirtableUserId,
  }
}

export async function syncStaffProfileByEmail(params: {
  supabaseUserId: string
  email: string
}): Promise<StaffContext> {
  const staffUser = await findStaffUserByEmail(params.email)

  if (!staffUser) {
    throw new AuthzError(403, "staff_not_found", "No Airtable staff user is linked to this email.")
  }

  if (staffUser.status !== "Active") {
    throw new AuthzError(403, "staff_inactive", "This staff account is inactive.")
  }

  if (staffUser.supabaseUserId !== params.supabaseUserId) {
    await syncStaffSupabaseUserId(staffUser.id, params.supabaseUserId)
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { error } = await supabaseAdmin.from("staff_profiles").upsert(
    {
      id: params.supabaseUserId,
      email: staffUser.email,
      airtable_user_id: staffUser.id,
      name: staffUser.name,
      role: staffUser.role,
      status: staffUser.status,
      last_synced_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  )

  if (error) {
    throw new AuthzError(500, "staff_profile_sync_failed", "Staff profile sync failed.")
  }

  return mapStaffContext(params.supabaseUserId, staffUser)
}

export async function getStaffContext(): Promise<StaffContext> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new AuthzError(401, "unauthenticated", "Staff sign-in is required.")
  }

  const email = user.email?.trim().toLowerCase()
  if (!email) {
    throw new AuthzError(403, "missing_email", "The signed-in user does not have an email.")
  }

  return syncStaffProfileByEmail({ supabaseUserId: user.id, email })
}

export function authzErrorResponse(error: unknown): Response {
  if (error instanceof AuthzError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status })
  }

  const message = error instanceof Error ? error.message : "Unexpected server error"
  return Response.json({ error: message }, { status: 500 })
}
