import { AuthzError, authzErrorResponse, getStaffContext } from "@/lib/authz"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const staff = await getStaffContext()
    return Response.json({ staff })
  } catch (error) {
    if (error instanceof AuthzError && error.status === 401) {
      return Response.json({ staff: null })
    }

    return authzErrorResponse(error)
  }
}
