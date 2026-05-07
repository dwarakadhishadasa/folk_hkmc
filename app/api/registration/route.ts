import {
  createContact,
  createAttendanceRecord,
  findAttendanceByContactAndSession,
  findContactByPhone,
  findSessionById,
  normalizeMobile,
  type ContactRecord,
  type SessionRecord,
} from "@/lib/airtable"
import { getSessionAttendanceEligibility } from "@/lib/attendance-session"

export const dynamic = "force-dynamic"

interface RegistrationPayload {
  name?: string
  mobile?: string
  age?: string | number
  occupation?: string
  year?: string
  location?: string
  sessionId?: string
}

type RegistrationOutcome = "contact_created" | "contact_exists"
type AttendanceOutcome = "attendance_marked" | "attendance_already_marked"

function parseAge(value: unknown): number | undefined {
  const age = typeof value === "number" ? value : Number.parseInt(String(value || ""), 10)
  return Number.isFinite(age) && age > 0 ? age : undefined
}

function completedResponse(params: {
  status: number
  contact: ContactRecord
  session: SessionRecord
  registrationOutcome: RegistrationOutcome
  attendanceOutcome: AttendanceOutcome
  attendanceId: string
  attendanceCreatedAt?: string
}) {
  return Response.json(
    {
      completed: true,
      sessionBacked: true,
      registrationOutcome: params.registrationOutcome,
      attendanceOutcome: params.attendanceOutcome,
      contact: { id: params.contact.id, name: params.contact.name, phone: params.contact.phone },
      attendance: {
        id: params.attendanceId,
        createdAt: params.attendanceCreatedAt || new Date().toISOString(),
      },
      sessionId: params.session.id,
    },
    { status: params.status },
  )
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as RegistrationPayload
    const mobile = normalizeMobile(payload.mobile)
    const name = payload.name?.trim()

    if (!name || !mobile) {
      return Response.json({ error: "Name and a valid 10-digit mobile number are required." }, { status: 400 })
    }

    const sessionId = payload.sessionId?.trim()
    let session: SessionRecord | null = null

    if (sessionId) {
      session = await findSessionById(sessionId)
      const eligibility = getSessionAttendanceEligibility(session)
      if (!eligibility.ok) {
        return Response.json({ error: eligibility.error }, { status: eligibility.status })
      }

      if (!session) {
        return Response.json({ error: "This attendance session is no longer available." }, { status: 404 })
      }

      if (!session.preacherIds[0] || !session.locationIds[0]) {
        return Response.json({ error: "This attendance session is missing preacher or location routing." }, { status: 422 })
      }
    }

    const existing = await findContactByPhone(mobile)
    if (existing && !session) {
      return Response.json(
        {
          alreadyRegistered: true,
          contact: { id: existing.id, name: existing.name, phone: existing.phone },
        },
        { status: 409 },
      )
    }

    let assignedPreacherAirtableUserId: string | undefined
    let locationId: string | undefined

    if (session) {
      assignedPreacherAirtableUserId = session.preacherIds[0]
      locationId = session.locationIds[0]
    }

    const contact =
      existing ||
      (await createContact({
        name,
        phone: mobile,
        age: parseAge(payload.age),
        year: payload.occupation === "Working" ? "Unknown" : payload.year || undefined,
        source: session ? "Attendance Registration" : "Public Registration",
        locationId,
        location: locationId ? undefined : payload.location,
        assignedPreacherAirtableUserId,
      }))

    if (session) {
      const existingAttendance = await findAttendanceByContactAndSession(contact.id, session.id, session)
      if (existingAttendance) {
        return completedResponse({
          status: existing ? 200 : 201,
          contact,
          session,
          registrationOutcome: existing ? "contact_exists" : "contact_created",
          attendanceOutcome: "attendance_already_marked",
          attendanceId: existingAttendance.id,
          attendanceCreatedAt: existingAttendance.createdTime,
        })
      }

      const attendance = await createAttendanceRecord({
        contactId: contact.id,
        sessionId: session.id,
        phone: mobile,
        name: contact.name,
      })

      return completedResponse({
        status: existing ? 200 : 201,
        contact,
        session,
        registrationOutcome: existing ? "contact_exists" : "contact_created",
        attendanceOutcome: "attendance_marked",
        attendanceId: attendance.id,
        attendanceCreatedAt: attendance.createdTime,
      })
    }

    return Response.json({ contact }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to submit registration"
    return Response.json({ error: message }, { status: 500 })
  }
}
