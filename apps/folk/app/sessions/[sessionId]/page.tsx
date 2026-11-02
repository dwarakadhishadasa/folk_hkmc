import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { notFound, redirect } from "next/navigation"

import { SessionAttendees } from "@/components/sessions/session-attendees"
import { SessionDetailStats } from "@/components/sessions/session-detail-stats"
import { SessionStatusPill } from "@/components/sessions/session-status-pill"
import { AuthzError, requireRole } from "@/lib/authz"
import { getCampaign } from "@/lib/dialer/campaigns"
import { getSessionAttendees, isSessionId, listSessionsOverview } from "@/lib/sessions/data"
import { formatSessionDate, formatSessionTime, programDateOf } from "@/lib/sessions/format"
import { sessionsScope } from "@/lib/sessions/scope"
import { findSessionById } from "@/lib/supabase/data"

import { getSessionsStaff } from "../staff"

export const dynamic = "force-dynamic"

/**
 * One completed (or not-yet-open) session and its attendees.
 *
 * Selecting an attendee opens that contact's full record in a modal on both
 * breakpoints. A malformed id, another programme's session and a session
 * outside the caller's scope are one 404: `listSessionsOverview` is the scope
 * predicate, so a foreign id never reaches a query that could distinguish it.
 */
export default async function SessionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
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

    // The design's detail screen is for a window that has closed (or not yet
    // opened); a live session belongs on its attendance dashboard.
    if (session.status === "Live now") {
      redirect(`/sessions/${session.id}/live`)
    }

    const query = await searchParams
    const sortByName = (Array.isArray(query.sort) ? query.sort[0] : query.sort) === "name"

    const record = await findSessionById(session.id)
    let linkedCampaign: { id: string; name: string } | null = null

    if (record?.campaignId) {
      try {
        const campaign = await getCampaign(staff, record.campaignId)
        linkedCampaign = { id: campaign.id, name: campaign.name }
      } catch (error) {
        // A campaign outside this reader's campaign scope, or one that has
        // since disappeared, reads as "no link" here; the session itself is
        // already scoped, so this must not become a 403 for the whole page.
        if (!(error instanceof AuthzError) || (error.status !== 403 && error.status !== 404)) {
          throw error
        }
      }
    }

    const attendees = await getSessionAttendees(scope, session.id)
    const sorted = sortByName
      ? [...attendees].sort((left, right) => left.name.localeCompare(right.name))
      : attendees

    const sessionStartDate = programDateOf(session.opensAt) ?? session.sessionDate
    const firstTimers = attendees.filter(
      (attendee) => attendee.firstSession !== null && attendee.firstSession === sessionStartDate,
    ).length
    const returning = attendees.length - firstTimers
    const meta = `${formatSessionDate(session.sessionDate)} · ${formatSessionTime(session.opensAt)}`

    return (
      <>
        <div className="flex flex-col gap-3">
          <Link
            href="/sessions"
            className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--program-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)]"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            <span className="hidden md:inline">All sessions</span>
            <span className="md:hidden">Sessions</span>
          </Link>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-[family-name:var(--font-poppins)] text-[22px] leading-tight font-semibold tracking-tight text-[var(--program-text)]">
                {session.name}
              </h1>
              <SessionStatusPill status={session.status} />
            </div>

            <p className="mt-1 hidden text-xs text-[var(--muted-foreground)] md:block">
              {meta} · {session.locationName ?? "—"}
            </p>
            <p className="mt-1 text-xs text-[var(--muted-foreground)] md:hidden">{meta}</p>
            <p className="text-xs text-[var(--muted-foreground)] md:hidden">{session.locationName ?? "—"}</p>
            {linkedCampaign ? (
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Invited by{" "}
                <Link
                  href={`/campaigns/${linkedCampaign.id}/assign-contacts`}
                  className="font-medium text-[var(--program-primary)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  {linkedCampaign.name}
                </Link>
              </p>
            ) : null}
          </div>
        </div>

        <SessionDetailStats attended={attendees.length} firstTimers={firstTimers} returning={returning} />

        <SessionAttendees sessionId={session.id} attendees={sorted} />
      </>
    )
  } catch (error) {
    if (error instanceof AuthzError && error.status === 401) {
      redirect(`/login?redirect=/sessions/${sessionId}`)
    }

    if (error instanceof AuthzError && error.status === 403) {
      redirect("/auth/error?code=staff-authorization-failed")
    }

    console.error("[sessions] detail failed", error)
    throw error
  }
}
