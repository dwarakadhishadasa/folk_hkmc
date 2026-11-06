"use client"

import type { GridViewConfig } from "@/components/grid/grid-view-config"
import type {
  SavedGridView,
  SavedViewVisibility,
} from "@/components/grid/saved-view-types"

/**
 * The saved-views endpoints, as a surface's view bar calls them.
 *
 * Every call returns the server's row rather than the value the client sent:
 * the server resolves colliding names and stamps timestamps, and a local guess
 * at either would drift from what the next page load shows.
 */

export const CONTACTS_VIEWS_ENDPOINT = "/api/manage/views"
export const CAMPAIGNS_VIEWS_ENDPOINT = "/api/dialer/campaign-views"

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const payload: unknown = await response.json()
    const record = payload && typeof payload === "object" ? (payload as { error?: unknown }) : null

    return typeof record?.error === "string" && record.error ? record.error : fallback
  } catch {
    return fallback
  }
}

async function readView(response: Response, fallback: string): Promise<SavedGridView> {
  if (!response.ok) {
    throw new Error(await readError(response, fallback))
  }

  const payload = (await response.json()) as { view?: SavedGridView }

  if (!payload.view) {
    throw new Error(fallback)
  }

  return payload.view
}

export async function createSavedViewRequest(
  endpoint: string,
  input: {
    name: string
    config: GridViewConfig
    visibility: SavedViewVisibility
  },
): Promise<SavedGridView> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  })

  return readView(response, "Unable to create that view.")
}

export async function updateSavedViewRequest(
  endpoint: string,
  viewId: string,
  patch: { name?: string; config?: GridViewConfig },
): Promise<SavedGridView> {
  const response = await fetch(`${endpoint}/${encodeURIComponent(viewId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  })

  return readView(response, "Unable to save that view.")
}

export async function deleteSavedViewRequest(endpoint: string, viewId: string): Promise<void> {
  const response = await fetch(`${endpoint}/${encodeURIComponent(viewId)}`, {
    method: "DELETE",
  })

  if (!response.ok) {
    throw new Error(await readError(response, "Unable to delete that view."))
  }
}

/**
 * Remembers that this person is now in `viewId`.
 *
 * Fire-and-forget: failing to remember where someone was is not worth an error
 * in front of the grid, and the next navigation will try again.
 */
export function markSavedViewUsed(endpoint: string, viewId: string): void {
  void fetch(`${endpoint}/${encodeURIComponent(viewId)}/use`, {
    method: "POST",
    keepalive: true,
  }).catch(() => {})
}
