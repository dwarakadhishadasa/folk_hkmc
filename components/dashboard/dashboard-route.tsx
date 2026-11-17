import type { ReactNode } from "react"
import { redirect } from "next/navigation"

import { DashboardPage } from "@/components/dashboard/dashboard-page"
import { Header } from "@/components/header"
import { StaffAuthShell } from "@/components/staff-auth-shell"
import { AuthzError, getStaffContext } from "@/lib/authz"
import { toClientStaff } from "@/lib/staff-dto"
import type { UpcomingBirthday } from "@/lib/dashboard/birthdays"
import { loadDashboardLiveSessions, type DashboardLiveSession } from "@/lib/dashboard/live"
import { loadDashboardOverview } from "@/lib/dashboard/overview"
import { loadDashboardPeopleSeries } from "@/lib/dashboard/people-series"
import { parseDashboardPeriod, resolveDashboardWindow } from "@/lib/dashboard/period"
import { requireDashboardRole, resolveDashboardScope } from "@/lib/dashboard/scope"
import { loadUpcomingBirthdays } from "@/lib/dashboard/upcoming-birthdays"
import type { DashboardOverview, DashboardPeopleSeries } from "@/lib/dashboard/types"
import { programDay } from "@/lib/program-day"

type DashboardSearchParams = Promise<Record<string, string | string[] | undefined>>

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/**
 * The one `/dashboard` implementation both apps mount.
 *
 * Scope is resolved once, server-side, before any read; the period is parsed
 * from the URL; and an Assistant with no active assigned preacher renders the
 * header and its notice without calling either RPC. A core read failure throws
 * to the app's error boundary (a 500), never to a partial page of zeros.
 */
export async function DashboardRoute({ searchParams }: { searchParams: DashboardSearchParams }) {
  const params = await searchParams

  try {
    const staff = await getStaffContext({ refresh: true })
    requireDashboardRole(staff)

    const scope = await resolveDashboardScope(staff, firstValue(params.mode))
    const today = programDay()
    const period = parseDashboardPeriod(params, today)
    const window = resolveDashboardWindow(period, today)

    let overview: DashboardOverview | null = null
    let series: DashboardPeopleSeries | null = null
    let liveSessions: DashboardLiveSession[] = []
    let birthdays: UpcomingBirthday[] = []

    if (!scope.assistantUnassigned) {
      // An Admin reading the whole programme is on the Sessions page for live
      // work, and the birthday board is a patch card; both skip the read rather
      // than load data the branch will not render.
      const personalScope = !(scope.role === "Admin" && scope.mode === "admin")

      const [loadedOverview, loadedSeries, loadedLiveSessions, loadedBirthdays] = await Promise.all([
        loadDashboardOverview(scope, window),
        loadDashboardPeopleSeries(scope, window),
        personalScope
          ? loadDashboardLiveSessions(staff, scope)
          : Promise.resolve<DashboardLiveSession[]>([]),
        personalScope
          ? loadUpcomingBirthdays(scope, today)
          : Promise.resolve<UpcomingBirthday[]>([]),
      ])
      overview = loadedOverview
      series = loadedSeries
      liveSessions = loadedLiveSessions
      birthdays = loadedBirthdays
    }

    return (
      <StaffAuthShell staff={toClientStaff(staff)}>
        <DashboardShell>
          <DashboardPage
            scope={scope}
            period={period}
            today={today}
            overview={overview}
            liveSessions={liveSessions}
            series={series}
            birthdays={birthdays}
          />
        </DashboardShell>
      </StaffAuthShell>
    )
  } catch (error) {
    if (error instanceof AuthzError && error.status === 401) {
      redirect("/login?redirect=/dashboard")
    }

    if (error instanceof AuthzError && error.status === 403) {
      redirect("/auth/error?code=staff-authorization-failed")
    }

    console.error("[dashboard] page failed", error)
    throw error
  }
}

function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[calc(var(--app-viewport-height,100dvh)_-_var(--mobile-app-nav-inset,0px))] flex-col bg-background">
      <Header />
      <main className="relative flex w-full flex-1 flex-col gap-5 px-4 py-6 sm:px-6">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-72"
          style={{
            background:
              "radial-gradient(60% 100% at 50% 0%, color-mix(in oklab, var(--program-primary) 5%, transparent), transparent)",
          }}
          aria-hidden="true"
        />
        <div className="relative flex flex-col gap-5">{children}</div>
      </main>
    </div>
  )
}

