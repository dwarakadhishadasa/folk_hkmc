import { listAssignableCallers } from "@/lib/dialer/assignments"
import { dialerErrorResponse } from "@/lib/dialer/scope"
import { getStaffContext } from "@/lib/authz"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const staff = await getStaffContext()
    return Response.json({ callers: await listAssignableCallers(staff) })
  } catch (error) {
    return dialerErrorResponse(error)
  }
}
