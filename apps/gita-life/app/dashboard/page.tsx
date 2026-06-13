import Link from "next/link"
import { redirect } from "next/navigation"
import { Header } from "@/components/header"
import { LiveAttendanceDashboard, type DashboardSessionContext } from "@/components/live-attendance-dashboard"
import { StaffAuthShell } from "@/components/staff-auth-shell"
import { listLocations, listSessions, type SessionRecord } from "@/lib/airtable"
import { AuthzError, getStaffContext, requireRole } from "@/lib/authz"

export const dynamic = "force-dynamic"

function readTime(value?: string): number | null {
  if (!value) {
    return null
  }

  const time = Date.parse(value)
  return Number.isFinite(time) ? time : null
}

function isActiveSession(session: SessionRecord, now: number): boolean {
  const opensAt = readTime(session.attendanceOpensAt)
  const closesAt = readTime(session.attendanceClosesAt)

  if (!session.publicAttendanceEnabled || closesAt === null || closesAt <= now) {
    return false
  }

  return opensAt === null || opensAt <= now
}

function sessionStartTime(session: SessionRecord): number {
  return readTime(session.attendanceOpensAt) || readTime(session.sessionDate) || 0
}

export default async function DashboardPage() {
  try {
    const staff = await getStaffContext({ refresh: true })
    requireRole(staff, ["Admin", "Preacher"])
    let activeSession: DashboardSessionContext | undefined

    try {
      const [sessions, locations] = await Promise.all([listSessions(), listLocations()])
      const locationById = new Map(locations.map((location) => [location.id, location.name]))
      const scopedSessions =
        staff.role === "Admin"
          ? sessions
          : sessions.filter(
              (session) =>
                session.preacherIds.includes(staff.airtableUserId) ||
                session.locationIds.some((locationId) => staff.locationIds.includes(locationId)),
            )
      const now = Date.now()
      const currentSession = scopedSessions
        .filter((session) => isActiveSession(session, now))
        .sort((left, right) => sessionStartTime(right) - sessionStartTime(left))[0]

      if (currentSession) {
        activeSession = {
          id: currentSession.id,
          name: currentSession.name,
          locationNames: currentSession.locationIds.map((locationId) => locationById.get(locationId) || locationId),
          attendanceClosesAt: currentSession.attendanceClosesAt || null,
          attendanceUrl: currentSession.attendanceUrl || null,
        }
      }
    } catch (error) {
      console.error("[dashboard] Failed to load active session context", error)
    }

    return (
      <StaffAuthShell staff={staff}>
      <div className="min-h-screen bg-[#FFF9F0]">
        <Header />
        <main className="container mx-auto px-4 py-6">
          <LiveAttendanceDashboard activeSession={activeSession} />
        </main>
      </div>
      </StaffAuthShell>
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
              className="inline-block rounded-xl bg-[var(--program-primary)] px-6 py-3 font-medium text-white transition-colors hover:bg-[var(--program-primary-light)]"
            >
              Go to Contact Form
            </Link>
          </div>
        </main>
      </div>
    )
  }
}
