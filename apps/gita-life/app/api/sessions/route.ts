import { authzErrorResponse, getStaffContext, requireRole } from "@/lib/authz"
import {
  createSession,
  findLocationById,
  listSessions,
  updateSessionAttendanceUrl,
} from "@/lib/airtable"

export const dynamic = "force-dynamic"

interface SessionPayload {
  name?: string
  locationId?: string
  durationMinutes?: string | number
}

const DEFAULT_SESSION_DURATION_MINUTES = 15
const MIN_SESSION_DURATION_MINUTES = 1
const MAX_SESSION_DURATION_MINUTES = 24 * 60
const MINUTE_MS = 60 * 1000

function requireSiteUrl(): URL {
  const value = process.env.NEXT_PUBLIC_SITE_URL
  if (!value) {
    throw new Error("NEXT_PUBLIC_SITE_URL is required to generate attendance links.")
  }

  return new URL(value)
}

function parseDurationMinutes(value: unknown): { durationMinutes?: number; error?: string } {
  if (value === undefined || value === null || value === "") {
    return { durationMinutes: DEFAULT_SESSION_DURATION_MINUTES }
  }

  const durationMinutes = typeof value === "number" ? value : Number(String(value).trim())
  if (!Number.isInteger(durationMinutes)) {
    return { error: "Duration must be a whole number of minutes." }
  }

  if (durationMinutes < MIN_SESSION_DURATION_MINUTES || durationMinutes > MAX_SESSION_DURATION_MINUTES) {
    return {
      error: `Duration must be between ${MIN_SESSION_DURATION_MINUTES} and ${MAX_SESSION_DURATION_MINUTES} minutes.`,
    }
  }

  return { durationMinutes }
}

export async function GET() {
  try {
    const staff = await getStaffContext()
    requireRole(staff, ["Admin", "Preacher"])

    const sessions = await listSessions()
    const scoped =
      staff.role === "Admin"
        ? sessions
        : sessions.filter(
            (session) =>
              session.preacherIds.includes(staff.airtableUserId) ||
              session.locationIds.some((locationId) => staff.locationIds.includes(locationId)),
          )

    return Response.json({
      sessions: scoped.map((session) => ({
        id: session.id,
        name: session.name,
        sessionDate: session.sessionDate || null,
        locationIds: session.locationIds,
        preacherIds: session.preacherIds,
        publicAttendanceEnabled: session.publicAttendanceEnabled,
        attendanceOpensAt: session.attendanceOpensAt || null,
        attendanceClosesAt: session.attendanceClosesAt || null,
        attendanceUrl: session.attendanceUrl || null,
      })),
    })
  } catch (error) {
    return authzErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const staff = await getStaffContext()
    requireRole(staff, ["Admin", "Preacher"])

    const payload = (await request.json()) as SessionPayload
    const name = payload.name?.trim()
    const locationId = payload.locationId?.trim()
    const duration = parseDurationMinutes(payload.durationMinutes)

    if (!name || !locationId) {
      return Response.json({ error: "Session name and location are required." }, { status: 400 })
    }

    if (duration.error || !duration.durationMinutes) {
      return Response.json({ error: duration.error }, { status: 400 })
    }

    if (staff.role === "Preacher" && !staff.locationIds.includes(locationId)) {
      return Response.json({ error: "This location is outside your allowed scope." }, { status: 403 })
    }

    const location = await findLocationById(locationId)
    if (!location) {
      return Response.json({ error: "Selected location does not exist." }, { status: 400 })
    }

    const siteUrl = requireSiteUrl()
    const startsAt = new Date()
    const closesAt = new Date(startsAt.getTime() + duration.durationMinutes * MINUTE_MS)
    const session = await createSession({
      name,
      sessionDate: startsAt.toISOString(),
      locationId,
      preacherAirtableUserId: staff.airtableUserId,
      durationMinutes: duration.durationMinutes,
      publicAttendanceEnabled: true,
      attendanceOpensAt: startsAt.toISOString(),
      attendanceClosesAt: closesAt.toISOString(),
    })

    const attendanceUrl = new URL("/attend", siteUrl)
    attendanceUrl.searchParams.set("session", session.id)

    const updated = await updateSessionAttendanceUrl(session.id, attendanceUrl.toString())
    return Response.json({ session: updated }, { status: 201 })
  } catch (error) {
    return authzErrorResponse(error)
  }
}
