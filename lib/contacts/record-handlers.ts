import "server-only"

import { loadContactRecord } from "@/lib/contacts/record"
import { authzErrorResponse, getStaffContext, requireRole } from "@/lib/authz"
import { MANAGE_CONTACT_WRITE_ROLES } from "@/lib/staff-roles"

/**
 * The only full-record HTTP surface.
 *
 * One route in both apps, one authorization decision: the staff context, the
 * manage write-role set, and the contact RLS boundary inside
 * `loadContactRecord`. A malformed id is a `400` before any read, and an
 * out-of-scope or unknown contact keeps the project's existing `403`/`404`
 * distinction through `authzErrorResponse`.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function handleContactRecord(
  _request: Request,
  contactId: string,
): Promise<Response> {
  try {
    const staff = await getStaffContext()
    requireRole(staff, MANAGE_CONTACT_WRITE_ROLES)

    const normalized = contactId.trim().toLowerCase()

    if (!UUID_PATTERN.test(normalized)) {
      return Response.json(
        { error: "contactId must be a UUID." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      )
    }

    const payload = await loadContactRecord({ staff, contactId: normalized })

    return Response.json(payload, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    const response = authzErrorResponse(error)
    response.headers.set("Cache-Control", "no-store")
    return response
  }
}
