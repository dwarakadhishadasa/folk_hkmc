import "server-only"

import { AuthzError, type StaffContext } from "@/lib/authz"
import { type CallerProfile, promoteCallers } from "@/lib/dialer/callers"
import { getCampaign, type CampaignRow } from "@/lib/dialer/campaigns"
import {
  campaignScope,
  requireCampaignAdmin,
  type AssignableCaller,
  type CampaignScope,
} from "@/lib/dialer/scope"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { collectPagedRows, type PagingFailures } from "@/lib/supabase/paging"
import type { Database } from "@/lib/supabase/types"

const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE = 100
const CONTACT_PROFILE_CHUNK_SIZE = 200
const ASSIGNMENT_CHUNK_SIZE = 200

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const CONTACT_COLUMNS = "id,name,phone,initial_contact,collected_by_id,location_ids,assigned_preacher_id,notes"
const CONTACT_PROFILE_COLUMNS = "contact_id,centre,level,gender,language"
const ASSIGNMENT_COLUMNS = "contact_id,caller_id,status,contacts(name),dialer_callers(display_name)"
const STAFF_NAME_COLUMNS = "id,name,email"

const CONTACT_FACET_KEYS = ["centre", "level", "gender", "language"] as const

export type ContactFacetKey = (typeof CONTACT_FACET_KEYS)[number]

/** Fragment options for the four calling facets, each sorted and distinct. */
export type ContactFacets = Record<ContactFacetKey, string[]>

type ContactRow = Pick<
  Database["public"]["Tables"]["contacts"]["Row"],
  | "id"
  | "name"
  | "phone"
  | "initial_contact"
  | "collected_by_id"
  | "location_ids"
  | "assigned_preacher_id"
  | "notes"
>

type StaffNameRow = Pick<Database["public"]["Tables"]["users"]["Row"], "id" | "name" | "email">

type ContactProfileRow = Pick<
  Database["public"]["Tables"]["dialer_contact_profiles"]["Row"],
  "contact_id" | "centre" | "level" | "gender" | "language"
>

/** The four nullable facets; every key is null when the contact has no profile row. */
export interface AssignableContactProfile {
  centre: string | null
  level: string | null
  gender: string | null
  language: string | null
}

/** One contact in the assigner's AD-3 scope, with its optional calling profile. */
export interface AssignableContact {
  contactId: string
  name: string
  phone: string
  /** `contacts.initial_contact` as `YYYY-MM-DD`; `null` when unset. */
  initialContact: string | null
  /** Resolved `contacts.collected_by_id`; `null` when nobody is recorded. */
  collectedByName: string | null
  locationIds: string[]
  /** Absent when `contacts.assigned_preacher_id` is null. */
  assignedPreacherUserId?: string
  /** Free-text note the operator wrote on the contact; `null` when unset. */
  notes: string | null
  /**
   * The caller holding this contact in *this campaign*, or `null` when the
   * contact is unassigned there. Read from `dialer_assignments`, not from the
   * contact's own `assigned_preacher_id`, which is a different fact.
   */
  assignedCallerName: string | null
  profile: AssignableContactProfile
}

export interface AssignableContactQuery {
  page?: number
  pageSize?: number
  search?: string | null
  centre?: string | null
  level?: string | null
  gender?: string | null
  language?: string | null
}

/**
 * One page of the scoped contact set. `facets` describes the whole scope and
 * `total` the search/facet-filtered set, so neither is inferred from the page
 * slice.
 */
export interface AssignableContactPage {
  rows: AssignableContact[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  facets: ContactFacets
}

export interface AssignmentWeight {
  callerId: string
  weight: number
}

/** One caller's share of a confirmed contact set; `count` is what will be written. */
export interface AssignmentSplitEntry {
  callerId: string
  weight: number
  count: number
}

/** A selected contact already assigned in this campaign, named by contact and current caller. */
export interface AssignmentConflict {
  contactId: string
  contactName: string
  callerId: string
  callerName: string
  /** The stored `dialer_assignments.status` of the conflicting row. */
  status: string
}

/** The conflict list plus the two counts the assign screen's primary button needs. */
export interface AssignmentPrecheck {
  conflicts: AssignmentConflict[]
  /** Selected contacts with no row in this campaign: what `skip` would distribute. */
  assignableCount: number
  conflictCount: number
}

export type AssignmentWriteMode = "skip" | "move"

export interface AssignmentCallerInput {
  /** `public.users.id`; auto-promoted to a `dialer_callers` profile when absent. */
  userId: string
  weight: number
}

export interface WriteAssignmentsInput {
  contactIds: string[]
  callers: AssignmentCallerInput[]
  /** Absent means the assigner has not chosen yet; a selection with conflicts is refused. */
  mode?: AssignmentWriteMode
}

/** One row of the assignment RPC's `p_rows` payload; `sortOrder` restarts at 0 per caller. */
export type AssignmentWriteRow = { contactId: string; callerId: string; sortOrder: number }

export interface WriteAssignmentsResult {
  written: number
  /** Contacts the `skip` decision left alone, plus any the RPC skipped on a concurrent write. */
  skipped: number
  /** `callerId` is a `dialer_callers.id`; the counts sum to the confirmed set size. */
  split: AssignmentSplitEntry[]
}

type AssignmentConflictRow = {
  contact_id: string
  caller_id: string
  status: string
  contacts: { name: string } | null
  dialer_callers: { display_name: string } | null
}

const CONTACT_READ_FAILURES: PagingFailures = {
  read: () => new AuthzError(500, "contact_list_read_failed", "Unable to read the campaign contacts."),
  truncated: () => new AuthzError(500, "contact_list_truncated", "The campaign contact read was truncated."),
}

const CONTACT_PROFILE_READ_FAILURES: PagingFailures = {
  read: () => new AuthzError(500, "contact_profile_read_failed", "Unable to read the contact profiles."),
  truncated: () => new AuthzError(500, "contact_list_truncated", "The campaign contact read was truncated."),
}

const ASSIGNMENT_READ_FAILURES: PagingFailures = {
  read: () => new AuthzError(500, "assignment_read_failed", "Unable to read the campaign assignments."),
  truncated: () => new AuthzError(500, "assignment_read_truncated", "The campaign assignment read was truncated."),
}

const STAFF_NAME_READ_FAILURES: PagingFailures = {
  read: () => new AuthzError(500, "staff_name_read_failed", "Unable to read the staff names for these contacts."),
  truncated: () => new AuthzError(500, "staff_name_read_truncated", "The staff name read was truncated."),
}

/**
 * A stored facet is trimmed once, here, so an option and its filter compare
 * equal even when the profile row was written with padding. A padded-empty
 * value is absent, not an empty option.
 */
function normalizeFacetValue(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeSearch(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed.toLowerCase() : null
}

function requirePage(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_PAGE
  }

  if (!Number.isInteger(value) || value < 1) {
    throw new AuthzError(400, "invalid_page", "Page must be a whole number of 1 or more.")
  }

  return value
}

function requirePageSize(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_PAGE_SIZE
  }

  if (!Number.isInteger(value) || value < 1 || value > MAX_PAGE_SIZE) {
    throw new AuthzError(400, "invalid_page_size", "Page size must be a whole number between 1 and 100.")
  }

  return value
}

function toContactProfile(row: ContactProfileRow | undefined): AssignableContactProfile {
  return {
    centre: normalizeFacetValue(row?.centre),
    level: normalizeFacetValue(row?.level),
    gender: normalizeFacetValue(row?.gender),
    language: normalizeFacetValue(row?.language),
  }
}

function toAssignableContact(
  row: ContactRow,
  profile: AssignableContactProfile,
  assignment: AssignmentConflictRow | undefined,
  collectedByName: string | null,
): AssignableContact {
  const callerName = assignment?.dialer_callers?.display_name.trim()

  return {
    contactId: row.id,
    name: row.name,
    phone: row.phone,
    initialContact: row.initial_contact ?? null,
    collectedByName,
    locationIds: row.location_ids ?? [],
    ...(row.assigned_preacher_id ? { assignedPreacherUserId: row.assigned_preacher_id } : {}),
    notes: row.notes ?? null,
    assignedCallerName: callerName && callerName.length > 0 ? callerName : null,
    profile,
  }
}

function matchesSearch(row: ContactRow, needle: string): boolean {
  return row.name.toLowerCase().includes(needle) || row.phone.toLowerCase().includes(needle)
}

function compareContacts(left: ContactRow, right: ContactRow): number {
  return left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
}

/**
 * Distinct non-null values for every contact in scope, before search and facet
 * filters apply: a facet built from the filtered or paged set contradicts the
 * options the admin can still choose.
 */
function buildFacets(profiles: Iterable<AssignableContactProfile>): ContactFacets {
  const values: Record<ContactFacetKey, Set<string>> = {
    centre: new Set<string>(),
    level: new Set<string>(),
    gender: new Set<string>(),
    language: new Set<string>(),
  }

  for (const profile of profiles) {
    for (const key of CONTACT_FACET_KEYS) {
      const value = profile[key]
      if (value !== null) {
        values[key].add(value)
      }
    }
  }

  const sorted = (set: Set<string>): string[] =>
    [...set].sort((left, right) => left.localeCompare(right))

  return {
    centre: sorted(values.centre),
    level: sorted(values.level),
    gender: sorted(values.gender),
    language: sorted(values.language),
  }
}

async function readScopedContacts(
  staff: StaffContext,
  scope: CampaignScope,
): Promise<ContactRow[]> {
  const supabaseAdmin = createSupabaseAdminClient()

  return collectPagedRows<ContactRow>(async (from, to) => {
    let request = supabaseAdmin
      .from("contacts")
      .select(CONTACT_COLUMNS)
      .eq("program_id", staff.programId)

    if (scope.kind === "preacher") {
      request = request.eq("assigned_preacher_id", scope.userId)
    }

    const response = await request.order("id", { ascending: true }).range(from, to)
    return { data: response.data, error: response.error }
  }, CONTACT_READ_FAILURES)
}

async function readStaffNames(
  programId: StaffContext["programId"],
  userIds: Array<string | null>,
): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  const uniqueIds = [...new Set(userIds.filter((id): id is string => Boolean(id)))]

  if (uniqueIds.length === 0) {
    return names
  }

  const supabaseAdmin = createSupabaseAdminClient()

  for (let offset = 0; offset < uniqueIds.length; offset += ASSIGNMENT_CHUNK_SIZE) {
    const chunk = uniqueIds.slice(offset, offset + ASSIGNMENT_CHUNK_SIZE)
    const rows = await collectPagedRows<StaffNameRow>(async (from, to) => {
      const response = await supabaseAdmin
        .from("users")
        .select(STAFF_NAME_COLUMNS)
        .eq("program_id", programId)
        .in("id", chunk)
        .order("id", { ascending: true })
        .range(from, to)

      return { data: response.data, error: response.error }
    }, STAFF_NAME_READ_FAILURES)

    for (const row of rows) {
      names.set(row.id, row.name?.trim() || row.email)
    }
  }

  return names
}

async function readContactProfiles(
  programId: StaffContext["programId"],
  contactIds: string[],
): Promise<Map<string, ContactProfileRow>> {
  const profiles = new Map<string, ContactProfileRow>()
  const uniqueIds = [...new Set(contactIds.filter(Boolean))]

  if (uniqueIds.length === 0) {
    return profiles
  }

  const supabaseAdmin = createSupabaseAdminClient()

  for (let offset = 0; offset < uniqueIds.length; offset += CONTACT_PROFILE_CHUNK_SIZE) {
    const chunk = uniqueIds.slice(offset, offset + CONTACT_PROFILE_CHUNK_SIZE)
    const rows = await collectPagedRows<ContactProfileRow>(async (from, to) => {
      const response = await supabaseAdmin
        .from("dialer_contact_profiles")
        .select(CONTACT_PROFILE_COLUMNS)
        .eq("program_id", programId)
        .in("contact_id", chunk)
        .order("contact_id", { ascending: true })
        .range(from, to)

      return { data: response.data, error: response.error }
    }, CONTACT_PROFILE_READ_FAILURES)

    for (const row of rows) {
      profiles.set(row.contact_id, row)
    }
  }

  return profiles
}

/**
 * The scoped contacts plus the two lookups each row needs: its calling profile
 * and the caller holding it in this campaign.
 *
 * `dialer_assignments` is read for the whole scope because the assign screen's
 * grid shows "Assigned To" on every row, and a per-page read would leave the
 * column blank for rows the current page does not happen to hold.
 */
async function readAssignableEntries(
  staff: StaffContext,
  scope: CampaignScope,
  campaignId: string,
) {
  const contacts = await readScopedContacts(staff, scope)
  const contactIds = contacts.map((contact) => contact.id)

  const [profileRows, assignmentRows, staffNames] = await Promise.all([
    readContactProfiles(staff.programId, contactIds),
    readAssignmentConflicts(staff.programId, campaignId, contactIds),
    readStaffNames(
      staff.programId,
      contacts.map((contact) => contact.collected_by_id),
    ),
  ])

  return contacts.map((contact) => {
    const collectedById = contact.collected_by_id

    return {
      contact,
      profile: toContactProfile(profileRows.get(contact.id)),
      assignment: assignmentRows.get(contact.id),
      collectedByName: collectedById ? staffNames.get(collectedById) ?? "Unknown staff" : null,
    }
  })
}

/**
 * AD-3-scoped contacts for the assign-contacts screen. Contact selection is a
 * live facet over `dialer_contact_profiles`, not a stored audience filter
 * (AD-11), and contacts already assigned in the campaign stay in the list:
 * Story 1.8's pre-check names them, and hiding them here would make that
 * conflict list disagree with what the admin selected.
 */
export async function listAssignableContacts(
  staff: StaffContext,
  campaignId: string,
  query: AssignableContactQuery = {},
): Promise<AssignableContactPage> {
  requireCampaignAdmin(staff)

  // The campaign resolution is this read's 404 gate: a malformed, missing or
  // other-program id fails before any contact is read.
  await getCampaign(staff, campaignId)

  const scope = await campaignScope(staff)
  const page = requirePage(query.page)
  const pageSize = requirePageSize(query.pageSize)

  const entries = await readAssignableEntries(staff, scope, campaignId)

  const filters: Record<ContactFacetKey, string | null> = {
    centre: normalizeFacetValue(query.centre),
    level: normalizeFacetValue(query.level),
    gender: normalizeFacetValue(query.gender),
    language: normalizeFacetValue(query.language),
  }
  const search = normalizeSearch(query.search)

  const filtered = entries.filter(({ contact, profile }) => {
    if (search && !matchesSearch(contact, search)) {
      return false
    }

    return CONTACT_FACET_KEYS.every((key) => {
      const wanted = filters[key]
      return wanted === null || profile[key] === wanted
    })
  })

  filtered.sort((left, right) => compareContacts(left.contact, right.contact))

  const total = filtered.length
  const totalPages = Math.ceil(total / pageSize)
  const start = (page - 1) * pageSize
  const rows = filtered
    .slice(start, start + pageSize)
    .map(({ contact, profile, assignment, collectedByName }) =>
      toAssignableContact(contact, profile, assignment, collectedByName),
    )

  return {
    rows,
    page,
    pageSize,
    total,
    totalPages,
    facets: buildFacets(entries.map((entry) => entry.profile)),
  }
}

/**
 * The whole scoped set in one answer, for a grid that sorts, filters and
 * selects across every row rather than one page at a time.
 *
 * This is the same read the screen's own route performs, minus the page slice:
 * the grid's toolbar and its "N of M selected" footer both describe the whole
 * scope, so handing it a page would make both numbers wrong.
 */
export async function listAllAssignableContacts(
  staff: StaffContext,
  campaignId: string,
): Promise<AssignableContact[]> {
  requireCampaignAdmin(staff)
  await getCampaign(staff, campaignId)

  const scope = await campaignScope(staff)
  const entries = await readAssignableEntries(staff, scope, campaignId)

  return entries
    .sort((left, right) => compareContacts(left.contact, right.contact))
    .map(({ contact, profile, assignment, collectedByName }) =>
      toAssignableContact(contact, profile, assignment, collectedByName),
    )
}

/** AD-3's assignable caller set for the picker; no second derivation. */
export async function listAssignableCallers(staff: StaffContext): Promise<AssignableCaller[]> {
  requireCampaignAdmin(staff)

  const scope = await campaignScope(staff)
  return scope.assignableCallers
}

/**
 * AD-11's weighted distribution: every caller gets `floor(N × weight ÷ total
 * weight)`, then the leftover units go one at a time to the largest
 * remainders, ties by higher weight and then request order. BigInt keeps the
 * numerator and remainder exact when `total × weight` exceeds
 * `Number.MAX_SAFE_INTEGER`.
 */
export function previewAssignmentSplit(
  total: number,
  callers: AssignmentWeight[],
): AssignmentSplitEntry[] {
  if (!Array.isArray(callers) || callers.length === 0) {
    throw new AuthzError(400, "invalid_caller_list", "Select at least one caller.")
  }

  if (!Number.isSafeInteger(total) || total < 0) {
    throw new AuthzError(400, "invalid_total", "The contact count must be a non-negative whole number.")
  }

  const seen = new Set<string>()

  for (const caller of callers) {
    if (
      !caller ||
      typeof caller.callerId !== "string" ||
      caller.callerId.trim().length === 0 ||
      seen.has(caller.callerId)
    ) {
      throw new AuthzError(400, "invalid_caller_list", "Each caller must appear exactly once.")
    }

    seen.add(caller.callerId)

    if (!Number.isSafeInteger(caller.weight) || caller.weight < 1) {
      throw new AuthzError(400, "invalid_weight", "Every weight must be a positive whole number.")
    }
  }

  const totalWeight = callers.reduce((sum, caller) => sum + BigInt(caller.weight), 0n)
  const totalCount = BigInt(total)

  const parts = callers.map((caller, index) => {
    const weight = BigInt(caller.weight)
    const numerator = totalCount * weight

    return {
      callerId: caller.callerId,
      weight: caller.weight,
      index,
      count: Number(numerator / totalWeight),
      remainder: numerator % totalWeight,
    }
  })

  const allocated = parts.reduce((sum, part) => sum + part.count, 0)
  const leftovers = total - allocated

  const ranked = [...parts].sort((left, right) => {
    if (left.remainder !== right.remainder) {
      return left.remainder > right.remainder ? -1 : 1
    }

    if (left.weight !== right.weight) {
      return left.weight > right.weight ? -1 : 1
    }

    return left.index - right.index
  })

  for (let index = 0; index < leftovers; index += 1) {
    ranked[index].count += 1
  }

  return parts.map((part) => ({
    callerId: part.callerId,
    weight: part.weight,
    count: part.count,
  }))
}

function normalizeContactIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new AuthzError(400, "invalid_contact_ids", "Select at least one contact.")
  }

  const seen = new Set<string>()
  const ids: string[] = []

  for (const entry of value) {
    if (typeof entry !== "string" || !UUID_PATTERN.test(entry)) {
      throw new AuthzError(400, "invalid_contact_ids", "Every contact id must be a UUID.")
    }

    const id = entry.toLowerCase()
    if (seen.has(id)) {
      continue
    }

    seen.add(id)
    ids.push(id)
  }

  return ids
}

function requireCallerWeights(value: unknown): AssignmentWeight[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new AuthzError(400, "invalid_caller_list", "Select at least one caller.")
  }

  return value.map((entry) => {
    if (!entry || typeof entry !== "object") {
      throw new AuthzError(400, "invalid_caller_list", "Each caller needs a user id and a weight.")
    }

    const { userId, weight } = entry as { userId?: unknown; weight?: unknown }

    if (typeof userId !== "string" || userId.trim().length === 0) {
      throw new AuthzError(400, "invalid_caller_list", "Each caller needs a user id.")
    }

    return {
      callerId: userId.trim().toLowerCase(),
      weight: typeof weight === "number" ? weight : Number.NaN,
    }
  })
}

function normalizeAssignmentMode(value: unknown): AssignmentWriteMode | undefined {
  if (value === undefined || value === null) {
    return undefined
  }

  if (value === "skip" || value === "move") {
    return value
  }

  throw new AuthzError(400, "invalid_mode", "The assignment mode must be skip or move.")
}

async function readContactsByIds(
  programId: StaffContext["programId"],
  contactIds: string[],
): Promise<Map<string, ContactRow>> {
  const contacts = new Map<string, ContactRow>()

  if (contactIds.length === 0) {
    return contacts
  }

  const supabaseAdmin = createSupabaseAdminClient()

  for (let offset = 0; offset < contactIds.length; offset += ASSIGNMENT_CHUNK_SIZE) {
    const chunk = contactIds.slice(offset, offset + ASSIGNMENT_CHUNK_SIZE)
    const rows = await collectPagedRows<ContactRow>(async (from, to) => {
      const response = await supabaseAdmin
        .from("contacts")
        .select(CONTACT_COLUMNS)
        .eq("program_id", programId)
        .in("id", chunk)
        .order("id", { ascending: true })
        .range(from, to)

      return { data: response.data, error: response.error }
    }, CONTACT_READ_FAILURES)

    for (const row of rows) {
      contacts.set(row.id, row)
    }
  }

  return contacts
}

async function readAssignmentConflicts(
  programId: StaffContext["programId"],
  campaignId: string,
  contactIds: string[],
): Promise<Map<string, AssignmentConflictRow>> {
  const rows = new Map<string, AssignmentConflictRow>()

  if (contactIds.length === 0) {
    return rows
  }

  const supabaseAdmin = createSupabaseAdminClient()

  for (let offset = 0; offset < contactIds.length; offset += ASSIGNMENT_CHUNK_SIZE) {
    const chunk = contactIds.slice(offset, offset + ASSIGNMENT_CHUNK_SIZE)
    const chunkRows = await collectPagedRows<AssignmentConflictRow>(async (from, to) => {
      const response = await supabaseAdmin
        .from("dialer_assignments")
        .select(ASSIGNMENT_COLUMNS)
        .eq("program_id", programId)
        .eq("campaign_id", campaignId)
        .in("contact_id", chunk)
        .order("contact_id", { ascending: true })
        .range(from, to)

      return { data: response.data, error: response.error }
    }, ASSIGNMENT_READ_FAILURES)

    for (const row of chunkRows) {
      rows.set(row.contact_id, row)
    }
  }

  return rows
}

/**
 * The read half of Story 1.8: every selected contact already assigned in this
 * campaign, named by contact and current caller, before anything is written.
 * A contact outside the caller's AD-3 scope is refused by id, never dropped —
 * a silently shortened list would make the primary button's count lie.
 */
export async function precheckAssignments(
  staff: StaffContext,
  campaignId: string,
  contactIds: string[],
): Promise<AssignmentPrecheck> {
  requireCampaignAdmin(staff)

  // The campaign resolution is this read's 404 gate, as in `listAssignableContacts`.
  await getCampaign(staff, campaignId)

  const scope = await campaignScope(staff)
  const ids = normalizeContactIds(contactIds)
  const contacts = await readContactsByIds(staff.programId, ids)

  const outsideScope = ids.filter((id) => {
    const contact = contacts.get(id)
    if (!contact) {
      return true
    }

    return scope.kind === "preacher" && contact.assigned_preacher_id !== scope.userId
  })

  if (outsideScope.length > 0) {
    throw new AuthzError(
      403,
      "contact_not_assignable",
      `These contacts are not in your assignable set: ${outsideScope.join(", ")}.`,
    )
  }

  const assigned = await readAssignmentConflicts(staff.programId, campaignId, ids)
  const conflicts: AssignmentConflict[] = []

  for (const id of ids) {
    const row = assigned.get(id)
    if (!row) {
      continue
    }

    conflicts.push({
      contactId: id,
      contactName: row.contacts?.name ?? contacts.get(id)?.name ?? id,
      callerId: row.caller_id,
      callerName: row.dialer_callers?.display_name.trim() || row.caller_id,
      status: row.status,
    })
  }

  return {
    conflicts,
    assignableCount: ids.length - conflicts.length,
    conflictCount: conflicts.length,
  }
}

function assignmentWriteError(
  error: { message?: string; code?: string } | null,
  campaign: CampaignRow,
  callerNameById: Map<string, string>,
): AuthzError {
  const message = typeof error?.message === "string" ? error.message : ""
  const code = typeof error?.code === "string" ? error.code : ""

  if (code === "P0002" || message.startsWith("campaign_not_found")) {
    return new AuthzError(404, "campaign_not_found", "Campaign not found in this program.")
  }

  if (message.startsWith("campaign_not_assignable")) {
    return new AuthzError(
      409,
      "campaign_not_assignable",
      `Only a DRAFT or ACTIVE campaign accepts assignments; this campaign is now ${campaign.status}.`,
    )
  }

  if (message.startsWith("caller_inactive:")) {
    const callerId = message.slice("caller_inactive:".length)
    return new AuthzError(
      409,
      "caller_inactive",
      `Deactivated callers cannot receive assignments: ${callerNameById.get(callerId) ?? callerId}.`,
    )
  }

  if (message.startsWith("caller_not_assignable:")) {
    const callerId = message.slice("caller_not_assignable:".length)
    return new AuthzError(
      403,
      "caller_not_assignable",
      `${callerNameById.get(callerId) ?? callerId} is not in your assignable caller set.`,
    )
  }

  if (message === "invalid_rows") {
    return new AuthzError(400, "invalid_rows", "The assignment rows were rejected.")
  }

  if (message === "invalid_mode") {
    return new AuthzError(400, "invalid_mode", "The assignment mode was rejected.")
  }

  return new AuthzError(
    500,
    "assignment_write_failed",
    "The assignment write failed and the whole batch was rolled back; nothing was written.",
  )
}

function readWriteCounts(data: unknown): { written: number; skipped: number } | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null
  }

  const record = data as { [key: string]: unknown }
  const written = record.written
  const skipped = record.skipped

  if (!Number.isSafeInteger(written) || !Number.isSafeInteger(skipped)) {
    return null
  }

  return { written: written as number, skipped: skipped as number }
}

/**
 * AD-11's one transactional write. The pre-check is re-run here on the same
 * selection rather than trusted from the client, so the skip/move decision is
 * made against rows as they are now; the RPC then re-validates what a
 * concurrent request could still change and rolls the whole batch back.
 */
export async function writeAssignments(
  staff: StaffContext,
  campaignId: string,
  input: WriteAssignmentsInput,
): Promise<WriteAssignmentsResult> {
  requireCampaignAdmin(staff)

  const campaign = await getCampaign(staff, campaignId)
  const scope = await campaignScope(staff)

  const contactIds = normalizeContactIds(input.contactIds)
  const weights = requireCallerWeights(input.callers)
  const mode = normalizeAssignmentMode(input.mode)

  const precheck = await precheckAssignments(staff, campaignId, contactIds)

  if (precheck.conflictCount > 0 && mode === undefined) {
    const named = precheck.conflicts
      .map((conflict) => `${conflict.contactName} (currently ${conflict.callerName})`)
      .join(", ")

    throw new AuthzError(
      409,
      "conflicts_require_decision",
      `These contacts are already assigned in this campaign — choose skip or move: ${named}.`,
    )
  }

  const conflicted = new Set(precheck.conflicts.map((conflict) => conflict.contactId))
  const confirmed =
    mode === "skip" ? contactIds.filter((id) => !conflicted.has(id)) : contactIds

  if (confirmed.length === 0) {
    throw new AuthzError(
      409,
      "nothing_to_assign",
      "Every selected contact is already assigned in this campaign.",
    )
  }

  // The split is the weight validator: running it before promotion means a bad
  // weight cannot leave a caller profile behind, and it is the same function
  // that computes the counts once the profiles exist.
  previewAssignmentSplit(confirmed.length, weights)

  // Promotion runs before the membership assertion because a deactivated
  // profile is deliberately absent from `assignableCallers`: checking
  // membership first would turn `409 caller_inactive` into a 403 and lose the
  // named state. Promotion classifies the whole batch before it writes.
  const { promoted, existing } = await promoteCallers(
    staff,
    weights.map((caller) => caller.callerId),
  )

  const profileByUserId = new Map<string, CallerProfile>()
  const callerNameById = new Map<string, string>()

  for (const profile of [...promoted, ...existing]) {
    profileByUserId.set(profile.userId, profile)
    callerNameById.set(profile.id, profile.displayName.trim() || profile.id)
  }

  const assignable = new Set(scope.assignableCallers.map((caller) => caller.userId))

  for (const caller of weights) {
    if (!assignable.has(caller.callerId)) {
      throw new AuthzError(
        403,
        "caller_not_assignable",
        `${profileByUserId.get(caller.callerId)?.displayName ?? caller.callerId} is not in your assignable caller set.`,
      )
    }
  }

  const weighted: AssignmentWeight[] = weights.map((caller) => {
    const profile = profileByUserId.get(caller.callerId)

    if (!profile) {
      throw new AuthzError(
        500,
        "caller_profile_missing",
        "A caller profile could not be resolved after promotion.",
      )
    }

    return { callerId: profile.id, weight: caller.weight }
  })

  const split = previewAssignmentSplit(confirmed.length, weighted)

  // Callers in request order, contacts in `contactIds` order, `sortOrder`
  // restarting at 0 per caller: the queue rail reads this order, so it must not
  // depend on how Postgres happens to iterate the payload.
  const rows: AssignmentWriteRow[] = []
  let cursor = 0

  for (const entry of split) {
    for (let sortOrder = 0; sortOrder < entry.count; sortOrder += 1) {
      rows.push({ contactId: confirmed[cursor], callerId: entry.callerId, sortOrder })
      cursor += 1
    }
  }

  const effectiveMode: AssignmentWriteMode = mode ?? "move"

  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin.rpc("assign_dialer_contacts", {
    p_program_id: staff.programId,
    p_campaign_id: campaignId,
    p_assigned_by: staff.userId,
    p_rows: rows,
    p_mode: effectiveMode,
  })

  if (error) {
    throw assignmentWriteError(error, campaign, callerNameById)
  }

  const counts = readWriteCounts(data)

  if (!counts || counts.written + counts.skipped !== rows.length) {
    throw new AuthzError(
      500,
      "assignment_write_unverified",
      "The assignment write returned an unreadable result; the batch may have been written.",
    )
  }

  return {
    written: counts.written,
    skipped: contactIds.length - confirmed.length + counts.skipped,
    split,
  }
}
