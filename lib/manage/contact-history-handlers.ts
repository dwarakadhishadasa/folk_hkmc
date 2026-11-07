import "server-only"

import { authzErrorResponse, getStaffContext, requireRole } from "@/lib/authz"
import { MANAGE_CONTACT_WRITE_ROLES } from "@/lib/staff-roles"
import { loadManageContactHistory } from "@/lib/supabase/manage"

/**
 * The record view's history endpoint.
 *
 * Attendance and campaign history are read on demand — one contact at a time —
 * because the contacts payload is every row in the view and neither list is
 * needed until an operator opens a record. The role gate matches the grid's;
 * the scope check and RLS decide which contact and which rows are visible.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function handleContactHistory(request: Request): Promise<Response> {
  try {
    const staff = await getStaffContext()
    requireRole(staff, MANAGE_CONTACT_WRITE_ROLES)

    const value = new URL(request.url).searchParams.get("contactId")
    const contactId = typeof value === "string" ? value.trim().toLowerCase() : ""

    if (!UUID_PATTERN.test(contactId)) {
      return Response.json({ error: "contactId must be a UUID." }, { status: 400 })
    }

    const history = await loadManageContactHistory({ staff, contactId })

    return Response.json(history)
  } catch (error) {
    return authzErrorResponse(error)
  }
}
