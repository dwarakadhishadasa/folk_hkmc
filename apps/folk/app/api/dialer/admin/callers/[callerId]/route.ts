import { getStaffContext } from "@/lib/authz"
import { setCallerActive } from "@/lib/dialer/callers"
import { dialerErrorResponse } from "@/lib/dialer/scope"
import { readJsonBody } from "@/apps/folk/app/api/dialer/_lib/request-body"

export const dynamic = "force-dynamic"

interface CallerRouteContext {
  params: Promise<{ callerId: string }>
}

export async function PATCH(request: Request, context: CallerRouteContext) {
  try {
    const staff = await getStaffContext()
    const { callerId } = await context.params
    const body = (await readJsonBody(request)) as { isActive?: unknown }
    const caller = await setCallerActive(staff, callerId, body.isActive as boolean)
    return Response.json({ caller })
  } catch (error) {
    return dialerErrorResponse(error)
  }
}
