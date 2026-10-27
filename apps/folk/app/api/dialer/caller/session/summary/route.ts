import { AuthzError, getStaffContext } from "@/lib/authz"
import { getCallerSessionSummary } from "@/lib/dialer/caller"
import { dialerErrorResponse } from "@/lib/dialer/scope"

export const dynamic = "force-dynamic"

/** The caller's own counts for one campaign; never the campaign-wide funnel. */
export async function GET(request: Request) {
  try {
    const staff = await getStaffContext()
    const campaignId = new URL(request.url).searchParams.get("campaignId")

    if (!campaignId) {
      throw new AuthzError(400, "missing_campaign_id", "A campaign id is required.")
    }

    return Response.json(await getCallerSessionSummary(staff, campaignId))
  } catch (error) {
    return dialerErrorResponse(error)
  }
}
