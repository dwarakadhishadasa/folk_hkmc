import "server-only"

import type { SessionRecord } from "@/lib/airtable"

export interface SessionEligibilityFailure {
  ok: false
  status: number
  error: string
}

export interface SessionEligibilitySuccess {
  ok: true
}

export type SessionEligibilityResult = SessionEligibilityFailure | SessionEligibilitySuccess

export function getSessionAttendanceEligibility(session: SessionRecord | null): SessionEligibilityResult {
  if (!session) {
    return { ok: false, status: 404, error: "Invalid attendance session." }
  }

  if (!session.publicAttendanceEnabled) {
    return { ok: false, status: 403, error: "Attendance is not open for this session." }
  }

  const now = Date.now()
  if (session.attendanceOpensAt && now < Date.parse(session.attendanceOpensAt)) {
    return { ok: false, status: 403, error: "Attendance is not open yet." }
  }

  if (session.attendanceClosesAt && now > Date.parse(session.attendanceClosesAt)) {
    return { ok: false, status: 403, error: "Attendance is closed for this session." }
  }

  return { ok: true }
}
