"use client"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatSessionDateShort } from "@/lib/sessions/format"
import type { SessionAttendee } from "@/lib/sessions/data"

const HEAD_CLASS = "h-11 px-4 text-[11px] font-semibold text-[#64748b] dark:text-[var(--muted-foreground)]"

/**
 * Frame 32's attendee table. Selecting a row opens the contact modal; the row
 * is a button rather than a link, because the record no longer has a URL.
 */
export function SessionAttendeeTable({
  attendees,
  onSelect,
}: {
  attendees: SessionAttendee[]
  onSelect: (contactId: string) => void
}) {
  return (
    <div className="hidden overflow-hidden rounded-xl border border-[var(--border)] bg-card md:block">
      <Table>
        <TableHeader>
          <TableRow className="border-b border-[var(--border)] bg-[#f8fafc] hover:bg-[#f8fafc] dark:bg-[var(--secondary)] dark:hover:bg-[var(--secondary)]">
            <TableHead className={HEAD_CLASS}>Name</TableHead>
            <TableHead className={HEAD_CLASS}>Phone</TableHead>
            <TableHead className={HEAD_CLASS}>Location</TableHead>
            <TableHead className={HEAD_CLASS}>Sessions</TableHead>
            <TableHead className={HEAD_CLASS}>First session</TableHead>
            <TableHead className={HEAD_CLASS}>
              <span className="sr-only">View</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {attendees.map((attendee) => (
            <TableRow
              key={attendee.contactId}
              data-session-attendee={attendee.name}
              className="h-12 border-b border-[var(--border)]"
            >
              <TableCell className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => onSelect(attendee.contactId)}
                  className="text-left text-[14px] font-medium text-[var(--program-text)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]"
                >
                  {attendee.name}
                </button>
              </TableCell>
              <TableCell className="px-4 py-3 text-[14px] whitespace-nowrap text-[var(--muted-foreground)]">
                {attendee.phone}
              </TableCell>
              <TableCell className="px-4 py-3 text-[14px] whitespace-nowrap text-[var(--muted-foreground)]">
                {attendee.locationNames ?? "—"}
              </TableCell>
              <TableCell className="px-4 py-3 text-[14px] tabular-nums text-[var(--program-text)]">
                {attendee.sessionsAttended}
              </TableCell>
              <TableCell className="px-4 py-3 text-[14px] whitespace-nowrap text-[var(--muted-foreground)]">
                {formatSessionDateShort(attendee.firstSession)}
              </TableCell>
              <TableCell className="px-4 py-3 text-right">
                <button
                  type="button"
                  onClick={() => onSelect(attendee.contactId)}
                  aria-label={`View ${attendee.name}`}
                  className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--program-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]"
                >
                  View <span aria-hidden="true">›</span>
                </button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
