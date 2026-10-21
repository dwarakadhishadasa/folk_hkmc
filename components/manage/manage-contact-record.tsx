"use client"

import { useEffect, useId, useRef } from "react"
import { X } from "lucide-react"

import { ManageContactFieldEditor } from "@/components/manage/manage-contact-field-editor"
import {
  CONTACT_FIELD_IDS,
  CONTACT_FIELD_LABEL,
  CONTACT_FIELD_ORDER,
  contactFieldText,
  isContactFieldEditable,
  type ContactFieldId,
  type ContactFieldResolvers,
} from "@/components/manage/manage-contact-fields"
import type { ManageContact, ManageLocation } from "@/components/manage/manage-types"
import { Button } from "@/components/ui/button"

/**
 * The expanded record: the whole contact, in the Airtable mobile interface's
 * frame.
 *
 * The Airtable record view is a **label over a value**, not the side-by-side
 * pair the desktop interface used, and it is a full screen rather than a pane
 * beside a list. Both are reproduced here: the name is the title, and every
 * other field is a label with its value under it.
 *
 * Two of the Airtable record view's frames are deliberately absent:
 *
 * - its **comment** affordance. This app has no comment feature, and a
 *   button that opens nothing is worse than a frame that was never there;
 * - its **date quick action**. The one date in this record — `Initial Contact`
 *   — is not writable here, so there is nothing for a picker to pick.
 *
 * What is carried over is the discipline the frame implies: a writable field
 * is a control and a computed one is not. The attendance counts are server
 * rollups, `Collected By` is the staff member who collected the contact, and
 * `Initial Contact` was set when the contact was created — none of them is
 * something an operator types, and showing them as inputs would invite a
 * write the server would refuse.
 */
export interface ManageContactRecordProps {
  contact: ManageContact
  /** The program's locations — the options the location picker offers. */
  locations: readonly ManageLocation[]
  /** The names the two reference fields resolve against. */
  resolvers: ContactFieldResolvers
  /** Called with the new value, for a field that can be written. */
  onCommit: (fieldId: ContactFieldId, value: unknown) => void
  /** Close the record. */
  onClose: () => void
}

export function ManageContactRecord({
  contact,
  locations,
  resolvers,
  onCommit,
  onClose,
}: ManageContactRecordProps) {
  const nameId = useId()

  /**
   * The record takes the focus when it opens.
   *
   * The record covers the sheet, which covers the list, and the frame that is
   * on top has to be the one holding the focus — otherwise `Escape` would
   * reach the sheet underneath and close both at once.
   */
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    rootRef.current?.focus()
  }, [])

  /**
   * `Escape` closes the record.
   *
   * The record sits over the sheet, which sits over the list, so the frame
   * that owns the key is the one on top: an `Escape` here closes the record
   * and leaves the sheet open, which is the same order the Airtable app
   * unwinds its frames in.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation()
        onClose()
      }
    }

    document.addEventListener("keydown", onKeyDown)

    return () => document.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`Contact: ${contact.name}`}
      className="absolute inset-0 z-50 flex flex-col bg-card outline-none"
      data-contact-record=""
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-2 py-1.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Close"
          onClick={onClose}
          className="size-8 text-[var(--program-text)]"
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-4">
        {/*
          The name is the record's title, and it is the one field that is
          edited in the title's own frame: the Airtable record view made the
          primary field a large editable line at the top rather than a labelled
          field among the others.
        */}
        <div className="mb-5" data-contact-field={CONTACT_FIELD_IDS.name}>
          <label htmlFor={nameId} className="sr-only">
            {CONTACT_FIELD_LABEL.name}
          </label>
          <ManageContactFieldEditor
            contact={contact}
            fieldId={CONTACT_FIELD_IDS.name}
            locations={locations}
            onCommit={onCommit}
            inputId={nameId}
          />
        </div>

        <dl className="flex flex-col gap-4">
          {CONTACT_FIELD_ORDER.filter((id) => id !== CONTACT_FIELD_IDS.name).map((fieldId) => (
            <RecordField key={fieldId} fieldId={fieldId}>
              {isContactFieldEditable(fieldId) ? (
                <ManageContactFieldEditor
                  contact={contact}
                  fieldId={fieldId}
                  locations={locations}
                  onCommit={onCommit}
                />
              ) : (
                <span className="text-[13px] text-[var(--program-text)]">
                  {contactFieldText(contact, fieldId, resolvers) || "—"}
                </span>
              )}
            </RecordField>
          ))}
        </dl>
      </div>
    </div>
  )
}

/**
 * One field of the record: the label, and the value under it.
 *
 * The label is above the value rather than beside it because that is the
 * Airtable mobile frame, and because a value that can be long — notes, a
 * location — needs the width a label beside it would take.
 */
function RecordField({
  fieldId,
  children,
}: {
  fieldId: ContactFieldId
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5" data-contact-field={fieldId}>
      <dt className="text-[13px] font-medium text-[var(--program-text)]">
        {CONTACT_FIELD_LABEL[fieldId]}
      </dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}
