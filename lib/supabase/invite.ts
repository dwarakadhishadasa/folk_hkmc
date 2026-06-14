import "server-only"

import { createClient } from "@supabase/supabase-js"
import { getAuthConfirmRedirectUrl } from "@/lib/site-url"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getSupabasePublicUrl, getSupabaseServerPublicKey } from "@/lib/supabase/env"

export type StaffInviteDelivery = "invite" | "sign-in-link"

interface StaffInviteResult {
  delivery: StaffInviteDelivery
  error: Error | null
  safeErrorMessage?: string
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : ""
}

function isExistingAuthUserError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase()
  return message.includes("already") || message.includes("registered") || message.includes("duplicate")
}

function safeSupabaseInviteError(error: unknown, redirectTo: string): string {
  const message = errorMessage(error).toLowerCase()

  if (message.includes("redirect")) {
    return `Supabase rejected the invite redirect. Add ${redirectTo} to the Supabase Auth redirect URLs.`
  }

  if (message.includes("rate") || message.includes("too many")) {
    return "Supabase rate-limited this email. Please wait a minute and try again."
  }

  if (message.includes("smtp") || message.includes("email")) {
    return "Supabase could not send the invite email. Check the Supabase Auth email/SMTP setup and try again."
  }

  return "Supabase could not send the invite email. Check the Supabase Auth setup and try again."
}

function createSupabasePasswordlessClient() {
  return createClient(getSupabasePublicUrl(), getSupabaseServerPublicKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export async function sendStaffInviteEmail(email: string, request?: Request): Promise<StaffInviteResult> {
  const redirectTo = getAuthConfirmRedirectUrl(request)
  const supabaseAdmin = createSupabaseAdminClient()
  const inviteResult = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
  })

  if (!inviteResult.error) {
    return { delivery: "invite", error: null }
  }

  if (!isExistingAuthUserError(inviteResult.error)) {
    return {
      delivery: "invite",
      error: inviteResult.error,
      safeErrorMessage: safeSupabaseInviteError(inviteResult.error, redirectTo),
    }
  }

  const supabase = createSupabasePasswordlessClient()
  const signInResult = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
      shouldCreateUser: false,
    },
  })

  if (signInResult.error) {
    return {
      delivery: "sign-in-link",
      error: signInResult.error,
      safeErrorMessage: safeSupabaseInviteError(signInResult.error, redirectTo),
    }
  }

  return { delivery: "sign-in-link", error: null }
}
