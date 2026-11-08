"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { Header } from "@/components/header"
import {
  AUTH_ERROR_CLASS,
  AUTH_FIELD_CLASS,
  AUTH_LABEL_CLASS,
  AUTH_PANEL_BODY_CLASS,
  AUTH_PANEL_CLASS,
  AUTH_PANEL_HEADER_CLASS,
  AUTH_PRIMARY_BUTTON_CLASS,
} from "@/components/auth-form-styles"
import { useAuth } from "@/lib/auth-context"
import { safeStaffRedirectPath } from "@/lib/staff-routes"
import { cn } from "@/lib/utils"

let lastAuthCallbackHandoff = ""
const MIN_EMAIL_OTP_LENGTH = 6
const MAX_EMAIL_OTP_LENGTH = 10

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
  const redirectUrl = safeStaffRedirectPath(requestedRedirectUrl, role)
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
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="text-center text-sm font-semibold text-muted-foreground">Loading...</div>
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
      window.location.replace(safeStaffRedirectPath(requestedRedirectUrl, staff.role))
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to verify the sign-in code.")
    } finally {
      setIsVerifying(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto max-w-md px-4 py-8 sm:py-12">
        <div className={AUTH_PANEL_CLASS}>
          <div className={AUTH_PANEL_HEADER_CLASS}>
            <h2 className="font-[family-name:var(--font-poppins)] text-xl font-bold">
              Welcome Back
            </h2>
            <p className="mt-1 text-sm text-white/75">
              Use your invited staff email to enter the portal
            </p>
          </div>

          <div className={AUTH_PANEL_BODY_CLASS}>
            {!isCodeStep && (
              <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                  <div className={AUTH_ERROR_CLASS} role="alert">
                    {error}
                  </div>
                )}

                <div className="space-y-2">
                  <label htmlFor="email" className={AUTH_LABEL_CLASS}>
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className={AUTH_FIELD_CLASS}
                  />
                </div>

                <button type="submit" disabled={isLoading} className={AUTH_PRIMARY_BUTTON_CLASS}>
                  {isLoading ? "Sending code..." : "Send Code"}
                </button>
              </form>
            )}

            {isCodeStep && (
              <form onSubmit={handleVerifyCode} className="space-y-6">
                {error && (
                  <div className={AUTH_ERROR_CLASS} role="alert">
                    {error}
                  </div>
                )}
                <div className="space-y-2">
                  <label htmlFor="verification-code" className={AUTH_LABEL_CLASS}>
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
                    className={cn(AUTH_FIELD_CLASS, "text-center text-2xl tracking-[0.3em]")}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isVerifying || verificationCode.length < MIN_EMAIL_OTP_LENGTH}
                  className={AUTH_PRIMARY_BUTTON_CLASS}
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
