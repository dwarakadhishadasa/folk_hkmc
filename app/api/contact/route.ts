import { authzErrorResponse, getStaffContext } from "@/lib/authz"
import { createContact, findContactByPhone, findStaffUserById, normalizeMobile, type StaffUser } from "@/lib/airtable"

export const dynamic = "force-dynamic"

interface ContactPayload {
  name?: string
  mobile?: string
  age?: string | number
  occupation?: string
  year?: string
  source?: string
  locationId?: string
  location?: string
  assignedPreacherAirtableUserId?: string
}

interface ResolvedPreacher {
  id: string
  locationIds: string[]
}

function parseAge(value: unknown): number | undefined {
  const age = typeof value === "number" ? value : Number.parseInt(String(value || ""), 10)
  return Number.isFinite(age) && age > 0 ? age : undefined
}

function activePreacherResult(preacher: StaffUser | null): { preacher?: ResolvedPreacher; error?: string } {
  if (!preacher || preacher.role !== "Preacher" || preacher.status !== "Active") {
    return { error: "Assigned Preacher must be an active Preacher user." }
  }

  return { preacher: { id: preacher.id, locationIds: preacher.locationIds } }
}

async function resolveAssignedPreacher(
  payload: ContactPayload,
  staff: Awaited<ReturnType<typeof getStaffContext>>,
): Promise<{ preacher?: ResolvedPreacher; error?: string }> {
  if (staff.role === "Volunteer") {
    if (!staff.assignedPreacherAirtableUserId) {
      return { error: "Volunteer contact routing is not configured. Ask an Admin to assign your Preacher." }
    }
    return activePreacherResult(await findStaffUserById(staff.assignedPreacherAirtableUserId))
  }

  if (staff.role === "Preacher") {
    return { preacher: { id: staff.airtableUserId, locationIds: staff.locationIds } }
  }

  const explicitPreacherId = payload.assignedPreacherAirtableUserId?.trim()
  if (!explicitPreacherId) {
    return { error: "Assigned Preacher is required for Admin contact creation." }
  }

  return activePreacherResult(await findStaffUserById(explicitPreacherId))
}

function resolveLocationId(payload: ContactPayload): string {
  const locationId = payload.locationId?.trim()
  if (locationId) {
    return locationId
  }

  const legacyLocation = payload.location?.trim()
  return legacyLocation?.startsWith("rec") ? legacyLocation : ""
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
    if (assignment.error || !assignment.preacher) {
      return Response.json({ error: assignment.error }, { status: 422 })
    }

    const locationId = resolveLocationId(payload)
    if (assignment.preacher.locationIds.length === 0) {
      return Response.json(
        { error: "Assigned Preacher has no configured locations. Ask an Admin to update their Airtable user." },
        { status: 422 },
      )
    }
    if (!locationId) {
      return Response.json({ error: "Choose a location assigned to the contact's Preacher." }, { status: 422 })
    }
    if (!assignment.preacher.locationIds.includes(locationId)) {
      return Response.json({ error: "Selected location is not assigned to the contact's Preacher." }, { status: 422 })
    }

    const collectorId = staff.role === "Volunteer" ? staff.airtableUserId : assignment.preacher.id
    const contact = await createContact({
      name,
      phone: mobile,
      age: parseAge(payload.age),
      year: payload.occupation === "Working" ? "Unknown" : payload.year || undefined,
      source: payload.source || "Pass distribution",
      locationId,
      collectedByAirtableUserId: collectorId,
      assignedPreacherAirtableUserId: assignment.preacher.id,
    })

    return Response.json({ contact }, { status: 201 })
  } catch (error) {
    return authzErrorResponse(error)
  }
}
