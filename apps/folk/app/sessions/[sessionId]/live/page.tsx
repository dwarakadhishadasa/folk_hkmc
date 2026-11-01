import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { notFound, redirect } from "next/navigation"

import { LiveAttendanceDashboard } from "@/components/live-attendance-dashboard"
import { LiveSessionRedirect } from "@/components/sessions/live-session-redirect"
import { AuthzError, requireRole } from "@/lib/authz"
import { isSessionId, listSessionsOverview } from "@/lib/sessions/data"
import { sessionsScope } from "@/lib/sessions/scope"

import { getSessionsStaff } from "../../staff"

export const dynamic = "force-dynamic"

function attendanceLinkFor(session: { id: string; attendanceUrl: string | null }): string | null {
  if (session.attendanceUrl) {
    return session.attendanceUrl
  }

  const path = `/attend?session=${session.id}`
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  return siteUrl ? new URL(path, siteUrl).toString() : path
}

/**
 * One live session's attendance dashboard, at its own URL.
 *
 * The route is per session on purpose: a staff member can hold several live
 * sessions at once, and each one's QR, link and live list is its own screen.
 * The overview and the detail page both send `Live now` here.
 *
 * A session that has closed belongs on the designed detail screen, so both a
 * direct visit and the timer's expiry replace this URL with that one.
 */
export default async function SessionLivePage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params
  if (!isSessionId(sessionId)) {
    notFound()
  }

  try {
    const staff = await getSessionsStaff()
    requireRole(staff, ["Admin", "Preacher", "Assistant"])

    const scope = await sessionsScope(staff)
    const rows = await listSessionsOverview(scope)
    const session = rows.find((row) => row.id === sessionId)

    if (!session) {
      notFound()
    }

    if (session.status !== "Live now") {
      redirect(`/sessions/${session.id}`)
    }

    const attendanceUrl = attendanceLinkFor(session)

    return (
      <>
        <Link
          href="/sessions"
          className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--program-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          All sessions
        </Link>

        <LiveSessionRedirect sessionId={session.id} closesAt={session.closesAt} />
        <LiveAttendanceDashboard
          activeSession={{
            id: session.id,
            name: session.name,
            locationNames: session.locationName ? [session.locationName] : [],
            attendanceClosesAt: session.closesAt,
            attendanceUrl,
          }}
        />
      </>
    )
  } catch (error) {
    if (error instanceof AuthzError && error.status === 401) {
      redirect(`/login?redirect=/sessions/${sessionId}/live`)
    }

    if (error instanceof AuthzError && error.status === 403) {
      redirect("/auth/error?code=staff-authorization-failed")
    }

    console.error("[sessions] live dashboard failed", error)
    throw error
  }
}
