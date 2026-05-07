"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { usePathname } from "next/navigation"
import type { StaffContext, StaffRole } from "@/lib/authz"

export type UserRole = StaffRole

interface AuthContextType {
  isLoggedIn: boolean
  username: string | null
  role: UserRole | null
  staff: StaffContext | null
  login: (email: string) => Promise<boolean>
  logout: () => void
  refresh: () => Promise<void>
  isAdmin: boolean
  isPreacher: boolean
  isVolunteer: boolean
  isHydrated: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

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

function isProtectedStaffPath(pathname: string | null): boolean {
  return Boolean(
    pathname &&
      ["/admin", "/contact", "/dashboard", "/manage", "/sessions", "/volunteers"].some(
        (path) => pathname === path || pathname.startsWith(`${path}/`),
      ),
  )
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

    const data = (await response.json().catch(() => ({}))) as { error?: string }
    if (!response.ok) {
      throw new Error(data.error || "Unable to send sign-in link.")
    }

    return true
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
      logout,
      refresh,
      isAdmin: role === "Admin",
      isPreacher: role === "Admin" || role === "Preacher",
      isVolunteer: role === "Volunteer",
      isHydrated,
    }
  }, [isHydrated, login, logout, refresh, staff])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
