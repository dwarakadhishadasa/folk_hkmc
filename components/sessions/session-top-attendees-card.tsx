import { ContactRecordTrigger } from "@/components/contacts/contact-record-trigger"
import { SectionCard } from "@/components/section-card"
import type { SessionTopAttendee } from "@/lib/sessions/data"

const TOP_SIZE = 5

/**
 * The five contacts with the most check-ins in the reporting window, as a
 * ranked list on the Contacts Overview's Engagement shape: the figure and its
 * caption on one baseline, then a bar for the row's share of the leader.
 *
 * It is deliberately not a total — the KPI tiles own the totals — and the bar
 * is relative to the best-attended contact, not to the window's attendance.
 */
export function SessionTopAttendeesCard({
  attendees,
  rangeLabel,
}: {
  attendees: SessionTopAttendee[]
  rangeLabel: string
}) {
  const max = attendees[0]?.attendanceCount ?? 0
  const recordSequence = attendees
    .filter((attendee) => attendee.recordAvailable)
    .map((attendee) => attendee.contactId)

  return (
    <SectionCard
      title="Top 5 attendees"
      subtitle={`Programme-wide · most check-ins over the ${rangeLabel.toLowerCase()}.`}
      badge={`Top ${TOP_SIZE}`}
      className="h-full"
    >
      {attendees.length === 0 ? (
        <p className="py-6 text-center text-[12px] leading-5 text-[var(--muted-foreground)]">
          No attendance recorded in this window yet.
        </p>
      ) : (
        <ol className="flex flex-1 flex-col gap-1">
          {attendees.map((attendee, index) => {
            const row = (
              <>
                <span className="flex items-baseline justify-between gap-3">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span
                      className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--muted)] text-[10px] font-bold text-[var(--muted-foreground)]"
                      aria-hidden="true"
                    >
                      {index + 1}
                    </span>
                    <span className="truncate text-[13px] font-medium text-[var(--program-text)]">
                      {attendee.name}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-baseline gap-1.5">
                    <span className="font-[family-name:var(--font-poppins)] text-[22px] leading-none font-semibold tabular-nums text-[var(--chart-1)]">
                      {attendee.attendanceCount.toLocaleString("en-IN")}
                    </span>
                    <span className="text-[11px] text-[var(--muted-foreground)]">check-ins</span>
                  </span>
                </span>
                <span className="h-1.5 overflow-hidden rounded-full bg-[var(--muted)]">
                  <span
                    className="block h-full rounded-full bg-[var(--chart-1)]"
                    style={{
                      width: `${max === 0 ? 0 : Math.max(2, (attendee.attendanceCount / max) * 100)}%`,
                    }}
                  />
                </span>
              </>
            )

            return (
              <li key={attendee.contactId} data-session-top-attendee={attendee.contactId}>
                {attendee.recordAvailable ? (
                  <ContactRecordTrigger
                    contactId={attendee.contactId}
                    name={attendee.name}
                    sequence={recordSequence}
                    className="flex w-full flex-col gap-2 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-[var(--muted)]/30"
                    staticClassName="flex w-full flex-col gap-2 rounded-lg px-2 py-2.5"
                  >
                    {row}
                  </ContactRecordTrigger>
                ) : (
                  <div className="flex flex-col gap-2 rounded-lg px-2 py-2.5">{row}</div>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </SectionCard>
  )
}
