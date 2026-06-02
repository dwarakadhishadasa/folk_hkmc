import { AuthzError, authzErrorResponse, getStaffContext } from "@/lib/authz"

export const dynamic = "force-dynamic"
export const revalidate = 0

const headers = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
  Vary: "Cookie",
}

export async function GET() {
  try {
    const staff = await getStaffContext()
    return Response.json({ staff }, { headers })
  } catch (error) {
    if (error instanceof AuthzError && error.status === 401) {
      return Response.json({ staff: null }, { headers })
    }

    const response = authzErrorResponse(error)
    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value)
    }
    return response
  }
}
