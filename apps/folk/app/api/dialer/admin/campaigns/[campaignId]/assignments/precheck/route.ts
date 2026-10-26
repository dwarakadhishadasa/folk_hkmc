import { getStaffContext } from "@/lib/authz"
import { precheckAssignments } from "@/lib/dialer/assignments"
import { dialerErrorResponse } from "@/lib/dialer/scope"
import { readJsonBody } from "@/apps/folk/app/api/dialer/_lib/request-body"

export const dynamic = "force-dynamic"

interface CampaignAssignmentsContext {
  params: Promise<{ campaignId: string }>
}

/**
 * The read half of the assignment. The route forwards `contactIds` untouched:
 * the service owns id validation, the campaign 404 and the AD-3 scope refusal,
 * and writes nothing here.
 */
export async function POST(request: Request, context: CampaignAssignmentsContext) {
  try {
    const staff = await getStaffContext()
    const { campaignId } = await context.params
    const body = (await readJsonBody(request)) as { contactIds?: string[] }

    const precheck = await precheckAssignments(staff, campaignId, body.contactIds as string[])
    return Response.json(precheck)
  } catch (error) {
    return dialerErrorResponse(error)
  }
}
