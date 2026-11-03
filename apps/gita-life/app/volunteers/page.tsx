import { redirect } from "next/navigation"
import { Header } from "@/components/header"
import { InviteUserForm } from "@/components/invite-user-form"
import { StaffAuthShell } from "@/components/staff-auth-shell"
import { AuthzError, getStaffContext, requireRole } from "@/lib/authz"
import { VOLUNTEER_INVITE_ROLES } from "@/lib/staff-roles"
import { toClientStaff } from "@/lib/staff-dto"

export const dynamic = "force-dynamic"

export default async function VolunteersPage() {
  try {
    const staff = await getStaffContext()
    requireRole(staff, VOLUNTEER_INVITE_ROLES)

    return (
      <StaffAuthShell staff={toClientStaff(staff)}>
        <div className="min-h-screen bg-background">
          <Header />
          <main className="container mx-auto max-w-xl px-4 py-6 sm:py-8">
            <InviteUserForm mode="volunteer" />
          </main>
        </div>
      </StaffAuthShell>
    )
  } catch (error) {
    if (error instanceof AuthzError && error.status === 401) {
      redirect("/login?redirect=/volunteers")
    }
    redirect("/auth/error?code=staff-authorization-failed")
  }
}
