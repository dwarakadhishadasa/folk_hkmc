import { getStaffContext } from "@/lib/authz"
import { createCampaign, listCampaigns, type CreateCampaignInput } from "@/lib/dialer/campaigns"
import { dialerErrorResponse } from "@/lib/dialer/scope"
import { readJsonBody } from "@/apps/folk/app/api/dialer/_lib/request-body"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const staff = await getStaffContext()
    const campaigns = await listCampaigns(staff)
    return Response.json({ campaigns })
  } catch (error) {
    return dialerErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const staff = await getStaffContext()
    const body = (await readJsonBody(request)) as CreateCampaignInput
    const campaign = await createCampaign(staff, {
      name: body.name,
      description: body.description,
      campaignDate: body.campaignDate,
      campaignTime: body.campaignTime,
      gapDuration: body.gapDuration,
      maxAttempts: body.maxAttempts,
    })

    return Response.json({ campaign }, { status: 201 })
  } catch (error) {
    return dialerErrorResponse(error)
  }
}
