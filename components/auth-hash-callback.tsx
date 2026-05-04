"use client"

import { useEffect } from "react"
import type { StaffContext } from "@/lib/authz"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"

export function AuthHashCallback() {
  useEffect(() => {
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : ""
    if (!hash) {
      return
    }

    const params = new URLSearchParams(hash)
    const accessToken = params.get("access_token")
    const refreshToken = params.get("refresh_token")

    if (!accessToken || !refreshToken) {
      return
    }

    const sessionTokens = {
      access_token: accessToken,
      refresh_token: refreshToken,
    }
    let isActive = true

    async function completeImplicitSignIn() {
      const supabase = createSupabaseBrowserClient()
      const { error } = await supabase.auth.setSession(sessionTokens)

      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`)

      if (error || !isActive) {
        window.location.replace("/auth/error?code=invite-verification-failed")
        return
      }

      const response = await fetch("/api/auth/me", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      })

      if (!response.ok || !isActive) {
        window.location.replace("/auth/error?code=staff-authorization-failed")
        return
      }

      const data = (await response.json()) as { staff?: StaffContext }
      window.location.replace(data.staff?.role === "Volunteer" ? "/contact" : "/dashboard")
    }

    completeImplicitSignIn()

    return () => {
      isActive = false
    }
  }, [])

  return null
}
