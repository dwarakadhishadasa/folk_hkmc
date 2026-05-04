import "server-only"

import { createClient } from "@supabase/supabase-js"
import { getSupabasePublicUrl, getSupabaseServiceRoleKey } from "@/lib/supabase/env"

export function createSupabaseAdminClient() {
  return createClient(getSupabasePublicUrl(), getSupabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
