import { authzErrorResponse, getStaffContext } from "@/lib/authz"
import { createContact, findContactByPhone, findStaffUserById, normalizeMobile, type StaffUser } from "@/lib/airtable"

export const dynamic = "force-dynamic"

interface ContactPayload {
  name?: string
  mobile?: string
  age?: string | number
  dateOfBirth?: string
  occupation?: string
  year?: string
  college?: string
  company?: string
  source?: string
  locationId?: string
  location?: string
  comments?: string
  assignedPreacherAirtableUserId?: string
}

interface ResolvedPreacher {
  id: string
}

function parseDateOfBirth(value: unknown): { dateOfBirth?: string; error?: string } {
  if (typeof value !== "string" || !value.trim()) {
    return {}
  }

  const dateOfBirth = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    return { error: "Date of Birth must use YYYY-MM-DD format." }
  }

  const [year, month, day] = dateOfBirth.split("-").map(Number)
  const parsed = new Date(`${dateOfBirth}T00:00:00.000Z`)
  const isValidDate =
    parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day

  return isValidDate ? { dateOfBirth } : { error: "Date of Birth must be a valid date." }
}

function activePreacherResult(preacher: StaffUser | null): { preacher?: ResolvedPreacher; error?: string } {
  if (!preacher || preacher.role !== "Preacher" || preacher.status !== "Active") {
    return { error: "Assigned Preacher must be an active Preacher user." }
  }

  return { preacher: { id: preacher.id } }
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
    return { preacher: { id: staff.airtableUserId } }
  }

  const explicitPreacherId = payload.assignedPreacherAirtableUserId?.trim()
  if (!explicitPreacherId) {
    return { error: "Assigned Preacher is required for Admin contact creation." }
  }

  return activePreacherResult(await findStaffUserById(explicitPreacherId))
}

function resolveLocation(payload: ContactPayload): string {
  const location = payload.location?.trim()
  if (location) {
    return location
  }

  return payload.locationId?.trim() || ""
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

    const location = resolveLocation(payload)
    if (!location) {
      return Response.json({ error: "Enter a location before saving this contact." }, { status: 422 })
    }

    const parsedDateOfBirth = parseDateOfBirth(payload.dateOfBirth)
    if (parsedDateOfBirth.error) {
      return Response.json({ error: parsedDateOfBirth.error }, { status: 400 })
    }

    const collectorId = staff.role === "Volunteer" ? staff.airtableUserId : assignment.preacher.id
    const contact = await createContact({
      name,
      phone: mobile,
      dateOfBirth: parsedDateOfBirth.dateOfBirth,
      year: payload.occupation === "Working" ? "Unknown" : payload.year || undefined,
      college: payload.occupation === "Studying" ? payload.college?.trim() || undefined : undefined,
      company: payload.occupation === "Working" ? payload.company?.trim() || undefined : undefined,
      source: payload.source || "Pass distribution",
      location,
      comments: payload.comments?.trim() || undefined,
      collectedByAirtableUserId: collectorId,
      assignedPreacherAirtableUserId: assignment.preacher.id,
    })

    return Response.json({ contact }, { status: 201 })
  } catch (error) {
    return authzErrorResponse(error)
  }
}
