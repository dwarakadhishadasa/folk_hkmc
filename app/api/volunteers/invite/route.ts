import { authzErrorResponse, getStaffContext, requireRole } from "@/lib/authz"
import { findStaffUserById, upsertStaffUser } from "@/lib/airtable"
import { writeInviteLog } from "@/lib/invite-log"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

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

    const supabaseAdmin = createSupabaseAdminClient()
    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || ""}/auth/confirm`,
    })

    await writeInviteLog({
      programId: staff.programId,
      inviteeEmail: email,
      airtableUserId: user.id,
      inviterAirtableUserId: staff.airtableUserId,
      inviterSupabaseUserId: staff.supabaseUserId,
      inviteeRole: "Volunteer",
      status: error ? "failed" : "sent",
      errorMessage: error?.message,
    })

    if (error) {
      return Response.json({ error: "Airtable user saved, but Supabase invite failed." }, { status: 502 })
    }

    return Response.json({ invited: true, user: { id: user.id, email: user.email, role: user.role } }, { status: 201 })
  } catch (error) {
    return authzErrorResponse(error)
  }
}
