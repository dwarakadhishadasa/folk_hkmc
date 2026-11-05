import "server-only"

import { normalizeGridViewConfig } from "@/components/grid/grid-view-config"
import {
  isContactViewType,
  isContactViewVisibility,
} from "@/components/manage/manage-view-types"
import { MANAGE_CONTACT_WRITE_ROLES, OPERATIONAL_ROLES } from "@/lib/staff-roles"
import { authzErrorResponse, AuthzError, getStaffContext, requireRole } from "@/lib/authz"
import {
  createContactView,
  deleteContactView,
  loadContactViews,
  setLastContactView,
  updateContactView,
} from "@/lib/supabase/contact-views"

/**
 * The saved-views API for the contacts grid.
 *
 * Reads are open to every operational role that can open the grid. Writes use
 * the contact-write gate: saving a view does not change a record, but it does
 * change the surface everyone else works in, and a role that may not edit a
 * contact has no business reshaping the table it appears in.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function normalizeViewId(value: string): string {
  const candidate = value.trim().toLowerCase()

  if (!UUID_PATTERN.test(candidate)) {
    throw new AuthzError(400, "contact_view_id_invalid", "That view id is not valid.")
  }

  return candidate
}

export async function handleManageViewsList(): Promise<Response> {
  try {
    const staff = await getStaffContext()
    requireRole(staff, OPERATIONAL_ROLES)

    return Response.json({ views: await loadContactViews(staff) })
  } catch (error) {
    return authzErrorResponse(error)
  }
}

export async function handleManageViewCreate(request: Request): Promise<Response> {
  try {
    const staff = await getStaffContext()
    requireRole(staff, MANAGE_CONTACT_WRITE_ROLES)

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      throw new AuthzError(400, "contact_view_body_invalid", "A JSON object body is required.")
    }

    const body = asRecord(payload)

    if (!body) {
      throw new AuthzError(400, "contact_view_body_invalid", "A JSON object body is required.")
    }

    const name = typeof body.name === "string" ? body.name.trim() : ""

    if (name.length > 80) {
      throw new AuthzError(400, "contact_view_name_invalid", "A view name needs 1 to 80 characters.")
    }

    // The table's check constraint is the real guard; this is the answer a
    // client gets when it asks for a type this build cannot render, instead of
    // a 500 from Postgres.
    if (body.viewType !== undefined && !isContactViewType(body.viewType)) {
      throw new AuthzError(400, "contact_view_type_invalid", "That view type cannot be created.")
    }

    const view = await createContactView({
      staff,
      name: name.length > 0 ? name : "Grid",
      config: normalizeGridViewConfig(body.config),
      // Personal unless asked otherwise: two people keeping their own view is
      // the point, and a shared view is a deliberate choice.
      visibility: isContactViewVisibility(body.visibility) ? body.visibility : "personal",
    })

    return Response.json({ view }, { status: 201 })
  } catch (error) {
    return authzErrorResponse(error)
  }
}

export async function handleManageViewUpdate(
  request: Request,
  viewId: string,
): Promise<Response> {
  try {
    const staff = await getStaffContext()
    requireRole(staff, MANAGE_CONTACT_WRITE_ROLES)

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      throw new AuthzError(400, "contact_view_body_invalid", "A JSON object body is required.")
    }

    const body = asRecord(payload)

    if (!body) {
      throw new AuthzError(400, "contact_view_body_invalid", "A JSON object body is required.")
    }

    const view = await updateContactView({
      staff,
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
export async function handleManageViewUse(viewId: string): Promise<Response> {
  try {
    const staff = await getStaffContext()
    requireRole(staff, OPERATIONAL_ROLES)

    await setLastContactView(staff, normalizeViewId(viewId))

    return new Response(null, { status: 204 })
  } catch (error) {
    return authzErrorResponse(error)
  }
}

export async function handleManageViewDelete(viewId: string): Promise<Response> {
  try {
    const staff = await getStaffContext()
    requireRole(staff, MANAGE_CONTACT_WRITE_ROLES)

    await deleteContactView({ staff, viewId: normalizeViewId(viewId) })

    return new Response(null, { status: 204 })
  } catch (error) {
    return authzErrorResponse(error)
  }
}
