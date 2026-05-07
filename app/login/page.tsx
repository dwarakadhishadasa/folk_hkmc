"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Header } from "@/components/header"
import { useAuth } from "@/lib/auth-context"

let lastAuthCallbackHandoff = ""

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const { login, isLoggedIn, isHydrated, role } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  const requestedRedirectUrl = searchParams.get("redirect")
  const defaultRedirectUrl = role === "Volunteer" ? "/contact" : role === "Preacher" ? "/" : "/dashboard"
  const redirectUrl = requestedRedirectUrl || defaultRedirectUrl
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
    if (isHydrated && isLoggedIn) {
      router.push(redirectUrl)
    }
  }, [isLoggedIn, isHydrated, router, redirectUrl])

  if (!isHydrated || authCallbackCode || authCallbackTokenHash) {
    return (
      <div className="min-h-screen bg-[#FFF9F0] flex items-center justify-center">
        <div className="text-center text-[#24324A]">Loading...</div>
      </div>
    )
  }

  if (isLoggedIn) {
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setMessage("")
    setIsLoading(true)

    try {
      const success = await login(email)
      if (success) {
        setMessage("Check your email for the secure sign-in link.")
      } else {
        setError("Unable to send sign-in link. Check the email and try again.")
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to send sign-in link. Check the email and try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FFF9F0]">
      <Header />
      <main className="container mx-auto px-4 py-8 sm:py-12 max-w-md">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-[#0F1E54] to-[#1a2d6d] px-6 py-8 text-white text-center">
            <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl">🔑</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold font-[family-name:var(--font-poppins)]">Welcome Back</h2>
            <p className="text-white/70 mt-2 text-sm">Use your invited staff email to enter the portal</p>
          </div>

          <div className="p-6 sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
                  <span className="text-red-500">⚠️</span>
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
              {message && (
                <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
                  {message}
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-[#24324A] mb-2">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0F1E54]/20 focus:border-[#0F1E54] transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-4 bg-[#F98B1C] hover:bg-[#e07a10] disabled:bg-gray-300 text-white font-semibold rounded-xl transition-all text-lg shadow-lg shadow-[#F98B1C]/30 disabled:shadow-none"
              >
                {isLoading ? "Sending link..." : "Send Sign-in Link"}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  )
}
