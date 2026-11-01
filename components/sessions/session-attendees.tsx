"use client"

import { useEffect, useState } from "react"

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { ContactAttendanceCard } from "@/components/sessions/contact-attendance-card"
import { SessionAttendeeCards } from "@/components/sessions/session-attendee-cards"
import { SessionAttendeeSort } from "@/components/sessions/session-attendee-sort"
import { SessionAttendeeTable } from "@/components/sessions/session-attendee-table"
import type { ContactAttendanceSummary, SessionAttendee } from "@/lib/sessions/data"
import { formatSessionMonth, initialsFor } from "@/lib/sessions/format"

interface ContactPayload {
  name: string
  summary: ContactAttendanceSummary
}

/**
 * The attendee list and its contact modal.
 *
 * One dialog serves the desktop table and the phone cards. The record is read
 * on demand from the attendee endpoint when a row is opened, so the page does
 * not fetch every contact just to render the list.
 */
export function SessionAttendees({
  sessionId,
  attendees,
}: {
  sessionId: string
  attendees: SessionAttendee[]
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = selectedId ? attendees.find((entry) => entry.contactId === selectedId) : undefined

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between md:hidden">
        <h2 className="text-[11px] font-semibold tracking-[0.04em] text-[var(--muted-foreground)] uppercase">
          Attendees · {attendees.length}
        </h2>
        <SessionAttendeeSort />
      </div>

      <SessionAttendeeTable attendees={attendees} onSelect={setSelectedId} />
      <SessionAttendeeCards attendees={attendees} onSelect={setSelectedId} />

      <div className="flex flex-col gap-1 text-[11px] text-[var(--muted-foreground)] sm:flex-row sm:items-center sm:justify-between">
        <p>{attendees.length} {attendees.length === 1 ? "attendee" : "attendees"}</p>
        <p className="hidden md:block">
          Select an attendee to open their complete contact record — every contact field and their
          attended-session history.
        </p>
        <p className="md:hidden">Tap an attendee for their complete contact record.</p>
      </div>

      <ContactDialog
        sessionId={sessionId}
        attendee={selected}
        open={selected !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null)
          }
        }}
      />
    </div>
  )
}

function ContactDialog({
  sessionId,
  attendee,
  open,
  onOpenChange,
}: {
  sessionId: string
  attendee: SessionAttendee | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [payload, setPayload] = useState<ContactPayload | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open || !attendee) {
      setPayload(null)
      setError("")
      return
    }

    const controller = new AbortController()
    setPayload(null)
    setError("")

    fetch(`/api/sessions/${sessionId}/attendees/${attendee.contactId}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = (await response.json()) as ContactPayload & { error?: string }
        if (!response.ok) {
          throw new Error(data.error || "Failed to load the contact record.")
        }

        setPayload(data)
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) {
          return
        }

        setError(loadError instanceof Error ? loadError.message : "Failed to load the contact record.")
      })

    return () => controller.abort()
  }, [attendee, open, sessionId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogDescription className="sr-only">
          The attendee&apos;s contact details and attended-session history.
        </DialogDescription>

        {error ? (
          <p className="py-8 text-center text-[13px] text-destructive">{error}</p>
        ) : payload ? (
          <>
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--primary)_8%,var(--card))] text-[14px] font-semibold text-[var(--program-text)]"
              >
                {initialsFor(payload.name)}
              </span>
              <div>
                <DialogTitle className="font-[family-name:var(--font-poppins)] text-[18px] leading-tight font-semibold text-[var(--program-text)]">
                  {payload.name}
                </DialogTitle>
                <p className="text-[12px] text-[var(--muted-foreground)]">
                  Contact · since {formatSessionMonth(payload.summary.firstContact)}
                </p>
              </div>
            </div>
            <ContactAttendanceCard summary={payload.summary} />
          </>
        ) : (
          <>
            <DialogTitle className="sr-only">{attendee?.name ?? "Contact record"}</DialogTitle>
            <p className="py-8 text-center text-[13px] text-[var(--muted-foreground)]">Loading contact…</p>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
