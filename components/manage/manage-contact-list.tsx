"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Search } from "lucide-react"

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
import { Input } from "@/components/ui/input"

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
 * the grid either. The grid is a spreadsheet: fourteen columns, a toolbar, a
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
 * The list's two columns, as a grid.
 *
 * 60 / 40 — the Airtable Contacts page's own split — so the name gets the
 * room it needs and the phone number is not clipped by it.
 */
const LIST_COLUMN_TEMPLATE = "grid-cols-[3fr_2fr]"

export interface ManageContactListProps {
  contacts: readonly ManageContact[]
  /** The program's locations — the options the location picker offers. */
  locations: readonly ManageLocation[]
  /** The names the two reference fields resolve against. */
  resolvers: ContactFieldResolvers
  /** Called with the new value, for a field that can be written. */
  onCommit: (contactId: string, fieldId: ContactFieldId, value: unknown) => void
  /**
   * The grid conditions that narrowed the rows before the list received them.
   *
   * The list does not apply them — `ManageContactsTable` does, through the same
   * evaluator the grid uses — but it has to say that a filter is on and offer
   * the one way off. A list whose footer says `12 records` with no explanation
   * reads as a list that has lost 260 contacts.
   */
  activeFilters?: readonly string[]
  onClearFilters?: () => void
  /** Shown when there are no contacts at all, rather than no matches. */
  emptyScope?: boolean
}

export function ManageContactList({
  contacts,
  locations,
  resolvers,
  onCommit,
  activeFilters = [],
  onClearFilters,
  emptyScope = false,
}: ManageContactListProps) {
  const [query, setQuery] = useState("")

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
    () => filterContacts(contacts, query),
    [contacts, query],
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
      className="absolute inset-0 z-30 -mx-4 flex flex-col bg-card outline-none sm:-mx-6 md:mx-0"
      data-contact-list=""
    >
      {/*
        The search row.

        It is the list's own search, not the grid's global filter, and it sits
        under the page title rather than in a toolbar: on a phone the toolbar
        is a row of controls the operator cannot see past, and the grid is not
        mounted here anyway.
      */}
      <div className="flex h-12 shrink-0 items-center gap-3 px-4">
        <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          aria-label="Search contacts"
          placeholder="Search name or phone"
          onChange={(event) => setQuery(event.target.value)}
          className="h-9 border-0 bg-transparent px-0 text-[13px] shadow-none focus-visible:ring-0"
        />
      </div>

      {/*
        The arrival state: a metric link narrowed this list before it rendered.
        The chip names the condition and owns the only clear control, so the
        footer's smaller count is explained rather than mysterious.
      */}
      {activeFilters.length > 0 ? (
        <div
          data-contact-filter-chip=""
          className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-4 py-2"
        >
          <span className="text-[11px] font-medium text-muted-foreground">
            Filtered: {activeFilters.join(" · ")}
          </span>
          {onClearFilters ? (
            <button
              type="button"
              onClick={onClearFilters}
              className="text-[11px] font-semibold text-[var(--program-text)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]"
            >
              Clear filter
            </button>
          ) : null}
        </div>
      ) : null}

      {/*
        The column header. It is *outside* the scroll area, so it stays in view
        while the rows scroll under it — and a list of contacts without its
        column names is a list of fragments.
      */}
      <div
        className={`grid h-[38px] shrink-0 ${LIST_COLUMN_TEMPLATE} items-center border-b border-border bg-muted`}
      >
        {LIST_COLUMNS.map((fieldId) => (
          <div
            key={fieldId}
            className="truncate px-4 text-[12px] font-medium text-muted-foreground"
          >
            {CONTACT_FIELD_LABEL[fieldId]}
          </div>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">
            {emptyScope
              ? "No contacts yet."
              : query.trim().length > 0 || activeFilters.length > 0
                ? "No contact matches this filter."
                : "No contacts yet."}
          </p>
        ) : (
          visible.map((contact) => (
            <div
              key={contact.id}
              data-contact-row={contact.id}
              className={`grid ${LIST_COLUMN_TEMPLATE} border-b border-border`}
            >
              {LIST_COLUMNS.map((fieldId) => (
                <button
                  key={fieldId}
                  type="button"
                  data-contact-cell={fieldId}
                  onClick={() => setSheet({ contactId: contact.id, fieldId })}
                  className="flex h-11 items-center truncate px-4 text-left text-[13px] text-[var(--program-text)] hover:bg-muted/60 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--program-accent)]"
                >
                  {contactFieldText(contact, fieldId, resolvers) || "—"}
                </button>
              ))}
            </div>
          ))
        )}
      </div>

      {/*
        The footer count. It is the list's own visible count — the filtered
        count when a metric link narrowed the list — because this is the phone's
        status readout and the section's one invariant is asserted against it.
      */}
      <div className="flex h-11 shrink-0 items-center border-t border-border px-4">
        <span
          data-contact-list-count=""
          className="text-[12px] font-medium tabular-nums text-[var(--program-text)]"
        >
          {visible.length.toLocaleString("en-IN")} records
        </span>
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
 * The rows the list shows: the searched contacts.
 *
 * The search matches the name or the phone. It is decided here rather than by
 * a table model, because this list is a list: it is two columns and a stack,
 * not a spreadsheet with a column manager behind it.
 */
function filterContacts(contacts: readonly ManageContact[], query: string): ManageContact[] {
  const needle = query.trim().toLowerCase()

  if (!needle) {
    return [...contacts]
  }

  return contacts.filter(
    (contact) =>
      contact.name.toLowerCase().includes(needle) || contact.phone.toLowerCase().includes(needle),
  )
}
