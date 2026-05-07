import { AuthzError, authzErrorResponse, syncStaffProfileByEmail } from "@/lib/authz"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error || !user) {
      throw new AuthzError(401, "unauthenticated", "Staff sign-in is required.")
    }

    const email = user.email?.trim().toLowerCase()
    if (!email) {
      throw new AuthzError(403, "missing_email", "The signed-in user does not have an email.")
    }

    const staff = await syncStaffProfileByEmail({ supabaseUserId: user.id, email })
    return Response.json({ staff })
  } catch (error) {
    return authzErrorResponse(error)
  }
}
