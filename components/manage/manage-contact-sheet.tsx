"use client"

import { ManageContactFieldEditor } from "@/components/manage/manage-contact-field-editor"
import {
  CONTACT_FIELD_LABEL,
  type ContactFieldId,
} from "@/components/manage/manage-contact-fields"
import type { ManageContact, ManageLocation } from "@/components/manage/manage-types"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * The field sheet: one field, in a frame that rises from the bottom of the
 * contact surface.
 *
 * It is a Radix Dialog, not a hand-rolled overlay: the sheet and the record are
 * two layers of the same primitive, so the background is inert, the topmost
 * layer owns Escape, and one Escape never closes both. The sheet's own document
 * keydown is gone with the old frame.
 *
 * "Expand contact" opens the whole record through the list's one record host;
 * the sheet stays mounted underneath, which is what makes the step reversible.
 */
export interface ManageContactSheetProps {
  contact: ManageContact
  /** The field the operator tapped. */
  fieldId: ContactFieldId
  /** The program's locations — the options the location picker offers. */
  locations: readonly ManageLocation[]
  /** Called with the new value, for a field that can be written. */
  onCommit: (fieldId: ContactFieldId, value: unknown) => void | Promise<void>
  /** A rejected write's server message, shown inside the modal. */
  notice?: string | null
  /** Open the whole record. The sheet's "Expand contact". */
  onExpand: (trigger: HTMLElement | null) => void
  /** Close the sheet. */
  onClose: () => void
}

export function ManageContactSheet({
  contact,
  fieldId,
  locations,
  onCommit,
  notice = null,
  onExpand,
  onClose,
}: ManageContactSheetProps) {
  const label = CONTACT_FIELD_LABEL[fieldId]

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent
        showCloseButton={false}
        data-contact-sheet=""
        aria-describedby={undefined}
        aria-label={`Edit ${label}`}
        className="!inset-x-0 !bottom-[calc(100dvh_-_var(--app-viewport-height,100dvh))] !top-auto !left-0 !right-0 !translate-x-0 !translate-y-0 flex max-h-[calc(var(--app-viewport-height,100dvh)_-_4rem)] w-full max-w-none flex-col gap-0 overflow-y-auto rounded-t-xl rounded-b-none border-0 bg-card p-0 shadow-[0_8px_32px_rgba(0,0,0,0.18)] sm:max-w-none"
      >
        <DialogTitle className="sr-only">Edit {label}</DialogTitle>
        <DialogDescription className="sr-only">
          One field of {contact.name}&apos;s record, with the way to the whole record above it.
        </DialogDescription>

        {/*
          The drag handle. It is a picture of a handle rather than a handle:
          the sheet is dismissed by its scrim, its Escape or the list behind
          it, and a grab bar that does not move would be a control that lies.
        */}
        <div aria-hidden="true" className="flex shrink-0 justify-center pt-3">
          <span className="h-1 w-8 rounded-full bg-border" />
        </div>

        {/*
          "Expand contact" — the way from one field to the whole record.

          It sits above the editor rather than below it because it is the step
          *out* of the sheet: an operator who opened a cell to read a value and
          then wants the rest of the record should not have to scroll past the
          thing they already have. It is centred, and it is a 48px target: it
          is a label, so it has to look like one and still be easy to hit.
        */}
        <div className="flex shrink-0 justify-center">
          <Button
            type="button"
            variant="ghost"
            onClick={(event) => onExpand(event.currentTarget)}
            className="h-12 p-0 font-[family-name:var(--font-poppins)] text-[13px] font-semibold text-[var(--program-primary)] hover:bg-transparent hover:text-[var(--program-primary)] hover:opacity-80"
          >
            Expand contact
          </Button>
        </div>

        <div className="flex min-h-0 flex-col gap-2.5 px-4 pb-5 pt-4">
          {notice ? (
            <p role="alert" className="text-[12px] text-red-700">
              {notice}
            </p>
          ) : null}
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
      </DialogContent>
    </Dialog>
  )
}
