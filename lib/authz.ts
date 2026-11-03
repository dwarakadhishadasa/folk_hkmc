import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { StaffRole } from "@/lib/supabase/data"
import type { Database } from "@/lib/supabase/types"
import { resolvePatchOwner, type PatchOwner, type PatchOwnerRow } from "@/lib/staff-patch"
import { isProgramId, isStaffRole, type ProgramId } from "@hkmc/data-contracts"
import { resolveProgramId } from "@hkmc/program-config/server"

const STAFF_MEMBERSHIP_STATUSES = ["Active", "Inactive", "Suspended", "Revoked"] as const
type StaffMembershipStatusValue = (typeof STAFF_MEMBERSHIP_STATUSES)[number]

export type { StaffRole, StaffStatus, StaffUser } from "@/lib/supabase/data"

export interface StaffContext {
  programId: ProgramId
  supabaseUserId: string
  email: string
  /**
   * `public.users.id` (UUID) — the primary key of the staff row, which also
   * references `auth.users(id)`.
   */
  userId: string
  name: string
  role: StaffRole
  status: "Active" | "Inactive" | "Suspended" | "Revoked"
  locationIds: string[]
  /**
   * `public.users.assigned_preacher_id` (UUID) when the staff member is
   * routed through a Preacher, otherwise `undefined`. This is the raw FK; the
   * resolved patch owner is `patchOwner`.
   */
  assignedPreacherUserId?: string
  /**
   * The personal patch this staff member reads. Admin and Preacher resolve to
   * themselves; an Assistant resolves to the assigned Active Admin or Preacher;
   * a Volunteer or an ineligible Assistant resolves to `null`.
   *
   * Server-only: `toClientStaff()` strips it before any RSC or route payload.
   */
  patchOwner: PatchOwner | null
  /**
   * Whether this staff user holds an active `dialer_callers` profile. The
   * Campaign header item and its Assignments sub-nav resolve from this; it is
   * never an authorization decision on its own.
   */
  hasActiveCallerProfile: boolean
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

export function isRoleAllowed(role: StaffRole, allowedRoles: readonly StaffRole[]): boolean {
  return allowedRoles.includes(role)
}

export function requireRole(context: StaffContext, allowedRoles: readonly StaffRole[]): void {
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
  actorUserId?: string
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
      actor_user_id: data.actorUserId,
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

function mapUsersRowToStaffContext(
  row: UsersRow,
  hasActiveCallerProfile: boolean,
  patchOwner: PatchOwner | null,
): StaffContext {
  if (!isProgramId(row.program_id)) {
    throw new AuthzError(403, "unsupported_program", "This program is not supported.")
  }

  if (!isStaffRole(row.role)) {
    throw new AuthzError(403, "unsupported_role", "This staff role is not supported.")
  }

  if (!(STAFF_MEMBERSHIP_STATUSES as readonly string[]).includes(row.status)) {
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
    userId: row.id,
    name: row.name?.trim() || email,
    role: row.role,
    status: row.status as StaffMembershipStatusValue,
    locationIds: Array.isArray(row.location_ids) ? row.location_ids.filter(Boolean) : [],
    assignedPreacherUserId: row.assigned_preacher_id || undefined,
    patchOwner,
    hasActiveCallerProfile,
    lastSyncedAt: new Date().toISOString(),
  }
}

async function loadStaffContextForUser(params: {
  authUserId: string
  programId: ProgramId
}): Promise<StaffContext> {
  const supabaseAdmin = createSupabaseAdminClient()
  const [userResult, callerResult] = await Promise.all([
    supabaseAdmin
      .from("users")
      .select("id,program_id,email,name,role,status,location_ids,assigned_preacher_id")
      .eq("id", params.authUserId)
      .eq("program_id", params.programId)
      .maybeSingle(),
    supabaseAdmin
      .from("dialer_callers")
      .select("id")
      .eq("user_id", params.authUserId)
      .eq("program_id", params.programId)
      .eq("is_active", true)
      .maybeSingle(),
  ])

  if (userResult.error) {
    throw new AuthzError(500, "staff_user_read_failed", "Unable to read the staff user.")
  }

  if (!userResult.data) {
    throw new AuthzError(403, "staff_not_found", "No staff user is linked to this email.")
  }

  // Refusing to answer is the honest failure here: defaulting to `false` would
  // silently hide a caller's Campaign entry behind a broken read.
  if (callerResult.error) {
    throw new AuthzError(500, "staff_caller_profile_read_failed", "Unable to read the staff caller profile.")
  }

  const callerRow = userResult.data as UsersRow
  const assignedRow = await loadAssignedSupervisorRow(callerRow, params.programId)

  return mapUsersRowToStaffContext(
    callerRow,
    Boolean(callerResult.data),
    resolvePatchOwner(toPatchOwnerRow(callerRow), assignedRow ? toPatchOwnerRow(assignedRow) : null),
  )
}

function toPatchOwnerRow(row: UsersRow): PatchOwnerRow {
  return {
    id: row.id,
    programId: row.program_id,
    name: row.name?.trim() || row.email,
    role: row.role,
    status: row.status,
    locationIds: Array.isArray(row.location_ids) ? row.location_ids.filter(Boolean) : [],
  }
}

/**
 * The assigned row is read with the admin client because `public.users` RLS
 * lets a non-Admin read only their own row. Only an Assistant can have an
 * owner that is not itself, so no other role pays for the read.
 */
async function loadAssignedSupervisorRow(
  callerRow: UsersRow,
  programId: ProgramId,
): Promise<UsersRow | null> {
  if (callerRow.role !== "Assistant" || !callerRow.assigned_preacher_id) {
    return null
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id,program_id,email,name,role,status,location_ids,assigned_preacher_id")
    .eq("id", callerRow.assigned_preacher_id)
    .eq("program_id", programId)
    .maybeSingle()

  if (error) {
    throw new AuthzError(500, "staff_supervisor_read_failed", "Unable to read the assigned Preacher.")
  }

  return (data as UsersRow | null) ?? null
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
