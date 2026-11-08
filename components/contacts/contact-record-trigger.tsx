"use client"

import { useRef, type ReactNode } from "react"

import { useContactRecordContext } from "@/components/contacts/contact-record-provider"
import { cn } from "@/lib/utils"

/**
 * An inline record trigger.
 *
 * A real, labelled button: a surface renders it only when the contact is inside
 * the caller's manage scope (the server's availability read decides), and the
 * button opens the one shared record through the staff shell's provider.
 *
 * Without a provider — a surface mounted outside `StaffAuthShell` — the
 * component renders plain text rather than a dead control.
 */
export interface ContactRecordTriggerProps {
  contactId: string
  name: string
  /** The source list's visible, in-scope ids in display order. */
  sequence?: readonly string[]
  className?: string
  /** Classes for the plain-text fallback; interactive classes are not reused. */
  staticClassName?: string
  /** Defaults to the contact's name. */
  children?: ReactNode
}

export function ContactRecordTrigger({
  contactId,
  name,
  sequence,
  className,
  staticClassName,
  children,
}: ContactRecordTriggerProps) {
  const context = useContactRecordContext()
  const ref = useRef<HTMLButtonElement | null>(null)

  if (!context?.canOpenContactRecord) {
    return <span className={staticClassName}>{children ?? name}</span>
  }

  return (
    <button
      ref={ref}
      type="button"
      data-contact-record-trigger={contactId}
      aria-label={`Open the contact record for ${name}`}
      aria-haspopup="dialog"
      onClick={() =>
        context.openContactRecord({
          contactId,
          sequence,
          trigger: ref.current,
        })
      }
      className={cn(
        "text-left underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        className,
      )}
    >
      {children ?? name}
    </button>
  )
}
