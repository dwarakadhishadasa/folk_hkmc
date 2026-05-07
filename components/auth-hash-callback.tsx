"use client"

import { useEffect } from "react"
import type { StaffContext } from "@/lib/authz"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"

const STAFF_SYNC_RETRY_DELAYS_MS = [0, 150, 400]

type StaffSyncResult =
  | { status: "authenticated"; staff: StaffContext }
  | { status: "unauthenticated" }
  | { status: "unauthorized" }

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

function authErrorPath(code: string, message?: string): string {
  const params = new URLSearchParams({ code })

  if (message) {
    params.set("message", message.slice(0, 240))
  }

  return `/auth/error?${params.toString()}`
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function completeImplicitStaffSignIn(): Promise<StaffSyncResult> {
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
      return data.staff ? { status: "authenticated", staff: data.staff } : { status: "unauthorized" }
    }

    if (response.status !== 401) {
      return { status: "unauthorized" }
    }
  }

  return { status: "unauthenticated" }
}

export function AuthHashCallback() {
  useEffect(() => {
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : ""
    const isHashCallbackPath = window.location.pathname === "/auth/hash-callback"
    let isActive = true

    if (!hash) {
      if (isHashCallbackPath) {
        completeImplicitStaffSignIn()
          .then((result) => {
            if (!isActive) {
              return
            }

            if (result.status === "authenticated") {
              window.location.replace(currentLandingPath(result.staff.role))
              return
            }

            window.location.replace(
              result.status === "unauthenticated"
                ? authErrorPath("invalid-invite")
                : authErrorPath("staff-authorization-failed"),
            )
          })
          .catch(() => {
            if (isActive) {
              window.location.replace(authErrorPath("invalid-invite"))
            }
          })

        return () => {
          isActive = false
        }
      }

      return
    }

    const params = new URLSearchParams(hash)
    const accessToken = params.get("access_token")
    const refreshToken = params.get("refresh_token")

    if (!accessToken || !refreshToken) {
      const callbackError = params.get("error_description") || params.get("error")
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`)

      if (isHashCallbackPath) {
        window.location.replace(
          callbackError
            ? authErrorPath("supabase-callback-error", callbackError)
            : authErrorPath("invalid-invite"),
        )
      }

      return
    }

    const sessionTokens = {
      access_token: accessToken,
      refresh_token: refreshToken,
    }
    async function completeImplicitSignIn() {
      const supabase = createSupabaseBrowserClient()
      const { error } = await supabase.auth.setSession(sessionTokens)

      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`)

      if (error || !isActive) {
        window.location.replace("/auth/error?code=invite-verification-failed")
        return
      }

      let staffSyncResult: StaffSyncResult = { status: "unauthorized" }
      try {
        staffSyncResult = await completeImplicitStaffSignIn()
      } catch {
        staffSyncResult = { status: "unauthorized" }
      }

      if (staffSyncResult.status !== "authenticated" || !isActive) {
        window.location.replace("/auth/error?code=staff-authorization-failed")
        return
      }

      window.location.replace(currentLandingPath(staffSyncResult.staff.role))
    }

    completeImplicitSignIn()

    return () => {
      isActive = false
    }
  }, [])

  return null
}
