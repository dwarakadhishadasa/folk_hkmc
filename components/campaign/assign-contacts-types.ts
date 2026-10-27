import type { StaffRole } from "@hkmc/data-contracts"

/**
 * The assign-contacts surface's client contract.
 *
 * `lib/dialer/assignments.ts` is `server-only`, so its types are mirrored here
 * rather than imported into the client graph; the route returns the service's
 * page object verbatim, and this is the shape the browser reads back.
 */
export const CONTACT_FACET_KEYS = ["centre", "level", "gender", "language"] as const

export type ContactFacetKey = (typeof CONTACT_FACET_KEYS)[number]

/** Fragment options for the four calling facets, each sorted and distinct. */
export type ContactFacets = Record<ContactFacetKey, string[]>

export const FACET_LABELS: Record<ContactFacetKey, string> = {
  centre: "Centre",
  level: "Level",
  gender: "Gender",
  language: "Language",
}

/** Every facet key is null when the contact has no profile row. */
export interface AssignableContactProfileView {
  centre: string | null
  level: string | null
  gender: string | null
  language: string | null
}

export interface AssignableContactView {
  contactId: string
  name: string
  phone: string
  locationIds: string[]
  assignedPreacherUserId?: string
  notes: string | null
  assignedCallerName: string | null
  profile: AssignableContactProfileView
}

/** One page of the scoped contact set, with whole-set facets and filtered total. */
export interface AssignableContactPageView {
  rows: AssignableContactView[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  facets: ContactFacets
}

/** AD-3's assignable caller set; `callerId` is absent until first assignment promotes. */
export interface AssignableCallerView {
  userId: string
  name: string
  email: string
  role: StaffRole
  callerId?: string
}

/** One caller's share of the confirmed contact set. */
export interface AssignmentSplitEntryView {
  callerId: string
  weight: number
  count: number
}

/** A selected contact already assigned in this campaign, named by contact and current caller. */
export interface AssignmentConflictView {
  contactId: string
  contactName: string
  /** `dialer_callers.id` of the current owner, not the staff user id. */
  callerId: string
  callerName: string
  /** The stored `dialer_assignments.status` of the conflicting row. */
  status: string
}

/** The pre-check's answer: what is already assigned, and what a skip would write. */
export interface AssignmentPrecheckView {
  conflicts: AssignmentConflictView[]
  assignableCount: number
  conflictCount: number
}

/** The only two decisions a conflict leaves open. */
export type AssignmentWriteModeView = "skip" | "move"

/** The write's receipt: whole numbers that sum to the confirmed set size. */
export interface AssignmentWriteResultView {
  written: number
  skipped: number
  split: AssignmentSplitEntryView[]
}

export interface LocationOption {
  id: string
  name: string
}

export const EMPTY_FACETS: ContactFacets = {
  centre: [],
  level: [],
  gender: [],
  language: [],
}
