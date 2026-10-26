import "server-only"

import { AuthzError, type StaffContext } from "@/lib/authz"
import { getCampaign } from "@/lib/dialer/campaigns"
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

const CONTACT_COLUMNS = "id,name,phone,location_ids,assigned_preacher_id"
const CONTACT_PROFILE_COLUMNS = "contact_id,centre,level,gender,language"

const CONTACT_FACET_KEYS = ["centre", "level", "gender", "language"] as const

export type ContactFacetKey = (typeof CONTACT_FACET_KEYS)[number]

/** Fragment options for the four calling facets, each sorted and distinct. */
export type ContactFacets = Record<ContactFacetKey, string[]>

type ContactRow = Pick<
  Database["public"]["Tables"]["contacts"]["Row"],
  "id" | "name" | "phone" | "location_ids" | "assigned_preacher_id"
>

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
  locationIds: string[]
  /** Absent when `contacts.assigned_preacher_id` is null. */
  assignedPreacherUserId?: string
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

const CONTACT_READ_FAILURES: PagingFailures = {
  read: () => new AuthzError(500, "contact_list_read_failed", "Unable to read the campaign contacts."),
  truncated: () => new AuthzError(500, "contact_list_truncated", "The campaign contact read was truncated."),
}

const CONTACT_PROFILE_READ_FAILURES: PagingFailures = {
  read: () => new AuthzError(500, "contact_profile_read_failed", "Unable to read the contact profiles."),
  truncated: () => new AuthzError(500, "contact_list_truncated", "The campaign contact read was truncated."),
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
): AssignableContact {
  return {
    contactId: row.id,
    name: row.name,
    phone: row.phone,
    locationIds: row.location_ids ?? [],
    ...(row.assigned_preacher_id ? { assignedPreacherUserId: row.assigned_preacher_id } : {}),
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

  const contacts = await readScopedContacts(staff, scope)
  const profileRows = await readContactProfiles(
    staff.programId,
    contacts.map((contact) => contact.id),
  )

  const entries = contacts.map((contact) => ({
    contact,
    profile: toContactProfile(profileRows.get(contact.id)),
  }))

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
    .map(({ contact, profile }) => toAssignableContact(contact, profile))

  return {
    rows,
    page,
    pageSize,
    total,
    totalPages,
    facets: buildFacets(entries.map((entry) => entry.profile)),
  }
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
