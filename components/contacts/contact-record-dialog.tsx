"use client"

import { useEffect, useRef, useState, type ComponentProps } from "react"
import {
  Check,
  ChevronDown,
  ChevronUp,
  Link2,
  MessageSquare,
  MoreHorizontal,
  X,
} from "lucide-react"

import { ContactRecordBody } from "@/components/contacts/contact-record-body"
import {
  isContactRecordReady,
  type CommentActions,
  type ContactRecordState,
} from "@/components/contacts/contact-record-types"
import { CONTACT_DIALOG_SHADOW } from "@/components/manage/contact-record-styles"
import type { ContactFieldId } from "@/components/manage/manage-contact-fields"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

/**
 * The desktop record frame.
 *
 * It positions, scrolls and supplies the header actions; the shared body owns
 * the fields, the activity sections and the comments layout. The frame mounts
 * inside the Radix Dialog primitive, so the background is inert and
 * scroll-locked and the topmost layer owns Escape — there is no document
 * keydown here.
 *
 * The measured geometry is the source product's: a dialog that starts under the
 * page header and keeps a 12px gutter on the other three sides, 1104px wide
 * with the comments column and 800px without.
 */
export interface ContactRecordDialogProps {
  state: ContactRecordState
  onCommit?: (fieldId: ContactFieldId, value: unknown) => void | Promise<void>
  commentActions?: CommentActions | null
  onClose: () => void
  onPrevious: () => void
  onNext: () => void
  canGoPrevious: boolean
  canGoNext: boolean
  /** The control that opened the record; focus returns to it when connected. */
  returnFocusTo?: HTMLElement | null
  /** A write's server message, shown above the fields. */
  notice?: string | null
}

function HeaderIconButton({
  label,
  active = false,
  children,
  ...props
}: ComponentProps<"button"> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      {...props}
      className="group flex h-12 w-6 items-center justify-center outline-none disabled:opacity-40"
    >
      <span
        className={cn(
          "flex size-6 items-center justify-center rounded-full text-foreground opacity-75 transition-[background-color,opacity] group-hover:bg-secondary group-hover:opacity-100 group-focus-visible:ring-1 group-focus-visible:ring-ring dark:group-hover:bg-field",
          active && "bg-secondary opacity-75 dark:bg-field",
        )}
      >
        {children}
      </span>
    </button>
  )
}

/**
 * Escape in an inline editor belongs to the editor.
 *
 * Radix's Escape handler is on the document; preventing its default keeps the
 * record open while the editor's own keydown has already discarded the draft.
 * The check is on the event target, so it covers the grid's and the record's
 * editors without either frame owning a listener.
 */
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

export function ContactRecordDialog({
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
}: ContactRecordDialogProps) {
  const ready = isContactRecordReady(state)
  const contact = ready ? state.contact : null
  const name = contact?.name ?? null
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [commentsOpen, setCommentsOpen] = useState(true)
  const [copied, setCopied] = useState<string | null>(null)
  const [top, setTop] = useState(88)
  const triggerRef = useRef<HTMLElement | null>(returnFocusTo)

  useEffect(() => {
    if (returnFocusTo) {
      triggerRef.current = returnFocusTo
    }
  }, [returnFocusTo])

  useEffect(() => {
    const header = [...document.querySelectorAll("header")].find(
      (element) => !element.closest("[data-contact-record-dialog]"),
    )

    const update = () => {
      setTop(header ? Math.round(header.getBoundingClientRect().bottom) : 88)
    }

    update()
    window.addEventListener("resize", update)

    return () => window.removeEventListener("resize", update)
  }, [])

  useEffect(
    () => () => {
      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current)
      }
    },
    [],
  )

  const copy = (kind: string, value: string) => {
    if (!value || typeof navigator === "undefined" || !navigator.clipboard) {
      return
    }

    void navigator.clipboard.writeText(value).then(() => {
      setCopied(kind)
      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current)
      }
      copiedTimer.current = setTimeout(() => setCopied(null), 1500)
    })
  }

  const handleCloseAutoFocus = (event: Event) => {
    // Radix would return focus to its trigger; this dialog is opened from a
    // host-owned control, so the host's trigger wins while it is still
    // connected. The fallbacks are the host's own containers, never a plain h1.
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
        data-contact-record-dialog=""
        aria-describedby={undefined}
        onEscapeKeyDown={(event) => {
          if (isEditableTarget(event.target)) {
            event.preventDefault()
          }
        }}
        onKeyDown={(event) => {
          if (!event.altKey) {
            return
          }

          if (event.key === "ArrowUp" && canGoPrevious) {
            event.preventDefault()
            onPrevious()
          }

          if (event.key === "ArrowDown" && canGoNext) {
            event.preventDefault()
            onNext()
          }
        }}
        onCloseAutoFocus={handleCloseAutoFocus}
        style={{ top }}
        className={cn(
          "!bottom-3 !translate-y-0 flex h-auto max-h-[800px] !w-[calc(100%-1.5rem)] max-w-none flex-col gap-0 overflow-hidden rounded-[6px] border-0 bg-card p-0 text-[13px] text-foreground outline-none",
          commentsOpen && contact ? "sm:max-w-[1104px]" : "sm:max-w-[800px]",
          CONTACT_DIALOG_SHADOW,
        )}
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

        <header className="flex h-12 shrink-0 items-center border-b border-border pl-5 pr-4">
          <div className="flex w-9 shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label="Previous contact"
              disabled={!canGoPrevious}
              onClick={onPrevious}
              className="flex h-12 w-4 items-center justify-center text-foreground opacity-75 outline-none hover:opacity-100 focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            >
              <ChevronUp aria-hidden="true" className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Next contact"
              disabled={!canGoNext}
              onClick={onNext}
              className="flex h-12 w-4 items-center justify-center text-foreground opacity-75 outline-none hover:opacity-100 focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            >
              <ChevronDown aria-hidden="true" className="size-4" />
            </button>
          </div>

          <div className="min-w-0 flex-1" />

          <div className="flex shrink-0 items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <HeaderIconButton label="More options" disabled={!contact}>
                  <MoreHorizontal aria-hidden="true" className="size-4" />
                </HeaderIconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-40">
                <DropdownMenuItem onSelect={() => copy("name", contact?.name ?? "")}>
                  {copied === "name" ? <Check aria-hidden="true" /> : null}
                  Copy name
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => copy("phone", contact?.phone ?? "")}>
                  {copied === "phone" ? <Check aria-hidden="true" /> : null}
                  Copy phone
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => copy("id", contact?.id ?? "")}>
                  {copied === "id" ? <Check aria-hidden="true" /> : null}
                  Copy contact ID
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <HeaderIconButton
              label="Copy contact URL"
              disabled={!contact}
              onClick={() =>
                copy("url", `${window.location.href.split("#")[0]}#contact-${contact?.id ?? ""}`)
              }
            >
              {copied === "url" ? (
                <Check aria-hidden="true" className="size-4" />
              ) : (
                <Link2 aria-hidden="true" className="size-4" />
              )}
            </HeaderIconButton>

            <HeaderIconButton
              label={
                commentsOpen
                  ? "Hide comments and revision history"
                  : "Show comments and revision history"
              }
              active={commentsOpen}
              onClick={() => setCommentsOpen((open) => !open)}
            >
              <MessageSquare aria-hidden="true" className="size-4" />
            </HeaderIconButton>

            <span aria-hidden="true" className="mx-2 h-[15px] w-px bg-border" />

            <HeaderIconButton label="Close dialog" onClick={onClose}>
              <X aria-hidden="true" className="size-4" />
            </HeaderIconButton>
          </div>
        </header>

        {notice ? (
          <p role="alert" className="shrink-0 border-b border-border px-5 py-2 text-[12px] text-destructive">
            {notice}
          </p>
        ) : null}

        {ready ? (
          <ContactRecordBody
            state={state}
            onCommit={onCommit}
            commentActions={commentActions}
            showComments={commentsOpen}
            layout="desktop"
          />
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-[13px] text-muted-foreground">
            {state.status === "loading" ? "Loading contact…" : state.message}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
