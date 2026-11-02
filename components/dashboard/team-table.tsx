import Link from "next/link"

import { DashboardCard } from "@/components/dashboard/dashboard-card"
import { formatCount, formatDay } from "@/lib/dashboard/format"
import type { DashboardRole, DashboardTeam } from "@/lib/dashboard/types"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const HEAD_CLASS = "h-11 px-2 text-[13px] font-semibold text-[var(--program-text)] sm:px-4"

const AVATAR_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

function avatarColor(name: string): string {
  let hash = 0
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  }

  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!
}

function NameCell({ name }: { name: string }) {
  const accent = avatarColor(name)

  return (
    <span className="flex items-center gap-2.5">
      <span
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
        style={{
          backgroundColor: `color-mix(in oklab, ${accent} 14%, var(--card))`,
          color: accent,
        }}
        aria-hidden="true"
      >
        {initials(name)}
      </span>
      <span className="truncate">{name}</span>
    </span>
  )
}

/**
 * The team comparison: preachers in All scope, locations in Own scope, on the
 * same seven figures. A row with no activity stays with zeros — that is the
 * table's job.
 */
export function DashboardTeamTable({
  team,
  role,
  programScope,
  hasDialer,
}: {
  team: DashboardTeam
  role: DashboardRole
  programScope: boolean
  hasDialer: boolean
}) {
  const nameHeading = team.groupBy === "preacher" ? "Preacher" : "Location"
  const title = team.groupBy === "preacher" ? "By preacher" : "By location"
  const subtitle = hasDialer
    ? team.groupBy === "preacher"
      ? "Contacts collected, calls and attendance for every preacher in the programme"
      : "Contacts collected, calls and attendance for every location in your scope"
    : team.groupBy === "preacher"
      ? "Contacts collected, sessions and attendance for every preacher in the programme"
      : "Contacts collected, sessions and attendance for every location in your scope"

  return (
    <DashboardCard title={title} subtitle={subtitle}>
      {team.rows.length === 0 ? (
        <div className="px-2 py-10 text-center">
          <p className="text-sm text-[var(--muted-foreground)]">
            {team.groupBy === "preacher"
              ? "No preachers in this programme yet."
              : "No locations in this scope yet."}
          </p>
          {team.groupBy === "preacher" && role !== "Assistant" ? (
            <Link
              href={role === "Admin" ? "/admin/invite" : "/volunteers"}
              className="mt-3 inline-flex text-sm font-semibold text-[var(--program-primary)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              {role === "Admin" ? "Invite a preacher" : "Manage volunteers"}
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-[var(--border)] md:block">
            <Table>
              <caption className="sr-only">
                Assigned contacts and sessions only.
              </caption>
              <TableHeader>
                <TableRow className="border-b border-[var(--border)] bg-[var(--muted)]/50 hover:bg-[var(--muted)]/50">
                  <TableHead className={HEAD_CLASS} scope="col">
                    {nameHeading}
                  </TableHead>
                  <TableHead className={HEAD_CLASS} scope="col">
                    Collected
                  </TableHead>
                  {hasDialer ? (
                    <>
                      <TableHead className={HEAD_CLASS} scope="col">
                        Calls
                      </TableHead>
                      <TableHead className={HEAD_CLASS} scope="col">
                        Reached
                      </TableHead>
                      <TableHead className={HEAD_CLASS} scope="col">
                        Confirmed
                      </TableHead>
                    </>
                  ) : null}
                  <TableHead className={HEAD_CLASS} scope="col">
                    Sessions
                  </TableHead>
                  <TableHead className={HEAD_CLASS} scope="col">
                    Attendees
                  </TableHead>
                  <TableHead className={HEAD_CLASS} scope="col">
                    Last activity
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {team.rows.map((row) => (
                  <TableRow
                    key={row.key}
                    className="h-12 border-b border-[var(--border)] transition-colors hover:bg-foreground/[0.02]"
                  >
                    <TableCell className="px-2 py-3 text-[14px] font-medium text-[var(--program-text)] sm:px-4">
                      <NameCell name={row.name} />
                    </TableCell>
                    <TableCell className="px-2 py-3 text-[14px] tabular-nums text-[var(--program-text)] sm:px-4">
                      {formatCount(row.contactsCollected)}
                    </TableCell>
                    {hasDialer ? (
                      <>
                        <TableCell className="px-2 py-3 text-[14px] tabular-nums text-[var(--program-text)] sm:px-4">
                          {formatCount(row.callsMade)}
                        </TableCell>
                        <TableCell className="px-2 py-3 text-[14px] tabular-nums text-[var(--program-text)] sm:px-4">
                          {formatCount(row.reached)}
                        </TableCell>
                        <TableCell className="px-2 py-3 text-[14px] tabular-nums text-[var(--program-text)] sm:px-4">
                          {formatCount(row.confirmed)}
                        </TableCell>
                      </>
                    ) : null}
                    <TableCell className="px-2 py-3 text-[14px] tabular-nums text-[var(--program-text)] sm:px-4">
                      {formatCount(row.sessions)}
                    </TableCell>
                    <TableCell className="px-2 py-3 text-[14px] tabular-nums text-[var(--program-text)] sm:px-4">
                      {formatCount(row.attendees)}
                    </TableCell>
                    <TableCell className="px-2 py-3 text-[14px] whitespace-nowrap text-[var(--muted-foreground)] sm:px-4">
                      {formatDay(row.lastActivity)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="flex flex-col divide-y divide-[var(--border)] md:hidden">
            {team.rows.map((row) => (
              <li key={row.key} className="py-3 first:pt-0 last:pb-0">
                <p className="flex items-center gap-2.5 text-sm font-semibold text-[var(--program-text)]">
                  <span
                    className="flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                    style={{
                      backgroundColor: `color-mix(in oklab, ${avatarColor(row.name)} 14%, var(--card))`,
                      color: avatarColor(row.name),
                    }}
                    aria-hidden="true"
                  >
                    {initials(row.name)}
                  </span>
                  {row.name}
                </p>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--muted-foreground)]">Collected</dt>
                    <dd className="tabular-nums text-[var(--program-text)]">
                      {formatCount(row.contactsCollected)}
                    </dd>
                  </div>
                  {hasDialer ? (
                    <>
                      <div className="flex justify-between gap-2">
                        <dt className="text-[var(--muted-foreground)]">Calls</dt>
                        <dd className="tabular-nums text-[var(--program-text)]">
                          {formatCount(row.callsMade)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-[var(--muted-foreground)]">Reached</dt>
                        <dd className="tabular-nums text-[var(--program-text)]">{formatCount(row.reached)}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-[var(--muted-foreground)]">Confirmed</dt>
                        <dd className="tabular-nums text-[var(--program-text)]">
                          {formatCount(row.confirmed)}
                        </dd>
                      </div>
                    </>
                  ) : null}
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--muted-foreground)]">Sessions</dt>
                    <dd className="tabular-nums text-[var(--program-text)]">{formatCount(row.sessions)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--muted-foreground)]">Attendees</dt>
                    <dd className="tabular-nums text-[var(--program-text)]">
                      {formatCount(row.attendees)}
                    </dd>
                  </div>
                  <div className="col-span-2 flex justify-between gap-2">
                    <dt className="text-[var(--muted-foreground)]">Last activity</dt>
                    <dd className="text-[var(--program-text)]">{formatDay(row.lastActivity)}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>

          <p className="mt-3 text-xs text-[var(--muted-foreground)]">
            {programScope
              ? "Assigned contacts only."
              : "Sessions and contacts in your scope only."}
          </p>
        </>
      )}
    </DashboardCard>
  )
}
