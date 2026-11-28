"use client"

import type React from "react"
import { useState, useEffect } from "react"
import Link from "next/link"
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

import { ButtonLoading, LoadingSpinner, LoginPageSkeleton } from "../_components/loading"

let lastAuthCallbackHandoff = ""
const MIN_EMAIL_OTP_LENGTH = 6
const MAX_EMAIL_OTP_LENGTH = 10
const LOGIN_BOOT_TIMEOUT_MS = 6000

interface LoginPageClientProps {
  previewPasswordLoginEnabled?: boolean
}

export function LoginPageClient({ previewPasswordLoginEnabled = false }: LoginPageClientProps) {
  const [email, setEmail] = useState("")
  const [verificationCode, setVerificationCode] = useState("")
  const [error, setError] = useState("")
  const [isCodeStep, setIsCodeStep] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [bootstrapTimedOut, setBootstrapTimedOut] = useState(false)
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0)
  const { login, verifyLoginCode, isLoggedIn, isHydrated, role, refresh } = useAuth()
  const searchParams = useSearchParams()

  const requestedRedirectUrl = searchParams.get("redirect")
  const redirectUrl = safeStaffRedirectPath(requestedRedirectUrl, role)
  const previewPasswordLoginHref = previewPasswordLoginEnabled
    ? `/preview-login${requestedRedirectUrl ? `?redirect=${encodeURIComponent(requestedRedirectUrl)}` : ""}`
    : null
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

  useEffect(() => {
    if (isHydrated) {
      setBootstrapTimedOut(false)
      return
    }

    const timeout = window.setTimeout(() => setBootstrapTimedOut(true), LOGIN_BOOT_TIMEOUT_MS)
    return () => window.clearTimeout(timeout)
  }, [bootstrapAttempt, isHydrated])

  if (!isHydrated || authCallbackCode || authCallbackTokenHash) {
    const isAuthCallback = Boolean(authCallbackCode || authCallbackTokenHash)

    return (
      <LoginPageSkeleton label={isAuthCallback ? "Completing sign-in" : "Checking your session"}>
        {bootstrapTimedOut && !isAuthCallback ? (
          <div className="mt-4 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
            <p>We&apos;re still checking your session. This is taking longer than usual.</p>
            <button
              type="button"
              onClick={() => {
                setBootstrapAttempt((attempt) => attempt + 1)
                void refresh()
              }}
              className="mt-3 inline-flex h-10 items-center justify-center rounded-full border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Retry
            </button>
          </div>
        ) : null}
      </LoginPageSkeleton>
    )
  }

  if (isLoggedIn && !didJustSignOut) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto max-w-md px-4 py-8 sm:py-12" aria-busy="true">
          <div className={AUTH_PANEL_CLASS}>
            <div className={AUTH_PANEL_HEADER_CLASS}>
              <h2 className="font-[family-name:var(--font-poppins)] text-xl font-bold">Welcome Back</h2>
              <p className="mt-1 text-sm text-white/75">Your staff session is active</p>
            </div>
            <div className={AUTH_PANEL_BODY_CLASS}>
              <div
                role="status"
                aria-live="polite"
                className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 px-4 py-3"
              >
                <LoadingSpinner />
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Already signed in; opening your portal…
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    This page will close automatically.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isLoading) {
      return
    }
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
    if (isVerifying) {
      return
    }
    setError("")
    setIsVerifying(true)

    try {
      const staff = await verifyLoginCode(email, verificationCode)
      window.location.replace(safeStaffRedirectPath(requestedRedirectUrl, staff.role))
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to verify the sign-in code.")
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

                <ButtonLoading
                  type="submit"
                  busy={isLoading}
                  loadingLabel="Sending code..."
                  className={AUTH_PRIMARY_BUTTON_CLASS}
                >
                  Send Code
                </ButtonLoading>
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

                <ButtonLoading
                  type="submit"
                  busy={isVerifying}
                  loadingLabel="Verifying..."
                  disabled={verificationCode.length < MIN_EMAIL_OTP_LENGTH}
                  className={AUTH_PRIMARY_BUTTON_CLASS}
                >
                  Verify Code
                </ButtonLoading>
              </form>
            )}

            {previewPasswordLoginHref && (
              <p className="mt-6 border-t border-border pt-4 text-center text-sm text-muted-foreground">
                Preview QA?{" "}
                <Link
                  href={previewPasswordLoginHref}
                  className="font-semibold text-[var(--program-accent)] underline-offset-4 hover:underline"
                >
                  Sign in with a password
                </Link>
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
