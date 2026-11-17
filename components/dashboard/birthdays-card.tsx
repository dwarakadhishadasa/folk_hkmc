import { DashboardCard, DashboardInlineEmpty } from "@/components/dashboard/dashboard-card"
import { DashboardDateBlock } from "@/components/dashboard/recent-sessions-card"
import type { UpcomingBirthday } from "@/lib/dashboard/birthdays"

function countdownLabel(daysUntil: number): string {
  if (daysUntil === 0) {
    return "Today"
  }
  if (daysUntil === 1) {
    return "Tomorrow"
  }
  return `in ${daysUntil} days`
}

/**
 * The end-of-dashboard birthday list. It is the same list shape as Recent
 * sessions — date block, name and a secondary line, a small figure on the
 * right — so the two cards read as one row of the page.
 */
export function DashboardBirthdaysCard({ birthdays }: { birthdays: UpcomingBirthday[] }) {
  return (
    <DashboardCard title="Upcoming birthdays">
      {birthdays.length === 0 ? (
        <DashboardInlineEmpty>No birthdays in the next 60 days.</DashboardInlineEmpty>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--border)]">
          {birthdays.map((birthday) => (
            <li
              key={birthday.contactId}
              className="flex items-start gap-3 py-3 transition-colors first:pt-0 last:pb-0 hover:bg-foreground/[0.02]"
            >
              <DashboardDateBlock value={birthday.date} />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--program-text)]">{birthday.name}</p>
                <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                  {birthday.turningAge !== null ? `Turns ${birthday.turningAge}` : "Birthday"}
                </p>
              </div>

              <span
                className={
                  birthday.isToday
                    ? "shrink-0 text-[11px] font-semibold text-[var(--program-text)]"
                    : "shrink-0 text-[11px] text-[var(--muted-foreground)]"
                }
              >
                {countdownLabel(birthday.daysUntil)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  )
}
