import { authzErrorResponse, getStaffContext, requireRole } from "@/lib/authz"
import { createLocation, findLocationByName } from "@/lib/airtable"

export const dynamic = "force-dynamic"

interface LocationPayload {
  name?: string
}

const MAX_LOCATION_NAME_LENGTH = 80

function normalizeLocationName(value: string | undefined): string {
  return value?.trim().replace(/\s+/g, " ") || ""
}

export async function POST(request: Request) {
  try {
    const staff = await getStaffContext()
    requireRole(staff, ["Admin"])

    const payload = (await request.json()) as LocationPayload
    const name = normalizeLocationName(payload.name)

    if (!name) {
      return Response.json({ error: "Location name is required." }, { status: 400 })
    }

    if (name.length > MAX_LOCATION_NAME_LENGTH) {
      return Response.json(
        { error: `Location name must be ${MAX_LOCATION_NAME_LENGTH} characters or fewer.` },
        { status: 400 },
      )
    }

    const existingLocation = await findLocationByName(name)
    if (existingLocation) {
      return Response.json({ location: existingLocation, existing: true }, { status: 200 })
    }

    const location = await createLocation({ name })
    return Response.json({ location, existing: false }, { status: 201 })
  } catch (error) {
    return authzErrorResponse(error)
  }
}
