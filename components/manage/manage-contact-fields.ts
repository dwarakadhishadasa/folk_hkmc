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

/**
 * The `source` values the local fixtures write, verbatim.
 *
 * A `select` editor rejects a value that is not one of its options, so the
 * option list has to be a superset of what the rows actually hold or every
 * existing row renders as "not an option" and a no-op commit is refused.
 * `scripts/seed-preview-fixtures.mjs` writes the first and
 * `scripts/bulk-contact-fixtures.mjs` writes the second; the record gateway and
 * the grid union these with whatever their own rows carry so a hand-written row
 * is covered too.
 *
 * The catalog's "Pass Distribution" / "Public Registration" / "Old" were
 * Airtable-era values: no migration, seeder or fixture in this repository writes
 * them, and offering them would put three dead options in front of every
 * operator. Verified against the running local stack at the premium-record
 * story's baseline: `preview-fixture` on 4 rows and `preview-fixture-bulk` on
 * 250, and nothing else.
 */
export const KNOWN_SOURCE_VALUES = ["preview-fixture", "preview-fixture-bulk"] as const

/** The contact fields the surface shows, keyed by what they mean. */
export const CONTACT_FIELD_IDS = {
  name: "name",
  phone: "phone",
  age: "age",
  college: "college",
  company: "company",
  designation: "designation",
  year: "year",
  address: "address",
  location: "location",
  source: "source",
  rounds: "rounds",
  booksRead: "booksRead",
  initialContact: "initialContact",
  dateOfBirth: "dateOfBirth",
  totalAttendance: "totalAttendanceCount",
  past60DayAttendance: "past60DayAttendanceCount",
  lastContactedOn: "lastContactedOn",
  notes: "notes",
  collectedBy: "collectedBy",
  assignedPreacher: "assignedPreacher",
  favorite: "favorite",
  photo: "photo",
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
  [CONTACT_FIELD_IDS.age]: "Age",
  [CONTACT_FIELD_IDS.college]: "College",
  [CONTACT_FIELD_IDS.company]: "Company",
  [CONTACT_FIELD_IDS.designation]: "Designation",
  [CONTACT_FIELD_IDS.year]: "Year",
  [CONTACT_FIELD_IDS.address]: "Address",
  [CONTACT_FIELD_IDS.location]: "Location",
  [CONTACT_FIELD_IDS.source]: "Source",
  [CONTACT_FIELD_IDS.rounds]: "Rounds",
  [CONTACT_FIELD_IDS.booksRead]: "Books Read",
  [CONTACT_FIELD_IDS.initialContact]: "Initial Contact",
  [CONTACT_FIELD_IDS.dateOfBirth]: "Date of Birth",
  [CONTACT_FIELD_IDS.totalAttendance]: "Total attendance",
  [CONTACT_FIELD_IDS.past60DayAttendance]: "Past 60 day attendance",
  [CONTACT_FIELD_IDS.lastContactedOn]: "Last Contacted On",
  [CONTACT_FIELD_IDS.notes]: "Notes",
  [CONTACT_FIELD_IDS.collectedBy]: "Collected By",
  [CONTACT_FIELD_IDS.assignedPreacher]: "Assigned Preacher",
  [CONTACT_FIELD_IDS.favorite]: "Favorite",
  [CONTACT_FIELD_IDS.photo]: "Photo",
}

/**
 * The order the expanded record shows its fields in.
 *
 * The record view is the whole contact, so this is the grid's column order
 * with the fields the grid does not have columns for (`Age`, `College`,
 * `Company`, `Designation`, `Year`, `Address`, `Assigned Preacher`, `Photo`)
 * slotted beside their nearest relation. Nothing is hidden: every column the
 * contact row carries is a field an operator can read here.
 */
export const CONTACT_FIELD_ORDER: readonly ContactFieldId[] = [
  CONTACT_FIELD_IDS.name,
  CONTACT_FIELD_IDS.phone,
  CONTACT_FIELD_IDS.age,
  CONTACT_FIELD_IDS.college,
  CONTACT_FIELD_IDS.company,
  CONTACT_FIELD_IDS.designation,
  CONTACT_FIELD_IDS.year,
  CONTACT_FIELD_IDS.location,
  CONTACT_FIELD_IDS.address,
  CONTACT_FIELD_IDS.source,
  CONTACT_FIELD_IDS.rounds,
  CONTACT_FIELD_IDS.booksRead,
  CONTACT_FIELD_IDS.initialContact,
  CONTACT_FIELD_IDS.dateOfBirth,
  CONTACT_FIELD_IDS.totalAttendance,
  CONTACT_FIELD_IDS.past60DayAttendance,
  CONTACT_FIELD_IDS.lastContactedOn,
  CONTACT_FIELD_IDS.notes,
  CONTACT_FIELD_IDS.collectedBy,
  CONTACT_FIELD_IDS.assignedPreacher,
  CONTACT_FIELD_IDS.favorite,
  CONTACT_FIELD_IDS.photo,
]

/**
 * The patch key each writable field writes, and `null` for the fields that
 * cannot be written.
 *
 * `location` is the one whose two names differ: the column is `location` and
 * the wire key is `locationIds`, because a contact belongs to at most one
 * location and the column stores the set.
 *
 * The attendance counts, `Last Contacted On`, `Collected By`, `Assigned
 * Preacher` and `Photo` are `null` because nothing in this app writes them.
 * The counts are rollups the server resolves; `Last Contacted On` is derived
 * from attendance; `Collected By` is the staff member who collected the
 * contact; `Assigned Preacher` is set from the campaign/assignment surface; and
 * a photo is uploaded through its own endpoint. `favorite` is `null` here too,
 * because the star toggles through its own write — the server's key is
 * `isFavorite`, which is not the column's name, and a favourite is a toggle
 * rather than a typed value.
 */
export const CONTACT_FIELD_PATCH_KEY: Record<ContactFieldId, ManageContactPatchKey | null> = {
  [CONTACT_FIELD_IDS.name]: "name",
  [CONTACT_FIELD_IDS.phone]: "phone",
  [CONTACT_FIELD_IDS.age]: null,
  [CONTACT_FIELD_IDS.college]: "college",
  [CONTACT_FIELD_IDS.company]: "company",
  [CONTACT_FIELD_IDS.designation]: null,
  [CONTACT_FIELD_IDS.year]: null,
  [CONTACT_FIELD_IDS.address]: null,
  [CONTACT_FIELD_IDS.location]: "locationIds",
  [CONTACT_FIELD_IDS.source]: "source",
  [CONTACT_FIELD_IDS.rounds]: "rounds",
  [CONTACT_FIELD_IDS.booksRead]: "booksRead",
  [CONTACT_FIELD_IDS.initialContact]: "initialContact",
  [CONTACT_FIELD_IDS.dateOfBirth]: "dateOfBirth",
  [CONTACT_FIELD_IDS.totalAttendance]: null,
  [CONTACT_FIELD_IDS.past60DayAttendance]: null,
  [CONTACT_FIELD_IDS.lastContactedOn]: null,
  [CONTACT_FIELD_IDS.notes]: "notes",
  [CONTACT_FIELD_IDS.collectedBy]: null,
  [CONTACT_FIELD_IDS.assignedPreacher]: null,
  [CONTACT_FIELD_IDS.favorite]: null,
  [CONTACT_FIELD_IDS.photo]: null,
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
  [CONTACT_FIELD_IDS.age]: (contact) => contact.age,
  [CONTACT_FIELD_IDS.college]: (contact) => contact.college,
  [CONTACT_FIELD_IDS.company]: (contact) => contact.company,
  [CONTACT_FIELD_IDS.designation]: (contact) => contact.designation,
  [CONTACT_FIELD_IDS.year]: (contact) => contact.year,
  [CONTACT_FIELD_IDS.address]: (contact) => contact.address,
  [CONTACT_FIELD_IDS.location]: (contact) => contact.locationIds,
  [CONTACT_FIELD_IDS.source]: (contact) => contact.source,
  [CONTACT_FIELD_IDS.rounds]: (contact) => contact.rounds,
  [CONTACT_FIELD_IDS.booksRead]: (contact) => contact.booksRead,
  [CONTACT_FIELD_IDS.initialContact]: (contact) => contact.initialContact,
  [CONTACT_FIELD_IDS.dateOfBirth]: (contact) => contact.dateOfBirth,
  [CONTACT_FIELD_IDS.totalAttendance]: (contact) => contact.totalAttendanceCount,
  [CONTACT_FIELD_IDS.past60DayAttendance]: (contact) => contact.past60DayAttendanceCount,
  [CONTACT_FIELD_IDS.lastContactedOn]: (contact) => contact.lastContactedOn,
  [CONTACT_FIELD_IDS.notes]: (contact) => contact.notes,
  [CONTACT_FIELD_IDS.collectedBy]: (contact) => contact.collectedById,
  [CONTACT_FIELD_IDS.assignedPreacher]: (contact) => contact.assignedPreacherId,
  [CONTACT_FIELD_IDS.favorite]: (contact) => contact.isFavorite,
  [CONTACT_FIELD_IDS.photo]: (contact) => contact.photoPath,
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
 * A `YYYY-MM-DD` contact date as the record shows it.
 *
 * Parsed at midnight UTC and formatted in UTC, so the day an operator picked
 * is the day every machine shows; a local-zone parse would name the previous
 * day west of Greenwich. A value the formatter cannot read is shown as stored.
 */
const CONTACT_DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
})

export function formatContactDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00.000Z`)

  return Number.isNaN(parsed.getTime()) ? value : CONTACT_DATE_FORMATTER.format(parsed)
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
    case CONTACT_FIELD_IDS.age:
      return contact.age === null ? "" : String(contact.age)
    case CONTACT_FIELD_IDS.college:
      return contact.college ?? ""
    case CONTACT_FIELD_IDS.company:
      return contact.company ?? ""
    case CONTACT_FIELD_IDS.designation:
      return contact.designation ?? ""
    case CONTACT_FIELD_IDS.year:
      return contact.year ?? ""
    case CONTACT_FIELD_IDS.address:
      return contact.address ?? ""
    case CONTACT_FIELD_IDS.location: {
      const names = contact.locationIds
        .map((id) => resolvers.locationNameById.get(id) ?? UNRESOLVED_LOCATION)
        .join(", ")

      return names
    }
    case CONTACT_FIELD_IDS.source:
      return contact.source ?? ""
    case CONTACT_FIELD_IDS.rounds:
      return contact.rounds === null ? "" : String(contact.rounds)
    case CONTACT_FIELD_IDS.booksRead:
      return contact.booksRead.join(", ")
    case CONTACT_FIELD_IDS.initialContact:
      return contact.initialContact ? formatContactDate(contact.initialContact) : ""
    case CONTACT_FIELD_IDS.dateOfBirth:
      return contact.dateOfBirth ? formatContactDate(contact.dateOfBirth) : ""
    case CONTACT_FIELD_IDS.totalAttendance:
      return String(contact.totalAttendanceCount)
    case CONTACT_FIELD_IDS.past60DayAttendance:
      return String(contact.past60DayAttendanceCount)
    case CONTACT_FIELD_IDS.lastContactedOn:
      return contact.lastContactedOn ? formatContactDate(contact.lastContactedOn) : ""
    case CONTACT_FIELD_IDS.notes:
      return contact.notes ?? ""
    case CONTACT_FIELD_IDS.collectedBy: {
      if (!contact.collectedById) {
        return ""
      }

      return resolvers.staffNameById.get(contact.collectedById) ?? UNRESOLVED_STAFF
    }
    case CONTACT_FIELD_IDS.assignedPreacher: {
      if (!contact.assignedPreacherId) {
        return ""
      }

      return resolvers.staffNameById.get(contact.assignedPreacherId) ?? UNRESOLVED_STAFF
    }
    case CONTACT_FIELD_IDS.favorite:
      return contact.isFavorite ? "Yes" : "No"
    case CONTACT_FIELD_IDS.photo:
      return contact.photoPath ? "Set" : ""
  }
}
