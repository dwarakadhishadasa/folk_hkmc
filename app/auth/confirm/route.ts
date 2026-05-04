import { redirect } from "next/navigation"
import type { EmailOtpType } from "@supabase/supabase-js"
import { syncStaffProfileByEmail } from "@/lib/authz"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

function safeNextPath(value: string | null, role: string): string {
  if (value?.startsWith("/") && !value.startsWith("//") && !value.startsWith("/auth")) {
    if (role === "Volunteer" && value !== "/contact") {
      return "/contact"
    }
    return value
  }

  return role === "Volunteer" ? "/contact" : "/dashboard"
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const tokenHash = requestUrl.searchParams.get("token_hash")
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null
  const next = requestUrl.searchParams.get("next")

  if (!tokenHash || (type !== "invite" && type !== "magiclink" && type !== "email")) {
    redirect("/auth/error?code=invalid-invite")
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  })

  const email = data.user?.email?.trim().toLowerCase()
  if (error || !data.user || !email) {
    redirect("/auth/error?code=invite-verification-failed")
  }

  try {
    const staff = await syncStaffProfileByEmail({ supabaseUserId: data.user.id, email })
    redirect(safeNextPath(next, staff.role))
  } catch {
    await supabase.auth.signOut()
    redirect("/auth/error?code=staff-authorization-failed")
  }
}
