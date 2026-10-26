import { CallerStatusControl } from "@/components/campaign/caller-status-control"
import { CallerStatusPill } from "@/components/campaign/caller-status-pill"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import type { CallerRosterEntry } from "@/lib/dialer/callers"

/**
 * The roster table (frame 645), carrying only the columns this story can fill.
 *
 * The frame also draws Contact, Campaigns, Calls made and Reached. Those are
 * `campaign_progress` facts owned by Story 1.9, so they are absent rather than
 * rendered as `0`: a zero is a claim about a caller, and this surface cannot
 * compute one yet.
 *
 * A deactivated caller is dimmed but never removed — that row is the only place
 * their history stays visible — and a staff user with no caller profile keeps a
 * row too, because promotion happens by assignment (Story 1.8), not here.
 */
function statusFor(entry: CallerRosterEntry): "active" | "inactive" | "unassigned" {
  if (entry.isActive) {
    return "active"
  }

  return entry.deactivated ? "inactive" : "unassigned"
}

export function CallerRoster({
  entries,
  canManage,
}: {
  entries: CallerRosterEntry[]
  /** Admin only: AD-2 keeps deactivation and reactivation out of every other role's hands. */
  canManage: boolean
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-[var(--muted)] hover:bg-[var(--muted)]">
            <TableHead className="px-2 text-xs font-semibold tracking-[0.04em] text-[var(--muted-foreground)] uppercase sm:px-4">
              Caller
            </TableHead>
            <TableHead className="px-2 text-xs font-semibold tracking-[0.04em] text-[var(--muted-foreground)] uppercase sm:px-4">
              Status
            </TableHead>
            <TableHead className="px-2 text-right sm:px-4">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.userId}>
              <TableCell className="px-2 py-3 sm:px-4">
                <span
                  className={cn(
                    "text-[13px] font-medium",
                    entry.deactivated ? "text-[var(--muted-foreground)]" : "text-[var(--program-text)]",
                  )}
                >
                  {entry.name}
                </span>
              </TableCell>
              <TableCell className="px-2 py-3 sm:px-4">
                <CallerStatusPill status={statusFor(entry)} />
              </TableCell>
              <TableCell className="px-2 py-3 text-right sm:px-4">
                {canManage && entry.callerId ? (
                  <CallerStatusControl
                    callerId={entry.callerId}
                    name={entry.name}
                    isActive={entry.isActive}
                  />
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
