import type { ReactNode } from "react"
import { redirect } from "next/navigation"

import { DashboardPage } from "@/components/dashboard/dashboard-page"
import { Header } from "@/components/header"
import { StaffAuthShell } from "@/components/staff-auth-shell"
import { AuthzError, getStaffContext } from "@/lib/authz"
import { loadDashboardLiveSessions, type DashboardLiveSession } from "@/lib/dashboard/live"
import { loadDashboardOverview } from "@/lib/dashboard/overview"
import { parseDashboardPeriod, resolveDashboardWindow } from "@/lib/dashboard/period"
import { requireDashboardRole, resolveDashboardScope } from "@/lib/dashboard/scope"
import type { DashboardOverview } from "@/lib/dashboard/types"
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
    let liveSessions: DashboardLiveSession[] = []

    if (!scope.assistantUnassigned) {
      // An Admin reading the whole programme is on the Sessions page for live
      // work; the dashboard skips the read rather than loading a band it hides.
      const showLive = !(scope.role === "Admin" && scope.mode === "admin")

      const [loadedOverview, loadedLiveSessions] = await Promise.all([
        loadDashboardOverview(scope, window),
        showLive
          ? loadDashboardLiveSessions(staff, scope)
          : Promise.resolve<DashboardLiveSession[]>([]),
      ])
      overview = loadedOverview
      liveSessions = loadedLiveSessions
    }

    return (
      <StaffAuthShell staff={staff}>
        <DashboardShell>
          <DashboardPage
            scope={scope}
            period={period}
            today={today}
            overview={overview}
            liveSessions={liveSessions}
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
    <div className="flex min-h-[calc(100dvh_-_var(--mobile-app-nav-inset,0px))] flex-col bg-background">
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

