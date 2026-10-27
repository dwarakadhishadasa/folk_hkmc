import { AuthzError, getStaffContext } from "@/lib/authz"
import { recallCallerNotReachable } from "@/lib/dialer/caller"
import { dialerErrorResponse } from "@/lib/dialer/scope"

import { readJsonBody } from "@/apps/folk/app/api/dialer/_lib/request-body"

export const dynamic = "force-dynamic"

/** Re-queue only this caller's own NOT_REACHABLE rows, under the attempt cap. */
export async function POST(request: Request) {
  try {
    const staff = await getStaffContext()
    const body = (await readJsonBody(request)) as { [key: string]: unknown }
    const campaignId = typeof body.campaignId === "string" ? body.campaignId : ""

    if (!campaignId) {
      throw new AuthzError(400, "missing_campaign_id", "A campaign id is required.")
    }

    return Response.json(await recallCallerNotReachable(staff, campaignId))
  } catch (error) {
    return dialerErrorResponse(error)
  }
}
