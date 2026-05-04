import { createSupabaseServerClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

function isEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: unknown }

    if (!isEmail(body.email)) {
      return Response.json({ error: "A valid staff email is required." }, { status: 400 })
    }

    const email = body.email.trim().toLowerCase()
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
