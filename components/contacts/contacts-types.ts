/**
 * The Contacts section's server payload.
 *
 * Client-safe by construction: this module imports only types from the manage
 * stack, so a `"use client"` component can name the payload without reaching
 * `@/lib/supabase/manage` or `@/lib/authz`.
 *
 * `P` is the reader's own contacts — `assigned_preacher_id = me`, for an Admin
 * and a Preacher alike. There is no `mode` here because the section has no
 * scope switch; `scope.mode` is carried as `"preacher"` because the read is
 * exactly the preacher-narrowed one, and the grid never reads it.
 */

import type { ManageContactsPayload } from "@/components/manage/manage-types"
import type { ManageContactView } from "@/components/manage/manage-view-types"

export interface ContactsSectionPayload extends ManageContactsPayload {
  /**
   * Active program locations — the header's `{locations} locations`.
   *
   * Deliberately a count rather than a filtered array: `locations` is what the
   * grid's picker resolves against and is not narrowed by active status, while
   * the header's figure is. The two numbers differ whenever an inactive
   * location exists, and the difference is intended.
   */
  activeLocationCount: number
  /**
   * Saved grid views, in their display order.
   *
   * Loaded with the section rather than fetched by the view bar: the bar is the
   * first thing above the grid, and a client fetch would paint it empty and then
   * move. Absent (`undefined`) on surfaces that do not offer views.
   */
  views?: ManageContactView[]
  /**
   * The view this person last opened, read from the server so it follows them to
   * another machine. Only a hint: an id that no longer exists is ignored.
   */
  lastViewId?: string | null
}

export interface ContactsSectionSummary {
  contactCount: number
  locationCount: number
}

export function summarizeContactsSection(payload: ContactsSectionPayload): ContactsSectionSummary {
  return {
    contactCount: payload.contacts.length,
    locationCount: payload.activeLocationCount,
  }
}

/**
 * The section path, with its query, for a sign-in redirect.
 *
 * "Carrying the path and query" is a contract: a reader who hit an expired
 * session on a filtered grid returns to that filtered grid, not to the
 * unfiltered root.
 */
export function sectionRedirectPath(
  pathname: string,
  params: Readonly<Record<string, string | string[] | undefined>>,
): string {
  const query = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue
    }

    for (const entry of Array.isArray(value) ? value : [value]) {
      query.append(key, entry)
    }
  }

  const serialized = query.toString()

  return serialized.length > 0 ? `${pathname}?${serialized}` : pathname
}
