import type { NextRequest } from "next/server"
import { updateSupabaseSession } from "@/lib/supabase/proxy"

export async function proxy(request: NextRequest) {
  return updateSupabaseSession(request)
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/contact/:path*",
    "/sessions/:path*",
    "/volunteers/:path*",
    "/auth/:path*",
    "/api/contact",
    "/api/sessions/:path*",
    "/api/volunteers/:path*",
    "/api/admin/:path*",
  ],
}
