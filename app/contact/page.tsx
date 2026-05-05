import { redirect } from "next/navigation"
import { Header } from "@/components/header"
import { ContactForm } from "@/components/contact-form"
import { AuthzError, getStaffContext } from "@/lib/authz"
import { findStaffUserById, listActivePreachers, listLocations } from "@/lib/airtable"

export const dynamic = "force-dynamic"

export default async function ContactPage() {
  try {
    const staff = await getStaffContext()
    const [allLocations, preachers, assignedPreacher] = await Promise.all([
      listLocations(),
      staff.role === "Admin" ? listActivePreachers() : Promise.resolve([]),
      staff.role === "Volunteer" && staff.assignedPreacherAirtableUserId
        ? findStaffUserById(staff.assignedPreacherAirtableUserId)
        : Promise.resolve(null),
    ])
    const allowedLocationIds =
      staff.role === "Preacher"
        ? staff.locationIds
        : assignedPreacher?.role === "Preacher" && assignedPreacher.status === "Active"
          ? assignedPreacher.locationIds
          : []
    const visibleLocationIds =
      staff.role === "Admin" ? new Set(preachers.flatMap((preacher) => preacher.locationIds)) : new Set(allowedLocationIds)
    const locations = allLocations.filter((location) => visibleLocationIds.has(location.id))

    return (
      <div className="min-h-screen bg-muted/30">
        <Header />
        <main className="container mx-auto max-w-2xl px-4 py-8">
          <ContactForm
            staffRole={staff.role}
            preachers={preachers.map((preacher) => ({
              id: preacher.id,
              name: preacher.name,
              locationIds: preacher.locationIds,
            }))}
            locations={locations.map((location) => ({ id: location.id, name: location.name }))}
            allowedLocationIds={allowedLocationIds}
          />
        </main>
      </div>
    )
  } catch (error) {
    if (error instanceof AuthzError && error.status === 401) {
      redirect("/login?redirect=/contact")
    }
    redirect("/auth/error?code=staff-authorization-failed")
  }
}
