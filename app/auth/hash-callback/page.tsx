"use client"

import { useEffect } from "react"

function authErrorPath(code: string, message?: string): string {
  const params = new URLSearchParams({ code })

  if (message) {
    params.set("message", message.slice(0, 240))
  }

  return `/auth/error?${params.toString()}`
}

export default function AuthHashCallbackPage() {
  useEffect(() => {
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : ""

    if (!hash) {
      window.location.replace("/auth/error?code=invalid-invite")
      return
    }

    const params = new URLSearchParams(hash)
    const accessToken = params.get("access_token")
    const refreshToken = params.get("refresh_token")

    if (!accessToken || !refreshToken) {
      const callbackError = params.get("error_description") || params.get("error")
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`)
      window.location.replace(
        callbackError
          ? authErrorPath("supabase-callback-error", callbackError)
          : authErrorPath("invalid-invite"),
      )
    }
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FFF9F0]">
      <div className="text-center text-[#24324A]">Completing sign-in...</div>
    </div>
  )
}
