import { authzErrorResponse, getStaffContext, requireRole } from "@/lib/authz"
import { findStaffUserByEmail, findStaffUserById, type StaffRole, upsertStaffUser } from "@/lib/airtable"
import { writeInviteLog } from "@/lib/invite-log"
import { sendStaffInviteEmail } from "@/lib/supabase/invite"

export const dynamic = "force-dynamic"

type InvitableRole = Extract<StaffRole, "Volunteer" | "Assistant">

interface InvitePayload {
  name?: string
  email?: string
  role?: string
  assignedPreacherAirtableUserId?: string
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
    requireRole(staff, ["Admin", "Preacher"])

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

    const assignedPreacherId =
      staff.role === "Preacher" ? staff.airtableUserId : payload.assignedPreacherAirtableUserId?.trim()

    if (!assignedPreacherId) {
      return Response.json(
        { error: "Assigned Preacher is required for Volunteer invites." },
        { status: 400 },
      )
    }

    const preacher = await findStaffUserById(assignedPreacherId)
    if (!preacher || preacher.role !== "Preacher" || preacher.status !== "Active") {
      return Response.json({ error: "Assigned Preacher must be an active Preacher." }, { status: 400 })
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
      existing.assignedPreacherAirtableUserId &&
      existing.assignedPreacherAirtableUserId !== assignedPreacherId
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
      invitedByAirtableUserId: staff.airtableUserId,
      assignedPreacherAirtableUserId: assignedPreacherId,
    })

    const inviteResult = await sendStaffInviteEmail(email, request)

    await writeInviteLog({
      programId: staff.programId,
      inviteeEmail: email,
      airtableUserId: user.id,
      inviterAirtableUserId: staff.airtableUserId,
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
