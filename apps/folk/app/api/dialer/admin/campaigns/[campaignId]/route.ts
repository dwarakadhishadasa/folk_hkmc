import { getStaffContext } from "@/lib/authz"
import { getCampaign, updateCampaign, type UpdateCampaignInput } from "@/lib/dialer/campaigns"
import { dialerErrorResponse } from "@/lib/dialer/scope"

import { readJsonBody } from "@/apps/folk/app/api/dialer/_lib/request-body"

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

/** The edit page's Save: name, description and end date, never the status. */
export async function PATCH(request: Request, context: CampaignRouteContext) {
  try {
    const staff = await getStaffContext()
    const { campaignId } = await context.params
    const body = (await readJsonBody(request)) as UpdateCampaignInput

    const campaign = await updateCampaign(staff, campaignId, {
      name: body.name,
      description: body.description,
      campaignDate: body.campaignDate,
    })

    return Response.json({ campaign })
  } catch (error) {
    return dialerErrorResponse(error)
  }
}
