import { redirect } from "next/navigation"
import { Header } from "@/components/header"
import { SessionsManager } from "@/components/sessions-manager"
import { StaffAuthShell } from "@/components/staff-auth-shell"
import { listLocations } from "@/lib/supabase/data"
import { AuthzError, getStaffContext, requireRole } from "@/lib/authz"
import { toClientStaff } from "@/lib/staff-dto"

export const dynamic = "force-dynamic"

export default async function SessionsPage() {
  try {
    const staff = await getStaffContext({ refresh: true })
    requireRole(staff, ["Admin", "Preacher", "Assistant"])
    const allLocations = await listLocations()

    const scopedLocationIds =
      staff.role === "Admin" ? null : (staff.patchOwner?.locationIds ?? [])

    const locations =
      scopedLocationIds === null
        ? allLocations
        : allLocations.filter((location) => scopedLocationIds.includes(location.id))

    return (
      <StaffAuthShell staff={toClientStaff(staff)}>
        <div className="min-h-screen bg-background">
          <Header />
          <main className="container mx-auto px-4 py-6 sm:py-8">
            <SessionsManager locations={locations} />
          </main>
        </div>
      </StaffAuthShell>
    )
  } catch (error) {
    if (error instanceof AuthzError && error.status === 401) {
      redirect("/login?redirect=/sessions")
    }
    redirect("/auth/error?code=staff-authorization-failed")
  }
}
