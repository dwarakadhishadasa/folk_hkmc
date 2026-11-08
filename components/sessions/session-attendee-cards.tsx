"use client"

import { ChevronRight } from "lucide-react"

import { initialsFor, pluralise } from "@/lib/sessions/format"
import type { SessionAttendee } from "@/lib/sessions/data"

/**
 * Frame 1752's attendee cards: initials, name, phone, the sessions attended
 * count and a chevron. Selecting one opens the contact modal.
 */
export function SessionAttendeeCards({
  attendees,
  onSelect,
}: {
  attendees: SessionAttendee[]
  onSelect: (contactId: string, trigger: HTMLElement | null) => void
}) {
  return (
    <ul className="flex flex-col gap-2 md:hidden">
      {attendees.map((attendee) => (
        <li key={attendee.contactId}>
          <button
            type="button"
            onClick={(event) => onSelect(attendee.contactId, event.currentTarget)}
            data-session-attendee-card={attendee.name}
            className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-card px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]"
          >
            <span
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--primary)_8%,var(--card))] text-[12px] font-semibold text-[var(--program-text)]"
            >
              {initialsFor(attendee.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold text-[var(--program-text)]">
                {attendee.name}
              </span>
              <span className="block text-[12px] text-[var(--muted-foreground)]">{attendee.phone}</span>
            </span>
            <span className="shrink-0 text-[12px] whitespace-nowrap text-[var(--muted-foreground)]">
              {pluralise(attendee.sessionsAttended, "session")}
            </span>
            <ChevronRight className="size-4 shrink-0 text-[#9195A0]" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  )
}
