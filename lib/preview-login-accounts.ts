import "server-only"

import { resolveProgramId } from "@hkmc/program-config/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type { PreviewFixtureAccount } from "@/lib/preview-login"

const ROLE_ORDER = ["Admin", "Preacher", "Volunteer", "Assistant"]
const roleIndex = (role: string) => {
  const index = ROLE_ORDER.indexOf(role)
  return index === -1 ? ROLE_ORDER.length : index
}

export async function loadPreviewFixtureAccounts(): Promise<PreviewFixtureAccount[]> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("email,role")
    .eq("program_id", resolveProgramId())
    .eq("status", "Active")
    .like("email", "%.fixture.test")
    .order("email")

  if (error) {
    throw error
  }

  return (data ?? [])
    .flatMap((row) => (row.email && row.role ? [{ email: row.email, role: row.role }] : []))
    .sort((a, b) => roleIndex(a.role) - roleIndex(b.role) || a.email.localeCompare(b.email))
}
