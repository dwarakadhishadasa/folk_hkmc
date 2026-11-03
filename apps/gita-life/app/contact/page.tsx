import { redirect } from "next/navigation"
import { BackButton } from "@/components/back-button"
import { Header } from "@/components/header"
import { ContactForm } from "@/components/contact-form"
import { StaffAuthShell } from "@/components/staff-auth-shell"
import { AuthzError, getStaffContext } from "@/lib/authz"
import { toClientStaff } from "@/lib/staff-dto"
import { listCachedActivePreachers } from "@/lib/supabase/data"

export const dynamic = "force-dynamic"

export default async function ContactPage() {
  try {
    const staff = await getStaffContext()
    const preachers = staff.role === "Admin" ? await listCachedActivePreachers() : []

    return (
      <StaffAuthShell staff={toClientStaff(staff)}>
        <div className="min-h-screen bg-background">
          <Header />
          <main className="container mx-auto max-w-2xl px-4 py-6 sm:py-8">
            <div className="mb-4">
              <BackButton
                href={
                staff.role === "Admin" ||
                staff.role === "Preacher" ||
                (staff.role === "Assistant" && staff.patchOwner !== null)
                  ? "/contacts"
                  : "/"
              }
              />
            </div>
            <ContactForm
              staffRole={staff.role}
              preachers={preachers.map((preacher) => ({
                id: preacher.id,
                name: preacher.name,
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
