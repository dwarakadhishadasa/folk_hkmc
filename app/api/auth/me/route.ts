import { authzErrorResponse, getStaffContext } from "@/lib/authz"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const staff = await getStaffContext()
    return Response.json({ staff })
  } catch (error) {
    return authzErrorResponse(error)
  }
}
