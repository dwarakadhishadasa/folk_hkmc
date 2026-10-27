import { AuthzError, getStaffContext } from "@/lib/authz"
import { recordCallDisposition, type DispositionResponseInput } from "@/lib/dialer/caller"
import { dialerErrorResponse } from "@/lib/dialer/scope"

import { readJsonBody } from "@/apps/folk/app/api/dialer/_lib/request-body"

export const dynamic = "force-dynamic"

/**
 * The one disposition write. The caller id is never read from this body:
 * `recordCallDisposition` resolves it through `getStaffContext()` and
 * `requireDialerCaller`, and the RPC re-reads the assignment and caller.
 */
export async function POST(request: Request) {
  try {
    const staff = await getStaffContext()
    const body = (await readJsonBody(request)) as { [key: string]: unknown }

    if (typeof body.assignmentId !== "string" || body.assignmentId.length === 0) {
      throw new AuthzError(400, "invalid_assignment_id", "An assignment id is required.")
    }

    const receipt = await recordCallDisposition(staff, {
      assignmentId: body.assignmentId,
      attempt: typeof body.attempt === "number" ? body.attempt : Number.NaN,
      dispositionStatus: typeof body.dispositionStatus === "string" ? body.dispositionStatus : "",
      followUpNotes: typeof body.followUpNotes === "string" ? body.followUpNotes : null,
      responses: Array.isArray(body.responses)
        ? (body.responses as DispositionResponseInput[])
        : undefined,
    })

    return Response.json({ receipt })
  } catch (error) {
    return dialerErrorResponse(error)
  }
}
