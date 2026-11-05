"use client"

import { useEffect, useId, useRef, useState } from "react"
import { ChevronDown, ChevronUp, MessageSquare, X } from "lucide-react"

import { ContactCommentsPane } from "@/components/manage/contact-comments-pane"
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
import { cn } from "@/lib/utils"

/**
 * The expanded record, over the grid.
 *
 * The source product opened a record as a **centred dialog over the grid**, not
 * as a page: the grid stayed behind it, a chevron pair stepped through records
 * in view order, and the record itself was a two-column frame — fields on the
 * left, comments on the right. This reproduces that frame.
 *
 * Two of the source's affordances are absent, and deliberately:
 *
 * - **Cell-level comments.** The table stores `cell_field_id` so the shape
 *   exists, but nothing in this app pins a comment to a field yet, and a
 *   control that only ever writes `null` is noise.
 * - **Reactions and reply threads.** Both need a second table each; see the
 *   note in `contact-comments-pane.tsx`.
 *
 * The field column keeps the source's **label over value** rule rather than a
 * side-by-side pair: a label above its control stays readable when the value is
 * a pill, a date, or a wrapped note.
 */
export interface ContactRecordDialogProps {
  contact: ManageContact
  locations: readonly ManageLocation[]
  resolvers: ContactFieldResolvers
  onCommit: (fieldId: ContactFieldId, value: unknown) => void
  onClose: () => void
  onPrevious: () => void
  onNext: () => void
  canGoPrevious: boolean
  canGoNext: boolean
}

/** One field, label above its control. */
function FieldRow({
  contact,
  fieldId,
  locations,
  resolvers,
  onCommit,
}: {
  contact: ManageContact
  fieldId: ContactFieldId
  locations: readonly ManageLocation[]
  resolvers: ContactFieldResolvers
  onCommit: (fieldId: ContactFieldId, value: unknown) => void
}) {
  const inputId = useId()
  const editable = isContactFieldEditable(fieldId)

  return (
    <div className="flex flex-col gap-1" data-contact-field={fieldId}>
      <label htmlFor={inputId} className="text-[12px] font-medium text-muted-foreground">
        {CONTACT_FIELD_LABEL[fieldId]}
      </label>
      {editable ? (
        <ManageContactFieldEditor
          contact={contact}
          fieldId={fieldId}
          locations={locations}
          onCommit={onCommit}
          inputId={inputId}
        />
      ) : (
        <p className="min-h-8 rounded-md border border-transparent px-0 py-1.5 text-[13px] leading-snug text-[var(--program-text)]">
          {contactFieldText(contact, fieldId, resolvers) || "—"}
        </p>
      )}
    </div>
  )
}

export function ContactRecordDialog({
  contact,
  locations,
  resolvers,
  onCommit,
  onClose,
  onPrevious,
  onNext,
  canGoPrevious,
  canGoNext,
}: ContactRecordDialogProps) {
  const nameId = useId()
  const rootRef = useRef<HTMLDivElement | null>(null)

  /**
   * Whether the comments column is showing.
   *
   * The source product's header button collapsed the pane and grew the field
   * column from 800 to 1104 (measured), relabelling itself from "Hide comments
   * and revision history" to "Show …". The pane stays mounted while collapsed
   * so reopening it does not re-read the thread.
   */
  const [commentsOpen, setCommentsOpen] = useState(true)

  useEffect(() => {
    rootRef.current?.focus()
  }, [])

  /**
   * `Escape` closes the record, and the arrow keys step through records the way
   * the chevrons do. Both are captured here rather than on the document with a
   * guard, because the dialog is the only frame: when it is open, it owns the
   * keyboard.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation()
        onClose()
        return
      }

      if (event.key === "ArrowUp" && event.altKey && canGoPrevious) {
        event.preventDefault()
        onPrevious()
        return
      }

      if (event.key === "ArrowDown" && event.altKey && canGoNext) {
        event.preventDefault()
        onNext()
      }
    }

    document.addEventListener("keydown", onKeyDown)

    return () => document.removeEventListener("keydown", onKeyDown)
  }, [canGoNext, canGoPrevious, onClose, onNext, onPrevious])

  const orderedFields = CONTACT_FIELD_ORDER.filter((fieldId) => fieldId !== CONTACT_FIELD_IDS.name)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      data-contact-record-dialog=""
    >
      <div
        ref={rootRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Detail view dialog"
        className={cn(
          "flex h-[min(788px,88vh)] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl outline-none",
          // Measured on the source product: the pane is 304px, so hiding it
          // takes the dialog from 1104 to 800.
          commentsOpen ? "w-[min(1104px,94vw)]" : "w-[min(800px,94vw)]",
        )}
      >        <header className="flex h-11 shrink-0 items-center justify-between border-b border-border px-2">
          <div className="flex items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Previous contact"
              disabled={!canGoPrevious}
              onClick={onPrevious}
              className="size-8"
            >
              <ChevronUp aria-hidden="true" className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Next contact"
              disabled={!canGoNext}
              onClick={onNext}
              className="size-8"
            >
              <ChevronDown aria-hidden="true" className="size-4" />
            </Button>
          </div>
          {/*
            The comments control sits immediately left of Close, as a group.
            With `justify-between` and three loose children it landed in the
            middle of the header instead of beside the way out.
          */}
          <div className="flex items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={
                commentsOpen
                  ? "Hide comments and revision history"
                  : "Show comments and revision history"
              }
              title={
                commentsOpen
                  ? "Hide comments and revision history"
                  : "Show comments and revision history"
              }
              aria-pressed={commentsOpen}
              onClick={() => setCommentsOpen((open) => !open)}
              className="size-8"
            >
              {/*
                A speech bubble, matching the source product's `Chat` glyph,
                rather than a panel icon: the button is about the conversation,
                not about the layout it happens to move.
              */}
              <MessageSquare
                aria-hidden="true"
                className={commentsOpen ? "size-4" : "size-4 opacity-60"}
              />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close dialog"
              onClick={onClose}
              className="size-8"
            >
              <X aria-hidden="true" className="size-4" />
            </Button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 overflow-y-auto px-8 py-5" data-contact-record-fields="">
            {/*
              The primary field is the title. The source product drew it larger
              than every other value and left it unlabelled, which is what makes
              a record identifiable before any other field is read.
            */}
            <div className="mb-5" data-contact-field={CONTACT_FIELD_IDS.name}>
              <label htmlFor={nameId} className="sr-only">
                {CONTACT_FIELD_LABEL.name}
              </label>
              <div className="text-[22px] font-semibold leading-tight text-[var(--program-text)]">
                <ManageContactFieldEditor
                  contact={contact}
                  fieldId={CONTACT_FIELD_IDS.name}
                  locations={locations}
                  onCommit={onCommit}
                  inputId={nameId}
                  appearance="title"
                />
              </div>
            </div>

            <div className="flex flex-col gap-4">
              {orderedFields.map((fieldId) => (
                <FieldRow
                  key={fieldId}
                  contact={contact}
                  fieldId={fieldId}
                  locations={locations}
                  resolvers={resolvers}
                  onCommit={onCommit}
                />
              ))}
            </div>
          </div>

          <div
            className="hidden w-[320px] shrink-0 md:flex"
            style={commentsOpen ? undefined : { display: "none" }}
          >
            <ContactCommentsPane contactId={contact.id} contactName={contact.name} />
          </div>
        </div>
      </div>
    </div>
  )
}
