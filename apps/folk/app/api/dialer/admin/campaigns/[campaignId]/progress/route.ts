import { getStaffContext } from "@/lib/authz"
import { getCampaignProgress } from "@/lib/dialer/progress"
import { dialerErrorResponse } from "@/lib/dialer/scope"

export const dynamic = "force-dynamic"

interface CampaignProgressContext {
  params: Promise<{ campaignId: string }>
}

export async function GET(_request: Request, context: CampaignProgressContext) {
  try {
    const staff = await getStaffContext()
    const { campaignId } = await context.params
    const progress = await getCampaignProgress(staff, campaignId)
    return Response.json({ progress })
  } catch (error) {
    return dialerErrorResponse(error)
  }
}
