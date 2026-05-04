import Link from "next/link"
import { redirect } from "next/navigation"
import { Header } from "@/components/header"
import { LiveAttendanceDashboard } from "@/components/live-attendance-dashboard"
import { AuthzError, getStaffContext, requireRole } from "@/lib/authz"

export const dynamic = "force-dynamic"

export default async function DashboardPage() {
  try {
    const staff = await getStaffContext()
    requireRole(staff, ["Admin", "Preacher"])

    return (
      <div className="min-h-screen bg-[#FFF9F0]">
        <Header />
        <main className="container mx-auto px-4 py-6">
          <LiveAttendanceDashboard />
        </main>
      </div>
    )
  } catch (error) {
    if (error instanceof AuthzError && error.status === 401) {
      redirect("/login?redirect=/dashboard")
    }

    return (
      <div className="min-h-screen bg-[#FFF9F0]">
        <Header />
        <main className="container mx-auto max-w-md px-4 py-8">
          <div className="rounded-2xl bg-white p-6 text-center shadow-xl">
            <h2 className="mb-2 text-xl font-bold text-[#24324A]">Access Restricted</h2>
            <p className="mb-6 text-[#24324A]/70">Only Admin and Preacher staff can access the dashboard.</p>
            <Link
              href="/contact"
              className="inline-block rounded-xl bg-[#0F1E54] px-6 py-3 font-medium text-white transition-colors hover:bg-[#1a2d6d]"
            >
              Go to Contact Form
            </Link>
          </div>
        </main>
      </div>
    )
  }
}
