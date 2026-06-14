import { authzErrorResponse, getStaffContext, requireRole } from "@/lib/authz"
import { findLocationById, findStaffUserById, type StaffRole, upsertStaffUser } from "@/lib/airtable"
import { writeInviteLog } from "@/lib/invite-log"
import { sendStaffInviteEmail } from "@/lib/supabase/invite"

export const dynamic = "force-dynamic"

const roles: StaffRole[] = ["Admin", "Preacher", "Volunteer"]

interface AdminInvitePayload {
  name?: string
  email?: string
  role?: StaffRole
  assignedPreacherAirtableUserId?: string
  locationIds?: string[]
}

function normalizeLocationIds(locationIds: string[] | undefined): string[] {
  if (!Array.isArray(locationIds)) {
    return []
  }

  return [...new Set(locationIds.map((locationId) => locationId.trim()).filter(Boolean))]
}

export async function POST(request: Request) {
  try {
    const staff = await getStaffContext()
    requireRole(staff, ["Admin"])

    const payload = (await request.json()) as AdminInvitePayload
    const email = payload.email?.trim().toLowerCase()
    const name = payload.name?.trim()
    const role = payload.role
    const locationIds = role === "Volunteer" ? [] : normalizeLocationIds(payload.locationIds)

    if (!email || !name || !role || !roles.includes(role)) {
      return Response.json({ error: "Name, email, and a valid role are required." }, { status: 400 })
    }

    if (role === "Volunteer") {
      const preacherId = payload.assignedPreacherAirtableUserId?.trim()
      if (!preacherId) {
        return Response.json({ error: "Assigned Preacher is required for Volunteer invites." }, { status: 400 })
      }

      const preacher = await findStaffUserById(preacherId)
      if (!preacher || preacher.role !== "Preacher" || preacher.status !== "Active") {
        return Response.json({ error: "Assigned Preacher must be an active Preacher." }, { status: 400 })
      }
    }

    if (locationIds.length > 0) {
      const locations = await Promise.all(locationIds.map((locationId) => findLocationById(locationId)))
      if (locations.some((location) => !location)) {
        return Response.json({ error: "One or more selected locations do not exist." }, { status: 400 })
      }
    }

    const user = await upsertStaffUser({
      email,
      name,
      role,
      invitedByAirtableUserId: staff.airtableUserId,
      assignedPreacherAirtableUserId: role === "Volunteer" ? payload.assignedPreacherAirtableUserId : undefined,
      locationIds,
    })

    const inviteResult = await sendStaffInviteEmail(email, request)

    await writeInviteLog({
      programId: staff.programId,
      inviteeEmail: email,
      airtableUserId: user.id,
      inviterAirtableUserId: staff.airtableUserId,
      inviterSupabaseUserId: staff.supabaseUserId,
      inviteeRole: role,
      status: inviteResult.error ? "failed" : "sent",
      errorMessage: inviteResult.error?.message,
    })

    if (inviteResult.error) {
      return Response.json({ error: inviteResult.safeErrorMessage }, { status: 502 })
    }

    return Response.json(
      { invited: true, delivery: inviteResult.delivery, user: { id: user.id, email: user.email, role: user.role } },
      { status: 201 },
    )
  } catch (error) {
    return authzErrorResponse(error)
  }
}
