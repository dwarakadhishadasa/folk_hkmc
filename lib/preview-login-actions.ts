"use server"

import { notFound, redirect } from "next/navigation"
import { AuthzError, syncStaffProfileByEmail } from "@/lib/authz"
import { loadPreviewFixtureAccounts } from "@/lib/preview-login-accounts"
import { isPreviewPasswordLoginEnabled } from "@/lib/preview-login"
import { safeStaffRedirectPath } from "@/lib/staff-routes"
import { createSupabaseServerClient } from "@/lib/supabase/server"

type PreviewLoginError = "invalid" | "not-staff" | "rate-limit" | "server"

function errorPath(error: PreviewLoginError, redirectTo: string, email: string): string {
  const params = new URLSearchParams({ error })
  if (redirectTo) {
    params.set("redirect", redirectTo)
  }
  if (email) {
    params.set("email", email)
  }
  return `/preview-login?${params.toString()}`
}

function isRateLimitError(error: { code?: string; status?: number }): boolean {
  return (
    error.status === 429 ||
    error.code === "over_request_rate_limit" ||
    error.code === "too_many_requests"
  )
}

export async function signInWithPreviewPassword(formData: FormData) {
  if (!isPreviewPasswordLoginEnabled()) {
    notFound()
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const password = String(formData.get("password") ?? "")
  const redirectTo = String(formData.get("redirect") ?? "")

  if (!email.endsWith(".fixture.test") || !password) {
    redirect(errorPath("invalid", redirectTo, email))
  }

  const accounts = await loadPreviewFixtureAccounts().catch((error: unknown) => {
    console.error("[preview-login] fixture account load failed", error)
    redirect(errorPath("server", redirectTo, email))
  })

  if (!accounts.some((account) => account.email === email)) {
    redirect(errorPath("invalid", redirectTo, email))
  }

  const supabase = await createSupabaseServerClient()
  const signIn = await supabase.auth.signInWithPassword({ email, password }).catch((error: unknown) => {
    console.error("[preview-login] password sign-in threw", error)
    redirect(errorPath("server", redirectTo, email))
  })

  if (signIn.error || !signIn.data.user || !signIn.data.session) {
    if (signIn.error && isRateLimitError(signIn.error)) {
      redirect(errorPath("rate-limit", redirectTo, email))
    }
    redirect(errorPath("invalid", redirectTo, email))
  }

  const signedInEmail = signIn.data.user.email?.trim().toLowerCase() || email
  const staff = await syncStaffProfileByEmail({
    supabaseUserId: signIn.data.user.id,
    email: signedInEmail,
  }).catch(async (syncError: unknown) => {
    await supabase.auth.signOut()
    if (syncError instanceof AuthzError && syncError.status === 403) {
      redirect(errorPath("not-staff", redirectTo, email))
    }
    console.error("[preview-login] staff profile sync failed", syncError)
    redirect(errorPath("server", redirectTo, email))
  })

  redirect(safeStaffRedirectPath(redirectTo, staff.role))
}
