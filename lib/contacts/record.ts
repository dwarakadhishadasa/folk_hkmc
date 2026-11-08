import "server-only"

import type { ContactRecordPayload } from "@/components/contacts/contact-record-types"
import { KNOWN_SOURCE_VALUES } from "@/components/manage/manage-contact-fields"
import type { ManageContactCommentList } from "@/components/manage/manage-comment-types"
import { contactInPatch, locationInPatch } from "@/lib/patch-scope"
import type { StaffContext } from "@/lib/authz"
import { listManageContactComments } from "@/lib/supabase/contact-comments"
import {
  loadManageContactHistory,
  loadManageContactRecordRow,
  loadProgramLocations,
  loadStaffDisplayNames,
} from "@/lib/supabase/manage"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * The one full-record read model.
 *
 * A record is one contact, its rollups, its history, its comments when the
 * caller may comment, and the reference data its pickers need. It deliberately
 * does **not** call `loadContactsSectionData` or `loadManagePortalData`, and it
 * never reads the full contact set: the row and rollups are one contact, and the
 * books picker is a scoped distinct read of one column through the RLS client.
 *
 * Authorization happens before any of the reads: `loadManageContactRecordRow`
 * reads the full row through the RLS client, so the contact scope is the
 * boundary rather than a page-built filter.
 */
export async function loadContactRecord(params: {
  staff: StaffContext
  contactId: string
}): Promise<ContactRecordPayload> {
  const { staff, contactId } = params

  const contact = await loadManageContactRecordRow({ staff, contactId })

  const owner = staff.patchOwner
  const ownerId = owner?.userId ?? null
  const ownerLocationIds = owner?.locationIds ?? []
  const canComment = contactInPatch(contact.assignedPreacherId, ownerId)

  const referencedStaffIds = [contact.assignedPreacherId, contact.collectedById].filter(
    (userId): userId is string => Boolean(userId),
  )

  const [locations, staffNames, history, comments, scopedBooks] = await Promise.all([
    loadProgramLocations(staff.programId),
    loadStaffDisplayNames(staff.programId, referencedStaffIds),
    loadManageContactHistory({ staff, contactId }),
    // The comments read is conditional: an Admin may edit a programme contact
    // outside their patch but cannot comment on it, and a read that ran anyway
    // would either 403 the whole record or expose comments it must not.
    canComment
      ? listManageContactComments({ staff, contactId })
      : Promise.resolve<ManageContactCommentList | null>(null),
    loadScopedBooksReadOptions(staff),
  ])

  const sourceOptions = [
    ...new Set([...KNOWN_SOURCE_VALUES, ...(contact.source ? [contact.source] : [])]),
  ]

  // The record's own values are always options, even if the scoped distinct read
  // somehow missed one; the union is the picker's contract.
  const booksReadOptions = [...new Set([...scopedBooks, ...contact.booksRead])].sort((left, right) =>
    left.localeCompare(right),
  )

  return {
    contact,
    locations,
    locationOptions: locations.filter((location) => locationInPatch(location.id, ownerLocationIds)),
    staffNames,
    sourceOptions,
    booksReadOptions,
    history,
    comments,
    capabilities: {
      // Every record the gateway produces is a manage-context record. The
      // out-of-scope session summary is a different, read-only component.
      canEdit: true,
      canComment,
    },
  }
}

const AVAILABILITY_CHUNK_SIZE = 200

/**
 * The books the record's picker offers: every value present in the reader's
 * scoped contacts.
 *
 * A scoped distinct read, not a contact read: it selects one array column
 * through the RLS client, so it can only return values from contacts the caller
 * may already see. The record's own books are necessarily in the set because
 * the record row itself came through the same client.
 */
async function loadScopedBooksReadOptions(staff: StaffContext): Promise<string[]> {
  const supabase = await createSupabaseServerClient()
  const options = new Set<string>()
  const pageSize = 1000

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("contacts")
      .select("books_read")
      .eq("program_id", staff.programId)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) {
      throw error
    }

    const rows = (data ?? []) as Array<{ books_read: string[] | null }>

    for (const row of rows) {
      for (const book of row.books_read ?? []) {
        if (book) {
          options.add(book)
        }
      }
    }

    if (rows.length < pageSize) {
      break
    }
  }

  return [...options].sort((left, right) => left.localeCompare(right))
}

/**
 * The contacts among `contactIds` the caller may read, for deciding whether a
 * surface should render an inline record trigger.
 *
 * This is the **only** availability read. It uses the RLS client, never the
 * service role: the question is exactly "would the record gateway authorize
 * this contact", and answering it through the same client is what keeps the
 * trigger and the gateway from disagreeing. A contact outside the returned set
 * keeps the surface's existing fallback — the session summary, or plain text.
 */
export async function loadContactRecordAvailability(params: {
  staff: StaffContext
  contactIds: readonly string[]
}): Promise<Set<string>> {
  const { staff } = params
  const unique = [...new Set(params.contactIds.filter(Boolean))]

  if (unique.length === 0) {
    return new Set()
  }

  const supabase = await createSupabaseServerClient()
  const available = new Set<string>()

  for (let offset = 0; offset < unique.length; offset += AVAILABILITY_CHUNK_SIZE) {
    const chunk = unique.slice(offset, offset + AVAILABILITY_CHUNK_SIZE)
    const { data, error } = await supabase
      .from("contacts")
      .select("id")
      .eq("program_id", staff.programId)
      .in("id", chunk)

    if (error) {
      throw error
    }

    for (const row of (data ?? []) as Array<{ id: string }>) {
      available.add(row.id)
    }
  }

  return available
}
