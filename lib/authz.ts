import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { StaffRole, StaffStatus, StaffUser } from "@/lib/supabase/data"
import type { Database } from "@/lib/supabase/types"
import { isProgramId, isStaffMembershipStatus, isStaffRole, type ProgramId } from "@hkmc/data-contracts"
import { resolveProgramId } from "@hkmc/program-config/server"

export type { StaffRole, StaffStatus, StaffUser } from "@/lib/supabase/data"

export interface StaffContext {
  programId: ProgramId
  supabaseUserId: string
  email: string
  /**
   * Renamed semantics (story 4 boundary): now carries `public.users.id` (UUID).
   * Field name is preserved for caller compatibility — the downstream rename
   * to `userId` is story 5's work.
   */
  airtableUserId: string
  name: string
  role: StaffRole
  status: "Active" | "Inactive" | "Suspended" | "Revoked"
  locationIds: string[]
  /**
   * Renamed semantics (story 4 boundary): now carries
   * `public.users.assigned_preacher_id` (UUID or undefined). Field name is
   * preserved for caller compatibility — the downstream rename to
   * `assignedPreacherUserId` is story 5's work.
   */
  assignedPreacherAirtableUserId?: string
  lastSyncedAt: string
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

type UsersRow = Database["public"]["Tables"]["users"]["Row"]

interface StaffContextOptions {
  programId?: ProgramId
  action?: string
  refresh?: boolean
}

export async function writeAuditEvent(data: {
  programId: ProgramId
  actorSupabaseUserId?: string
  actorAirtableUserId?: string
  actorRole?: string
  action: string
  targetId?: string
  source: string
  syncState?: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    const supabaseAdmin = createSupabaseAdminClient()
    await supabaseAdmin.from("audit_events").insert({
      program_id: data.programId,
      actor_supabase_user_id: data.actorSupabaseUserId,
      actor_airtable_user_id: data.actorAirtableUserId,
      actor_role: data.actorRole,
      action: data.action,
      target_id: data.targetId,
      source: data.source,
      sync_state: data.syncState,
      metadata: data.metadata || {},
    })
  } catch (error) {
    console.error("[authz] audit write failed", {
      programId: data.programId,
      action: data.action,
      error: error instanceof Error ? error.message : "unknown",
    })
  }
}

function mapUsersRowToStaffContext(row: UsersRow): StaffContext {
  if (!isProgramId(row.program_id)) {
    throw new AuthzError(403, "unsupported_program", "This program is not supported.")
  }

  if (!isStaffRole(row.role)) {
    throw new AuthzError(403, "unsupported_role", "This staff role is not supported.")
  }

  if (!isStaffMembershipStatus(row.status)) {
    throw new AuthzError(403, "staff_inactive", "This staff account is inactive.")
  }

  if (row.status !== "Active") {
    throw new AuthzError(403, "staff_inactive", "This staff account is inactive.")
  }

  const email = row.email?.trim().toLowerCase()
  if (!email) {
    throw new AuthzError(403, "missing_email", "The signed-in user does not have an email.")
  }

  return {
    programId: row.program_id,
    supabaseUserId: row.id,
    email,
    airtableUserId: row.id,
    name: row.name?.trim() || email,
    role: row.role,
    status: row.status,
    locationIds: Array.isArray(row.location_ids) ? row.location_ids.filter(Boolean) : [],
    assignedPreacherAirtableUserId: row.assigned_preacher_id || undefined,
    lastSyncedAt: new Date().toISOString(),
  }
}

async function loadStaffContextForUser(params: {
  authUserId: string
  programId: ProgramId
}): Promise<StaffContext> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id,program_id,email,name,role,status,location_ids,assigned_preacher_id")
    .eq("id", params.authUserId)
    .eq("program_id", params.programId)
    .maybeSingle()

  if (error) {
    throw new AuthzError(500, "staff_user_read_failed", "Unable to read the staff user.")
  }

  if (!data) {
    throw new AuthzError(403, "staff_not_found", "No staff user is linked to this email.")
  }

  return mapUsersRowToStaffContext(data as UsersRow)
}

export async function syncStaffProfileByEmail(params: {
  supabaseUserId: string
  email: string
  programId?: ProgramId
}): Promise<StaffContext> {
  const programId = params.programId || resolveProgramId()
  if (!isProgramId(programId)) {
    throw new AuthzError(403, "unsupported_program", "This program is not supported.")
  }

  const normalizedEmail = params.email?.trim().toLowerCase()
  if (!normalizedEmail) {
    throw new AuthzError(403, "missing_email", "The signed-in user does not have an email.")
  }

  return loadStaffContextForUser({
    authUserId: params.supabaseUserId,
    programId,
  })
}

export async function getStaffContext(options: StaffContextOptions = {}): Promise<StaffContext> {
  const programId = options.programId || resolveProgramId()
  if (!isProgramId(programId)) {
    throw new AuthzError(403, "unsupported_program", "This program is not supported.")
  }

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

  return loadStaffContextForUser({
    authUserId: user.id,
    programId,
  })
}

export function authzErrorResponse(error: unknown): Response {
  if (error instanceof AuthzError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status })
  }

  const message = error instanceof Error ? error.message : "Unexpected server error"
  return Response.json({ error: message }, { status: 500 })
}
