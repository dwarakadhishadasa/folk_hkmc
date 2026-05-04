"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Header } from "@/components/header"
import { useAuth } from "@/lib/auth-context"
import { LiveAttendanceDashboard } from "@/components/live-attendance-dashboard"
import Link from "next/link"

export default function DashboardPage() {
  const { isLoggedIn, isPreacher, isHydrated } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (isHydrated && !isLoggedIn) {
      router.push("/login?redirect=/dashboard")
    }
  }, [isLoggedIn, isHydrated, router])

  if (!isHydrated) {
    return (
      <div className="min-h-screen bg-[#FFF9F0] flex items-center justify-center">
        <div className="text-center text-[#24324A]">Loading...</div>
      </div>
    )
  }

  if (!isLoggedIn) {
    return null
  }

  if (!isPreacher) {
    return (
      <div className="min-h-screen bg-[#FFF9F0]">
        <Header />
        <main className="container mx-auto px-4 py-8 max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-6 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">🚫</span>
            </div>
            <h2 className="text-xl font-bold text-[#24324A] mb-2">Access Restricted</h2>
            <p className="text-[#24324A]/70 mb-6">Only preachers can access the attendance dashboard.</p>
            <Link
              href="/contact"
              className="inline-block px-6 py-3 bg-[#0F1E54] hover:bg-[#1a2d6d] text-white font-medium rounded-xl transition-colors"
            >
              Go to Contact Form
            </Link>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FFF9F0]">
      <Header />
      <main className="container mx-auto px-4 py-6">
        <LiveAttendanceDashboard />
      </main>
    </div>
  )
}
