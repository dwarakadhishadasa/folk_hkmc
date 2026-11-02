"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"

import type { DashboardLiveSession } from "@/lib/dashboard/live"
import { formatClosingTime, formatUpdated } from "@/lib/dashboard/format"

const REFRESH_INTERVAL_MS = 20_000
const MAX_VISIBLE_SESSIONS = 3

async function readCheckInCount(sessionId: string): Promise<number> {
  const response = await fetch(`/attendance?session=${encodeURIComponent(sessionId)}`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
  })

  if (!response.ok) {
    throw new Error(`Live count read failed: ${response.status}`)
  }

  const rows = (await response.json()) as unknown
  if (!Array.isArray(rows)) {
    throw new Error("Live count read returned an unexpected payload.")
  }

  return rows.length
}

/**
 * Live sessions, refreshed every 20 seconds while the tab is visible.
 *
 * It is not period-scoped: it answers "is anything open right now". The count
 * is `aria-live="polite"` so a screen reader hears the change without a
 * full-page announcement, and `Updated {time}` appears only once a refresh has
 * actually succeeded.
 */
export function DashboardLiveBand({ sessions }: { sessions: DashboardLiveSession[] }) {
  const [counts, setCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(sessions.map((session) => [session.id, session.checkIns])),
  )
  const [failed, setFailed] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (document.visibilityState !== "visible") {
      return
    }

    try {
      const entries = await Promise.all(
        sessions.map(async (session) => [session.id, await readCheckInCount(session.id)] as const),
      )

      setCounts((previous) => ({ ...previous, ...Object.fromEntries(entries) }))
      setFailed(false)
      setUpdatedAt(new Date().toISOString())
    } catch (error) {
      console.error("[dashboard] live count refresh failed", error)
      setFailed(true)
    }
  }, [sessions])

  useEffect(() => {
    const interval = window.setInterval(refresh, REFRESH_INTERVAL_MS)

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refresh()
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [refresh])

  if (sessions.length === 0) {
    return null
  }

  const visible = sessions.slice(0, MAX_VISIBLE_SESSIONS)
  const overflow = sessions.length - visible.length

  return (
    <section aria-label="Live sessions" className="flex flex-col gap-2">
      <div className="relative overflow-hidden rounded-xl border border-success/30 shadow-[0_18px_50px_rgba(45,10,10,0.08)]">
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in oklab, var(--success) 8%, var(--card)), var(--card))",
          }}
          aria-hidden="true"
        />
        <ul className="relative divide-y divide-[var(--border)]">
          {visible.map((session) => {
            const count = counts[session.id] ?? session.checkIns
            const meta = [session.preacherName, session.locationNames.join(", "), session.closesAt ? `closes ${formatClosingTime(session.closesAt)}` : null]
              .filter((part): part is string => Boolean(part))
              .join(" · ")

            return (
              <li
                key={session.id}
                data-dashboard-live-session={session.id}
                className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success/15 px-3 py-1.5 text-xs font-semibold text-success">
                      <span className="size-2 animate-pulse rounded-full bg-success motion-reduce:animate-none" aria-hidden="true" />
                      Live
                    </span>
                    <p className="min-w-0 truncate font-[family-name:var(--font-poppins)] text-base font-semibold text-[var(--program-text)]">
                      {session.name}
                    </p>
                  </div>
                  {meta ? <p className="mt-1 text-xs text-[var(--muted-foreground)]">{meta}</p> : null}
                </div>

                <div className="flex items-center justify-between gap-4 sm:justify-end">
                  <p
                    className="whitespace-nowrap font-[family-name:var(--font-poppins)] text-2xl font-bold tabular-nums text-[var(--program-text)]"
                    aria-live="polite"
                    data-dashboard-live-count={session.id}
                  >
                    {count}
                    <span className="ml-1 text-xs font-medium text-[var(--muted-foreground)]">
                      checked in
                    </span>
                  </p>
                  <Link
                    href={`/sessions/${session.id}/live`}
                    className="inline-flex h-9 shrink-0 items-center rounded-md border border-[var(--border)] px-3 text-sm font-semibold text-[var(--program-text)] transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    Open Sessions
                  </Link>
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--muted-foreground)]">
        {overflow > 0 ? (
          <Link
            href="/sessions"
            className="font-semibold text-[var(--program-primary)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            +{overflow} more live
          </Link>
        ) : null}
        {updatedAt ? <span>Updated {formatUpdated(updatedAt)}</span> : null}
        {failed ? (
          <span className="flex items-center gap-2 text-destructive">
            Could not refresh live counts.
            <button
              type="button"
              onClick={() => void refresh()}
              className="font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              Retry
            </button>
          </span>
        ) : null}
      </div>
    </section>
  )
}
