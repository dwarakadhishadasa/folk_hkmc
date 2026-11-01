import Link from "next/link"
import { redirect } from "next/navigation"

import { Header } from "@/components/header"
import { LiveAttendanceDashboard } from "@/components/live-attendance-dashboard"
import { StaffAuthShell } from "@/components/staff-auth-shell"
import { AuthzError, getStaffContext, requireRole } from "@/lib/authz"
import { listSessionsOverview } from "@/lib/sessions/data"
import { sessionsScope } from "@/lib/sessions/scope"

export const dynamic = "force-dynamic"

/**
 * `/dashboard` is the legacy entry point for the live attendance screen. Every
 * live session now has its own URL, so this page forwards to the newest live
 * session in the staff member's scope; with none, it keeps the screen's empty
 * state and its link to Sessions.
 */
export default async function DashboardPage() {
  try {
    const staff = await getStaffContext({ refresh: true })
    requireRole(staff, ["Admin", "Preacher"])

    const scope = await sessionsScope(staff)
    const liveSession = (await listSessionsOverview(scope)).find((row) => row.status === "Live now")

    if (liveSession) {
      redirect(`/sessions/${liveSession.id}/live`)
    }

    return (
      <StaffAuthShell staff={staff}>
        <div className="min-h-screen bg-[#FFF9F0]">
          <Header />
          <main className="container mx-auto px-4 py-6">
            <LiveAttendanceDashboard />
          </main>
        </div>
      </StaffAuthShell>
    )
  } catch (error) {
    if (error instanceof AuthzError && error.status === 401) {
      redirect("/login?redirect=/dashboard")
    }

    // `redirect()` above is not an `AuthzError`; rethrowing keeps the
    // framework's control-flow error out of the access panel.
    if (!(error instanceof AuthzError)) {
      throw error
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
