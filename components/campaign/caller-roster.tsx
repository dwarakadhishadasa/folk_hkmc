import { CallerStatusControl } from "@/components/campaign/caller-status-control"
import { CallerStatusPill } from "@/components/campaign/caller-status-pill"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import type { CallerRosterEntry } from "@/lib/dialer/callers"
import type { RosterProgress } from "@/lib/dialer/progress"

/**
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

const HEAD_CLASS =
  "px-2 text-xs font-semibold tracking-[0.04em] text-[var(--muted-foreground)] uppercase sm:px-4"

const COUNT_CLASS = "px-2 py-3 text-[13px] text-[var(--program-text)] tabular-nums sm:px-4"

/**
 * Frame 645's roster, with its four performance columns filled from
 * `getRosterProgress` — the roster's own aggregation of `campaign_progress`
 * across every campaign the reader can see, never a count taken here.
 *
 * A row without a caller profile has no key in the map and reads `0` in the
 * three count columns: without a caller id it cannot hold an assignment, so the
 * zero is measured and not a stand-in for "unknown". Its email is still shown —
 * `Contact` is the staff identity, not a performance number.
 */
export function CallerRoster({
  entries,
  progress,
  canManage,
}: {
  entries: CallerRosterEntry[]
  progress: RosterProgress
  /** Admin only: AD-2 keeps deactivation and reactivation out of every other role's hands. */
  canManage: boolean
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-[var(--muted)] hover:bg-[var(--muted)]">
            <TableHead className={HEAD_CLASS}>Caller</TableHead>
            <TableHead className={HEAD_CLASS}>Contact</TableHead>
            <TableHead className={HEAD_CLASS}>Campaigns</TableHead>
            <TableHead className={HEAD_CLASS}>Calls made</TableHead>
            <TableHead className={HEAD_CLASS}>Reached</TableHead>
            <TableHead className={HEAD_CLASS}>Status</TableHead>
            <TableHead className="px-2 text-right sm:px-4">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => {
            const callerProgress = entry.callerId ? progress.get(entry.callerId) : undefined

            return (
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
                  <span className="block max-w-[180px] truncate text-[13px] text-[var(--muted-foreground)]">
                    {entry.email}
                  </span>
                </TableCell>
                <TableCell className={COUNT_CLASS}>{callerProgress?.assigned ?? 0}</TableCell>
                <TableCell className={COUNT_CLASS}>{callerProgress?.callsMade ?? 0}</TableCell>
                <TableCell className={COUNT_CLASS}>{callerProgress?.reached ?? 0}</TableCell>
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
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
