"use client"

import { useEffect, useRef, useState } from "react"
import { MessageSquare, X } from "lucide-react"

import { ContactRecordBody } from "@/components/contacts/contact-record-body"
import {
  isContactRecordReady,
  type CommentActions,
  type ContactRecordState,
} from "@/components/contacts/contact-record-types"
import { ContactCommentsPane } from "@/components/manage/contact-comments-pane"
import type { ContactFieldId } from "@/components/manage/manage-contact-fields"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * The phone record frame.
 *
 * A full-screen Radix Dialog: it positions and scrolls, and the shared body
 * supplies the fields, the attendance and campaign sections and the comments
 * pane. The phone record is no longer a reduced copy — it shows the same
 * record the desktop does.
 *
 * The record is a full-screen Radix Dialog: the comments panel is a second
 * layer, so one Escape closes the comments first and the record second.
 */
export interface ContactRecordPhoneFrameProps {
  state: ContactRecordState
  onCommit?: (fieldId: ContactFieldId, value: unknown) => void | Promise<void>
  commentActions?: CommentActions | null
  onClose: () => void
  onPrevious: () => void
  onNext: () => void
  canGoPrevious: boolean
  canGoNext: boolean
  returnFocusTo?: HTMLElement | null
  notice?: string | null
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return Boolean(
    target.closest(
      "input, textarea, select, [contenteditable='true'], [contenteditable=''], [data-radix-popper-content-wrapper]",
    ),
  )
}

export function ContactRecordPhoneFrame({
  state,
  onCommit,
  commentActions = null,
  onClose,
  onPrevious,
  onNext,
  canGoPrevious,
  canGoNext,
  returnFocusTo = null,
  notice = null,
}: ContactRecordPhoneFrameProps) {
  const ready = isContactRecordReady(state)
  const name = ready ? state.contact.name : null
  const triggerRef = useRef<HTMLElement | null>(returnFocusTo)
  const [commentsOpen, setCommentsOpen] = useState(false)

  useEffect(() => {
    if (returnFocusTo) {
      triggerRef.current = returnFocusTo
    }
  }, [returnFocusTo])

  const handleCloseAutoFocus = (event: Event) => {
    event.preventDefault()

    const target =
      triggerRef.current && triggerRef.current.isConnected
        ? triggerRef.current
        : document.querySelector<HTMLElement>(
            "[data-contact-list], [data-grid-scroll], [data-contact-record-heading]",
          )

    target?.focus()
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent
        showCloseButton={false}
        data-contact-record-phone=""
        aria-describedby={undefined}
        onEscapeKeyDown={(event) => {
          if (isEditableTarget(event.target)) {
            event.preventDefault()
          }
        }}
        onCloseAutoFocus={handleCloseAutoFocus}
        className="!left-0 !right-0 !top-[var(--app-viewport-offset-top,0px)] !bottom-auto !translate-x-0 !translate-y-0 flex h-[var(--app-viewport-height,100dvh)] max-h-none w-full max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 bg-card p-0 text-[13px] text-foreground outline-none sm:max-w-none"
      >
        <DialogTitle className="sr-only">
          {name ? `Contact record: ${name}` : "Contact record"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          The contact&apos;s fields, attendance, campaign history and comments.
        </DialogDescription>
        <h1 tabIndex={-1} data-contact-record-heading="" className="sr-only">
          {name ?? "Contact record"}
        </h1>
        <p aria-live="polite" className="sr-only">
          {name ? `Showing record for ${name}` : "Loading contact record"}
        </p>

        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border pl-2 pr-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close"
            onClick={onClose}
            className="size-9 justify-start p-0 text-[var(--program-text)]"
          >
            <X aria-hidden="true" className="size-[18px]" strokeWidth={2} />
          </Button>

          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={commentsOpen ? "Hide comments" : "Show comments"}
              aria-pressed={commentsOpen}
              disabled={!ready}
              onClick={() => setCommentsOpen((open) => !open)}
              className={cn(
                "mr-1 size-9 p-0 text-[var(--program-text)]",
                commentsOpen && "bg-secondary",
              )}
            >
              <MessageSquare aria-hidden="true" className="size-[18px]" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Previous contact"
              disabled={!canGoPrevious}
              onClick={onPrevious}
              className="h-9 px-2 text-[12px]"
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Next contact"
              disabled={!canGoNext}
              onClick={onNext}
              className="h-9 px-2 text-[12px]"
            >
              Next
            </Button>
          </div>
        </header>

        {notice ? (
          <p role="alert" className="shrink-0 border-b border-border px-4 py-2 text-[12px] text-destructive">
            {notice}
          </p>
        ) : null}

        {ready ? (
          <>
            <ContactRecordBody
              state={state}
              onCommit={onCommit}
              commentActions={commentActions}
              showComments={false}
              layout="phone"
            />

            <Sheet open={commentsOpen} onOpenChange={setCommentsOpen}>
              <SheetContent
                side="bottom"
                className="!bottom-[calc(100dvh_-_var(--app-viewport-height,100dvh))] !h-[var(--app-viewport-height,100dvh)] !max-h-none w-full max-w-none gap-0 rounded-none border-0 bg-card p-0 shadow-none"
              >
                <div className="flex h-12 shrink-0 items-center border-b border-border px-4">
                  <SheetTitle className="text-[15px] font-semibold text-[var(--program-text)]">
                    Comments
                  </SheetTitle>
                </div>
                <SheetDescription className="sr-only">
                  Comments for {state.contact.name}
                </SheetDescription>
                <div className="flex min-h-0 flex-1 flex-col [&>section]:border-l-0">
                  <ContactCommentsPane
                    contactName={state.contact.name}
                    comments={state.comments}
                    canComment={state.capabilities.canComment}
                    actions={commentActions}
                  />
                </div>
              </SheetContent>
            </Sheet>
          </>
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-[13px] text-muted-foreground">
            {state.status === "loading" ? "Loading contact…" : state.message}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
