"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Header } from "@/components/header"
import { useAuth } from "@/lib/auth-context"

export default function LoginPage() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const { login, isLoggedIn, isHydrated } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  const redirectUrl = searchParams.get("redirect") || "/contact"

  useEffect(() => {
    if (isHydrated && isLoggedIn) {
      router.push(redirectUrl)
    }
  }, [isLoggedIn, isHydrated, router, redirectUrl])

  if (!isHydrated) {
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
    setIsLoading(true)

    await new Promise((resolve) => setTimeout(resolve, 500))

    const success = login(username, password)
    if (success) {
      router.push(redirectUrl)
    } else {
      setError("Invalid username or password")
    }
    setIsLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#FFF9F0]">
      <Header />
      <main className="container mx-auto px-4 py-8 sm:py-12 max-w-md">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-[#0F1E54] to-[#1a2d6d] px-6 py-8 text-white text-center">
            <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl">🔐</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold font-[family-name:var(--font-poppins)]">Welcome Back</h2>
            <p className="text-white/70 mt-2 text-sm">Sign in to access the FOLK system</p>
          </div>

          <div className="p-6 sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
                  <span className="text-red-500">⚠️</span>
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <div>
                <label htmlFor="username" className="block text-sm font-medium text-[#24324A] mb-2">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  placeholder="Enter username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0F1E54]/20 focus:border-[#0F1E54] transition-all"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-[#24324A] mb-2">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0F1E54]/20 focus:border-[#0F1E54] transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-4 bg-[#F98B1C] hover:bg-[#e07a10] disabled:bg-gray-300 text-white font-semibold rounded-xl transition-all text-lg shadow-lg shadow-[#F98B1C]/30 disabled:shadow-none"
              >
                {isLoading ? "Signing in..." : "Sign In"}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  )
}
