import { authzErrorResponse, getStaffContext, requireRole } from "@/lib/authz"
import { getSessionAttendanceEligibility } from "@/lib/attendance-session"
import {
  createAttendanceRecord,
  findAttendanceByContactAndSession,
  findContactByPhone,
  findSessionById,
  getAttendanceByDate,
  getAttendanceDashboardRecords,
  getAttendanceBySessionRecord,
  normalizeMobile,
} from "@/lib/supabase/data"

export const dynamic = "force-dynamic"

const MAX_KNOWN_ATTENDANCE_IDS = 1000
const ATTENDANCE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface AttendancePayload {
  mobile?: string
  sessionId?: string
}

function parseKnownAttendanceIds(value: string | null): Set<string> | null {
  if (!value) {
    return null
  }

  const ids = value
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)

  if (ids.length === 0 || ids.length > MAX_KNOWN_ATTENDANCE_IDS || ids.some((id) => !ATTENDANCE_ID_PATTERN.test(id))) {
    return null
  }

  return new Set(ids)
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AttendancePayload
    const mobile = normalizeMobile(body.mobile)
    const sessionId = body.sessionId?.trim()

    if (!mobile) {
      return Response.json({ error: "Invalid mobile number" }, { status: 400 })
    }

    if (!sessionId) {
      return Response.json({ error: "A session-specific attendance link is required." }, { status: 400 })
    }

    const session = await findSessionById(sessionId)
    const windowState = getSessionAttendanceEligibility(session)
    if (!windowState.ok) {
      return Response.json({ error: windowState.error }, { status: windowState.status })
    }
    if (!session) {
      return Response.json({ error: "Invalid attendance session." }, { status: 404 })
    }

    const contact = await findContactByPhone(mobile)
    if (!contact) {
      return Response.json(
        {
          error: "User not found. Please register first.",
          notRegistered: true,
          mobile,
          sessionId,
        },
        { status: 404 },
      )
    }

    const existing = await findAttendanceByContactAndSession(contact.id, sessionId, session)
    if (existing) {
      return Response.json(
        {
          error: "Attendance already marked for this session",
          duplicate: true,
          id: existing.id,
          mobile,
          userName: contact.name,
          sessionId,
          createdAt: existing.createdTime || new Date().toISOString(),
        },
        { status: 409 },
      )
    }

    const attendanceRecord = await createAttendanceRecord({
      contactId: contact.id,
      sessionId,
      phone: mobile,
      name: contact.name,
    })

    return Response.json(
      {
        id: attendanceRecord.id,
        mobile,
        userName: contact.name,
        sessionId,
        createdAt: new Date().toISOString(),
      },
      { status: 201 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to mark attendance"
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const staff = await getStaffContext()
    requireRole(staff, ["Admin", "Preacher", "Assistant"])

    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get("session")?.trim()
    const knownAttendanceIds = parseKnownAttendanceIds(searchParams.get("knownAttendanceIds"))
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0]
    let dashboardRecords: Awaited<ReturnType<typeof getAttendanceByDate>>

    if (sessionId) {
      const session = await findSessionById(sessionId)

      if (!session) {
        return Response.json({ error: "Invalid attendance session." }, { status: 404 })
      }

      const isAssistantMatch =
        staff.role === "Assistant" &&
        Boolean(staff.assignedPreacherUserId) &&
        session.preacherIds.includes(staff.assignedPreacherUserId || "")

      const canReadSession =
        staff.role === "Admin" ||
        session.preacherIds.includes(staff.userId) ||
        (staff.role !== "Assistant" &&
          session.locationIds.some((locationId) => staff.locationIds.includes(locationId))) ||
        isAssistantMatch

      if (!canReadSession) {
        return Response.json({ error: "This session is outside your allowed scope." }, { status: 403 })
      }

      dashboardRecords = await getAttendanceBySessionRecord(session, { knownAttendanceIds })
    } else {
      dashboardRecords = await getAttendanceByDate(date)
    }

    const attendanceList = await getAttendanceDashboardRecords(dashboardRecords || [], date, {
      hydrateContacts: Boolean(sessionId),
    })

    return Response.json(attendanceList, {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    })
  } catch (error) {
    return authzErrorResponse(error)
  }
}
