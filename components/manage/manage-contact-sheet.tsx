"use client"

import { useEffect } from "react"

import { ManageContactFieldEditor } from "@/components/manage/manage-contact-field-editor"
import {
  CONTACT_FIELD_LABEL,
  type ContactFieldId,
} from "@/components/manage/manage-contact-fields"
import type { ManageContact, ManageLocation } from "@/components/manage/manage-types"
import { Button } from "@/components/ui/button"

/**
 * The field sheet: one field, in a frame that rises from the bottom of the
 * contact surface.
 *
 * This is the Airtable mobile interface's cell editor, reproduced. The Airtable
 * app opened a sheet when a cell was tapped, and the sheet held two things: an
 * **"Expand contact"** action at the top, and the tapped cell's own editor
 * under it. The first is the way out to the whole record; the second is the
 * reason the operator came.
 *
 * The sheet is the *only* place in this app where a single field is edited
 * outside a grid cell, and that is deliberate rather than accidental: the grid
 * remains the place a contact is edited, and the sheet is one field of it
 * brought to the front for a tap-sized edit.
 *
 * What the sheet does not do is own the value. It writes through the grid's
 * commit path, so the optimistic update, the request and the rejection are
 * the grid's — and a rejected write is reported where every other rejected
 * write is reported.
 */
export interface ManageContactSheetProps {
  contact: ManageContact
  /** The field the operator tapped. */
  fieldId: ContactFieldId
  /** The program's locations — the options the location picker offers. */
  locations: readonly ManageLocation[]
  /** Called with the new value, for a field that can be written. */
  onCommit: (fieldId: ContactFieldId, value: unknown) => void
  /** Open the whole record. The sheet's "Expand contact". */
  onExpand: () => void
  /** Close the sheet. */
  onClose: () => void
}

export function ManageContactSheet({
  contact,
  fieldId,
  locations,
  onCommit,
  onExpand,
  onClose,
}: ManageContactSheetProps) {
  const label = CONTACT_FIELD_LABEL[fieldId]

  /**
   * `Escape` closes the sheet.
   *
   * The sheet is a modal frame over the list, and a modal frame that ignores
   * `Escape` is a frame an operator has to find the close button for. The
   * editor's own `Escape` handling runs first — it is bound to the input — and
   * only an `Escape` that reaches the frame closes the sheet.
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
    <div className="absolute inset-0 z-40" data-contact-sheet="">
      {/*
        The scrim is a button, not a click handler on a div: it is the control
        that dismisses the sheet, and a control is what a keyboard can reach.
      */}
      <button
        type="button"
        aria-label="Close sheet"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/40"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${label}`}
        className="absolute inset-x-0 bottom-0 flex flex-col rounded-t-2xl border-t border-border bg-card shadow-2xl"
      >
        {/*
          The drag handle. It is a picture of a handle rather than a handle:
          the sheet is dismissed by its scrim, its `Escape` or the list behind
          it, and a grab bar that does not move would be a control that lies.
        */}
        <div aria-hidden="true" className="flex shrink-0 justify-center pt-3">
          <span className="h-1 w-10 rounded-full bg-border" />
        </div>

        {/*
          "Expand contact" — the way from one field to the whole record.

          It sits above the editor rather than below it because it is the step
          *out* of the sheet: an operator who opened a cell to read a value and
          then wants the rest of the record should not have to scroll past the
          thing they already have.
        */}
        <div className="shrink-0 px-4 pt-2">
          <Button
            type="button"
            variant="link"
            onClick={onExpand}
            className="h-auto p-0 text-[13px] font-semibold text-[var(--program-primary)]"
          >
            Expand contact
          </Button>
        </div>

        <div className="flex min-h-0 flex-col gap-1.5 px-4 pb-5 pt-3">
          <label
            htmlFor={`contact-sheet-${fieldId}`}
            className="text-[13px] font-medium text-[var(--program-text)]"
          >
            {label}
          </label>
          <ManageContactFieldEditor
            contact={contact}
            fieldId={fieldId}
            locations={locations}
            onCommit={onCommit}
            autoFocus
            inputId={`contact-sheet-${fieldId}`}
          />
        </div>
      </div>
    </div>
  )
}
