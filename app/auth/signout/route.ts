import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect("/login?signedOut=1")
}

export async function POST() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect("/login?signedOut=1")
}
