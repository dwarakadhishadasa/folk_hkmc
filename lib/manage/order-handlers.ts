import "server-only"

import { authzErrorResponse, getStaffContext, requireRole } from "@/lib/authz"
import { MANAGE_CONTACT_WRITE_ROLES } from "@/lib/staff-roles"
import { moveManageContact } from "@/lib/supabase/contact-order"

/**
 * Row reordering for the contacts grid.
 *
 * The role gate is the contact-write gate, not a new one: moving a row changes
 * the same table an inline edit does, and a role that may not edit a contact
 * has no business reshuffling the list it appears in.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

class OrderBadRequest extends Error {
  status = 400
}

function badRequestResponse(error: unknown): Response | null {
  if (error instanceof OrderBadRequest) {
    return Response.json({ error: error.message }, { status: error.status })
  }

  return null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function normalizeUuid(value: unknown): string | null {
  const candidate = typeof value === "string" ? value.trim().toLowerCase() : ""
  return UUID_PATTERN.test(candidate) ? candidate : null
}

export async function handleManageContactReorder(request: Request): Promise<Response> {
  try {
    const staff = await getStaffContext()
    requireRole(staff, MANAGE_CONTACT_WRITE_ROLES)

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      throw new OrderBadRequest("A JSON object body is required.")
    }

    const record = asRecord(payload)
    const contactId = normalizeUuid(record?.contactId)

    if (!contactId) {
      throw new OrderBadRequest("contactId must be a UUID.")
    }

    const beforeId = record?.beforeId === null ? null : normalizeUuid(record?.beforeId)
    const afterId = record?.afterId === null ? null : normalizeUuid(record?.afterId)

    if (record?.beforeId !== undefined && record?.beforeId !== null && !beforeId) {
      throw new OrderBadRequest("beforeId must be a UUID or null.")
    }

    if (record?.afterId !== undefined && record?.afterId !== null && !afterId) {
      throw new OrderBadRequest("afterId must be a UUID or null.")
    }

    await moveManageContact({ staff, contactId, beforeId, afterId })

    return new Response(null, { status: 204 })
  } catch (error) {
    return badRequestResponse(error) ?? authzErrorResponse(error)
  }
}
