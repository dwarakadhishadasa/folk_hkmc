import Link from "next/link"

import { SessionStatusPill } from "@/components/sessions/session-status-pill"
import { formatSessionDate } from "@/lib/sessions/format"
import { sessionHref } from "@/lib/sessions/links"
import type { SessionOverviewRow } from "@/lib/sessions/data"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const HEAD_CLASS = "h-11 px-4 text-[13px] font-semibold text-[var(--program-text)]"

/**
 * Frame 32's session table, one row per visible session, newest first.
 *
 * `Open ›` is the row's only affordance and it leads to the session's detail
 * page. The attendance column is a total, never a fraction: the schema has no
 * capacity and the design's `42 of 60` is sample data.
 */
export function SessionOverviewTable({ rows }: { rows: SessionOverviewRow[] }) {
  return (
    <div className="hidden overflow-hidden rounded-xl border border-[var(--border)] bg-card md:block">
      <Table>
        <TableHeader>
          <TableRow className="border-b border-[var(--border)] bg-[#f8fafc] hover:bg-[#f8fafc] dark:bg-[var(--secondary)] dark:hover:bg-[var(--secondary)]">
            <TableHead className={HEAD_CLASS}>Session</TableHead>
            <TableHead className={HEAD_CLASS}>Date</TableHead>
            <TableHead className={HEAD_CLASS}>Location</TableHead>
            <TableHead className={HEAD_CLASS}>Attendees</TableHead>
            <TableHead className={HEAD_CLASS}>Status</TableHead>
            <TableHead className={HEAD_CLASS}>
              <span className="sr-only">Open</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.id}
              data-session-row={row.name}
              data-session-status={row.status}
              data-session-attendance={row.attendanceCount}
              className="h-12 border-b border-[var(--border)]"
            >
              <TableCell className="px-4 py-3">
                <Link
                  href={sessionHref(row)}
                  className="text-[14px] font-medium text-[var(--program-text)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]"
                >
                  {row.name}
                </Link>
              </TableCell>
              <TableCell className="px-4 py-3 text-[14px] whitespace-nowrap text-[var(--muted-foreground)]">
                {formatSessionDate(row.sessionDate)}
              </TableCell>
              <TableCell className="px-4 py-3 text-[14px] whitespace-nowrap text-[var(--muted-foreground)]">
                {row.locationName ?? "—"}
              </TableCell>
              <TableCell
                data-session-attendance={row.attendanceCount}
                className="px-4 py-3 text-[14px] tabular-nums text-[var(--program-text)]"
              >
                {row.attendanceCount}
              </TableCell>
              <TableCell className="px-4 py-3">
                <SessionStatusPill status={row.status} />
              </TableCell>
              <TableCell className="px-4 py-3 text-right">
                <Link
                  href={sessionHref(row)}
                  aria-label={`Open ${row.name}`}
                  className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--program-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]"
                >
                  Open <span aria-hidden="true">›</span>
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
