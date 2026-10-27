import { getStaffContext } from "@/lib/authz"
import { listCallerQueue } from "@/lib/dialer/caller"
import { dialerErrorResponse } from "@/lib/dialer/scope"

export const dynamic = "force-dynamic"

/** The caller's own queue: only their PENDING assignments on ACTIVE campaigns. */
export async function GET() {
  try {
    const staff = await getStaffContext()
    return Response.json(await listCallerQueue(staff))
  } catch (error) {
    return dialerErrorResponse(error)
  }
}
