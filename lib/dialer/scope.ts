import "server-only"

import {
  AuthzError,
  authzErrorResponse,
  requireRole,
  type StaffContext,
  type StaffRole,
} from "@/lib/authz"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type { Database } from "@/lib/supabase/types"
import { isStaffRole, type ProgramId } from "@hkmc/data-contracts"

const DIALER_PAGE_SIZE = 1000
const DIALER_MAX_PAGES = 50
const DIALER_ROSTER_CHUNK_SIZE = 200
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type UsersRow = Database["public"]["Tables"]["users"]["Row"]
type DialerCallerRow = Database["public"]["Tables"]["dialer_callers"]["Row"]
type DialerAssignmentRow = Database["public"]["Tables"]["dialer_assignments"]["Row"]

type StaffRosterRow = Pick<UsersRow, "id" | "name" | "email" | "role">
type CallerProfileRow = Pick<DialerCallerRow, "id" | "user_id" | "display_name" | "is_active">

/** The assignment columns the caller boundary hands to a queue, card or history read. */
export type CallerAssignment = Pick<
  DialerAssignmentRow,
  | "assigned_at"
  | "caller_id"
  | "campaign_id"
  | "contact_id"
  | "id"
  | "program_id"
  | "sort_order"
  | "status"
>

/** The resolved `dialer_callers` row an active caller acts through. */
export interface DialerCaller {
  id: string
  userId: string
  programId: ProgramId
  displayName: string
  isActive: true
}

/** One staff user an admin-surface role may assign work to; AD-3's assignable set. */
export interface AssignableCaller {
  userId: string
  name: string
  email: string
  role: StaffRole
  /** `dialer_callers.id` when a profile already exists; absent means auto-promote on first assignment. */
  callerId?: string
}

interface CampaignScopeBase {
  programId: ProgramId
  assignableCallers: AssignableCaller[]
}

export type CampaignScope =
  | (CampaignScopeBase & { kind: "program" })
  | (CampaignScopeBase & { kind: "preacher"; userId: string })

export interface CallerAssignmentScope {
  assignment: CallerAssignment
  caller: DialerCaller
}

/**
 * The caller path's only 404: a missing assignment and another caller's
 * assignment are indistinguishable, and the response carries no body at all.
 */
export class CallerAssignmentNotFoundError extends AuthzError {
  constructor() {
    super(404, "caller_assignment_not_found", "This assignment is not available.")
    this.name = "CallerAssignmentNotFoundError"
  }
}

type RosterScope = { kind: "program" } | { kind: "preacher"; userId: string }

interface PostgrestPageResult {
  data: unknown
  error: { message: string } | null
}

function assertAssignmentIdShape(assignmentId: string): void {
  if (!UUID_PATTERN.test(assignmentId)) {
    throw new CallerAssignmentNotFoundError()
  }
}

function missingCampaignScopeError(): AuthzError {
  return new AuthzError(403, "campaign_scope_missing", "This staff account has no Campaign scope.")
}

/**
 * AD-16: PostgREST caps a read at 1,000 rows, so a full final page means the
 * result was truncated. Failing loudly beats returning a short roster.
 */
async function collectPagedRows<T>(
  fetchPage: (from: number, to: number) => Promise<PostgrestPageResult>,
): Promise<T[]> {
  const rows: T[] = []

  for (let page = 0; page < DIALER_MAX_PAGES; page += 1) {
    const from = page * DIALER_PAGE_SIZE
    const { data, error } = await fetchPage(from, from + DIALER_PAGE_SIZE - 1)

    if (error) {
      throw new AuthzError(500, "dialer_roster_read_failed", "Unable to read the dialer roster.")
    }

    const pageRows = Array.isArray(data) ? (data as T[]) : []
    rows.push(...pageRows)

    if (pageRows.length < DIALER_PAGE_SIZE) {
      return rows
    }
  }

  throw new AuthzError(500, "dialer_roster_truncated", "The dialer roster read was truncated.")
}

function requireStaffRole(value: string): StaffRole {
  if (!isStaffRole(value)) {
    throw new AuthzError(500, "unsupported_role", "A staff roster row has an unsupported role.")
  }

  return value
}

async function readActiveStaffRows(programId: ProgramId, preacherId?: string): Promise<StaffRosterRow[]> {
  const supabaseAdmin = createSupabaseAdminClient()

  return collectPagedRows<StaffRosterRow>(async (from, to) => {
    let query = supabaseAdmin
      .from("users")
      .select("id,name,email,role")
      .eq("program_id", programId)
      .eq("status", "Active")

    if (preacherId) {
      query = query.eq("assigned_preacher_id", preacherId)
    }

    const response = await query.order("id", { ascending: true }).range(from, to)
    return { data: response.data, error: response.error }
  })
}

async function readCallerProfiles(
  programId: ProgramId,
  userIds: string[],
): Promise<Map<string, CallerProfileRow>> {
  const profiles = new Map<string, CallerProfileRow>()
  const uniqueIds = [...new Set(userIds.filter(Boolean))]

  if (uniqueIds.length === 0) {
    return profiles
  }

  const supabaseAdmin = createSupabaseAdminClient()

  for (let offset = 0; offset < uniqueIds.length; offset += DIALER_ROSTER_CHUNK_SIZE) {
    const chunk = uniqueIds.slice(offset, offset + DIALER_ROSTER_CHUNK_SIZE)
    const rows = await collectPagedRows<CallerProfileRow>(async (from, to) => {
      const response = await supabaseAdmin
        .from("dialer_callers")
        .select("id,user_id,display_name,is_active")
        .eq("program_id", programId)
        .in("user_id", chunk)
        .order("user_id", { ascending: true })
        .range(from, to)

      return { data: response.data, error: response.error }
    })

    for (const row of rows) {
      profiles.set(row.user_id, row)
    }
  }

  return profiles
}

/**
 * AD-3's assignable caller set. The requester is added when the preacher
 * filter excluded their own row, and a deactivated caller profile removes
 * that person from every scope — assignment never reactivates them.
 */
async function loadAssignableCallers(staff: StaffContext, scope: RosterScope): Promise<AssignableCaller[]> {
  const staffRows = await readActiveStaffRows(
    staff.programId,
    scope.kind === "preacher" ? scope.userId : undefined,
  )

  const entries = staffRows.map((row) => ({
    userId: row.id,
    name: row.name?.trim() || row.email,
    email: row.email,
    role: requireStaffRole(row.role),
  }))

  if (!entries.some((entry) => entry.userId === staff.userId)) {
    entries.push({
      userId: staff.userId,
      name: staff.name,
      email: staff.email,
      role: staff.role,
    })
  }

  const profiles = await readCallerProfiles(
    staff.programId,
    entries.map((entry) => entry.userId),
  )

  const assignableCallers: AssignableCaller[] = []

  for (const entry of entries) {
    const profile = profiles.get(entry.userId)
    if (profile && !profile.is_active) {
      continue
    }

    assignableCallers.push({
      userId: entry.userId,
      name: profile?.display_name.trim() || entry.name,
      email: entry.email,
      role: entry.role,
      ...(profile ? { callerId: profile.id } : {}),
    })
  }

  return assignableCallers.sort(
    (left, right) => left.name.localeCompare(right.name) || left.userId.localeCompare(right.userId),
  )
}

/** AD-2: the admin surface's only role guard, and nothing else. */
export function requireCampaignAdmin(staff: StaffContext): void {
  requireRole(staff, ["Admin", "Preacher", "Assistant"])
}

/** AD-2: any staff role holding an active caller profile. */
export async function requireDialerCaller(staff: StaffContext): Promise<DialerCaller> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("dialer_callers")
    .select("id,user_id,display_name,is_active")
    .eq("user_id", staff.userId)
    .eq("program_id", staff.programId)
    .maybeSingle()

  if (error) {
    throw new AuthzError(500, "caller_read_failed", "Unable to read the dialer caller profile.")
  }

  if (!data) {
    throw new AuthzError(403, "caller_not_found", "No dialer caller profile is linked to this staff user.")
  }

  if (!data.is_active) {
    throw new AuthzError(403, "caller_inactive", "This dialer caller profile is deactivated.")
  }

  return {
    id: data.id,
    userId: data.user_id,
    programId: staff.programId,
    displayName: data.display_name,
    isActive: true,
  }
}

/**
 * AD-3: the one helper every Campaign count, list, leaderboard and export
 * scopes through. A Preacher or Assistant without a scope id is refused, not
 * widened to the program.
 */
export async function campaignScope(staff: StaffContext): Promise<CampaignScope> {
  switch (staff.role) {
    case "Admin": {
      return {
        kind: "program",
        programId: staff.programId,
        assignableCallers: await loadAssignableCallers(staff, { kind: "program" }),
      }
    }

    case "Preacher": {
      if (!staff.userId) {
        throw missingCampaignScopeError()
      }

      return {
        kind: "preacher",
        userId: staff.userId,
        programId: staff.programId,
        assignableCallers: await loadAssignableCallers(staff, { kind: "preacher", userId: staff.userId }),
      }
    }

    case "Assistant": {
      const preacherUserId = staff.assignedPreacherUserId?.trim()
      if (!preacherUserId) {
        throw missingCampaignScopeError()
      }

      return {
        kind: "preacher",
        userId: preacherUserId,
        programId: staff.programId,
        assignableCallers: await loadAssignableCallers(staff, { kind: "preacher", userId: preacherUserId }),
      }
    }

    default:
      throw new AuthzError(403, "forbidden", "You do not have access to this staff action.")
  }
}

/**
 * AD-7: the only path to a queue payload, call card or contact history.
 * A missing assignment and another caller's assignment both throw the same
 * body-less 404, and no row is ever returned on failure.
 */
export async function assertCallerAssignmentInScope(
  staff: StaffContext,
  assignmentId: string,
): Promise<CallerAssignmentScope> {
  assertAssignmentIdShape(assignmentId)

  const caller = await requireDialerCaller(staff)
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("dialer_assignments")
    .select("id,program_id,campaign_id,contact_id,caller_id,status,sort_order,assigned_at")
    .eq("id", assignmentId)
    .eq("program_id", staff.programId)
    .eq("caller_id", caller.id)
    .maybeSingle()

  if (error) {
    throw new AuthzError(500, "assignment_scope_read_failed", "Unable to read the dialer assignment.")
  }

  if (!data) {
    throw new CallerAssignmentNotFoundError()
  }

  return { assignment: data as CallerAssignment, caller }
}

/**
 * AD-7's no-oracle rule: the caller boundary's 404 has no body, so a handler
 * response never differs between a missing and a foreign assignment. Every
 * other refusal keeps the repo's `AuthzError` JSON shape.
 */
export function dialerErrorResponse(error: unknown): Response {
  if (error instanceof CallerAssignmentNotFoundError) {
    return new Response(null, { status: 404 })
  }

  return authzErrorResponse(error)
}
