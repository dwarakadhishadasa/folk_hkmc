import "server-only"

import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { getSupabasePublicUrl, getSupabaseServerPublicKey } from "@/lib/supabase/env"

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(getSupabasePublicUrl(), getSupabaseServerPublicKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Server Components cannot set cookies. Route handlers and proxy refresh paths can.
        }
      },
    },
  })
}
