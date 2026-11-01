import { formatSessionDateShort } from "@/lib/sessions/format"
import type { ContactAttendanceSummary } from "@/lib/sessions/data"

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-[12px] whitespace-nowrap text-[var(--muted-foreground)]">{label}</dt>
      <dd className="text-right text-[13px] text-[var(--program-text)]">{value}</dd>
    </div>
  )
}

/**
 * The attendee's full contact record, shown in the session detail modal.
 *
 * Every field the contact record carries is here: phone, location, assigned
 * preacher, first and last contact, the attendance rollups (including the
 * 60-day count), collected-by, favourite and notes, then the attended-session
 * history. There is no email row — the schema has no contact
 * email — and no action buttons.
 */
export function ContactAttendanceCard({ summary }: { summary: ContactAttendanceSummary }) {
  return (
    <div className="flex flex-col gap-4">
      <section
        aria-label="Contact details"
        className="rounded-xl border border-[var(--border)] bg-card px-4 py-3"
      >
        <h3 className="mb-2 text-[13px] font-semibold text-[var(--program-text)]">Contact details</h3>
        <dl className="flex flex-col gap-2">
          <DetailRow label="Phone" value={summary.phone} />
          <DetailRow label="Location" value={summary.locationNames ?? "—"} />
          <DetailRow label="Assigned preacher" value={summary.preacherName ?? "—"} />
          <DetailRow label="First contact" value={formatSessionDateShort(summary.firstContact)} />
          <DetailRow label="Last contacted" value={formatSessionDateShort(summary.lastContacted)} />
          <DetailRow label="Sessions attended" value={String(summary.sessionsAttended)} />
          <DetailRow label="Past 60 days" value={String(summary.past60DayAttendance)} />
          <DetailRow label="Last attended" value={formatSessionDateShort(summary.lastAttended)} />
          <DetailRow label="Collected by" value={summary.collectedByName ?? "—"} />
          <DetailRow label="Favorite" value={summary.favorite ? "Yes" : "No"} />
          <div className="border-t border-[var(--border)] pt-2">
            <dt className="text-[12px] text-[var(--muted-foreground)]">Notes</dt>
            <dd className="mt-1 text-[13px] whitespace-pre-line text-[var(--program-text)]">
              {summary.notes ?? "—"}
            </dd>
          </div>
        </dl>
      </section>

      <section
        aria-label="Attendance history"
        className="rounded-xl border border-[var(--border)] bg-card px-4 py-3"
      >
        <h3 className="mb-2 text-[13px] font-semibold text-[var(--program-text)]">Attendance history</h3>

        {summary.history.length === 0 ? (
          <p className="text-[12px] text-[var(--muted-foreground)]">No attended sessions in this scope.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {summary.history.map((entry, index) => (
              <li
                key={`${entry.sessionName}-${index}`}
                data-attendance-history={entry.sessionName}
                className="flex items-center gap-2"
              >
                <span
                  aria-hidden="true"
                  className="size-1.5 shrink-0 rounded-full bg-[#15803d] dark:bg-[#4ade80]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-[var(--program-text)]">
                    {entry.sessionName}
                  </span>
                  <span className="block text-[11px] text-[var(--muted-foreground)]">
                    {formatSessionDateShort(entry.sessionDate)}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-[#e8f5ec] px-2 py-[3px] text-[11px] font-medium text-[#15803d] dark:bg-[#10331c] dark:text-[#7ee2a3]">
                  Attended
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
