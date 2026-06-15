import "server-only"

import { createClient } from "@supabase/supabase-js"
import { getAuthConfirmRedirectUrl } from "@/lib/site-url"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getAuthEmailBrandingMetadata, updateAuthEmailBrandingForEmail } from "@/lib/supabase/auth-email-branding"
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

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error("Unexpected Supabase auth email setup error.")
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
  const authEmailBranding = getAuthEmailBrandingMetadata()
  const inviteResult = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: authEmailBranding,
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

  let fallbackAuthEmailBranding = authEmailBranding
  try {
    fallbackAuthEmailBranding = await updateAuthEmailBrandingForEmail(email, supabaseAdmin)
  } catch (error) {
    return {
      delivery: "sign-in-link",
      error: toError(error),
      safeErrorMessage: safeSupabaseInviteError(error, redirectTo),
    }
  }

  const supabase = createSupabasePasswordlessClient()
  const signInResult = await supabase.auth.signInWithOtp({
    email,
    options: {
      data: fallbackAuthEmailBranding,
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
