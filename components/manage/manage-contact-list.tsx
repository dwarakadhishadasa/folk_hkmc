"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Search } from "lucide-react"

import { ContactRecordPhoneFrame } from "@/components/contacts/contact-record-phone"
import type { UseContactRecordResult } from "@/components/contacts/contact-record-types"
import { ManageContactSheet } from "@/components/manage/manage-contact-sheet"
import {
  CONTACT_FIELD_IDS,
  CONTACT_FIELD_LABEL,
  contactFieldText,
  type ContactFieldId,
  type ContactFieldResolvers,
} from "@/components/manage/manage-contact-fields"
import type {
  ManageContact,
  ManageContactWriteResult,
  ManageLocation,
} from "@/components/manage/manage-types"
import { Input } from "@/components/ui/input"

/**
 * The contact list: the Airtable mobile interface's Contacts page, brought
 * into this app.
 *
 * The list stacks: a cell opens the field sheet, the sheet's "Expand contact"
 * opens the whole record over it. The record is the **shared phone frame** —
 * the same body, attendance, campaign history and comments the desktop dialog
 * shows — not a reduced copy. Both the sheet and the record are Radix layers,
 * so one Escape unwinds the top one.
 *
 * The record's sequence is this list's own `visible` order: the search-filtered
 * rows the operator is looking at, never the unfiltered mirror.
 */
const LIST_COLUMNS: readonly ContactFieldId[] = [
  CONTACT_FIELD_IDS.name,
  CONTACT_FIELD_IDS.phone,
]

const LIST_COLUMN_TEMPLATE = "grid-cols-[3fr_2fr]"

export interface ManageContactListProps {
  contacts: readonly ManageContact[]
  /** The program's locations — the options the location picker offers. */
  locations: readonly ManageLocation[]
  /** The names the two reference fields resolve against. */
  resolvers: ContactFieldResolvers
  /** Called with the new value, for a field that can be written. */
  onCommit: (contactId: string, fieldId: ContactFieldId, value: unknown) => void | Promise<void>
  /** The list's record host: one hook instance for the phone's stack. */
  record: UseContactRecordResult
  /** Mirrors a successful record write into the parent's grid mirror. */
  onRecordWrite?: (written: ManageContactWriteResult) => void
  activeFilters?: readonly string[]
  onClearFilters?: () => void
  emptyScope?: boolean
}

export function ManageContactList({
  contacts,
  locations,
  resolvers,
  onCommit,
  record,
  onRecordWrite,
  activeFilters = [],
  onClearFilters,
  emptyScope = false,
}: ManageContactListProps) {
  const [query, setQuery] = useState("")
  const [sheet, setSheet] = useState<{ contactId: string; fieldId: ContactFieldId } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const visible = useMemo(() => filterContacts(contacts, query), [contacts, query])
  const visibleIds = useMemo(() => visible.map((contact) => contact.id), [visible])
  const visibleKey = visibleIds.join("\u0000")

  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    rootRef.current?.focus()
  }, [])

  // The record's chevrons follow the list the operator is actually looking at:
  // when a search hides the open record, the sequence re-anchors to the
  // nearest surviving row instead of stepping through a stale order.
  useEffect(() => {
    if (record.isOpen) {
      record.updateSequence(visibleKey.length > 0 ? visibleKey.split("\u0000") : [])
    }
  }, [record.isOpen, record.updateSequence, visibleKey])

  const sheetContact = sheet
    ? (contacts.find((contact) => contact.id === sheet.contactId) ?? null)
    : null

  const commitRecord = async (fieldId: ContactFieldId, value: unknown) => {
    try {
      const written = await record.commit(fieldId, value)

      if (written) {
        onRecordWrite?.(written)
      }

      setNotice(null)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The change could not be saved.")
      // The field editor reverts on a rejected commit; the frame owns the
      // message, so the rejection must not be swallowed here.
      throw error
    }
  }

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className="absolute inset-0 z-30 -mx-4 flex flex-col bg-card outline-none sm:-mx-6 md:mx-0"
      data-contact-list=""
    >
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

      {notice ? (
        <p role="alert" className="shrink-0 border-b border-border px-4 py-2 text-[12px] text-destructive">
          {notice}
        </p>
      ) : null}

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
                  onClick={() => {
                    setNotice(null)
                    setSheet({ contactId: contact.id, fieldId })
                  }}
                  className="flex h-11 items-center truncate px-4 text-left text-[13px] text-[var(--program-text)] hover:bg-muted/60 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--program-accent)]"
                >
                  {contactFieldText(contact, fieldId, resolvers) || "—"}
                </button>
              ))}
            </div>
          ))
        )}
      </div>

      <div className="flex h-11 shrink-0 items-center border-t border-border px-4">
        <span
          data-contact-list-count=""
          className="text-[12px] font-medium tabular-nums text-[var(--program-text)]"
        >
          {visible.length.toLocaleString("en-IN")} records
        </span>
      </div>

      {sheetContact && sheet ? (
        <ManageContactSheet
          contact={sheetContact}
          fieldId={sheet.fieldId}
          locations={locations}
          notice={notice}
          onCommit={async (fieldId, value) => {
            try {
              await onCommit(sheetContact.id, fieldId, value)
              setNotice(null)
            } catch (error) {
              setNotice(error instanceof Error ? error.message : "The change could not be saved.")
              // The sheet's editor reverts its draft on a rejected commit.
              throw error
            }
          }}
          onExpand={(trigger) => {
            setNotice(null)
            record.open({
              contactId: sheetContact.id,
              sequence: visibleIds,
              trigger,
            })
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}

      {record.state ? (
        <ContactRecordPhoneFrame
          state={record.state}
          onCommit={commitRecord}
          commentActions={record.comments}
          onClose={record.close}
          onPrevious={record.previous}
          onNext={record.next}
          canGoPrevious={record.canGoPrevious}
          canGoNext={record.canGoNext}
          returnFocusTo={record.trigger}
          notice={notice}
        />
      ) : null}
    </div>
  )
}

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
