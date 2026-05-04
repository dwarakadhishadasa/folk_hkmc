"use client"

import { createBrowserClient } from "@supabase/ssr"
import { getSupabaseBrowserKey, getSupabasePublicUrl } from "@/lib/supabase/env"

export function createSupabaseBrowserClient() {
  return createBrowserClient(getSupabasePublicUrl(), getSupabaseBrowserKey())
}
