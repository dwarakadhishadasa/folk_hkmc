import type { NextRequest } from "next/server"
import { proxy as rootProxy } from "../../proxy"

export async function proxy(request: NextRequest) {
  return rootProxy(request)
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
