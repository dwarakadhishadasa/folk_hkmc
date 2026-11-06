import "server-only"

import { normalizeGridViewConfig } from "@/components/grid/grid-view-config"
import {
  isSavedViewType,
  isSavedViewVisibility,
  type SavedViewSurface,
} from "@/components/grid/saved-view-types"
import { CAMPAIGN_ADMIN_ROLES, OPERATIONAL_ROLES } from "@/lib/staff-roles"
import { authzErrorResponse, AuthzError, getStaffContext, requireRole } from "@/lib/authz"
import {
  createSavedView,
  deleteSavedView,
  loadLastSavedView,
  loadSavedViews,
  setLastSavedView,
  updateSavedView,
} from "@/lib/supabase/saved-views"
import type { StaffRole } from "@hkmc/data-contracts"

/**
 * The saved-views API, for every surface that renders a `Grid`.
 *
 * A view is a grid arrangement, not a record, so the read gate is the surface's
 * own read gate. Writes use the same set: reshaping a shared surface is at
 * least as consequential as editing a row, and two role lists that agree today
 * are one list.
 *
 * Rows are separated by `surface`, so a contacts view never appears in a
 * campaign switcher even though both go through this module.
 */

const SURFACE_ROLES: Record<SavedViewSurface, readonly StaffRole[]> = {
  contacts: OPERATIONAL_ROLES,
  campaigns: CAMPAIGN_ADMIN_ROLES,
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function normalizeViewId(value: string): string {
  const candidate = value.trim().toLowerCase()

  if (!UUID_PATTERN.test(candidate)) {
    throw new AuthzError(400, "saved_view_id_invalid", "That view id is not valid.")
  }

  return candidate
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    throw new AuthzError(400, "saved_view_body_invalid", "A JSON object body is required.")
  }

  const body = asRecord(payload)

  if (!body) {
    throw new AuthzError(400, "saved_view_body_invalid", "A JSON object body is required.")
  }

  return body
}

export async function handleSavedViewsList(surface: SavedViewSurface): Promise<Response> {
  try {
    const staff = await getStaffContext()
    requireRole(staff, SURFACE_ROLES[surface])

    return Response.json({
      views: await loadSavedViews(staff, surface),
      lastViewId: await loadLastSavedView(staff, surface),
    })
  } catch (error) {
    return authzErrorResponse(error)
  }
}

export async function handleSavedViewCreate(
  request: Request,
  surface: SavedViewSurface,
): Promise<Response> {
  try {
    const staff = await getStaffContext()
    requireRole(staff, SURFACE_ROLES[surface])
    const body = await readBody(request)
    const name = typeof body.name === "string" ? body.name.trim() : ""

    if (name.length > 80) {
      throw new AuthzError(400, "saved_view_name_invalid", "A view name needs 1 to 80 characters.")
    }

    // The table's check constraint is the real guard; this is the answer a
    // client gets when it asks for a type this build cannot render, instead of
    // a 500 from Postgres.
    if (body.viewType !== undefined && !isSavedViewType(body.viewType)) {
      throw new AuthzError(400, "saved_view_type_invalid", "That view type cannot be created.")
    }

    const view = await createSavedView({
      staff,
      surface,
      name: name.length > 0 ? name : "Grid",
      config: normalizeGridViewConfig(body.config),
      // Personal unless asked otherwise: two people keeping their own view is
      // the point, and a shared view is a deliberate choice.
      visibility: isSavedViewVisibility(body.visibility) ? body.visibility : "personal",
    })

    return Response.json({ view }, { status: 201 })
  } catch (error) {
    return authzErrorResponse(error)
  }
}

export async function handleSavedViewUpdate(
  request: Request,
  viewId: string,
  surface: SavedViewSurface,
): Promise<Response> {
  try {
    const staff = await getStaffContext()
    requireRole(staff, SURFACE_ROLES[surface])
    const body = await readBody(request)

    const view = await updateSavedView({
      staff,
      surface,
      viewId: normalizeViewId(viewId),
      name: typeof body.name === "string" ? body.name : undefined,
      config: body.config === undefined ? undefined : normalizeGridViewConfig(body.config),
    })

    return Response.json({ view })
  } catch (error) {
    return authzErrorResponse(error)
  }
}

/**
 * Remembers the view this person is opening.
 *
 * The source product does the same with `view/{id}/setAsLastUsed`; it is a
 * per-account write, which is why it lives on the server rather than in a
 * browser cache.
 */
export async function handleSavedViewUse(
  viewId: string,
  surface: SavedViewSurface,
): Promise<Response> {
  try {
    const staff = await getStaffContext()
    requireRole(staff, SURFACE_ROLES[surface])

    await setLastSavedView(staff, surface, normalizeViewId(viewId))

    return new Response(null, { status: 204 })
  } catch (error) {
    return authzErrorResponse(error)
  }
}

export async function handleSavedViewDelete(
  viewId: string,
  surface: SavedViewSurface,
): Promise<Response> {
  try {
    const staff = await getStaffContext()
    requireRole(staff, SURFACE_ROLES[surface])

    await deleteSavedView({ staff, surface, viewId: normalizeViewId(viewId) })

    return new Response(null, { status: 204 })
  } catch (error) {
    return authzErrorResponse(error)
  }
}
