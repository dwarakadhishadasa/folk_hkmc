"use client"

import type { GridViewConfig } from "@/components/grid/grid-view-config"
import type {
  ContactViewVisibility,
  ManageContactView,
} from "@/components/manage/manage-view-types"

/**
 * The saved-views endpoints, as the view bar calls them.
 *
 * Every call returns the server's row rather than the value the client sent:
 * the server resolves colliding names and stamps timestamps, and a local guess
 * at either would drift from what the next page load shows.
 */

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const payload: unknown = await response.json()
    const record = payload && typeof payload === "object" ? (payload as { error?: unknown }) : null

    return typeof record?.error === "string" && record.error ? record.error : fallback
  } catch {
    return fallback
  }
}

async function readView(response: Response, fallback: string): Promise<ManageContactView> {
  if (!response.ok) {
    throw new Error(await readError(response, fallback))
  }

  const payload = (await response.json()) as { view?: ManageContactView }

  if (!payload.view) {
    throw new Error(fallback)
  }

  return payload.view
}

export async function createContactViewRequest(input: {
  name: string
  config: GridViewConfig
  visibility: ContactViewVisibility
}): Promise<ManageContactView> {
  const response = await fetch("/api/manage/views", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  })

  return readView(response, "Unable to create that view.")
}

export async function updateContactViewRequest(
  viewId: string,
  patch: { name?: string; config?: GridViewConfig },
): Promise<ManageContactView> {
  const response = await fetch(`/api/manage/views/${encodeURIComponent(viewId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  })

  return readView(response, "Unable to save that view.")
}

export async function deleteContactViewRequest(viewId: string): Promise<void> {
  const response = await fetch(`/api/manage/views/${encodeURIComponent(viewId)}`, {
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
export function markContactViewUsed(viewId: string): void {
  void fetch(`/api/manage/views/${encodeURIComponent(viewId)}/use`, {
    method: "POST",
    keepalive: true,
  }).catch(() => {})
}
