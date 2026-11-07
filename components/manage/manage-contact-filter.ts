/**
 * The contact-shaped reading of the grid's filter model.
 *
 * The phone's contact list is not a table, so it cannot ask TanStack's row
 * models to narrow it. It still has to narrow to exactly the rows a metric link
 * asked for — the section's one invariant is that a figure clicked and a list
 * shown report the same count — so it evaluates the same conditions through the
 * same `evaluateCondition`, with the contact columns resolved exactly the way
 * `manage-contacts-table.tsx`'s accessors resolve them.
 *
 * Pure and client-safe: no React, no table, no DOM.
 */

import {
  evaluateCondition,
  findFilterOperator,
  type GridFilterCondition,
  type GridFilterConnective,
} from "@/components/grid/grid-filter-operators"
import { evaluateFilterGroup, type GridFilterGroup } from "@/components/grid/grid-filter-tree"
import type { GridFieldType } from "@/components/grid/grid-types"
import {
  UNRESOLVED_LOCATION,
  UNRESOLVED_STAFF,
} from "@/components/manage/manage-contact-fields"
import type { ManageContact } from "@/components/manage/manage-types"

export interface ContactFilterResolvers {
  locationNameById: ReadonlyMap<string, string>
  staffNameById: ReadonlyMap<string, string>
}

/** The label the filter chip uses for the columns a metric link can name. */
export const CONTACT_FILTER_COLUMN_LABEL: Readonly<Record<string, string>> = {
  name: "Name",
  phone: "Phone",
  source: "Source",
  rounds: "Rounds",
  booksRead: "Books Read",
  initialContact: "Initial Contact",
  dateOfBirth: "Date of Birth",
  totalAttendanceCount: "Total Attendance",
  past60DayAttendanceCount: "Past 60 Days",
  lastContactedOn: "Last Contacted On",
  notes: "Notes",
  location: "Location",
  collectedBy: "Collected By",
}

/** One column's value on a contact, as the grid's accessor would present it. */
export function contactColumnValue(
  contact: ManageContact,
  columnId: string,
  resolvers: ContactFilterResolvers,
): unknown {
  switch (columnId) {
    case "name":
      return contact.name
    case "phone":
      return contact.phone
    case "source":
      return contact.source
    case "rounds":
      return contact.rounds
    case "booksRead":
      return contact.booksRead
    case "initialContact":
      return contact.initialContact
    case "dateOfBirth":
      return contact.dateOfBirth
    case "lastContactedOn":
      return contact.lastContactedOn
    case "notes":
      return contact.notes
    case "totalAttendanceCount":
      return contact.totalAttendanceCount
    case "past60DayAttendanceCount":
      return contact.past60DayAttendanceCount
    case "favorite":
      return contact.isFavorite
    case "location":
      return contact.locationIds
        .map((id) => resolvers.locationNameById.get(id) ?? UNRESOLVED_LOCATION)
        .join(", ")
    case "collectedBy":
      return contact.collectedById
        ? (resolvers.staffNameById.get(contact.collectedById) ?? UNRESOLVED_STAFF)
        : ""
    default:
      return ""
  }
}

function asCondition(columnId: string, value: unknown): GridFilterCondition | null {
  if (typeof value === "string") {
    return value.length > 0 ? { columnId, operator: "contains", value } : null
  }

  if (value && typeof value === "object") {
    const candidate = value as Partial<GridFilterCondition>

    if (typeof candidate.operator === "string" && candidate.operator.length > 0) {
      return {
        columnId: candidate.columnId || columnId,
        operator: candidate.operator,
        value: candidate.value ?? "",
      }
    }
  }

  return null
}

function normalize(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
}

/**
 * Whether a contact satisfies the URL's conditions.
 *
 * `all` is every condition; `any` is at least one. An empty list passes every
 * row — the same inert condition the grid treats as "not narrowed yet".
 */
export function contactMatchesConditions(
  contact: ManageContact,
  conditions: ReadonlyArray<{ id: string; value: unknown }>,
  connective: GridFilterConnective,
  fieldTypes: Readonly<Record<string, GridFieldType | undefined>>,
  resolvers: ContactFilterResolvers,
): boolean {
  const parsed = conditions
    .map((condition) => {
      const value = asCondition(condition.id, condition.value)

      return value ? { columnId: condition.id, condition: value } : null
    })
    .filter(
      (entry): entry is { columnId: string; condition: GridFilterCondition } => entry !== null,
    )

  if (parsed.length === 0) {
    return true
  }

  const matches = (entry: { columnId: string; condition: GridFilterCondition }) =>
    evaluateCondition(
      contactColumnValue(contact, entry.columnId, resolvers),
      entry.condition,
      fieldTypes[entry.columnId],
    )

  return connective === "any" ? parsed.some(matches) : parsed.every(matches)
}

/** The grid's global filter, over the fields a phone list can show. */
export function contactMatchesSearch(contact: ManageContact, query: string, resolvers: ContactFilterResolvers): boolean {
  const needle = normalize(query)

  if (needle.length === 0) {
    return true
  }

  return [
    contact.name,
    contact.phone,
    contact.source,
    contact.notes,
    contactColumnValue(contact, "location", resolvers),
    contactColumnValue(contact, "collectedBy", resolvers),
  ].some((value) => normalize(value).includes(needle))
}

export function filterContactsForPhone(params: {
  contacts: readonly ManageContact[]
  query: string
  filterTree: GridFilterGroup
  fieldTypes: Readonly<Record<string, GridFieldType | undefined>>
  resolvers: ContactFilterResolvers
}): ManageContact[] {
  const { contacts, query, filterTree, fieldTypes, resolvers } = params
  const fieldTypeById = new Map(Object.entries(fieldTypes))

  return contacts.filter(
    (contact) =>
      contactMatchesSearch(contact, query, resolvers) &&
      evaluateFilterGroup(
        filterTree,
        (columnId) => contactColumnValue(contact, columnId, resolvers),
        fieldTypeById,
      ),
  )
}

/** One sentence naming a condition, for the phone list's filter chip. */
export function describeContactCondition(
  columnId: string,
  value: unknown,
  fieldType: GridFieldType | undefined,
): string | null {
  const condition = asCondition(columnId, value)

  if (!condition) {
    return null
  }

  const columnLabel = CONTACT_FILTER_COLUMN_LABEL[columnId] ?? columnId
  const operator = findFilterOperator(fieldType, condition.operator)
  const operatorLabel = operator?.label ?? condition.operator
  const raw = Array.isArray(condition.value)
    ? condition.value.join(", ")
    : String(condition.value ?? "")

  if (operator?.valueShape === "none") {
    return `${columnLabel} ${operatorLabel}`
  }

  return `${columnLabel} ${operatorLabel} ${raw}`.trim()
}
