/**
 * The contact fields the contact surface shows.
 *
 * Two surfaces read the same contact now: the contacts grid, which is a
 * spreadsheet of columns, and the contact surface, which is the mobile-style
 * stack the Airtable interface uses — a list, a field sheet, and an expanded
 * record. They have to agree on which field is which, what it is called, and
 * which patch key a write to it carries, or the same field would be one column
 * in one surface and something else in the other.
 *
 * The ids are the grid's **column ids**, not ids invented here. A second
 * vocabulary would need a translation between the two, and a translation is
 * where "this field cannot be edited here" comes from.
 */

import type { ManageContact, ManageContactPatchKey } from "@/components/manage/manage-types"

/**
 * What a `location_ids` reference that resolves to nothing renders as.
 *
 * The id is never printed: a raw UUID in a cell tells an operator nothing they
 * can act on, and it is a personal identifier in a place that does not need to
 * be one.
 */
export const UNRESOLVED_LOCATION = "Unknown location"

/**
 * What a `collected_by_id` reference that resolves to nothing renders as.
 *
 * The same reasoning as the location marker, in the other direction: an
 * absent `collectedById` is a contact nobody collected, and a dangling one is
 * a contact whose collector is not on this staff list. Collapsing the two
 * into an empty string would make them indistinguishable.
 */
export const UNRESOLVED_STAFF = "Unknown staff member"

/** The contact fields the surface shows, keyed by what they mean. */
export const CONTACT_FIELD_IDS = {
  name: "name",
  phone: "phone",
  location: "location",
  notes: "notes",
  initialContact: "initialContact",
  totalAttendance: "totalAttendanceCount",
  past60DayAttendance: "past60DayAttendanceCount",
  collectedBy: "collectedBy",
  favorite: "favorite",
} as const

/** One of the surface's field ids. */
export type ContactFieldId = (typeof CONTACT_FIELD_IDS)[keyof typeof CONTACT_FIELD_IDS]

/**
 * What each field is called in the surface.
 *
 * The two attendance fields are the exception to the grid's own column
 * headers, and deliberately so: the Airtable interface named them "Total
 * Sessions Attended" and "Last 2 months sessions attended", and a record that
 * says one thing beside a grid that says another reads as two different
 * facts. "Total attendance" and "Past 60 day attendance" keep the Airtable
 * wording's meaning without borrowing its vocabulary, because this app's own
 * attendance rollups are named after the window they count.
 */
export const CONTACT_FIELD_LABEL: Record<ContactFieldId, string> = {
  [CONTACT_FIELD_IDS.name]: "Name",
  [CONTACT_FIELD_IDS.phone]: "Phone",
  [CONTACT_FIELD_IDS.location]: "Location",
  [CONTACT_FIELD_IDS.notes]: "Notes",
  [CONTACT_FIELD_IDS.initialContact]: "Initial Contact",
  [CONTACT_FIELD_IDS.totalAttendance]: "Total attendance",
  [CONTACT_FIELD_IDS.past60DayAttendance]: "Past 60 day attendance",
  [CONTACT_FIELD_IDS.collectedBy]: "Collected By",
  [CONTACT_FIELD_IDS.favorite]: "Favorite",
}

/**
 * The order the expanded record shows its fields in.
 *
 * The writable fields come first, then the ones that are facts about the
 * contact rather than things an operator types. The Airtable record view put
 * the attendance counts directly under the phone number; this keeps them with
 * the other read-only facts instead, because the counts summarise the record
 * rather than belong to it.
 */
export const CONTACT_FIELD_ORDER: readonly ContactFieldId[] = [
  CONTACT_FIELD_IDS.name,
  CONTACT_FIELD_IDS.phone,
  CONTACT_FIELD_IDS.location,
  CONTACT_FIELD_IDS.notes,
  CONTACT_FIELD_IDS.initialContact,
  CONTACT_FIELD_IDS.totalAttendance,
  CONTACT_FIELD_IDS.past60DayAttendance,
  CONTACT_FIELD_IDS.collectedBy,
  CONTACT_FIELD_IDS.favorite,
]

/**
 * The patch key each writable field writes, and `null` for the fields that
 * cannot be written.
 *
 * `location` is the one whose two names differ: the column is `location` and
 * the wire key is `locationIds`, because a contact belongs to at most one
 * location and the column stores the set.
 *
 * The attendance counts, `Initial Contact` and `Collected By` are `null`
 * because nothing in this app writes them. The counts are rollups the server
 * resolves; `Initial Contact` is set when the contact is created; and
 * `Collected By` is the staff member who collected the contact. `favorite` is
 * `null` here too, because the star toggles through its own write — the
 * server's key is `isFavorite`, which is not the column's name, and a
 * favourite is a toggle rather than a typed value.
 */
export const CONTACT_FIELD_PATCH_KEY: Record<ContactFieldId, ManageContactPatchKey | null> = {
  [CONTACT_FIELD_IDS.name]: "name",
  [CONTACT_FIELD_IDS.phone]: "phone",
  [CONTACT_FIELD_IDS.location]: "locationIds",
  [CONTACT_FIELD_IDS.notes]: "notes",
  [CONTACT_FIELD_IDS.initialContact]: null,
  [CONTACT_FIELD_IDS.totalAttendance]: null,
  [CONTACT_FIELD_IDS.past60DayAttendance]: null,
  [CONTACT_FIELD_IDS.collectedBy]: null,
  [CONTACT_FIELD_IDS.favorite]: null,
}

/** True when the surface may write this field. */
export function isContactFieldEditable(id: ContactFieldId): boolean {
  return CONTACT_FIELD_PATCH_KEY[id] !== null
}

/**
 * A field's raw value on a contact.
 *
 * `location` is the array the column stores and `favorite` is the boolean the
 * star toggles: the editor writes what the column holds, and the sheet and
 * the record view read it back the same way.
 */
const CONTACT_FIELD_READER: Record<ContactFieldId, (contact: ManageContact) => unknown> = {
  [CONTACT_FIELD_IDS.name]: (contact) => contact.name,
  [CONTACT_FIELD_IDS.phone]: (contact) => contact.phone,
  [CONTACT_FIELD_IDS.location]: (contact) => contact.locationIds,
  [CONTACT_FIELD_IDS.notes]: (contact) => contact.notes,
  [CONTACT_FIELD_IDS.initialContact]: (contact) => contact.initialContact,
  [CONTACT_FIELD_IDS.totalAttendance]: (contact) => contact.totalAttendanceCount,
  [CONTACT_FIELD_IDS.past60DayAttendance]: (contact) => contact.past60DayAttendanceCount,
  [CONTACT_FIELD_IDS.collectedBy]: (contact) => contact.collectedById,
  [CONTACT_FIELD_IDS.favorite]: (contact) => contact.isFavorite,
}

/** A field's raw value on a contact. */
export function contactFieldValue(contact: ManageContact, id: ContactFieldId): unknown {
  return CONTACT_FIELD_READER[id](contact)
}

/**
 * The names the two reference fields resolve against.
 *
 * A contact's location is a `location_ids` entry and its collector is a
 * `collected_by_id`; both point at ids this program owns, and both are
 * resolved by the caller because the caller is the one that knows the
 * program's scoped lists.
 */
export interface ContactFieldResolvers {
  locationNameById: ReadonlyMap<string, string>
  staffNameById: ReadonlyMap<string, string>
}

/**
 * A field's value as text.
 *
 * `location` and `Collected By` are references, so the text is the name the
 * reference resolves to — or the unresolved marker when it resolves to
 * nothing. The counts are numbers, and the favourite is a word rather than a
 * glyph: a star is a picture, and the record's job is to be readable.
 */
export function contactFieldText(
  contact: ManageContact,
  id: ContactFieldId,
  resolvers: ContactFieldResolvers,
): string {
  switch (id) {
    case CONTACT_FIELD_IDS.name:
      return contact.name
    case CONTACT_FIELD_IDS.phone:
      return contact.phone
    case CONTACT_FIELD_IDS.location: {
      const names = contact.locationIds
        .map((id) => resolvers.locationNameById.get(id) ?? UNRESOLVED_LOCATION)
        .join(", ")

      return names
    }
    case CONTACT_FIELD_IDS.notes:
      return contact.notes ?? ""
    case CONTACT_FIELD_IDS.initialContact:
      return contact.initialContact ?? ""
    case CONTACT_FIELD_IDS.totalAttendance:
      return String(contact.totalAttendanceCount)
    case CONTACT_FIELD_IDS.past60DayAttendance:
      return String(contact.past60DayAttendanceCount)
    case CONTACT_FIELD_IDS.collectedBy: {
      if (!contact.collectedById) {
        return ""
      }

      return resolvers.staffNameById.get(contact.collectedById) ?? UNRESOLVED_STAFF
    }
    case CONTACT_FIELD_IDS.favorite:
      return contact.isFavorite ? "Yes" : "No"
  }
}
