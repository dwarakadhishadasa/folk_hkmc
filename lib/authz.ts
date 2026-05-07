import "server-only"

import { findStaffUserByEmail, syncStaffSupabaseUserId, type StaffRole, type StaffUser } from "@/lib/airtable"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { Database } from "@/lib/supabase/types"

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

type StaffProfileRow = Database["public"]["Tables"]["staff_profiles"]["Row"]

function isStaffRole(value: string): value is StaffRole {
  return value === "Admin" || value === "Preacher" || value === "Volunteer"
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

export function mapStaffProfileRowToStaffContext(row: StaffProfileRow): StaffContext {
  if (!row.email?.trim() || !row.airtable_user_id?.trim()) {
    throw new AuthzError(403, "staff_profile_malformed", "This staff profile is incomplete.")
  }

  if (!isStaffRole(row.role)) {
    throw new AuthzError(403, "unsupported_role", "This staff role is not supported.")
  }

  if (row.status !== "Active") {
    throw new AuthzError(403, "staff_inactive", "This staff account is inactive.")
  }

  return {
    supabaseUserId: row.id,
    email: row.email.trim().toLowerCase(),
    airtableUserId: row.airtable_user_id,
    name: row.name?.trim() || row.email.trim().toLowerCase(),
    role: row.role,
    locationIds: Array.isArray(row.location_ids) ? row.location_ids.filter(Boolean) : [],
    assignedPreacherAirtableUserId: row.assigned_preacher_airtable_user_id || undefined,
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
      location_ids: staffUser.locationIds,
      assigned_preacher_airtable_user_id: staffUser.assignedPreacherAirtableUserId ?? null,
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

  const supabaseAdmin = createSupabaseAdminClient()
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("staff_profiles")
    .select(
      "id,email,airtable_user_id,name,role,status,location_ids,assigned_preacher_airtable_user_id,last_synced_at,created_at,updated_at",
    )
    .eq("id", user.id)
    .maybeSingle()

  if (profileError) {
    throw new AuthzError(500, "staff_profile_read_failed", "Unable to read the staff profile.")
  }

  if (!profile) {
    throw new AuthzError(403, "staff_profile_missing", "No local staff profile is linked to this user.")
  }

  if (typeof profile.email === "string" && profile.email.trim().toLowerCase() !== email) {
    throw new AuthzError(403, "staff_profile_mismatch", "This staff profile does not match the signed-in user.")
  }

  return mapStaffProfileRowToStaffContext(profile as StaffProfileRow)
}

export function authzErrorResponse(error: unknown): Response {
  if (error instanceof AuthzError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status })
  }

  const message = error instanceof Error ? error.message : "Unexpected server error"
  return Response.json({ error: message }, { status: 500 })
}
