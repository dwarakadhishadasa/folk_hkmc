/**
 * The one definition of "this attendance window is open".
 *
 * It was copied into `apps/<program>/app/dashboard/page.tsx` and
 * `components/sessions-manager.tsx`; the dashboard's live band is the fourth
 * caller, so it lives here and every caller reads it.
 *
 * A session is live when public attendance is enabled, now is at or after
 * `attendance_opens_at` (when present), and now is strictly before
 * `attendance_closes_at`. A missing close is not an endless live session.
 *
 * Client-safe: the Sessions manager and the dashboard's polling band are both
 * client components.
 */

export interface LiveWindow {
  publicAttendanceEnabled: boolean | null | undefined
  attendanceOpensAt: string | null | undefined
  attendanceClosesAt: string | null | undefined
}

export function parseSessionTime(value: string | null | undefined): number | null {
  if (!value) {
    return null
  }

  const time = Date.parse(value)
  return Number.isFinite(time) ? time : null
}

export function isSessionLive(session: LiveWindow, now: number): boolean {
  if (!session.publicAttendanceEnabled) {
    return false
  }

  const opensAt = parseSessionTime(session.attendanceOpensAt)
  const closesAt = parseSessionTime(session.attendanceClosesAt)

  if (closesAt === null || closesAt <= now) {
    return false
  }

  return opensAt === null || opensAt <= now
}

/** The next boundary a client should wake at, so the band flips without a reload. */
export function nextSessionBoundary(sessions: LiveWindow[], now: number): number | null {
  const futureBoundaries = sessions
    .flatMap((session) => [
      parseSessionTime(session.attendanceOpensAt),
      parseSessionTime(session.attendanceClosesAt),
    ])
    .filter((time): time is number => time !== null && time > now)

  return futureBoundaries.length > 0 ? Math.min(...futureBoundaries) : null
}
