import { useMemo } from "react"

import {
  assignedBarHeading,
  assignedCallerRows,
} from "@/components/campaign/assign-contacts-assigned"
import type { AssignableContactView } from "@/components/campaign/assign-contacts-types"

const CALLER_PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const

/**
 * The campaign's existing assignment split, above the primary action.
 *
 * It mirrors the Contacts Overview's location bar: a stacked proportion bar
 * over ranked legend rows. Segments are the assigned share of the whole scoped
 * set, so the muted track left behind is the unassigned remainder.
 */
export function AssignContactsAssignedBar({
  campaignStatus,
  contacts,
}: {
  campaignStatus: string
  contacts: readonly AssignableContactView[]
}) {
  const { rows, assignedCount, total } = useMemo(() => assignedCallerRows(contacts), [contacts])

  if (assignedCount === 0) {
    return null
  }

  return (
    <section
      aria-labelledby="assign-contacts-assigned-heading"
      className="flex max-h-[30%] shrink-0 flex-col border-t border-[var(--border)]"
    >
      <div className="px-4 pt-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3
            id="assign-contacts-assigned-heading"
            className="text-[13px] font-semibold text-[var(--program-text)]"
          >
            {assignedBarHeading(campaignStatus)}
          </h3>
          <p className="text-[11px] tabular-nums text-[var(--muted-foreground)]">
            {assignedCount.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")}{" "}
            {total === 1 ? "contact" : "contacts"}
          </p>
        </div>

        <div
          className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-[var(--muted)]"
          aria-hidden="true"
        >
          {rows.map((row, index) => (
            <span
              key={row.callerName}
              className="h-full"
              style={{
                flexBasis: 0,
                flexGrow: row.count,
                backgroundColor: CALLER_PALETTE[index % CALLER_PALETTE.length],
              }}
            />
          ))}
        </div>
      </div>

      <ul className="min-h-0 overflow-y-auto px-4 pt-2 pb-3">
        {rows.map((row, index) => (
          <li key={row.callerName} className="flex items-center gap-2 py-0.5 text-[12px]">
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: CALLER_PALETTE[index % CALLER_PALETTE.length] }}
            />
            <span
              className="min-w-0 flex-1 truncate text-[var(--program-text)]"
              title={row.callerName}
            >
              {row.callerName}
            </span>
            <span className="font-semibold tabular-nums text-[var(--program-text)]">
              {row.count.toLocaleString("en-IN")}
            </span>
            <span className="w-9 text-right text-[11px] tabular-nums text-[var(--muted-foreground)]">
              {row.percentage}%
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
