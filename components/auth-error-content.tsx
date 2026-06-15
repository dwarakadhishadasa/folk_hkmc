"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"

interface AuthErrorContentProps {
  code?: string
  message: string
}

function landingPathForRole(role: ReturnType<typeof useAuth>["role"]): string {
  if (role === "Volunteer") {
    return "/contact"
  }

  return "/"
}

function hasHashSessionTokens(): boolean {
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : ""
  if (!hash) {
    return false
  }

  const params = new URLSearchParams(hash)
  return Boolean(params.get("access_token") && params.get("refresh_token"))
}

export function AuthErrorContent({ code, message }: AuthErrorContentProps) {
  const router = useRouter()
  const { isHydrated, isLoggedIn, role } = useAuth()
  const shouldDeferInvalidInvite = code === "invalid-invite"
  const [isCheckingHashCallback, setIsCheckingHashCallback] = useState(shouldDeferInvalidInvite)

  useEffect(() => {
    if (!shouldDeferInvalidInvite) {
      return
    }

    if (hasHashSessionTokens()) {
      return
    }

    const timeout = window.setTimeout(() => {
      setIsCheckingHashCallback(false)
    }, 300)

    return () => window.clearTimeout(timeout)
  }, [shouldDeferInvalidInvite])

  useEffect(() => {
    if (shouldDeferInvalidInvite && isHydrated && isLoggedIn) {
      router.replace(landingPathForRole(role))
    }
  }, [isHydrated, isLoggedIn, role, router, shouldDeferInvalidInvite])

  if (isCheckingHashCallback) {
    return (
      <div className="text-center text-[#24324A]">
        <p className="text-sm font-medium">Completing sign-in...</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-white p-6 text-center shadow-xl">
      <h1 className="font-[family-name:var(--font-poppins)] text-2xl font-bold text-[#24324A]">
        Sign-in Problem
      </h1>
      <p className="mt-3 text-sm text-[#24324A]/70">{message}</p>
      <Link
        href="/login"
        className="mt-6 inline-flex rounded-xl bg-[var(--program-primary)] px-5 py-3 text-sm font-semibold text-white"
      >
        Back to Login
      </Link>
    </div>
  )
}
