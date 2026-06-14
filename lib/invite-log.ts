import "server-only"

import type { StaffRole } from "@/lib/airtable"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { resolveProgramId } from "@hkmc/program-config/server"
import type { ProgramId } from "@hkmc/data-contracts"

export async function writeInviteLog(data: {
  inviteeEmail: string
  airtableUserId?: string
  inviterAirtableUserId?: string
  inviterSupabaseUserId?: string
  inviteeRole: StaffRole
  status: "pending" | "sent" | "failed" | "accepted"
  errorMessage?: string
  programId?: ProgramId
}) {
  const supabaseAdmin = createSupabaseAdminClient()

  await supabaseAdmin.from("invite_log").insert({
    program_id: data.programId || resolveProgramId(),
    invitee_email: data.inviteeEmail.trim().toLowerCase(),
    airtable_user_id: data.airtableUserId,
    inviter_airtable_user_id: data.inviterAirtableUserId,
    inviter_supabase_user_id: data.inviterSupabaseUserId,
    invitee_role: data.inviteeRole,
    status: data.status,
    error_message: data.errorMessage,
    invited_at: new Date().toISOString(),
  })
}
