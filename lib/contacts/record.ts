import "server-only"

import type { ContactRecordPayload } from "@/components/contacts/contact-record-types"
import { KNOWN_SOURCE_VALUES } from "@/components/manage/manage-contact-fields"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { contactInPatch, locationInPatch } from "@/lib/patch-scope"
import type { StaffContext } from "@/lib/authz"
import type { ManageContact } from "@/components/manage/manage-types"
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
 * A record is one contact, its rollups, its history, and the reference data its
 * pickers need. Comments are **not** part of this read: they are the slowest
 * section and are fetched by the record pane after the fields have rendered.
 * It deliberately does **not** call `loadContactsSectionData` or
 * `loadManagePortalData`, and it never reads the full contact set.
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

  const contact = await withSignedAttachmentUrls(
    await loadManageContactRecordRow({ staff, contactId }),
  )

  const owner = staff.patchOwner
  const ownerId = owner?.userId ?? null
  const ownerLocationIds = owner?.locationIds ?? []
  const canComment = contactInPatch(contact.assignedPreacherId, ownerId)

  const referencedStaffIds = [contact.assignedPreacherId, contact.collectedById].filter(
    (userId): userId is string => Boolean(userId),
  )

  const [locations, staffNames, history, scopedBooks] = await Promise.all([
    loadProgramLocations(staff.programId),
    loadStaffDisplayNames(staff.programId, referencedStaffIds),
    loadManageContactHistory({ staff, contactId }),
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
    // The record frame fetches the comment list after these fields render; a
    // reader who cannot comment never asks for it.
    comments: null,
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

const ATTACHMENT_BUCKET = "gita-life-payment-screenshots"
const ATTACHMENT_URL_TTL_SECONDS = 60 * 60

/**
 * Mint a short-lived URL for each contact attachment.
 *
 * The bucket is private, so the record's reader cannot build a URL itself. The
 * contact row has already been read through the RLS client by the caller, so
 * signing here cannot widen the record's scope; a signing failure degrades to
 * "Unavailable" on that row rather than failing the whole record.
 */
async function withSignedAttachmentUrls(contact: ManageContact): Promise<ManageContact> {
  const attachments = contact.attachments ?? []
  if (attachments.length === 0) {
    return contact
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrls(
      attachments.map((attachment) => attachment.path),
      ATTACHMENT_URL_TTL_SECONDS,
    )

  if (error) {
    console.error("[contacts] unable to sign attachment urls", error)
    return contact
  }

  const signedByPath = new Map(
    (data ?? []).map((entry) => [entry.path, entry.signedUrl] as const),
  )

  return {
    ...contact,
    attachments: attachments.map((attachment) => ({
      ...attachment,
      url: signedByPath.get(attachment.path) ?? null,
    })),
  }
}
