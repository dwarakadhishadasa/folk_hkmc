import "server-only"

import { getServerProgramProfile } from "@hkmc/program-config/server"
import type { User } from "@supabase/supabase-js"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>

export interface AuthEmailBrandingMetadata {
  auth_email_brand_name: string
  auth_email_invite_action_url?: string
}

interface AuthEmailBrandingOptions {
  inviteActionUrl?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function mergeUserMetadata(user: User, metadata: AuthEmailBrandingMetadata): Record<string, unknown> {
  return {
    ...(isRecord(user.user_metadata) ? user.user_metadata : {}),
    ...metadata,
  }
}

async function findSupabaseUserByEmail(supabaseAdmin: SupabaseAdminClient, email: string): Promise<User | null> {
  const normalizedEmail = normalizeEmail(email)
  let page = 1

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) {
      throw error
    }

    const user = data.users.find((candidate) => candidate.email?.trim().toLowerCase() === normalizedEmail)
    if (user || !data.nextPage) {
      return user || null
    }

    page = data.nextPage
  }
}

async function updateUserMetadata(
  supabaseAdmin: SupabaseAdminClient,
  user: User,
  metadata: AuthEmailBrandingMetadata,
): Promise<void> {
  const currentMetadata = isRecord(user.user_metadata) ? user.user_metadata : {}
  const isCurrent = Object.entries(metadata).every(([key, value]) => currentMetadata[key] === value)

  if (isCurrent) {
    return
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    user_metadata: mergeUserMetadata(user, metadata),
  })

  if (error) {
    throw error
  }
}

export function getAuthEmailBrandingMetadata(options: AuthEmailBrandingOptions = {}): AuthEmailBrandingMetadata {
  const metadata: AuthEmailBrandingMetadata = {
    auth_email_brand_name: getServerProgramProfile().branding.shortName,
  }

  const inviteActionUrl = options.inviteActionUrl?.trim()
  if (inviteActionUrl) {
    metadata.auth_email_invite_action_url = inviteActionUrl
  }

  return metadata
}

export async function updateAuthEmailBrandingForUserId(
  supabaseUserId: string,
  supabaseAdmin: SupabaseAdminClient = createSupabaseAdminClient(),
  options: AuthEmailBrandingOptions = {},
): Promise<AuthEmailBrandingMetadata> {
  const metadata = getAuthEmailBrandingMetadata(options)
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(supabaseUserId)

  if (error) {
    throw error
  }

  if (!data.user) {
    throw new Error("Unable to load Supabase auth user for email branding.")
  }

  await updateUserMetadata(supabaseAdmin, data.user, metadata)
  return metadata
}

export async function updateAuthEmailBrandingForEmail(
  email: string,
  supabaseAdmin: SupabaseAdminClient = createSupabaseAdminClient(),
  options: AuthEmailBrandingOptions = {},
): Promise<AuthEmailBrandingMetadata> {
  const metadata = getAuthEmailBrandingMetadata(options)
  const user = await findSupabaseUserByEmail(supabaseAdmin, email)

  if (!user) {
    throw new Error("Unable to find Supabase auth user for email branding.")
  }

  await updateUserMetadata(supabaseAdmin, user, metadata)
  return metadata
}
