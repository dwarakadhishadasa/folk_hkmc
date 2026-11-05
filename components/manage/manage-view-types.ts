/**
 * Client-safe shapes for saved contacts-grid views.
 *
 * Imports nothing at runtime, like `manage-types.ts`, so a `"use client"` file
 * and `lib/supabase/contact-views.ts` can both name a view without either
 * reaching the other's side of the guardrail.
 */

import type { GridViewConfig } from "@/components/grid/grid-view-config"

/**
 * The view types this app can render.
 *
 * One entry on purpose. The create-view menu draws its options from this list,
 * so a second type is an addition here plus a renderer — not a menu built by
 * hand at the call site.
 */
export const CONTACT_VIEW_TYPES = ["grid"] as const

export type ContactViewType = (typeof CONTACT_VIEW_TYPES)[number]

export const CONTACT_VIEW_TYPE_LABELS: Record<ContactViewType, string> = {
  grid: "Grid",
}

export function isContactViewType(value: unknown): value is ContactViewType {
  return typeof value === "string" && (CONTACT_VIEW_TYPES as readonly string[]).includes(value)
}

/**
 * Who a view belongs to.
 *
 * `personal` views are the default and are the reason two people can each keep a
 * "Grid 2" without seeing each other's. `collaborative` is the shared case, and
 * is the only case in which somebody else's view can be renamed or deleted.
 */
export type ContactViewVisibility = "personal" | "collaborative"

export const CONTACT_VIEW_VISIBILITIES: readonly ContactViewVisibility[] = [
  "personal",
  "collaborative",
]

export const CONTACT_VIEW_VISIBILITY_LABELS: Record<ContactViewVisibility, string> = {
  personal: "Personal",
  collaborative: "Collaborative",
}

export const CONTACT_VIEW_VISIBILITY_HINTS: Record<ContactViewVisibility, string> = {
  personal: "Only you can see and edit this view.",
  collaborative: "Everyone in this programme can see and edit this view.",
}

export function isContactViewVisibility(value: unknown): value is ContactViewVisibility {
  return typeof value === "string" && (CONTACT_VIEW_VISIBILITIES as readonly string[]).includes(value)
}

export interface ManageContactView {
  id: string
  name: string
  viewType: ContactViewType
  config: GridViewConfig
  position: number
  /** Null only on rows that predate per-user views; those read as shared. */
  ownerUserId: string | null
  visibility: ContactViewVisibility
  createdAt: string
  updatedAt: string
}

/**
 * Whether the signed-in operator may rename, reconfigure or delete a view.
 *
 * The server applies the same rule; this is what lets the menu say so before a
 * request is made. A view whose author is unknown predates ownership and is
 * treated as shared, which is what it was.
 */
export function canEditContactView(view: ManageContactView, userId: string): boolean {
  return view.visibility === "collaborative" || view.ownerUserId === null || view.ownerUserId === userId
}

/** "Grid 3" for the third view, the way the source product numbers its copies. */
export function suggestContactViewName(views: readonly Pick<ManageContactView, "name">[]): string {
  return `Grid ${views.length + 1}`
}
