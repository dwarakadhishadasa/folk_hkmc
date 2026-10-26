import { getStaffContext } from "@/lib/authz"
import { transitionCampaign, type CampaignTransitionAction } from "@/lib/dialer/campaigns"
import { dialerErrorResponse } from "@/lib/dialer/scope"
import { readJsonBody } from "@/apps/folk/app/api/dialer/_lib/request-body"

export const dynamic = "force-dynamic"

interface CampaignTransitionContext {
  params: Promise<{ campaignId: string }>
}

export async function POST(request: Request, context: CampaignTransitionContext) {
  try {
    const staff = await getStaffContext()
    const { campaignId } = await context.params
    const { action } = (await readJsonBody(request)) as { action: CampaignTransitionAction }
    const campaign = await transitionCampaign(staff, campaignId, action)
    return Response.json({ campaign })
  } catch (error) {
    return dialerErrorResponse(error)
  }
}
