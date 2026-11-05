import "server-only"

import { AuthzError, type StaffContext } from "@/lib/authz"
import { contactInPatch } from "@/lib/patch-scope"
import { assertManageContactInScope } from "@/lib/supabase/manage"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

/**
 * Manual row order for the contacts grid.
 *
 * A drop sends **its neighbours**, not a list: the client says "place this
 * contact between `beforeId` and `afterId`", and this writes the midpoint of
 * their `sort_order`. One row moves, so a reorder costs one UPDATE rather than
 * renumbering every row beneath it, and two operators dragging different rows
 * at the same time cannot renumber each other's work away.
 *
 * Neighbours are resolved inside the caller's patch, so a crafted request
 * cannot read another patch's positions through the ordering it asks for.
 */
export async function moveManageContact(params: {
  staff: StaffContext
  contactId: string
  beforeId: string | null
  afterId: string | null
}): Promise<void> {
  const { staff, contactId, beforeId, afterId } = params

  const contact = await assertManageContactInScope(staff, contactId)
  const ownerId = staff.patchOwner?.userId ?? null

  if (!contactInPatch(contact.assigned_preacher_id, ownerId)) {
    throw new AuthzError(403, "manage_contact_out_of_patch", "That record is outside your patch.")
  }

  if (beforeId === null && afterId === null) {
    // A single-row view has no neighbour to sit between; nothing to write.
    return
  }

  const neighbours = [beforeId, afterId].filter((id): id is string => id !== null)

  if (neighbours.includes(contactId)) {
    throw new AuthzError(400, "manage_contact_order_invalid", "A record cannot be its own neighbour.")
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("contacts")
    .select("id, sort_order, assigned_preacher_id")
    .eq("program_id", staff.programId)
    .in("id", neighbours)

  if (error) {
    throw new AuthzError(500, "manage_contact_order_read_failed", "Unable to read the neighbours.")
  }

  const rows = (data ?? []) as Array<{
    id: string
    sort_order: number | null
    assigned_preacher_id: string | null
  }>

  if (rows.length !== neighbours.length) {
    throw new AuthzError(400, "manage_contact_order_invalid", "That neighbour is not in this programme.")
  }

  for (const row of rows) {
    if (!contactInPatch(row.assigned_preacher_id, ownerId)) {
      throw new AuthzError(403, "manage_contact_out_of_patch", "That neighbour is outside your patch.")
    }
  }

  const byId = new Map(rows.map((row) => [row.id, row.sort_order]))
  const before = beforeId ? (byId.get(beforeId) ?? null) : null
  const after = afterId ? (byId.get(afterId) ?? null) : null

  let next: number

  if (before !== null && after !== null) {
    next = (before + after) / 2
  } else if (before !== null) {
    // Dropped at the end: one below the last row.
    next = before + 1
  } else if (after !== null) {
    // Dropped at the top: one above the first row.
    next = after - 1
  } else {
    // Both neighbours exist but neither has a position yet. They sort by `id`
    // today, so seating the dragged row at 0 keeps it at the top rather than
    // guessing at a value between two unknowns.
    next = 0
  }

  const { error: writeError } = await supabaseAdmin
    .from("contacts")
    .update({ sort_order: next })
    .eq("id", contactId)
    .eq("program_id", staff.programId)

  if (writeError) {
    throw new AuthzError(500, "manage_contact_order_write_failed", "Unable to save the new order.")
  }
}
