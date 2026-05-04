import { authzErrorResponse, getStaffContext, requireRole } from "@/lib/authz"
import { findStaffUserById, type StaffRole, upsertStaffUser } from "@/lib/airtable"
import { writeInviteLog } from "@/lib/invite-log"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

const roles: StaffRole[] = ["Admin", "Preacher", "Volunteer"]

interface AdminInvitePayload {
  name?: string
  email?: string
  role?: StaffRole
  assignedPreacherAirtableUserId?: string
  locationIds?: string[]
}

export async function POST(request: Request) {
  try {
    const staff = await getStaffContext()
    requireRole(staff, ["Admin"])

    const payload = (await request.json()) as AdminInvitePayload
    const email = payload.email?.trim().toLowerCase()
    const name = payload.name?.trim()
    const role = payload.role

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

    const user = await upsertStaffUser({
      email,
      name,
      role,
      invitedByAirtableUserId: staff.airtableUserId,
      assignedPreacherAirtableUserId: role === "Volunteer" ? payload.assignedPreacherAirtableUserId : undefined,
      locationIds: payload.locationIds,
    })

    const supabaseAdmin = createSupabaseAdminClient()
    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || ""}/auth/confirm`,
    })

    await writeInviteLog({
      inviteeEmail: email,
      airtableUserId: user.id,
      inviterAirtableUserId: staff.airtableUserId,
      inviterSupabaseUserId: staff.supabaseUserId,
      inviteeRole: role,
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
