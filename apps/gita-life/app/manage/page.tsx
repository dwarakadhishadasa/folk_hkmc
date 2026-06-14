import { redirect } from "next/navigation"
import { Header } from "@/components/header"
import { StaffAuthShell } from "@/components/staff-auth-shell"
import type { StaffContext } from "@/lib/authz"
import { AuthzError, getStaffContext, requireRole, writeAuditEvent } from "@/lib/authz"
import { getProgramAirtableManagementUrl } from "@hkmc/program-config/server"

export const dynamic = "force-dynamic"

export default async function ManagePage() {
  let airtableDashboardUrl: string | null = null
  let staff: StaffContext | null = null

  try {
    staff = await getStaffContext()
    requireRole(staff, ["Admin", "Preacher"])
    airtableDashboardUrl = getProgramAirtableManagementUrl(staff.programId)
  } catch (error) {
    if (error instanceof AuthzError && error.status === 401) {
      redirect("/login?redirect=/manage")
    }

    redirect("/auth/error?code=staff-authorization-failed")
  }

  if (airtableDashboardUrl) {
    redirect(airtableDashboardUrl)
  }

  if (!staff) {
    redirect("/auth/error?code=staff-authorization-failed")
  }

  await writeAuditEvent({
    programId: staff.programId,
    actorSupabaseUserId: staff.supabaseUserId,
    actorAirtableUserId: staff.airtableUserId,
    actorRole: staff.role,
    action: "management.misconfigured",
    source: "manage-page",
    syncState: "ok",
  })

  return (
    <StaffAuthShell staff={staff}>
      <div className="min-h-screen bg-[#FFF9F0]">
        <Header />
        <main className="container mx-auto max-w-md px-4 py-6 sm:py-8">
          <div className="rounded-lg border border-[var(--border)] bg-card p-6 text-center shadow-[0_18px_50px_rgba(45,10,10,0.08)]">
            <h1 className="mb-2 text-xl font-bold text-[var(--program-text)]">Manage Link Unavailable</h1>
            <p className="text-[var(--muted-foreground)]">
              AIRTABLE_BASE_ID and AIRTABLE_INTERFACE_DASHBOARD_PAGE_ID are required to open the Airtable management
              interface for this Program.
            </p>
          </div>
        </main>
      </div>
    </StaffAuthShell>
  )
}
