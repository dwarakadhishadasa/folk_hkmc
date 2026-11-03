import type { NextRequest } from "next/server"
import { proxy as rootProxy } from "../../proxy"

export async function proxy(request: NextRequest) {
  return rootProxy(request)
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/manage",
    "/manage/:path*",
    "/api/manage",
    "/api/manage/:path*",
    "/admin",
    "/admin/:path*",
    "/attendance",
    "/contact/:path*",
    "/contacts",
    "/contacts/:path*",
    "/sessions/:path*",
    "/volunteers/:path*",
    "/auth/:path*",
    "/campaigns/:path*",
    "/api/contact",
    "/api/sessions/:path*",
    "/api/volunteers/:path*",
    "/api/admin/:path*",
    "/api/dialer/:path*",
  ],
}
