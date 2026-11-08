/**
 * Client-safe shapes for saved grid views.
 *
 * A saved view is a named `GridViewConfig` plus who may see it. The shape is
 * identical on every surface that renders a `Grid`; only the stored rows are
 * separated by `surface`. Imports nothing at runtime beyond the config type, so
 * a `"use client"` file and a `server-only` module can both name a view without
 * either reaching the other's side of the guardrail.
 */

import type { GridViewConfig } from "@/components/grid/grid-view-config"

/**
 * The view types this app can render.
 *
 * One entry on purpose. Creating a view always creates the one type the app
 * renders; a second type is an addition here plus a renderer.
 */
export const SAVED_VIEW_TYPES = ["grid"] as const

export type SavedViewType = (typeof SAVED_VIEW_TYPES)[number]

export const SAVED_VIEW_TYPE_LABELS: Record<SavedViewType, string> = {
  grid: "Grid",
}

export function isSavedViewType(value: unknown): value is SavedViewType {
  return typeof value === "string" && (SAVED_VIEW_TYPES as readonly string[]).includes(value)
}

/**
 * Who a view belongs to.
 *
 * `personal` views are the default and are the reason two people can each keep
 * a "Grid 2" without seeing each other's. `collaborative` is the shared case,
 * and is the only case in which somebody else's view can be renamed or deleted.
 */
export type SavedViewVisibility = "personal" | "collaborative"

export const SAVED_VIEW_VISIBILITIES: readonly SavedViewVisibility[] = [
  "personal",
  "collaborative",
]

export const SAVED_VIEW_VISIBILITY_LABELS: Record<SavedViewVisibility, string> = {
  personal: "Personal",
  collaborative: "Collaborative",
}

export const SAVED_VIEW_VISIBILITY_HINTS: Record<SavedViewVisibility, string> = {
  personal: "Only you can see and edit this view.",
  collaborative: "Everyone in this programme can see and edit this view.",
}

export function isSavedViewVisibility(value: unknown): value is SavedViewVisibility {
  return (
    typeof value === "string" &&
    (SAVED_VIEW_VISIBILITIES as readonly string[]).includes(value)
  )
}

export interface SavedGridView {
  id: string
  name: string
  viewType: SavedViewType
  config: GridViewConfig
  position: number
  /** Null only on rows that predate per-user views; those read as shared. */
  ownerUserId: string | null
  visibility: SavedViewVisibility
  createdAt: string
  updatedAt: string
}

/**
 * Which grid a view belongs to. Rows are stored in one table and separated by
 * this key, so a contacts arrangement never appears in a campaign switcher.
 */
export type SavedViewSurface = "contacts" | "campaigns"

/**
 * Whether the signed-in operator may rename, reconfigure or delete a view.
 *
 * The server applies the same rule; this is what lets the menu say so before a
 * request is made. A view whose author is unknown predates ownership and is
 * treated as shared, which is what it was.
 */
export function canEditSavedView(view: SavedGridView, userId: string): boolean {
  return view.visibility === "collaborative" || view.ownerUserId === null || view.ownerUserId === userId
}

/** "Grid 3" for the third view, the way the source product numbers its copies. */
export function suggestSavedViewName(views: readonly Pick<SavedGridView, "name">[]): string {
  return `Grid ${views.length + 1}`
}

/**
 * Folds a server payload into the in-memory view list without discarding a
 * write the client has already made.
 *
 * A navigation re-renders the server component, and that read can finish before
 * an autosave it raced with lands. Replacing the list wholesale would then put
 * the view's *old* configuration back in memory: the grid keeps showing what the
 * URL says, but the next switch to that view writes the stale copy over it.
 * Newest `updatedAt` wins. A view created moments ago and not yet in the payload
 * is kept; one deleted here is never resurrected by an older payload.
 */
export function mergeSavedViews(
  current: readonly SavedGridView[],
  incoming: readonly SavedGridView[],
  removed: ReadonlySet<string>,
): SavedGridView[] {
  const localById = new Map(current.map((view) => [view.id, view]))
  const incomingIds = new Set(incoming.map((view) => view.id))
  const now = Date.now()

  const merged = incoming
    .filter((view) => !removed.has(view.id))
    .map((view) => {
      const local = localById.get(view.id)

      if (!local) {
        return view
      }

      return Date.parse(local.updatedAt) > Date.parse(view.updatedAt) ? local : view
    })

  for (const view of current) {
    if (incomingIds.has(view.id) || removed.has(view.id)) {
      continue
    }

    if (now - Date.parse(view.createdAt) > 30_000) {
      continue
    }

    merged.push(view)
  }

  return merged
}
