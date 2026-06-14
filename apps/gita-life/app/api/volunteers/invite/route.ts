import { authzErrorResponse, getStaffContext, requireRole } from "@/lib/authz"
import { findStaffUserById, upsertStaffUser } from "@/lib/airtable"
import { writeInviteLog } from "@/lib/invite-log"
import { sendStaffInviteEmail } from "@/lib/supabase/invite"

export const dynamic = "force-dynamic"

interface InvitePayload {
  name?: string
  email?: string
  role?: string
  assignedPreacherAirtableUserId?: string
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

    if (payload.role && payload.role !== "Volunteer") {
      return Response.json({ error: "This invite surface can only invite Volunteers." }, { status: 403 })
    }

    const assignedPreacherId =
      staff.role === "Preacher" ? staff.airtableUserId : payload.assignedPreacherAirtableUserId?.trim()

    if (!assignedPreacherId) {
      return Response.json({ error: "Assigned Preacher is required for Volunteer invites." }, { status: 400 })
    }

    const preacher = await findStaffUserById(assignedPreacherId)
    if (!preacher || preacher.role !== "Preacher" || preacher.status !== "Active") {
      return Response.json({ error: "Assigned Preacher must be an active Preacher." }, { status: 400 })
    }

    const user = await upsertStaffUser({
      email,
      name,
      role: "Volunteer",
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
      inviteeRole: "Volunteer",
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
