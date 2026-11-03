import "server-only"

import { AuthzError, requireRole, type StaffContext, type StaffRole } from "@/lib/authz"
import {
  campaignScope,
  requireCampaignAdmin,
  type AssignableCaller,
  type CampaignScope,
} from "@/lib/dialer/scope"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { collectPagedRows, type PagingFailures } from "@/lib/supabase/paging"
import type { Database } from "@/lib/supabase/types"
import { isStaffRole } from "@hkmc/data-contracts"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ROSTER_CHUNK_SIZE = 200

const STAFF_COLUMNS = "id,name,email,role,status,assigned_preacher_id"
const CALLER_COLUMNS =
  "id,user_id,display_name,is_active,promoted_by,promoted_at,created_at,updated_at"

type UsersRow = Database["public"]["Tables"]["users"]["Row"]
type DialerCallerRow = Database["public"]["Tables"]["dialer_callers"]["Row"]

type StaffRosterRow = Pick<
  UsersRow,
  "id" | "name" | "email" | "role" | "status" | "assigned_preacher_id"
>

type CallerProfileRow = Pick<
  DialerCallerRow,
  | "id"
  | "user_id"
  | "display_name"
  | "is_active"
  | "promoted_by"
  | "promoted_at"
  | "created_at"
  | "updated_at"
>

/** One staff user in the viewer's roster scope, with their caller profile state when they hold one. */
export interface CallerRosterEntry {
  userId: string
  name: string
  email: string
  role: StaffRole
  /** `dialer_callers.id`; absent when the staff user has no caller profile. */
  callerId?: string
  /** The stored profile name; absent when the staff user has no caller profile. */
  displayName?: string
  /** True only when a caller profile exists and is active. */
  isActive: boolean
  promotedAt?: string | null
  /** True only when a caller profile exists with `is_active = false`. */
  deactivated: boolean
}

/** The resolved `dialer_callers` row, in camelCase. */
export interface CallerProfile {
  id: string
  userId: string
  displayName: string
  isActive: boolean
  promotedBy: string | null
  promotedAt: string | null
  createdAt: string
  updatedAt: string
}

/** The split a batch promotion returns: rows this call created, and profiles that already existed. */
export interface PromoteCallersResult {
  promoted: CallerProfile[]
  existing: CallerProfile[]
}

const STAFF_READ_FAILURES: PagingFailures = {
  read: () => new AuthzError(500, "caller_roster_read_failed", "Unable to read the caller roster."),
  truncated: () => new AuthzError(500, "caller_roster_truncated", "The caller roster read was truncated."),
}

const CALLER_READ_FAILURES: PagingFailures = {
  read: () => new AuthzError(500, "caller_read_failed", "Unable to read the dialer caller profiles."),
  truncated: () => new AuthzError(500, "caller_roster_truncated", "The caller roster read was truncated."),
}

interface PromotionOffender {
  userId: string
  profile?: CallerProfileRow
}

interface PromotionPlan {
  targets: AssignableCaller[]
  existing: CallerProfileRow[]
}

function callerNotFound(): AuthzError {
  return new AuthzError(404, "caller_not_found", "Caller not found in this program.")
}

function assertCallerIdShape(callerId: string): void {
  if (!UUID_PATTERN.test(callerId)) {
    throw callerNotFound()
  }
}

function requireStaffRole(value: string): StaffRole {
  if (!isStaffRole(value)) {
    throw new AuthzError(500, "unsupported_role", "A staff roster row has an unsupported role.")
  }

  return value
}

function staffName(row: Pick<StaffRosterRow, "name" | "email">): string {
  return row.name?.trim() || row.email
}

function toCallerProfile(row: CallerProfileRow): CallerProfile {
  return {
    id: row.id,
    userId: row.user_id,
    displayName: row.display_name,
    isActive: row.is_active,
    promotedBy: row.promoted_by,
    promotedAt: row.promoted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function readUserRow(
  programId: StaffContext["programId"],
  userId: string,
): Promise<StaffRosterRow | null> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("users")
    .select(STAFF_COLUMNS)
    .eq("id", userId)
    .eq("program_id", programId)
    .maybeSingle()

  if (error) {
    throw STAFF_READ_FAILURES.read()
  }

  return (data as StaffRosterRow | null) ?? null
}

async function readUsersByIds(
  programId: StaffContext["programId"],
  userIds: string[],
): Promise<Map<string, StaffRosterRow>> {
  const users = new Map<string, StaffRosterRow>()
  const uniqueIds = [...new Set(userIds.filter(Boolean))]
  const supabaseAdmin = createSupabaseAdminClient()

  for (let offset = 0; offset < uniqueIds.length; offset += ROSTER_CHUNK_SIZE) {
    const chunk = uniqueIds.slice(offset, offset + ROSTER_CHUNK_SIZE)
    const rows = await collectPagedRows<StaffRosterRow>(async (from, to) => {
      const response = await supabaseAdmin
        .from("users")
        .select(STAFF_COLUMNS)
        .eq("program_id", programId)
        .in("id", chunk)
        .order("id", { ascending: true })
        .range(from, to)

      return { data: response.data, error: response.error }
    }, STAFF_READ_FAILURES)

    for (const row of rows) {
      users.set(row.id, row)
    }
  }

  return users
}

/**
 * The preacher-scoped roster: staff assigned to that preacher plus the owner
 * and the requester. For an Assistant the owner is the assigned Admin or
 * Preacher and the requester is the Assistant — AD-3's assignable set is the
 * owner's assignees plus the owner and the actor.
 */
async function readScopedUsers(
  programId: StaffContext["programId"],
  preacherUserId: string,
  requesterUserId: string,
): Promise<StaffRosterRow[]> {
  const supabaseAdmin = createSupabaseAdminClient()
  const rows = await collectPagedRows<StaffRosterRow>(async (from, to) => {
    const response = await supabaseAdmin
      .from("users")
      .select(STAFF_COLUMNS)
      .eq("program_id", programId)
      .eq("assigned_preacher_id", preacherUserId)
      .order("id", { ascending: true })
      .range(from, to)

    return { data: response.data, error: response.error }
  }, STAFF_READ_FAILURES)

  const missingIds = [preacherUserId, requesterUserId].filter(
    (userId, index, all) => !rows.some((row) => row.id === userId) && all.indexOf(userId) === index,
  )

  if (missingIds.length === 0) {
    return rows
  }

  const additions = await Promise.all(missingIds.map((userId) => readUserRow(programId, userId)))
  if (additions.some((row) => row === null)) {
    throw new AuthzError(500, "caller_roster_read_failed", "Unable to read the requesting staff user.")
  }

  return [...rows, ...additions.filter((row): row is StaffRosterRow => row !== null)]
}

async function readProgramCallerProfiles(
  programId: StaffContext["programId"],
): Promise<Map<string, CallerProfileRow>> {
  const profiles = new Map<string, CallerProfileRow>()
  const supabaseAdmin = createSupabaseAdminClient()

  const rows = await collectPagedRows<CallerProfileRow>(async (from, to) => {
    const response = await supabaseAdmin
      .from("dialer_callers")
      .select(CALLER_COLUMNS)
      .eq("program_id", programId)
      .order("user_id", { ascending: true })
      .range(from, to)

    return { data: response.data, error: response.error }
  }, CALLER_READ_FAILURES)

  for (const row of rows) {
    profiles.set(row.user_id, row)
  }

  return profiles
}

async function readCallerProfilesByUserIds(
  programId: StaffContext["programId"],
  userIds: string[],
): Promise<Map<string, CallerProfileRow>> {
  const profiles = new Map<string, CallerProfileRow>()
  const uniqueIds = [...new Set(userIds.filter(Boolean))]
  const supabaseAdmin = createSupabaseAdminClient()

  for (let offset = 0; offset < uniqueIds.length; offset += ROSTER_CHUNK_SIZE) {
    const chunk = uniqueIds.slice(offset, offset + ROSTER_CHUNK_SIZE)
    const rows = await collectPagedRows<CallerProfileRow>(async (from, to) => {
      const response = await supabaseAdmin
        .from("dialer_callers")
        .select(CALLER_COLUMNS)
        .eq("program_id", programId)
        .in("user_id", chunk)
        .order("user_id", { ascending: true })
        .range(from, to)

      return { data: response.data, error: response.error }
    }, CALLER_READ_FAILURES)

    for (const row of rows) {
      profiles.set(row.user_id, row)
    }
  }

  return profiles
}

function rosterRank(entry: CallerRosterEntry): number {
  if (entry.deactivated) {
    return 2
  }

  return entry.callerId ? 0 : 1
}

function rosterSortName(entry: CallerRosterEntry): string {
  return entry.callerId ? entry.displayName?.trim() || entry.name : entry.name
}

/**
 * Active callers by display name, then staff without a caller profile by name,
 * then deactivated callers by display name. The userId tie-break keeps the
 * order stable when two people share a name.
 */
function compareRosterEntries(left: CallerRosterEntry, right: CallerRosterEntry): number {
  return (
    rosterRank(left) - rosterRank(right) ||
    rosterSortName(left).localeCompare(rosterSortName(right)) ||
    left.name.localeCompare(right.name) ||
    left.userId.localeCompare(right.userId)
  )
}

/**
 * AD-3's roster for the Callers screen. The active staff half is
 * `campaignScope`'s assignable set; the profile read then adds back the
 * deactivated callers that set deliberately excludes, so their history stays
 * visible without making them assignable again.
 */
export async function listRoster(staff: StaffContext): Promise<CallerRosterEntry[]> {
  requireCampaignAdmin(staff)

  const scope = await campaignScope(staff)
  let profiles: Map<string, CallerProfileRow>
  let usersById: Map<string, StaffRosterRow>

  if (scope.kind === "program") {
    profiles = await readProgramCallerProfiles(scope.programId)
    usersById = await readUsersByIds(scope.programId, [...profiles.keys()])
  } else {
    const scopedUsers = await readScopedUsers(scope.programId, scope.userId, staff.userId)
    usersById = new Map(scopedUsers.map((row): [string, StaffRosterRow] => [row.id, row]))

    const profileUserIds = [
      ...new Set([...usersById.keys(), ...scope.assignableCallers.map((caller) => caller.userId)]),
    ]
    profiles = await readCallerProfilesByUserIds(scope.programId, profileUserIds)
  }

  const entries = new Map<string, CallerRosterEntry>()

  for (const caller of scope.assignableCallers) {
    const profile = profiles.get(caller.userId)
    const user = usersById.get(caller.userId)
    const name = user ? staffName(user) : caller.name
    const entry: CallerRosterEntry = {
      userId: caller.userId,
      name,
      email: user?.email ?? caller.email,
      role: user ? requireStaffRole(user.role) : caller.role,
      isActive: profile?.is_active === true,
      deactivated: profile ? !profile.is_active : false,
    }

    const callerId = profile?.id ?? caller.callerId
    if (callerId) {
      entry.callerId = callerId
    }

    if (profile) {
      entry.displayName = profile.display_name.trim() || name
      entry.promotedAt = profile.promoted_at
    }

    entries.set(caller.userId, entry)
  }

  for (const profile of profiles.values()) {
    if (entries.has(profile.user_id)) {
      continue
    }

    const user = usersById.get(profile.user_id)
    if (!user) {
      continue
    }

    const name = staffName(user)
    entries.set(profile.user_id, {
      userId: profile.user_id,
      name,
      email: user.email,
      role: requireStaffRole(user.role),
      callerId: profile.id,
      displayName: profile.display_name.trim() || name,
      isActive: profile.is_active,
      promotedAt: profile.promoted_at,
      deactivated: !profile.is_active,
    })
  }

  return [...entries.values()].sort(compareRosterEntries)
}

/** AD-2: deactivation and reactivation are an Admin action; a roster reader without Admin is refused. */
export async function setCallerActive(
  staff: StaffContext,
  callerId: string,
  isActive: boolean,
): Promise<CallerProfile> {
  requireRole(staff, ["Admin"])
  assertCallerIdShape(callerId)

  if (typeof isActive !== "boolean") {
    throw new AuthzError(400, "invalid_is_active", "Active must be true or false.")
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("dialer_callers")
    .update({ is_active: isActive })
    .eq("id", callerId)
    .eq("program_id", staff.programId)
    .select(CALLER_COLUMNS)
    .maybeSingle()

  if (error) {
    throw new AuthzError(500, "caller_write_failed", "Unable to update the dialer caller profile.")
  }

  if (!data) {
    throw callerNotFound()
  }

  return toCallerProfile(data as CallerProfileRow)
}

function isStaffInRosterScope(
  staff: StaffContext,
  scope: CampaignScope,
  row: StaffRosterRow,
): boolean {
  if (scope.kind === "program") {
    return true
  }

  return (
    row.id === staff.userId ||
    row.id === scope.userId ||
    row.assigned_preacher_id === scope.userId
  )
}

/**
 * The inactive-profile refusal is decided before set membership because the
 * assignable set excludes exactly those users; checking membership first would
 * make `409 caller_inactive` unreachable. Only a user already in the requester's
 * roster scope is named, so the refusal cannot describe another preacher's staff.
 */
async function promotionRefusal(
  staff: StaffContext,
  scope: CampaignScope,
  offenders: PromotionOffender[],
): Promise<AuthzError> {
  const validIds = offenders
    .map((offender) => offender.userId)
    .filter((userId) => UUID_PATTERN.test(userId))
  const usersById = await readUsersByIds(scope.programId, validIds)

  const notAssignable: string[] = []
  const inactive: string[] = []

  for (const offender of offenders) {
    const user = usersById.get(offender.userId)
    const inScope = user ? isStaffInRosterScope(staff, scope, user) : false
    const label = user && inScope ? staffName(user) : offender.userId

    if (offender.profile && !offender.profile.is_active && inScope) {
      inactive.push(offender.profile.display_name.trim() || label)
    } else {
      notAssignable.push(label)
    }
  }

  if (notAssignable.length > 0) {
    const reasons = [`not in your assignable caller set: ${notAssignable.join(", ")}`]

    if (inactive.length > 0) {
      reasons.push(`deactivated: ${inactive.join(", ")}`)
    }

    return new AuthzError(
      403,
      "caller_not_assignable",
      `Cannot promote these callers — ${reasons.join("; ")}.`,
    )
  }

  return new AuthzError(
    409,
    "caller_inactive",
    `Deactivated callers cannot be promoted: ${inactive.join(", ")}.`,
  )
}

async function planPromotion(
  staff: StaffContext,
  userIds: string[],
): Promise<PromotionPlan> {
  const scope = await campaignScope(staff)
  const uniqueIds = [...new Set(userIds)]

  if (uniqueIds.length === 0) {
    return { targets: [], existing: [] }
  }

  const validIds = uniqueIds.filter(
    (userId) => typeof userId === "string" && UUID_PATTERN.test(userId),
  )
  const profiles = await readCallerProfilesByUserIds(scope.programId, validIds)
  const assignableById = new Map(
    scope.assignableCallers.map((caller) => [caller.userId, caller]),
  )

  const targets: AssignableCaller[] = []
  const existing: CallerProfileRow[] = []
  const offenders: PromotionOffender[] = []

  for (const userId of uniqueIds) {
    if (typeof userId !== "string" || !UUID_PATTERN.test(userId)) {
      offenders.push({ userId: String(userId) })
      continue
    }

    const profile = profiles.get(userId)

    if (profile && !profile.is_active) {
      offenders.push({ userId, profile })
      continue
    }

    const caller = assignableById.get(userId)
    if (!caller) {
      offenders.push({ userId, profile })
      continue
    }

    if (profile) {
      existing.push(profile)
    } else {
      targets.push(caller)
    }
  }

  if (offenders.length > 0) {
    const refusal = await promotionRefusal(staff, scope, offenders)
    throw refusal
  }

  return { targets, existing }
}

/**
 * AD-11's auto-promotion, in batch. Every id is classified before the first
 * write: one inactive or out-of-scope caller refuses the whole batch, so there
 * is no partial success and no reactivation. Duplicate ids collapse to their
 * first occurrence.
 */
export async function promoteCallers(
  staff: StaffContext,
  userIds: string[],
): Promise<PromoteCallersResult> {
  requireCampaignAdmin(staff)

  if (!Array.isArray(userIds)) {
    throw new AuthzError(400, "invalid_user_ids", "User ids must be a list.")
  }

  const plan = await planPromotion(staff, userIds)

  if (plan.targets.length === 0) {
    return { promoted: [], existing: plan.existing.map(toCallerProfile) }
  }

  const promotedAt = new Date().toISOString()
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("dialer_callers")
    .insert(
      plan.targets.map((caller) => ({
        program_id: staff.programId,
        user_id: caller.userId,
        display_name: caller.name,
        is_active: true,
        promoted_by: staff.userId,
        promoted_at: promotedAt,
      })),
    )
    .select(CALLER_COLUMNS)

  if (error || !data) {
    // A concurrent request may have created the same profile between the read
    // and this insert. Re-read before reporting a failure: an active row is the
    // idempotent answer, and anything less is still a whole-batch refusal.
    if (error?.code === "23505") {
      const raced = await readCallerProfilesByUserIds(
        staff.programId,
        plan.targets.map((caller) => caller.userId),
      )
      const racedRows: CallerProfileRow[] = []

      for (const caller of plan.targets) {
        const row = raced.get(caller.userId)
        if (!row || !row.is_active) {
          racedRows.length = 0
          break
        }
        racedRows.push(row)
      }

      if (racedRows.length === plan.targets.length) {
        return {
          promoted: [],
          existing: [...plan.existing, ...racedRows].map(toCallerProfile),
        }
      }
    }

    throw new AuthzError(500, "caller_write_failed", "Unable to promote the staff users to callers.")
  }

  const insertedByUserId = new Map(
    (data as CallerProfileRow[]).map((row) => [row.user_id, row]),
  )
  const promoted: CallerProfile[] = []

  for (const caller of plan.targets) {
    const row = insertedByUserId.get(caller.userId)
    if (!row) {
      throw new AuthzError(
        500,
        "caller_write_failed",
        "The caller promotion did not return every promoted row.",
      )
    }
    promoted.push(toCallerProfile(row))
  }

  return { promoted, existing: plan.existing.map(toCallerProfile) }
}

/** The single-caller form of `promoteCallers`, so both paths cannot diverge. */
export async function promoteCaller(
  staff: StaffContext,
  userId: string,
): Promise<CallerProfile> {
  const result = await promoteCallers(staff, [userId])
  const caller = result.promoted[0] ?? result.existing[0]

  if (!caller) {
    throw new AuthzError(500, "caller_write_failed", "Unable to promote the staff user to a caller.")
  }

  return caller
}
