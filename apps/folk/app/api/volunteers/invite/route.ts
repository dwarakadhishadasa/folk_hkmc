import { authzErrorResponse, getStaffContext, requireRole } from "@/lib/authz"
import {
  supervisorRequirementForRole,
  supervisorSatisfiesRequirement,
} from "@/lib/invite-supervisor"
import { VOLUNTEER_INVITE_ROLES } from "@/lib/staff-roles"
import { findStaffUserByEmail, type StaffRole, upsertStaffUser } from "@/lib/supabase/data"
import { writeInviteLog } from "@/lib/invite-log"
import { sendStaffInviteEmail } from "@/lib/supabase/invite"

export const dynamic = "force-dynamic"

type InvitableRole = Extract<StaffRole, "Volunteer" | "Assistant">

interface InvitePayload {
  name?: string
  email?: string
  role?: string
}

function normalizeInviteRole(value: string | undefined): InvitableRole | null {
  if (value === undefined || value === "") {
    return "Volunteer"
  }

  if (value === "Volunteer" || value === "Assistant") {
    return value
  }

  return null
}

export async function POST(request: Request) {
  try {
    const staff = await getStaffContext()
    requireRole(staff, VOLUNTEER_INVITE_ROLES)

    const payload = (await request.json()) as InvitePayload
    const email = payload.email?.trim().toLowerCase()
    const name = payload.name?.trim()

    if (!email || !name) {
      return Response.json({ error: "Volunteer name and email are required." }, { status: 400 })
    }

    const inviteRole = normalizeInviteRole(payload.role)
    if (!inviteRole) {
      return Response.json({ error: "This invite surface can only invite Volunteers or Assistants." }, { status: 403 })
    }

    // `/volunteers` is the Preacher's self-only surface. The binding is always
    // the signed-in Preacher, never a payload choice. The same eligibility helper
    // as the Admin invite path decides whether the destination role may use it.
    const assignedPreacherId = staff.userId
    const eligible = supervisorSatisfiesRequirement(
      supervisorRequirementForRole(inviteRole),
      { programId: staff.programId, role: staff.role, status: staff.status },
      staff.programId,
    )

    if (!eligible) {
      return Response.json({ error: "The assigned Preacher must be active." }, { status: 400 })
    }

    const existing = await findStaffUserByEmail(email)
    if (existing && (existing.role === "Admin" || existing.role === "Preacher")) {
      return Response.json(
        { error: "Existing Admin or Preacher users cannot be changed through this invite surface." },
        { status: 403 },
      )
    }

    if (
      existing &&
      existing.role === "Assistant" &&
      existing.status === "Active" &&
      inviteRole === "Volunteer"
    ) {
      return Response.json(
        { error: "Existing Assistants cannot be downgraded to Volunteer through this invite surface." },
        { status: 403 },
      )
    }

    if (
      existing &&
      existing.role === "Assistant" &&
      existing.status === "Active" &&
      existing.assignedPreacherUserId &&
      existing.assignedPreacherUserId !== assignedPreacherId
    ) {
      return Response.json(
        { error: "Existing Assistants cannot be moved to a different Preacher through this invite surface." },
        { status: 403 },
      )
    }

    const upgraded =
      Boolean(
        existing &&
          existing.role === "Volunteer" &&
          existing.status === "Active" &&
          inviteRole === "Assistant",
      ) ||
      Boolean(
        existing &&
          existing.role === "Assistant" &&
          existing.status === "Inactive" &&
          inviteRole === "Assistant",
      )

    const user = await upsertStaffUser({
      email,
      name,
      role: inviteRole,
      invitedByUserId: staff.userId,
      assignedPreacherUserId: assignedPreacherId,
    })

    // `delivery` is whatever `sendStaffInviteEmail` produced, never a local claim about the invitee.
    // On the insert path `upsertStaffUser` provisions the `auth.users` row above, so Supabase's own
    // `inviteUserByEmail` then reports the account as already registered and the helper falls through
    // to an OTP sign-in link: `delivery: "sign-in-link"` is the expected result for *every* insert-path
    // invite, including a brand-new invitee, and does not imply the account pre-existed.
    const inviteResult = await sendStaffInviteEmail(email, request)

    await writeInviteLog({
      programId: staff.programId,
      inviteeEmail: email,
      userId: user.id,
      inviterUserId: staff.userId,
      inviterSupabaseUserId: staff.supabaseUserId,
      inviteeRole: inviteRole,
      status: inviteResult.error ? "failed" : "sent",
      errorMessage: inviteResult.error?.message,
    })

    if (inviteResult.error) {
      return Response.json({ error: inviteResult.safeErrorMessage }, { status: 502 })
    }

    return Response.json(
      {
        invited: true,
        upgraded,
        delivery: inviteResult.delivery,
        user: { id: user.id, email: user.email, role: user.role },
      },
      { status: 201 },
    )
  } catch (error) {
    return authzErrorResponse(error)
  }
}
