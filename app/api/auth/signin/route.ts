import { createSupabaseServerClient } from "@/lib/supabase/server"
import { findStaffUserByEmail, syncStaffSupabaseUserId } from "@/lib/airtable"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type { User } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

function isEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function isMissingAuthUserError(error: { message?: string; status?: number } | null): boolean {
  const message = error?.message?.toLowerCase() || ""
  return error?.status === 404 || message.includes("not found")
}

function isExistingAuthUserError(error: { message?: string } | null): boolean {
  const message = error?.message?.toLowerCase() || ""
  return message.includes("already") || message.includes("registered") || message.includes("duplicate")
}

async function findSupabaseUserByEmail(
  supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>,
  email: string,
): Promise<User | null> {
  let page = 1

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) {
      throw error
    }

    const user = data.users.find((candidate) => candidate.email?.trim().toLowerCase() === email)
    if (user || !data.nextPage) {
      return user || null
    }

    page = data.nextPage
  }
}

async function ensureSupabaseAuthUser(email: string, staffUserId: string, linkedSupabaseUserId?: string): Promise<void> {
  const supabaseAdmin = createSupabaseAdminClient()

  if (linkedSupabaseUserId) {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(linkedSupabaseUserId)
    if (!error && data.user?.email?.trim().toLowerCase() === email) {
      return
    }

    if (error && !isMissingAuthUserError(error)) {
      throw error
    }
  }

  const existingUser = await findSupabaseUserByEmail(supabaseAdmin, email)
  if (existingUser) {
    if (existingUser.id !== linkedSupabaseUserId) {
      await syncStaffSupabaseUserId(staffUserId, existingUser.id)
    }
    return
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
  })

  if (error && !isExistingAuthUserError(error)) {
    throw error
  }

  const user = data.user || (error ? await findSupabaseUserByEmail(supabaseAdmin, email) : null)
  if (!user?.id) {
    throw error || new Error("Unable to provision Supabase auth user.")
  }

  await syncStaffSupabaseUserId(staffUserId, user.id)
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: unknown }

    if (!isEmail(body.email)) {
      return Response.json({ error: "A valid staff email is required." }, { status: 400 })
    }

    const email = body.email.trim().toLowerCase()
    const staff = await findStaffUserByEmail(email)
    if (!staff || staff.status !== "Active") {
      return Response.json({ error: "This email is not linked to an active staff account." }, { status: 403 })
    }

    await ensureSupabaseAuthUser(email, staff.id, staff.supabaseUserId)

    const origin = new URL(request.url).origin
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${origin}/auth/confirm`,
        shouldCreateUser: false,
      },
    })

    if (error) {
      return Response.json({ error: error.message }, { status: 400 })
    }

    return Response.json({ sent: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send sign-in link."
    return Response.json({ error: message }, { status: 500 })
  }
}
