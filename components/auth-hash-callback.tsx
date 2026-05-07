"use client"

import { useEffect } from "react"
import type { StaffContext } from "@/lib/authz"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"

const STAFF_SYNC_RETRY_DELAYS_MS = [0, 150, 400]

function landingPathForRole(role?: StaffContext["role"]): string {
  if (role === "Volunteer") {
    return "/contact"
  }

  if (role === "Preacher") {
    return "/"
  }

  return "/dashboard"
}

function safeLandingPath(value: string | null, role: StaffContext["role"]): string {
  if (value?.startsWith("/") && !value.startsWith("//") && !value.startsWith("/auth")) {
    if (role === "Volunteer" && value !== "/contact") {
      return "/contact"
    }

    return value
  }

  return landingPathForRole(role)
}

function currentLandingPath(role: StaffContext["role"]): string {
  const params = new URLSearchParams(window.location.search)
  return safeLandingPath(params.get("next") || params.get("redirect"), role)
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function completeImplicitStaffSignIn(): Promise<StaffContext | null> {
  for (const delay of STAFF_SYNC_RETRY_DELAYS_MS) {
    if (delay > 0) {
      await wait(delay)
    }

    const response = await fetch("/api/auth/complete-implicit", {
      method: "POST",
      cache: "no-store",
      headers: { Accept: "application/json" },
    })

    if (response.ok) {
      const data = (await response.json()) as { staff?: StaffContext }
      return data.staff || null
    }

    if (response.status !== 401) {
      return null
    }
  }

  return null
}

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

      let staff: StaffContext | null = null
      try {
        staff = await completeImplicitStaffSignIn()
      } catch {
        staff = null
      }

      if (!staff || !isActive) {
        window.location.replace("/auth/error?code=staff-authorization-failed")
        return
      }

      window.location.replace(currentLandingPath(staff.role))
    }

    completeImplicitSignIn()

    return () => {
      isActive = false
    }
  }, [])

  return null
}
