import Link from "next/link"
import { redirect } from "next/navigation"
import { ExternalLink, ShieldCheck } from "lucide-react"
import { Header } from "@/components/header"
import { LiveAttendanceDashboard, type DashboardSessionContext } from "@/components/live-attendance-dashboard"
import { listLocations, listSessions, type SessionRecord } from "@/lib/airtable"
import { AuthzError, getStaffContext, requireRole } from "@/lib/authz"

export const dynamic = "force-dynamic"

const DEFAULT_AIRTABLE_INTERFACE_DASHBOARD_PAGE_ID = "pagc77PtbNsr9ljWu"

function getAirtableInterfaceDashboardUrl(): string | null {
  const baseId = process.env.AIRTABLE_BASE_ID?.trim()
  const pageId = (
    process.env.AIRTABLE_INTERFACE_DASHBOARD_PAGE_ID || DEFAULT_AIRTABLE_INTERFACE_DASHBOARD_PAGE_ID
  ).trim()

  if (!baseId || !pageId) {
    return null
  }

  return `https://airtable.com/${baseId}/${pageId}`
}

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

function AdminAirtableFlow({ dashboardUrl }: { dashboardUrl: string | null }) {
  return (
    <section className="mb-6 rounded-2xl border border-[#F98B1C]/20 bg-white p-5 shadow-lg">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[#0F1E54] text-white">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase text-[#F98B1C]">Admin flow</p>
            <h2 className="font-[family-name:var(--font-poppins)] text-xl font-bold text-[#24324A]">
              Airtable operations
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-[#24324A]/70">
              Open the Airtable interface dashboard for admin-level records and follow-up work.
            </p>
          </div>
        </div>
        {dashboardUrl ? (
          <a
            href={dashboardUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#F98B1C] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#e07a10]"
          >
            Open Airtable
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        ) : (
          <p className="rounded-xl bg-[#FFF9F0] px-4 py-3 text-sm font-medium text-[#24324A]/70">
            Airtable admin link unavailable.
          </p>
        )}
      </div>
    </section>
  )
}

export default async function DashboardPage() {
  try {
    const staff = await getStaffContext()
    requireRole(staff, ["Admin", "Preacher"])
    const airtableDashboardUrl = getAirtableInterfaceDashboardUrl()
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
      <div className="min-h-screen bg-[#FFF9F0]">
        <Header />
        <main className="container mx-auto px-4 py-6">
          {staff.role === "Admin" && <AdminAirtableFlow dashboardUrl={airtableDashboardUrl} />}
          <LiveAttendanceDashboard activeSession={activeSession} />
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
