"use client"

import { useEffect, useId, useState } from "react"

import {
  CONTACT_FIELD_IDS,
  CONTACT_FIELD_LABEL,
  isContactFieldEditable,
  type ContactFieldId,
} from "@/components/manage/manage-contact-fields"
import type { ManageContact, ManageLocation } from "@/components/manage/manage-types"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

/**
 * The value Radix's `Select` cannot hold.
 *
 * A `Select.Item` may not have an empty value — Radix throws on it — so
 * "no location" needs a value that is not an id, and a name that cannot be
 * mistaken for one.
 */
const NO_LOCATION = "__no_location__"

/**
 * One field's editor, shared by the sheet and the expanded record.
 *
 * The Airtable sheet and the Airtable record view are the same control in two
 * frames: a label, and the value under it. That is why this is one component
 * rather than two — a sheet editor and a record editor that each owned their
 * own input would be two places for a field's edit rules to diverge.
 *
 * The edit rules are the grid's, not new ones:
 *
 * - a value is written when it **changes** and the field loses focus, and on
 *   `Enter` — so a stray click on an untouched field issues no request, which
 *   is the same "untouched issues no request" rule the grid's own editors
 *   follow;
 * - `Escape` puts the field back to the value it had, rather than writing the
 *   half-typed one.
 *
 * What this does **not** do is write. `onCommit` hands the new value to the
 * caller, which routes it through the grid's one write path, so there is a
 * single place where a contact is written and a single place where a rejected
 * write is reported.
 */
export interface ManageContactFieldEditorProps {
  contact: ManageContact
  fieldId: ContactFieldId
  /** The program's locations — the options the location picker offers. */
  locations: readonly ManageLocation[]
  /** Called with the new value. Only called for a field that can be written. */
  onCommit: (fieldId: ContactFieldId, value: unknown) => void
  /** Focus the control when it mounts. */
  autoFocus?: boolean
  /** The id of the input, so a `<label htmlFor>` can name it. */
  inputId?: string
}

export function ManageContactFieldEditor({
  contact,
  fieldId,
  locations,
  onCommit,
  autoFocus = false,
  inputId,
}: ManageContactFieldEditorProps) {
  const generatedId = useId()
  const controlId = inputId ?? generatedId

  if (!isContactFieldEditable(fieldId)) {
    return null
  }

  if (fieldId === CONTACT_FIELD_IDS.location) {
    return (
      <LocationFieldEditor
        contact={contact}
        controlId={controlId}
        locations={locations}
        onCommit={onCommit}
      />
    )
  }

  if (fieldId === CONTACT_FIELD_IDS.notes) {
    return (
      <TextFieldEditor
        contact={contact}
        fieldId={fieldId}
        controlId={controlId}
        onCommit={onCommit}
        autoFocus={autoFocus}
        multiline
      />
    )
  }

  return (
    <TextFieldEditor
      contact={contact}
      fieldId={fieldId}
      controlId={controlId}
      onCommit={onCommit}
      autoFocus={autoFocus}
    />
  )
}

/**
 * The text-shaped fields: the name, the phone and the notes.
 *
 * One component for all three because they differ only in the control they
 * draw, and a second implementation of "commit on blur, revert on Escape"
 * would be a second set of rules to keep in step with the first.
 */
function TextFieldEditor({
  contact,
  fieldId,
  controlId,
  onCommit,
  autoFocus,
  multiline = false,
}: {
  contact: ManageContact
  fieldId: ContactFieldId
  controlId: string
  onCommit: ManageContactFieldEditorProps["onCommit"]
  autoFocus: boolean
  multiline?: boolean
}) {
  const committed = readText(contact, fieldId)
  const [draft, setDraft] = useState(committed)

  /**
   * The draft follows the stored value, but only when the stored value
   * actually changes.
   *
   * A write the server accepted comes back as a new row, and a write it
   * refused comes back as the old one; both are the value the field holds
   * again, so the draft follows. What the draft must **not** do is follow the
   * row on every render — an operator typing into a field would have their
   * keystrokes overwritten by the re-render that followed the click that
   * focused the field.
   */
  useEffect(() => {
    setDraft(committed)
  }, [committed])

  const commit = () => {
    if (draft === committed) {
      return
    }

    onCommit(fieldId, draft)
  }

  const label = CONTACT_FIELD_LABEL[fieldId]

  if (multiline) {
    return (
      <Textarea
        id={controlId}
        value={draft}
        autoFocus={autoFocus}
        aria-label={label}
        placeholder={label}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            setDraft(committed)
          }
        }}
        className="min-h-24 resize-y bg-card text-[13px]"
      />
    )
  }

  return (
    <Input
      id={controlId}
      value={draft}
      autoFocus={autoFocus}
      aria-label={label}
      placeholder={label}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault()
          commit()
          return
        }

        if (event.key === "Escape") {
          event.preventDefault()
          setDraft(committed)
        }
      }}
      className="bg-card text-[13px]"
    />
  )
}

/**
 * The location picker.
 *
 * A contact belongs to at most one location — `contacts.location_ids` carries
 * a `CHECK (cardinality(…)) <= 1)` bound — so the picker is a single choice
 * that can be cleared, and it commits the moment the choice is made rather
 * than waiting for a blur it may never get.
 */
function LocationFieldEditor({
  contact,
  controlId,
  locations,
  onCommit,
}: {
  contact: ManageContact
  controlId: string
  locations: readonly ManageLocation[]
  onCommit: ManageContactFieldEditorProps["onCommit"]
}) {
  const current = contact.locationIds[0] ?? NO_LOCATION

  return (
    <Select
      value={current}
      onValueChange={(next) => {
        onCommit(
          CONTACT_FIELD_IDS.location,
          next === NO_LOCATION ? [] : [next],
        )
      }}
    >
      <SelectTrigger id={controlId} aria-label={CONTACT_FIELD_LABEL.location} className="bg-card text-[13px]">
        <SelectValue placeholder="No location" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_LOCATION}>No location</SelectItem>
        {locations.map((location) => (
          <SelectItem key={location.id} value={location.id}>
            {location.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** The text a field currently holds, as the string the editor works on. */
function readText(contact: ManageContact, fieldId: ContactFieldId): string {
  switch (fieldId) {
    case CONTACT_FIELD_IDS.name:
      return contact.name
    case CONTACT_FIELD_IDS.phone:
      return contact.phone
    case CONTACT_FIELD_IDS.notes:
      return contact.notes ?? ""
    default:
      return ""
  }
}
