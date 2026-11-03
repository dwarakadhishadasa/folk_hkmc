import { authzErrorResponse, getStaffContext, requireRole } from "@/lib/authz"
import {
  supervisorErrorForRequirement,
  supervisorRequirementForRole,
  supervisorSatisfiesRequirement,
} from "@/lib/invite-supervisor"
import { findLocationById, findStaffUserById, type StaffRole, upsertStaffUser } from "@/lib/supabase/data"
import { writeInviteLog } from "@/lib/invite-log"
import { sendStaffInviteEmail } from "@/lib/supabase/invite"

export const dynamic = "force-dynamic"

const roles: StaffRole[] = ["Admin", "Preacher", "Volunteer", "Assistant"]

interface AdminInvitePayload {
  name?: string
  email?: string
  role?: StaffRole
  assignedPreacherUserId?: string
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
    const locationIds = role === "Volunteer" || role === "Assistant" ? [] : normalizeLocationIds(payload.locationIds)

    if (!email || !name || !role || !roles.includes(role)) {
      return Response.json({ error: "Name, email, and a valid role are required." }, { status: 400 })
    }

    const supervisorRequirement = supervisorRequirementForRole(role)
    let assignedPreacherUserId: string | null = null

    if (supervisorRequirement !== "none") {
      const preacherId = payload.assignedPreacherUserId?.trim()
      if (!preacherId) {
        return Response.json(
          { error: "Assigned Preacher is required for Volunteer or Assistant invites." },
          { status: 400 },
        )
      }

      const preacher = await findStaffUserById(preacherId)
      const eligible = supervisorSatisfiesRequirement(
        supervisorRequirement,
        preacher
          ? { programId: staff.programId, role: preacher.role, status: preacher.status }
          : null,
        staff.programId,
      )

      if (!preacher || !eligible) {
        return Response.json(
          { error: supervisorErrorForRequirement(supervisorRequirement) },
          { status: 400 },
        )
      }

      assignedPreacherUserId = preacher.id
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
      invitedByUserId: staff.userId,
      // `null` is the explicit clear; omitting the field would leave a promoted
      // staff member pointing at their old Preacher.
      assignedPreacherUserId,
      locationIds,
    })

    // `delivery` is whatever `sendStaffInviteEmail` produced, never a local claim about the invitee.
    // Note that `upsertStaffUser` provisions the `auth.users` row above, so Supabase's own
    // `inviteUserByEmail` then reports the account as already registered and the helper falls
    // through to an OTP sign-in link: `delivery: "sign-in-link"` is therefore the expected result
    // for *every* invite, including a brand-new invitee, and does not imply the account pre-existed.
    const inviteResult = await sendStaffInviteEmail(email, request)

    await writeInviteLog({
      programId: staff.programId,
      inviteeEmail: email,
      userId: user.id,
      inviterUserId: staff.userId,
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
