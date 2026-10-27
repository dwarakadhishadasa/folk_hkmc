import { getStaffContext } from "@/lib/authz"
import { skipCallerAssignment } from "@/lib/dialer/caller"
import { dialerErrorResponse } from "@/lib/dialer/scope"

export const dynamic = "force-dynamic"

interface CallerSkipContext {
  params: Promise<{ assignmentId: string }>
}

/** Skip writes `SKIPPED`; it never drops the contact without a stored state. */
export async function POST(_request: Request, context: CallerSkipContext) {
  try {
    const staff = await getStaffContext()
    const { assignmentId } = await context.params
    return Response.json(await skipCallerAssignment(staff, assignmentId))
  } catch (error) {
    return dialerErrorResponse(error)
  }
}
