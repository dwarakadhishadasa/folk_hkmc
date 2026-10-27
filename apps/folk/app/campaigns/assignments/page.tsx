import { redirect } from "next/navigation"

import { CallerSession } from "@/components/campaign/caller/caller-session"
import { AuthzError } from "@/lib/authz"
import { listCallerQueue } from "@/lib/dialer/caller"
import { requireDialerCaller } from "@/lib/dialer/scope"

import { getCampaignStaff } from "../staff"

export const dynamic = "force-dynamic"

interface CampaignAssignmentsPageProps {
  searchParams: Promise<{ campaign?: string; assignment?: string; phase?: string }>
}

/**
 * The caller's Assignments session.
 *
 * The page is the caller boundary (`requireDialerCaller`) and the queue read in
 * one server pass; the client owns the session position, pacing, draft and
 * receipt. `?campaign=` and `?assignment=` are the reload contract: the server
 * refetches the same queue and hands the client the same starting row.
 */
export default async function CampaignAssignmentsPage({ searchParams }: CampaignAssignmentsPageProps) {
  try {
    const staff = await getCampaignStaff()
    await requireDialerCaller(staff)

    const [queue, params] = await Promise.all([listCallerQueue(staff), searchParams])

    return (
      <CallerSession
        initialQueue={queue}
        role={staff.role}
        initialCampaignId={params.campaign ?? null}
        initialAssignmentId={params.assignment ?? null}
        initialPhase={params.phase ?? null}
      />
    )
  } catch (error) {
    if (error instanceof AuthzError && error.status === 401) {
      redirect("/login?redirect=/campaigns/assignments")
    }

    if (error instanceof AuthzError) {
      redirect("/auth/error?code=staff-authorization-failed")
    }

    console.error("[campaigns] assignments failed", error)
    throw error
  }
}
