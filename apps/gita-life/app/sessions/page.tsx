import { redirect } from "next/navigation"
import { Header } from "@/components/header"
import { SessionsManager } from "@/components/sessions-manager"
import { StaffAuthShell } from "@/components/staff-auth-shell"
import { findStaffUserById, listLocations } from "@/lib/airtable"
import { AuthzError, getStaffContext, requireRole } from "@/lib/authz"

export const dynamic = "force-dynamic"

export default async function SessionsPage() {
  try {
    const staff = await getStaffContext({ refresh: true })
    requireRole(staff, ["Admin", "Preacher", "Assistant"])
    const allLocations = await listLocations()

    let scopedLocationIds: string[] | null = staff.locationIds
    if (staff.role === "Assistant") {
      if (!staff.assignedPreacherAirtableUserId) {
        scopedLocationIds = []
      } else {
        const assignedPreacher = await findStaffUserById(staff.assignedPreacherAirtableUserId)
        if (!assignedPreacher || assignedPreacher.role !== "Preacher" || assignedPreacher.status !== "Active") {
          scopedLocationIds = []
        } else {
          scopedLocationIds = assignedPreacher.locationIds
        }
      }
    }

    const locations =
      staff.role === "Admin"
        ? allLocations
        : allLocations.filter((location) => scopedLocationIds?.includes(location.id))

    return (
      <StaffAuthShell staff={staff}>
        <div className="min-h-screen bg-[#FFF9F0]">
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
