import "server-only"

import { findStaffUserByEmail, syncStaffSupabaseUserId, type StaffRole, type StaffUser } from "@/lib/airtable"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { Database } from "@/lib/supabase/types"
import { isProgramId, isStaffMembershipStatus, isStaffRole, type ProgramId } from "@hkmc/data-contracts"
import { getProgramScopedEnv, getServerProgramProfile, resolveProgramId } from "@hkmc/program-config/server"

export type { StaffRole, StaffStatus, StaffUser } from "@/lib/airtable"

export interface StaffContext {
  programId: ProgramId
  supabaseUserId: string
  email: string
  airtableUserId: string
  name: string
  role: StaffRole
  status: "Active" | "Inactive" | "Suspended" | "Revoked"
  locationIds: string[]
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

type StaffProfileRow = Database["public"]["Tables"]["staff_profiles"]["Row"]
type StaffMembershipRow = Database["public"]["Tables"]["staff_memberships"]["Row"]

const DEFAULT_STAFF_SYNC_STALE_AFTER_MINUTES = 24 * 60

interface StaffContextOptions {
  programId?: ProgramId
  action?: string
  refresh?: boolean
}

function staleThresholdMs(programId: ProgramId): number {
  const profile = getServerProgramProfile(programId)
  const value =
    getProgramScopedEnv(profile, "STAFF_SYNC_STALE_AFTER_MINUTES") ||
    getProgramScopedEnv(profile, "STAFF_PROFILE_STALE_AFTER_MINUTES")
  const minutes = Number(value || DEFAULT_STAFF_SYNC_STALE_AFTER_MINUTES)

  if (!Number.isFinite(minutes) || minutes <= 0) {
    return DEFAULT_STAFF_SYNC_STALE_AFTER_MINUTES * 60 * 1000
  }

  return minutes * 60 * 1000
}

function isSyncStale(lastSyncedAt: string | null | undefined, programId: ProgramId): boolean {
  if (!lastSyncedAt) {
    return true
  }

  const timestamp = Date.parse(lastSyncedAt)
  return !Number.isFinite(timestamp) || Date.now() - timestamp > staleThresholdMs(programId)
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

function mapStaffContext(programId: ProgramId, supabaseUserId: string, staffUser: StaffUser): StaffContext {
  return {
    programId,
    supabaseUserId,
    email: staffUser.email,
    airtableUserId: staffUser.id,
    name: staffUser.name,
    role: staffUser.role,
    status: staffUser.status,
    locationIds: staffUser.locationIds,
    assignedPreacherAirtableUserId: staffUser.assignedPreacherAirtableUserId,
    lastSyncedAt: new Date().toISOString(),
  }
}

export function mapStaffProfileRowToStaffContext(row: StaffProfileRow): StaffContext {
  const programId = row.program_id && isProgramId(row.program_id) ? row.program_id : "folk"

  if (!row.email?.trim() || !row.airtable_user_id?.trim()) {
    throw new AuthzError(403, "staff_profile_malformed", "This staff profile is incomplete.")
  }

  const role = row.role || ""
  if (!isStaffRole(role)) {
    throw new AuthzError(403, "unsupported_role", "This staff role is not supported.")
  }

  const status = row.membership_status || row.status || ""
  if (!isStaffMembershipStatus(status) || status !== "Active") {
    throw new AuthzError(403, "staff_inactive", "This staff account is inactive.")
  }

  return {
    programId,
    supabaseUserId: row.id,
    email: row.email.trim().toLowerCase(),
    airtableUserId: row.airtable_user_id,
    name: row.name?.trim() || row.email.trim().toLowerCase(),
    role,
    status,
    locationIds: Array.isArray(row.location_ids) ? row.location_ids.filter(Boolean) : [],
    assignedPreacherAirtableUserId: row.assigned_preacher_airtable_user_id || undefined,
    lastSyncedAt: row.last_synced_at,
  }
}

function mapStaffMembershipRowToStaffContext(row: StaffMembershipRow): StaffContext {
  if (!isProgramId(row.program_id)) {
    throw new AuthzError(403, "unsupported_program", "This Program is not supported.")
  }

  if (!row.email?.trim() || !row.airtable_user_id?.trim()) {
    throw new AuthzError(403, "staff_membership_malformed", "This staff membership is incomplete.")
  }

  if (!isStaffRole(row.role)) {
    throw new AuthzError(403, "unsupported_role", "This staff role is not supported.")
  }

  if (!isStaffMembershipStatus(row.status) || row.status !== "Active") {
    throw new AuthzError(403, "staff_inactive", "This staff account is inactive.")
  }

  if (row.sync_state !== "ok") {
    throw new AuthzError(403, "staff_sync_untrusted", "Staff authorization sync is not trusted.")
  }

  if (isSyncStale(row.last_synced_at, row.program_id)) {
    throw new AuthzError(403, "staff_sync_stale", "Staff authorization needs a fresh sync before continuing.")
  }

  return {
    programId: row.program_id,
    supabaseUserId: row.user_id,
    email: row.email.trim().toLowerCase(),
    airtableUserId: row.airtable_user_id,
    name: row.name?.trim() || row.email.trim().toLowerCase(),
    role: row.role,
    status: row.status,
    locationIds: Array.isArray(row.location_ids) ? row.location_ids.filter(Boolean) : [],
    assignedPreacherAirtableUserId: row.assigned_preacher_airtable_user_id || undefined,
    lastSyncedAt: row.last_synced_at,
  }
}

export async function syncStaffProfileByEmail(params: {
  supabaseUserId: string
  email: string
  programId?: ProgramId
}): Promise<StaffContext> {
  const programId = params.programId || resolveProgramId()
  const profile = getServerProgramProfile(programId)
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
      program_id: programId,
      email: staffUser.email,
      airtable_user_id: staffUser.id,
      name: staffUser.name,
      role: staffUser.role,
      status: staffUser.status,
      membership_status: staffUser.status === "Active" ? "Active" : "Inactive",
      location_ids: staffUser.locationIds,
      assigned_preacher_airtable_user_id: staffUser.assignedPreacherAirtableUserId ?? null,
      last_synced_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  )

  if (error) {
    throw new AuthzError(500, "staff_profile_sync_failed", "Staff profile sync failed.")
  }

  const membershipStatus = staffUser.status === "Active" ? "Active" : "Inactive"
  const syncedAt = new Date().toISOString()
  const { error: membershipError } = await supabaseAdmin.from("staff_memberships").upsert(
    {
      program_id: programId,
      user_id: params.supabaseUserId,
      email: staffUser.email,
      airtable_user_id: staffUser.id,
      name: staffUser.name,
      role: staffUser.role,
      status: membershipStatus,
      location_ids: staffUser.locationIds,
      assigned_preacher_airtable_user_id: staffUser.assignedPreacherAirtableUserId ?? null,
      last_synced_at: syncedAt,
      sync_source: "airtable",
      sync_state: "ok",
      sync_error: null,
      revoked_at: membershipStatus === "Active" ? null : syncedAt,
    },
    { onConflict: "program_id,user_id" },
  )

  if (membershipError) {
    throw new AuthzError(500, "staff_membership_sync_failed", "Staff membership sync failed.")
  }

  const { error: identityError } = await supabaseAdmin.from("airtable_identities").upsert(
    {
      program_id: programId,
      user_id: params.supabaseUserId,
      airtable_base_id: profile.airtable.baseId,
      airtable_user_id: staffUser.id,
      email: staffUser.email,
      last_synced_at: syncedAt,
    },
    { onConflict: "program_id,user_id" },
  )

  if (identityError) {
    throw new AuthzError(500, "airtable_identity_sync_failed", "Airtable identity sync failed.")
  }

  return {
    ...mapStaffContext(programId, params.supabaseUserId, staffUser),
    status: membershipStatus,
    lastSyncedAt: syncedAt,
  }
}

export async function getStaffContext(options: StaffContextOptions = {}): Promise<StaffContext> {
  const programId = options.programId || resolveProgramId()
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

  if (options.refresh) {
    return syncStaffProfileByEmail({ supabaseUserId: user.id, email, programId })
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("staff_memberships")
    .select(
      "id,program_id,user_id,email,airtable_user_id,name,role,status,location_ids,assigned_preacher_airtable_user_id,last_synced_at,revoked_at,sync_source,sync_state,sync_error,created_at,updated_at",
    )
    .eq("program_id", programId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (membershipError) {
    throw new AuthzError(500, "staff_membership_read_failed", "Unable to read the staff membership.")
  }

  if (membership) {
    if (membership.email.trim().toLowerCase() !== email) {
      await writeAuditEvent({
        programId,
        actorSupabaseUserId: user.id,
        actorAirtableUserId: membership.airtable_user_id,
        actorRole: membership.role,
        action: options.action || "staff.context.email_mismatch",
        source: "authz",
        syncState: membership.sync_state,
      })
      throw new AuthzError(403, "staff_membership_mismatch", "This staff membership does not match the signed-in user.")
    }

    try {
      return mapStaffMembershipRowToStaffContext(membership as StaffMembershipRow)
    } catch (error) {
      if (error instanceof AuthzError && error.code === "staff_sync_stale") {
        await writeAuditEvent({
          programId,
          actorSupabaseUserId: user.id,
          actorAirtableUserId: membership.airtable_user_id,
          actorRole: membership.role,
          action: options.action || "staff.context.stale_sync",
          source: "authz",
          syncState: membership.sync_state,
        })

        return syncStaffProfileByEmail({ supabaseUserId: user.id, email, programId })
      }

      await writeAuditEvent({
        programId,
        actorSupabaseUserId: user.id,
        actorAirtableUserId: membership.airtable_user_id,
        actorRole: membership.role,
        action: options.action || "staff.context.denied",
        source: "authz",
        syncState: membership.sync_state,
      })
      throw error
    }
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("staff_profiles")
    .select(
      "id,program_id,email,airtable_user_id,name,role,status,membership_status,location_ids,assigned_preacher_airtable_user_id,last_synced_at,created_at,updated_at",
    )
    .eq("id", user.id)
    .maybeSingle()

  if (profileError) {
    throw new AuthzError(500, "staff_profile_read_failed", "Unable to read the staff profile.")
  }

  if (profile) {
    const profileProgramId = profile.program_id && isProgramId(profile.program_id) ? profile.program_id : "folk"
    if (profileProgramId === programId && profile.email.trim().toLowerCase() === email && !isSyncStale(profile.last_synced_at, programId)) {
      return mapStaffProfileRowToStaffContext(profile as StaffProfileRow)
    }
  }

  try {
    return await syncStaffProfileByEmail({ supabaseUserId: user.id, email, programId })
  } catch (error) {
    await writeAuditEvent({
      programId,
      actorSupabaseUserId: user.id,
      action: options.action || "staff.context.missing_membership",
      source: "authz",
      syncState: "missing",
    })
    throw error
  }
}

export function authzErrorResponse(error: unknown): Response {
  if (error instanceof AuthzError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status })
  }

  const message = error instanceof Error ? error.message : "Unexpected server error"
  return Response.json({ error: message }, { status: 500 })
}
