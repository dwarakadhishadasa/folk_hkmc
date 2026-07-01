import { redirect } from "next/navigation"
import { Header } from "@/components/header"
import { ContactForm } from "@/components/contact-form"
import { StaffAuthShell } from "@/components/staff-auth-shell"
import { AuthzError, getStaffContext } from "@/lib/authz"
import { listCachedActivePreachers, listLocations } from "@/lib/airtable"

export const dynamic = "force-dynamic"

export default async function ContactPage() {
  try {
    const staff = await getStaffContext()
    const [preachers, locations] = await Promise.all([
      staff.role === "Admin" ? listCachedActivePreachers() : Promise.resolve([]),
      listLocations(),
    ])

    return (
      <StaffAuthShell staff={staff}>
      <div className="min-h-screen bg-muted/30">
        <Header />
        <main className="container mx-auto max-w-2xl px-4 py-8">
          <ContactForm
            staffRole={staff.role}
            preachers={preachers.map((preacher) => ({
              id: preacher.id,
              name: preacher.name,
            }))}
            locations={locations
              .filter((location) => location.status !== "Inactive")
              .map((location) => ({
                id: location.id,
                name: location.name,
                status: location.status,
              }))}
          />
        </main>
      </div>
      </StaffAuthShell>
    )
  } catch (error) {
    if (error instanceof AuthzError && error.status === 401) {
      redirect("/login?redirect=/contact")
    }
    redirect("/auth/error?code=staff-authorization-failed")
  }
}
