import { redirect } from "next/navigation"
import { Header } from "@/components/header"
import { InviteUserForm } from "@/components/invite-user-form"
import { AuthzError, getStaffContext, requireRole } from "@/lib/authz"
import { listActivePreachers } from "@/lib/airtable"

export const dynamic = "force-dynamic"

export default async function AdminInvitePage() {
  try {
    const staff = await getStaffContext()
    requireRole(staff, ["Admin"])
    const preachers = await listActivePreachers()

    return (
      <div className="min-h-screen bg-[#FFF9F0]">
        <Header />
        <main className="container mx-auto max-w-xl px-4 py-8">
          <InviteUserForm
            mode="admin"
            preachers={preachers.map((preacher) => ({ id: preacher.id, name: preacher.name }))}
          />
        </main>
      </div>
    )
  } catch (error) {
    if (error instanceof AuthzError && error.status === 401) {
      redirect("/login?redirect=/admin/invite")
    }
    redirect("/auth/error?code=staff-authorization-failed")
  }
}
