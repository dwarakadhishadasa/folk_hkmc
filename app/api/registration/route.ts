import {
  createContact,
  findContactByPhone,
  findSessionById,
  normalizeMobile,
} from "@/lib/airtable"

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

function parseAge(value: unknown): number | undefined {
  const age = typeof value === "number" ? value : Number.parseInt(String(value || ""), 10)
  return Number.isFinite(age) && age > 0 ? age : undefined
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as RegistrationPayload
    const mobile = normalizeMobile(payload.mobile)
    const name = payload.name?.trim()

    if (!name || !mobile) {
      return Response.json({ error: "Name and a valid 10-digit mobile number are required." }, { status: 400 })
    }

    const existing = await findContactByPhone(mobile)
    if (existing) {
      return Response.json(
        {
          alreadyRegistered: true,
          contact: { id: existing.id, name: existing.name, phone: existing.phone },
          sessionId: payload.sessionId,
        },
        { status: 409 },
      )
    }

    let assignedPreacherAirtableUserId: string | undefined
    let locationId: string | undefined

    if (payload.sessionId) {
      const session = await findSessionById(payload.sessionId)
      if (!session) {
        return Response.json({ error: "This attendance session is no longer available." }, { status: 400 })
      }
      assignedPreacherAirtableUserId = session.preacherIds[0]
      locationId = session.locationIds[0]
    }

    const contact = await createContact({
      name,
      phone: mobile,
      age: parseAge(payload.age),
      year: payload.occupation === "Working" ? "Unknown" : payload.year || undefined,
      source: payload.sessionId ? "Attendance Registration" : "Public Registration",
      locationId,
      location: locationId ? undefined : payload.location,
      assignedPreacherAirtableUserId,
    })

    return Response.json({ contact, sessionId: payload.sessionId }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to submit registration"
    return Response.json({ error: message }, { status: 500 })
  }
}
