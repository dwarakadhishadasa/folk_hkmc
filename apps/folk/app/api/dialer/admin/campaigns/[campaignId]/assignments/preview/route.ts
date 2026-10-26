import { getCampaign } from "@/lib/dialer/campaigns"
import { previewAssignmentSplit } from "@/lib/dialer/assignments"
import { dialerErrorResponse } from "@/lib/dialer/scope"
import { getStaffContext } from "@/lib/authz"

import { readJsonBody } from "../../../../../_lib/request-body"

export const dynamic = "force-dynamic"

/**
 * The distribution preview is computed by the same function the Story 1.8 write
 * will use, so the count on the button and the rows that land cannot diverge.
 */
export async function POST(request: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  try {
    const staff = await getStaffContext()
    const { campaignId } = await params
    await getCampaign(staff, campaignId)

    const body = (await readJsonBody(request)) as {
      total?: number
      callers?: { callerId: string; weight: number }[]
    }
    return Response.json({
      split: previewAssignmentSplit(body.total as number, body.callers as { callerId: string; weight: number }[]),
    })
  } catch (error) {
    return dialerErrorResponse(error)
  }
}
