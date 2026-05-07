import { redirect } from "next/navigation"
import { Header } from "@/components/header"
import { StaffAuthShell } from "@/components/staff-auth-shell"
import type { StaffContext } from "@/lib/authz"
import { AuthzError, getStaffContext, requireRole } from "@/lib/authz"

export const dynamic = "force-dynamic"

const DEFAULT_AIRTABLE_INTERFACE_DASHBOARD_PAGE_ID = "pagc77PtbNsr9ljWu"

function getAirtableInterfaceDashboardUrl(): string | null {
  const baseId = process.env.AIRTABLE_BASE_ID?.trim()
  const pageId = (
    process.env.AIRTABLE_INTERFACE_DASHBOARD_PAGE_ID || DEFAULT_AIRTABLE_INTERFACE_DASHBOARD_PAGE_ID
  ).trim()

  if (!baseId || !pageId) {
    return null
  }

  return `https://airtable.com/${baseId}/${pageId}`
}

export default async function ManagePage() {
  let airtableDashboardUrl: string | null = null
  let staff: StaffContext | null = null

  try {
    staff = await getStaffContext()
    requireRole(staff, ["Admin", "Preacher"])
    airtableDashboardUrl = getAirtableInterfaceDashboardUrl()
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

  return (
    <StaffAuthShell staff={staff}>
    <div className="min-h-screen bg-[#FFF9F0]">
      <Header />
      <main className="container mx-auto max-w-md px-4 py-8">
        <div className="rounded-2xl bg-white p-6 text-center shadow-xl">
          <h1 className="mb-2 text-xl font-bold text-[#24324A]">Manage Link Unavailable</h1>
          <p className="text-[#24324A]/70">
            AIRTABLE_BASE_ID and AIRTABLE_INTERFACE_DASHBOARD_PAGE_ID are required to open the Airtable management
            interface.
          </p>
        </div>
      </main>
    </div>
    </StaffAuthShell>
  )
}
