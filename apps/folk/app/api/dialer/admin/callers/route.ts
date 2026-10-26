import { getStaffContext } from "@/lib/authz"
import { listRoster } from "@/lib/dialer/callers"
import { dialerErrorResponse } from "@/lib/dialer/scope"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const staff = await getStaffContext()
    const callers = await listRoster(staff)
    return Response.json({ callers })
  } catch (error) {
    return dialerErrorResponse(error)
  }
}
