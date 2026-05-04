import { authzErrorResponse, getStaffContext } from "@/lib/authz"
import { createContact, findContactByPhone, findStaffUserById, normalizeMobile } from "@/lib/airtable"

export const dynamic = "force-dynamic"

interface ContactPayload {
  name?: string
  mobile?: string
  age?: string | number
  occupation?: string
  year?: string
  source?: string
  location?: string
  assignedPreacherAirtableUserId?: string
}

function parseAge(value: unknown): number | undefined {
  const age = typeof value === "number" ? value : Number.parseInt(String(value || ""), 10)
  return Number.isFinite(age) && age > 0 ? age : undefined
}

async function resolveAssignedPreacher(payload: ContactPayload, staff: Awaited<ReturnType<typeof getStaffContext>>) {
  if (staff.role === "Volunteer") {
    if (!staff.assignedPreacherAirtableUserId) {
      return { error: "Volunteer contact routing is not configured. Ask an Admin to assign your Preacher." }
    }
    return { preacherId: staff.assignedPreacherAirtableUserId }
  }

  if (staff.role === "Preacher") {
    return { preacherId: staff.airtableUserId }
  }

  const explicitPreacherId = payload.assignedPreacherAirtableUserId?.trim()
  if (!explicitPreacherId) {
    return { error: "Assigned Preacher is required for Admin contact creation." }
  }

  const preacher = await findStaffUserById(explicitPreacherId)
  if (!preacher || preacher.role !== "Preacher" || preacher.status !== "Active") {
    return { error: "Assigned Preacher must be an active Preacher user." }
  }

  return { preacherId: explicitPreacherId }
}

export async function POST(request: Request) {
  try {
    const staff = await getStaffContext()
    const payload = (await request.json()) as ContactPayload
    const mobile = normalizeMobile(payload.mobile)
    const name = payload.name?.trim()

    if (!name || !mobile) {
      return Response.json({ error: "Name and a valid 10-digit mobile number are required." }, { status: 400 })
    }

    const existing = await findContactByPhone(mobile)
    if (existing) {
      return Response.json(
        {
          duplicate: true,
          contact: { id: existing.id, name: existing.name, phone: existing.phone },
        },
        { status: 409 },
      )
    }

    const assignment = await resolveAssignedPreacher(payload, staff)
    if (assignment.error || !assignment.preacherId) {
      return Response.json({ error: assignment.error }, { status: 422 })
    }

    const contact = await createContact({
      name,
      phone: mobile,
      age: parseAge(payload.age),
      year: payload.occupation === "Working" ? "Unknown" : payload.year || undefined,
      source: payload.source || "Staff Portal",
      location: payload.location,
      collectedByAirtableUserId: staff.airtableUserId,
      assignedPreacherAirtableUserId: assignment.preacherId,
    })

    return Response.json({ contact }, { status: 201 })
  } catch (error) {
    return authzErrorResponse(error)
  }
}
