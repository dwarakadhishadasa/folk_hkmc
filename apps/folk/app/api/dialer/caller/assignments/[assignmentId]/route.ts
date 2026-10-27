import { getStaffContext } from "@/lib/authz"
import { getCallerAssignment } from "@/lib/dialer/caller"
import { dialerErrorResponse } from "@/lib/dialer/scope"

export const dynamic = "force-dynamic"

interface CallerAssignmentContext {
  params: Promise<{ assignmentId: string }>
}

/**
 * One card and its live survey. A missing assignment and another caller's
 * assignment both become `dialerErrorResponse`'s body-less 404.
 */
export async function GET(_request: Request, context: CallerAssignmentContext) {
  try {
    const staff = await getStaffContext()
    const { assignmentId } = await context.params
    return Response.json(await getCallerAssignment(staff, assignmentId))
  } catch (error) {
    return dialerErrorResponse(error)
  }
}
