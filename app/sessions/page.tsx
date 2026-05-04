import { redirect } from "next/navigation"
import { Header } from "@/components/header"
import { SessionsManager } from "@/components/sessions-manager"
import { AuthzError, getStaffContext, requireRole } from "@/lib/authz"

export const dynamic = "force-dynamic"

export default async function SessionsPage() {
  try {
    const staff = await getStaffContext()
    requireRole(staff, ["Admin", "Preacher"])

    return (
      <div className="min-h-screen bg-[#FFF9F0]">
        <Header />
        <main className="container mx-auto max-w-5xl px-4 py-8">
          <SessionsManager locationIds={staff.role === "Admin" ? [] : staff.locationIds} />
        </main>
      </div>
    )
  } catch (error) {
    if (error instanceof AuthzError && error.status === 401) {
      redirect("/login?redirect=/sessions")
    }
    redirect("/auth/error?code=staff-authorization-failed")
  }
}
