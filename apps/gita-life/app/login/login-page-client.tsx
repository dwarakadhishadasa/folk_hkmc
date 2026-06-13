"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { AlertTriangle, KeyRound } from "lucide-react"
import { Header } from "@/components/header"
import { useAuth } from "@/lib/auth-context"

let lastAuthCallbackHandoff = ""
const MIN_EMAIL_OTP_LENGTH = 6
const MAX_EMAIL_OTP_LENGTH = 10

function landingPathForRole(role: string | null | undefined): string {
  if (role === "Volunteer") {
    return "/contact"
  }

  if (role === "Preacher") {
    return "/"
  }

  return "/dashboard"
}

function safeRedirectPath(value: string | null, role: string | null | undefined): string {
  if (value?.startsWith("/") && !value.startsWith("//") && !value.startsWith("/auth")) {
    if (role === "Volunteer" && value !== "/contact") {
      return "/contact"
    }

    return value
  }

  return landingPathForRole(role)
}

export function LoginPageClient() {
  const [email, setEmail] = useState("")
  const [verificationCode, setVerificationCode] = useState("")
  const [error, setError] = useState("")
  const [isCodeStep, setIsCodeStep] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const { login, verifyLoginCode, isLoggedIn, isHydrated, role } = useAuth()
  const searchParams = useSearchParams()

  const requestedRedirectUrl = searchParams.get("redirect")
  const redirectUrl = safeRedirectPath(requestedRedirectUrl, role)
  const didJustSignOut = searchParams.get("signedOut") === "1"
  const authCallbackCode = searchParams.get("code")
  const authCallbackTokenHash = searchParams.get("token_hash")
  const authCallbackType = searchParams.get("type")

  useEffect(() => {
    if (!authCallbackCode && !authCallbackTokenHash) {
      return
    }

    const callbackParams = new URLSearchParams()
    if (authCallbackCode) {
      callbackParams.set("code", authCallbackCode)
    }
    if (authCallbackTokenHash) {
      callbackParams.set("token_hash", authCallbackTokenHash)
    }
    if (authCallbackType) {
      callbackParams.set("type", authCallbackType)
    }
    if (requestedRedirectUrl) {
      callbackParams.set("next", requestedRedirectUrl)
    }

    const confirmPath = `/auth/confirm?${callbackParams.toString()}`
    if (lastAuthCallbackHandoff === confirmPath) {
      return
    }

    lastAuthCallbackHandoff = confirmPath
    window.location.replace(confirmPath)
  }, [authCallbackCode, authCallbackTokenHash, authCallbackType, requestedRedirectUrl])

  useEffect(() => {
    if (isHydrated && isLoggedIn && !didJustSignOut) {
      window.location.replace(redirectUrl)
    }
  }, [didJustSignOut, isLoggedIn, isHydrated, redirectUrl])

  if (!isHydrated || authCallbackCode || authCallbackTokenHash) {
    return (
      <div className="min-h-screen bg-[#FFF9F0] flex items-center justify-center">
        <div className="text-center text-[#2D0A0A]">Loading...</div>
      </div>
    )
  }

  if (isLoggedIn && !didJustSignOut) {
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsCodeStep(false)
    setIsLoading(true)

    try {
      const success = await login(email)
      if (success) {
        setIsCodeStep(true)
      } else {
        setError("Unable to send sign-in code. Check the email and try again.")
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to send sign-in code. Check the email and try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsVerifying(true)

    try {
      const staff = await verifyLoginCode(email, verificationCode)
      window.location.replace(safeRedirectPath(requestedRedirectUrl, staff.role))
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to verify the sign-in code.")
    } finally {
      setIsVerifying(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FFF9F0]">
      <Header />
      <main className="container mx-auto px-4 py-8 sm:py-12 max-w-md">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-[#2D0A0A] px-6 py-8 text-white text-center">
            <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <KeyRound className="h-8 w-8 text-[#FFB81C]" aria-hidden="true" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold font-[family-name:var(--font-poppins)]">Welcome Back</h2>
            <p className="text-white/70 mt-2 text-sm">Use your invited staff email to enter the portal</p>
          </div>

          <div className="p-6 sm:p-8">
            {!isCodeStep && (
              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-[#2D0A0A] mb-2">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-[#EA580C]/20 focus:border-[#EA580C] transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-4 bg-[#EA580C] hover:bg-[#D97706] disabled:bg-gray-300 text-white font-semibold rounded-xl transition-all text-lg shadow-lg shadow-[#EA580C]/25 disabled:shadow-none"
                >
                  {isLoading ? "Sending code..." : "Send Code"}
                </button>
              </form>
            )}

            {isCodeStep && (
              <form onSubmit={handleVerifyCode} className="space-y-5">
                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}
                <div>
                  <label htmlFor="verification-code" className="block text-sm font-medium text-[#2D0A0A] mb-2">
                    Email code
                  </label>
                  <input
                    id="verification-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={MAX_EMAIL_OTP_LENGTH}
                    placeholder="12345678"
                    value={verificationCode}
                    onChange={(e) =>
                      setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, MAX_EMAIL_OTP_LENGTH))
                    }
                    required
                    className="w-full px-4 py-3 text-center text-2xl tracking-[0.3em] border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-[#EA580C]/20 focus:border-[#EA580C] transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isVerifying || verificationCode.length < MIN_EMAIL_OTP_LENGTH}
                  className="w-full py-4 bg-[#2D0A0A] hover:bg-[#451010] disabled:bg-gray-300 text-white font-semibold rounded-xl transition-all text-lg"
                >
                  {isVerifying ? "Verifying..." : "Verify Code"}
                </button>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
