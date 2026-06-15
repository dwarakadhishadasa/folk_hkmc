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

  if (role === "Volunteer") {
    return "/contact"
  }

  return "/"
}

function isSupportedEmailOtpType(value: string | null): value is EmailOtpType {
  return value === "invite" || value === "magiclink" || value === "email"
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const callbackError = requestUrl.searchParams.get("error_description") || requestUrl.searchParams.get("error")
  const code = requestUrl.searchParams.get("code")
  const tokenHash = requestUrl.searchParams.get("token_hash")
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null
  const next = requestUrl.searchParams.get("next")
  const hasSupportedTokenHash = Boolean(tokenHash) && isSupportedEmailOtpType(type)
  const supabase = await createSupabaseServerClient()

  if (callbackError) {
    const params = new URLSearchParams({
      code: "supabase-callback-error",
      message: callbackError.slice(0, 240),
    })
    redirect(`/auth/error?${params.toString()}`)
  }

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (error || !data.user) {
      redirect("/auth/error?code=invite-verification-failed")
    }

    const email = data.user.email?.trim().toLowerCase()
    if (!email) {
      redirect("/auth/error?code=invite-verification-failed")
    }

    let staff
    try {
      staff = await syncStaffProfileByEmail({ supabaseUserId: data.user.id, email })
    } catch {
      await supabase.auth.signOut()
      redirect("/auth/error?code=staff-authorization-failed")
    }

    redirect(safeNextPath(next, staff.role))
  }

  if (!code && !hasSupportedTokenHash && !callbackError) {
    const params = new URLSearchParams()
    if (next) {
      params.set("next", next)
    }

    redirect(`/auth/hash-callback${params.size > 0 ? `?${params.toString()}` : ""}`)
  }

  if (!tokenHash || !isSupportedEmailOtpType(type)) {
    redirect("/auth/error?code=invalid-invite")
  }

  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  })

  const email = data.user?.email?.trim().toLowerCase()
  if (error || !data.user || !email) {
    redirect("/auth/error?code=invite-verification-failed")
  }

  let staff
  try {
    staff = await syncStaffProfileByEmail({ supabaseUserId: data.user.id, email })
  } catch {
    await supabase.auth.signOut()
    redirect("/auth/error?code=staff-authorization-failed")
  }

  redirect(safeNextPath(next, staff.role))
}
