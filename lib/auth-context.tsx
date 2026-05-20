"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { usePathname } from "next/navigation"
import type { StaffContext, StaffRole } from "@/lib/authz"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"

export type UserRole = StaffRole

interface AuthContextType {
  isLoggedIn: boolean
  username: string | null
  role: UserRole | null
  staff: StaffContext | null
  login: (email: string) => Promise<boolean>
  verifyLoginCode: (email: string, token: string) => Promise<StaffContext>
  logout: () => void
  refresh: () => Promise<void>
  isAdmin: boolean
  isPreacher: boolean
  isVolunteer: boolean
  isHydrated: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)
const STAFF_SYNC_RETRY_DELAYS_MS = [0, 150, 400]
const MIN_EMAIL_OTP_LENGTH = 6

async function loadStaff(): Promise<StaffContext | null> {
  const response = await fetch("/api/auth/me", {
    cache: "no-store",
    headers: { Accept: "application/json" },
  })

  if (!response.ok) {
    return null
  }

  const data = (await response.json()) as { staff?: StaffContext }
  return data.staff || null
}

async function completeStaffProfileSync(): Promise<StaffContext> {
  for (const delay of STAFF_SYNC_RETRY_DELAYS_MS) {
    if (delay > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, delay))
    }

    const response = await fetch("/api/auth/complete-implicit", {
      method: "POST",
      cache: "no-store",
      headers: { Accept: "application/json" },
    })

    const data = (await response.json().catch(() => ({}))) as { staff?: StaffContext; error?: string }
    if (response.ok && data.staff) {
      return data.staff
    }

    if (response.status !== 401) {
      throw new Error(data.error || "Unable to complete staff sign-in.")
    }
  }

  throw new Error("Unable to complete staff sign-in.")
}

function isProtectedStaffPath(pathname: string | null): boolean {
  return Boolean(
    pathname &&
      ["/admin", "/contact", "/dashboard", "/manage", "/sessions", "/volunteers"].some(
        (path) => pathname === path || pathname.startsWith(`${path}/`),
      ),
  )
}

function safeRedirectPath(value: string | null): string | null {
  if (value?.startsWith("/") && !value.startsWith("//") && !value.startsWith("/auth")) {
    return value
  }

  return null
}

function buildAuthConfirmRedirect(): string {
  const url = new URL("/auth/confirm", window.location.origin)
  const requestedRedirectUrl = new URLSearchParams(window.location.search).get("redirect")
  const safeRequestedRedirectUrl = safeRedirectPath(requestedRedirectUrl)

  if (safeRequestedRedirectUrl) {
    url.searchParams.set("next", safeRequestedRedirectUrl)
  }

  return url.toString()
}

export function AuthProvider({ children, initialStaff }: { children: ReactNode; initialStaff?: StaffContext | null }) {
  const pathname = usePathname()
  const hasInitialStaff = Boolean(initialStaff)
  const [isHydrated, setIsHydrated] = useState(hasInitialStaff)
  const [staff, setStaff] = useState<StaffContext | null>(initialStaff || null)

  const refresh = useCallback(async () => {
    try {
      setStaff(await loadStaff())
    } catch {
      setStaff(null)
    } finally {
      setIsHydrated(true)
    }
  }, [])

  useEffect(() => {
    if (initialStaff) {
      setStaff(initialStaff)
      setIsHydrated(true)
      return
    }

    if (isProtectedStaffPath(pathname)) {
      setStaff(null)
      setIsHydrated(true)
      return
    }

    refresh()
  }, [initialStaff, pathname, refresh])

  const login = useCallback(async (email: string): Promise<boolean> => {
    const response = await fetch("/api/auth/signin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })

    const data = (await response.json().catch(() => ({}))) as { email?: string; error?: string }
    if (!response.ok) {
      throw new Error(data.error || "Unable to send sign-in link.")
    }

    const normalizedEmail = data.email || email.trim().toLowerCase()
    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: buildAuthConfirmRedirect(),
        shouldCreateUser: false,
      },
    })

    if (error) {
      throw new Error(error.message || "Unable to send sign-in link.")
    }

    return true
  }, [])

  const verifyLoginCode = useCallback(async (email: string, token: string): Promise<StaffContext> => {
    const normalizedEmail = email.trim().toLowerCase()
    const normalizedToken = token.replace(/\D/g, "")
    if (!normalizedEmail || normalizedToken.length < MIN_EMAIL_OTP_LENGTH) {
      throw new Error("Enter the code from your email.")
    }

    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token: normalizedToken,
      type: "email",
    })

    if (error) {
      throw new Error(error.message || "Unable to verify the sign-in code.")
    }

    const syncedStaff = await completeStaffProfileSync()
    setStaff(syncedStaff)
    setIsHydrated(true)
    return syncedStaff
  }, [])

  const logout = useCallback(() => {
    window.location.assign("/auth/signout")
  }, [])

  const value = useMemo<AuthContextType>(() => {
    const role = staff?.role || null

    return {
      isLoggedIn: Boolean(staff),
      username: staff?.name || staff?.email || null,
      role,
      staff,
      login,
      verifyLoginCode,
      logout,
      refresh,
      isAdmin: role === "Admin",
      isPreacher: role === "Admin" || role === "Preacher",
      isVolunteer: role === "Volunteer",
      isHydrated,
    }
  }, [isHydrated, login, logout, refresh, staff, verifyLoginCode])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
