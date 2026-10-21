"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowUpDown, Search, X } from "lucide-react"

import { ManageContactRecord } from "@/components/manage/manage-contact-record"
import { ManageContactSheet } from "@/components/manage/manage-contact-sheet"
import {
  CONTACT_FIELD_IDS,
  CONTACT_FIELD_LABEL,
  contactFieldText,
  type ContactFieldId,
  type ContactFieldResolvers,
} from "@/components/manage/manage-contact-fields"
import type { ManageContact, ManageLocation } from "@/components/manage/manage-types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

/**
 * The contact list: the Airtable mobile interface's Contacts page, brought
 * into this app.
 *
 * The Airtable app rendered the interface's Contacts page as a **list of two
 * columns** — the primary field and the phone number — with every cell
 * tappable, and it navigated by *stacking*: tap a cell and a sheet rises from
 * the bottom holding that cell's editor; the sheet's "Expand contact" action
 * opens the whole record over it. This component is that stack.
 *
 * The list is deliberately not the contacts grid, and it is not a rendering of
 * the grid either. The grid is a spreadsheet: thirteen columns, a toolbar, a
 * column manager, a keyboard model. The Airtable page is a phone-shaped
 * surface with two columns and a stack, and mixing the two — a spreadsheet
 * that also stacked — would give the operator neither. So the grid stays the
 * grid, and this is the other shape: on a narrow viewport it **is** the
 * contacts view, chosen by the viewport rather than by a button.
 *
 * What the two share is everything underneath: the same rows, the same write
 * path, and the same field vocabulary.
 */

/**
 * The fields the list shows.
 *
 * Two, and the two the Airtable Contacts page showed: the primary field and
 * the phone number. A contact is identified by its name and reached by its
 * phone, and every other field is one tap away in the record.
 */
const LIST_COLUMNS: readonly ContactFieldId[] = [
  CONTACT_FIELD_IDS.name,
  CONTACT_FIELD_IDS.phone,
]

/**
 * The sort options, in the Airtable app's order.
 *
 * The Airtable sheet offered "Created" first, as the default; this app's
 * contacts carry no creation timestamp, so the first option is the order the
 * server delivered — which is the same idea, and the rest of the list is the
 * Airtable list verbatim.
 */
const SORT_OPTIONS: readonly { id: string; label: string }[] = [
  { id: "default", label: "Default" },
  { id: CONTACT_FIELD_IDS.name, label: CONTACT_FIELD_LABEL.name },
  { id: CONTACT_FIELD_IDS.phone, label: CONTACT_FIELD_LABEL.phone },
  { id: CONTACT_FIELD_IDS.location, label: "Location" },
  { id: CONTACT_FIELD_IDS.totalAttendance, label: "TotalAttendanceCount" },
  { id: CONTACT_FIELD_IDS.past60DayAttendance, label: "Past60DayAttendanceCount" },
  { id: "lastContactedOn", label: "Last Contacted On" },
  { id: CONTACT_FIELD_IDS.notes, label: "Notes" },
  { id: CONTACT_FIELD_IDS.collectedBy, label: "Collected By" },
]

export interface ManageContactListProps {
  contacts: readonly ManageContact[]
  /** The program's locations — the options the location picker offers. */
  locations: readonly ManageLocation[]
  /** The names the two reference fields resolve against. */
  resolvers: ContactFieldResolvers
  /** Called with the new value, for a field that can be written. */
  onCommit: (contactId: string, fieldId: ContactFieldId, value: unknown) => void
  /**
   * Close the list and return to the grid.
   *
   * Optional, and optional for a reason: on a phone the list is the *whole*
   * contacts view, so there is nothing to close back to. A "Close contacts"
   * button there would close the only contacts surface the operator has.
   */
  onClose?: () => void
}

export function ManageContactList({
  contacts,
  locations,
  resolvers,
  onCommit,
  onClose,
}: ManageContactListProps) {
  const [query, setQuery] = useState("")
  const [sortId, setSortId] = useState("default")

  /**
   * The sheet: which record, and which of its fields.
   *
   * Both are needed, because the sheet is one *field* of one *record* — the
   * Airtable sheet opened on the cell that was tapped, not on the record.
   */
  const [sheet, setSheet] = useState<{ contactId: string; fieldId: ContactFieldId } | null>(null)

  /**
   * The record, when the sheet's "Expand contact" has been taken.
   *
   * The record is a separate piece of state from the sheet, and not a
   * replacement for it: closing the record returns to the sheet, which is
   * still holding the field the operator tapped. That is the Airtable order
   * and it is the order an operator expects — the sheet is a step out of the
   * list, the record is a step out of the sheet.
   */
  const [recordId, setRecordId] = useState<string | null>(null)

  const visible = useMemo(
    () => sortContacts(contacts, sortId, resolvers, query),
    [contacts, resolvers, query, sortId],
  )

  /**
   * The list takes the focus when it mounts.
   *
   * On a phone the list is the whole contacts view, so the focus has to land
   * inside it: a document that keeps its focus on the page behind the list
   * answers `Tab` to that page, and an operator who pressed `Escape` to
   * dismiss the sheet would find something behind it answering keys instead.
   */
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    rootRef.current?.focus()
  }, [])

  const sheetContact = sheet ? (contacts.find((contact) => contact.id === sheet.contactId) ?? null) : null
  const recordContact = recordId ? (contacts.find((contact) => contact.id === recordId) ?? null) : null

  const closeRecord = () => setRecordId(null)

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className="absolute inset-0 z-30 flex flex-col bg-card outline-none"
      data-contact-list=""
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        {onClose ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close contacts"
            onClick={onClose}
            className="size-8 text-[var(--program-text)]"
          >
            <X aria-hidden="true" className="size-4" />
          </Button>
        ) : null}
        <h2 className="min-w-0 flex-1 truncate font-[family-name:var(--font-poppins)] text-[15px] font-semibold text-[var(--program-text)]">
          Contacts
        </h2>
        <SortControl sortId={sortId} onSortChange={setSortId} />
      </header>

      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <Search aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          aria-label="Search contacts"
          placeholder="Search name or phone"
          onChange={(event) => setQuery(event.target.value)}
          className="h-7 border-0 bg-transparent px-0 text-[13px] shadow-none focus-visible:ring-0"
        />
      </div>

      {/*
        The column header. Sticky, because the Airtable list kept the field
        names in view while the rows scrolled under them, and a list of
        contacts without its column names is a list of fragments.
      */}
      <div className="sticky top-0 z-10 grid shrink-0 grid-cols-[minmax(0,3fr)_minmax(0,2fr)] border-b border-border bg-muted/40">
        {LIST_COLUMNS.map((fieldId) => (
          <div
            key={fieldId}
            className="truncate px-3 py-2 text-[12px] font-medium text-muted-foreground"
          >
            {CONTACT_FIELD_LABEL[fieldId]}
          </div>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">
            No contact matches this search.
          </p>
        ) : (
          visible.map((contact) => (
            <div
              key={contact.id}
              data-contact-row={contact.id}
              className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] border-b border-border/60"
            >
              {LIST_COLUMNS.map((fieldId) => (
                <button
                  key={fieldId}
                  type="button"
                  data-contact-cell={fieldId}
                  onClick={() => setSheet({ contactId: contact.id, fieldId })}
                  className="truncate px-3 py-2.5 text-left text-[13px] text-[var(--program-text)] hover:bg-muted/60"
                >
                  {contactFieldText(contact, fieldId, resolvers) || "—"}
                </button>
              ))}
            </div>
          ))
        )}
      </div>

      {/*
        The sheet and the record are siblings, and the record is drawn after
        the sheet so it covers it. The sheet stays mounted underneath, which is
        what makes "Expand contact" reversible: closing the record reveals the
        sheet it came from, with the same field still in it.
      */}
      {sheetContact && sheet ? (
        <ManageContactSheet
          contact={sheetContact}
          fieldId={sheet.fieldId}
          locations={locations}
          onCommit={(fieldId, value) => onCommit(sheetContact.id, fieldId, value)}
          onExpand={() => setRecordId(sheetContact.id)}
          onClose={() => setSheet(null)}
        />
      ) : null}

      {recordContact ? (
        <ManageContactRecord
          contact={recordContact}
          locations={locations}
          resolvers={resolvers}
          onCommit={(fieldId, value) => onCommit(recordContact.id, fieldId, value)}
          onClose={closeRecord}
        />
      ) : null}
    </div>
  )
}

/**
 * The sort control — the Airtable app's "End user controls" popover, which
 * held a single **Sort** action.
 *
 * The Airtable popover was a menu with one item in it, and the item opened a
 * second sheet of radio buttons. This is that second sheet, reached from the
 * same place in the frame: the sort button in the header.
 */
function SortControl({
  sortId,
  onSortChange,
}: {
  sortId: string
  onSortChange: (next: string) => void
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Sort contacts"
          className="size-8 text-[var(--program-text)]"
        >
          <ArrowUpDown aria-hidden="true" className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2">
        <p className="px-2 pb-1.5 text-[12px] font-semibold text-muted-foreground">Sort by</p>
        <RadioGroup value={sortId} onValueChange={onSortChange}>
          {SORT_OPTIONS.map((option) => (
            <label
              key={option.id}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] text-[var(--program-text)] hover:bg-muted"
            >
              <RadioGroupItem value={option.id} />
              <span className="truncate">{option.label}</span>
            </label>
          ))}
        </RadioGroup>
      </PopoverContent>
    </Popover>
  )
}

/**
 * The rows the list shows: the searched contacts, in the chosen order.
 *
 * The sort is a plain comparator over the values the list already knows how
 * to read, and the search matches the name or the phone. Both are decided
 * here rather than by a table model, because this list is a list: it is two
 * columns and a stack, not a spreadsheet with a column manager behind it.
 */
function sortContacts(
  contacts: readonly ManageContact[],
  sortId: string,
  resolvers: ContactFieldResolvers,
  query: string,
): ManageContact[] {
  const needle = query.trim().toLowerCase()

  const matched = needle
    ? contacts.filter(
        (contact) =>
          contact.name.toLowerCase().includes(needle) || contact.phone.toLowerCase().includes(needle),
      )
    : [...contacts]

  if (sortId === "default") {
    return matched
  }

  const value = (contact: ManageContact): string => {
    switch (sortId) {
      case CONTACT_FIELD_IDS.name:
        return contact.name
      case CONTACT_FIELD_IDS.phone:
        return contact.phone
      case CONTACT_FIELD_IDS.location:
        return contactFieldText(contact, CONTACT_FIELD_IDS.location, resolvers)
      case CONTACT_FIELD_IDS.totalAttendance:
        return String(contact.totalAttendanceCount)
      case CONTACT_FIELD_IDS.past60DayAttendance:
        return String(contact.past60DayAttendanceCount)
      case "lastContactedOn":
        return contact.lastContactedOn ?? ""
      case CONTACT_FIELD_IDS.notes:
        return contact.notes ?? ""
      case CONTACT_FIELD_IDS.collectedBy:
        return contactFieldText(contact, CONTACT_FIELD_IDS.collectedBy, resolvers)
      default:
        return ""
    }
  }

  return matched.sort((left, right) => value(left).localeCompare(value(right), undefined, { numeric: true }))
}
