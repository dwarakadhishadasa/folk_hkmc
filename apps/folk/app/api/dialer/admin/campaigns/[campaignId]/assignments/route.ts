import { getStaffContext } from "@/lib/authz"
import { writeAssignments, type WriteAssignmentsInput } from "@/lib/dialer/assignments"
import { dialerErrorResponse } from "@/lib/dialer/scope"
import { readJsonBody } from "@/apps/folk/app/api/dialer/_lib/request-body"

export const dynamic = "force-dynamic"

interface CampaignAssignmentsContext {
  params: Promise<{ campaignId: string }>
}

/**
 * `mode` is forwarded as it arrived, `undefined` included: defaulting it in the
 * route would turn the service's `409 conflicts_require_decision` into a write
 * the assigner never confirmed. Every other refusal is the service's too.
 */
export async function POST(request: Request, context: CampaignAssignmentsContext) {
  try {
    const staff = await getStaffContext()
    const { campaignId } = await context.params
    const body = (await readJsonBody(request)) as WriteAssignmentsInput

    const result = await writeAssignments(staff, campaignId, {
      contactIds: body.contactIds,
      callers: body.callers,
      mode: body.mode,
    })

    return Response.json(result, { status: 201 })
  } catch (error) {
    return dialerErrorResponse(error)
  }
}
