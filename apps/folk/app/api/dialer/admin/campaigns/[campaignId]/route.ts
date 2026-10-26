import { getStaffContext } from "@/lib/authz"
import { getCampaign } from "@/lib/dialer/campaigns"
import { dialerErrorResponse } from "@/lib/dialer/scope"

export const dynamic = "force-dynamic"

interface CampaignRouteContext {
  params: Promise<{ campaignId: string }>
}

export async function GET(_request: Request, context: CampaignRouteContext) {
  try {
    const staff = await getStaffContext()
    const { campaignId } = await context.params
    const campaign = await getCampaign(staff, campaignId)
    return Response.json({ campaign })
  } catch (error) {
    return dialerErrorResponse(error)
  }
}
