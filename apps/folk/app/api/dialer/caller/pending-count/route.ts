import { getStaffContext } from "@/lib/authz"
import { countCallerPendingCalls } from "@/lib/dialer/caller"
import { dialerErrorResponse } from "@/lib/dialer/scope"

export const dynamic = "force-dynamic"

/** The caller's pending-call count, for the phone menu's Assignments badge. */
export async function GET() {
  try {
    const staff = await getStaffContext()
    return Response.json({ pending: await countCallerPendingCalls(staff) })
  } catch (error) {
    return dialerErrorResponse(error)
  }
}
