"use client"

import { useMemo } from "react"
import type { ManagePortalPayload, ManageSession } from "@/components/manage/manage-types"
import { Badge } from "@/components/ui/badge"

const UNGROUPED_LOCATION = "Unassigned"

function groupKey(session: ManageSession): string {
  return session.locationId ?? UNGROUPED_LOCATION
}

export function ManageSessionsView({ payload }: { payload: ManagePortalPayload }) {
  const groups = useMemo(() => {
    const byLocation = new Map<string, { key: string; label: string; sessions: ManageSession[] }>()

    for (const session of payload.sessions) {
      const key = groupKey(session)
      let group = byLocation.get(key)
      if (!group) {
        group = { key, label: session.locationName ?? UNGROUPED_LOCATION, sessions: [] }
        byLocation.set(key, group)
      }
      group.sessions.push(session)
    }

    return [...byLocation.values()].sort((left, right) => left.label.localeCompare(right.label))
  }, [payload.sessions])

  const totalAttendees = payload.sessions.reduce((sum, session) => sum + session.attendees.length, 0)

  if (groups.length === 0) {
    return (
      <section className="rounded-lg border border-[var(--border)] bg-card px-5 py-12 text-center shadow-[0_18px_50px_rgba(45,10,10,0.08)]">
        <p className="text-sm text-[var(--muted-foreground)]">No sessions are visible in this scope.</p>
      </section>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-[family-name:var(--font-poppins)] text-lg font-semibold text-[var(--program-text)]">
            Sessions by location
          </h2>
          <p className="text-sm text-[var(--muted-foreground)]">
            {payload.sessions.length.toLocaleString("en-IN")} sessions ·{" "}
            {totalAttendees.toLocaleString("en-IN")} attendance records
          </p>
        </div>
      </div>

      {groups.map((group) => {
        const groupAttendees = group.sessions.reduce((sum, session) => sum + session.attendees.length, 0)

        return (
          <section
            key={group.key}
            className="overflow-hidden rounded-lg border border-[var(--border)] bg-card shadow-[0_18px_50px_rgba(45,10,10,0.08)]"
          >
            <div className="flex items-center justify-between bg-[var(--program-primary)] px-5 py-4 text-white">
              <h3 className="font-[family-name:var(--font-poppins)] text-base font-semibold">{group.label}</h3>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-white/70">{group.sessions.length} sessions</span>
                <Badge variant="secondary">{groupAttendees} attendees</Badge>
              </div>
            </div>

            <ul className="divide-y divide-[var(--border)]">
              {group.sessions.map((session) => (
                <li key={session.id} className="px-5 py-4">
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium text-[var(--program-text)]">{session.name}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        {session.sessionDate ?? "No date"} · {session.preacherName ?? "Unknown preacher"}
                      </p>
                    </div>
                    <p className="font-mono text-sm font-semibold tabular-nums text-[var(--program-text)]">
                      {session.attendees.length} attendee{session.attendees.length === 1 ? "" : "s"}
                    </p>
                  </div>

                  {session.attendees.length === 0 ? (
                    <p className="mt-2 text-sm text-[var(--muted-foreground)]">No attendance recorded.</p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {session.attendees.map((attendee) => (
                        <span
                          key={`${session.id}-${attendee.contactId}`}
                          className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-[var(--program-text)]"
                        >
                          {attendee.name}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}