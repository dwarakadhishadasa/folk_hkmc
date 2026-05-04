import { authzErrorResponse, getStaffContext, requireRole } from "@/lib/authz"
import {
  createAttendanceRecord,
  findAttendanceByContactAndSession,
  findContactByPhone,
  findSessionById,
  getAttendanceByDate,
  normalizeMobile,
} from "@/lib/airtable"

export const dynamic = "force-dynamic"

interface AttendancePayload {
  mobile?: string
  sessionId?: string
}

function sessionWindowState(session: Awaited<ReturnType<typeof findSessionById>>) {
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
    const windowState = sessionWindowState(session)
    if (!windowState.ok) {
      return Response.json({ error: windowState.error }, { status: windowState.status })
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

    const existing = await findAttendanceByContactAndSession(contact.id, sessionId)
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
    requireRole(staff, ["Admin", "Preacher"])

    const { searchParams } = new URL(request.url)
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0]
    const airtableRecords = await getAttendanceByDate(date)

    const attendanceList = (airtableRecords || []).map((record) => ({
      id: record.id,
      mobile: String(record.fields.Phone || ""),
      userName: record.fields.Name || "Unknown",
      createdAt: record.createdTime || record.fields["Attendance Date"] || date,
    }))

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
