"use client"

import type React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle } from "lucide-react"

export function AttendanceForm({ sessionId }: { sessionId: string }) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [isDuplicate, setIsDuplicate] = useState(false)
  const [userName, setUserName] = useState("")
  const [error, setError] = useState("")
  const [mobile, setMobile] = useState("")

  const isMobileValid = mobile.replace(/\D/g, "").length === 10

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError("")

    try {
      const response = await fetch("/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: mobile.replace(/\D/g, ""), sessionId }),
      })

      const data = await response.json()

      if (response.status === 202 && data.queued) {
        setError("You are offline. Your attendance will be submitted when you're back online.")
        setIsSubmitting(false)

        if ("serviceWorker" in navigator && "sync" in ServiceWorkerRegistration.prototype) {
          const registration = await navigator.serviceWorker.ready
          await (registration as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } }).sync.register(
            "sync-requests",
          )
        }
        return
      }

      if (response.status === 404) {
        setTimeout(() => {
          const params = new URLSearchParams({ mobile: data.mobile || mobile.replace(/\D/g, "") })
          if (data.sessionId || sessionId) {
            params.set("session", data.sessionId || sessionId)
          }
          router.push(`/register?${params.toString()}`)
        }, 1000)
        return
      }

      if (response.status === 409 && data.duplicate) {
        setUserName(data.userName || "")
        setIsDuplicate(true)
        setIsSubmitting(false)
        return
      }

      if (!response.ok) throw new Error(data.error || "Failed to mark attendance")

      setUserName(data.userName || "")
      setIsSuccess(true)
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to mark attendance. Please try again.")
      setIsSubmitting(false)
    }
  }

  const handleMarkAnother = () => {
    setIsSuccess(false)
    setIsDuplicate(false)
    setUserName("")
    setMobile("")
    setIsSubmitting(false)
  }

  // Duplicate state view
  if (isDuplicate) {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 text-center animate-fade-in-up">
        <div className="mb-6">
          <div className="mx-auto w-20 h-20 bg-[#FFF3DF] rounded-full flex items-center justify-center mb-4 animate-checkmark">
            <svg className="w-10 h-10 text-[var(--program-accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-[var(--program-text)] mb-2 font-[family-name:var(--font-poppins)]">
            Hare Krishna {userName}!
          </h2>
          <p className="text-[#24324A]/70 text-sm sm:text-base">Your attendance has already been marked for today</p>
          <p className="text-[#24324A]/50 text-sm mt-2">Thank you for attending the session</p>
        </div>
        <button
          onClick={handleMarkAnother}
          className="w-full sm:w-auto px-6 py-3 bg-[var(--program-primary)] hover:bg-[var(--program-primary-light)] text-white font-medium rounded-xl transition-colors"
        >
          Mark Another Attendance
        </button>
      </div>
    )
  }

  // Success state view
  if (isSuccess) {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 text-center animate-fade-in-up">
        <div className="mb-6">
          <div className="mx-auto w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4 animate-checkmark">
            <svg className="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-[var(--program-text)] mb-2 font-[family-name:var(--font-poppins)]">
            Hare Krishna {userName}!
          </h2>
          <p className="text-green-600 font-medium text-base sm:text-lg">Attendance marked successfully</p>
          <p className="text-[#24324A]/50 text-sm mt-2">Thank you for attending the session</p>
        </div>
        <button
          onClick={handleMarkAnother}
          className="w-full sm:w-auto px-6 py-3 bg-[var(--program-primary)] hover:bg-[var(--program-primary-light)] text-white font-medium rounded-xl transition-colors"
        >
          Mark Another Attendance
        </button>
      </div>
    )
  }

  // Form view
  return (
    <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
      <div className="bg-[var(--program-primary)] px-6 py-5 text-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
            <span className="text-xl">📱</span>
          </div>
          <div>
            <h2 className="font-semibold text-lg font-[family-name:var(--font-poppins)]">Quick Check-in</h2>
            <p className="text-white/70 text-sm">Enter your registered mobile number</p>
          </div>
        </div>
      </div>

      <div className="p-6">
        {!sessionId && (
          <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
            Please use the session-specific attendance link shared by your coordinator.
          </div>
        )}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="mobile" className="block text-sm font-medium text-[var(--program-text)] mb-2">
              Mobile Number
            </label>
            <input
              id="mobile"
              type="tel"
              inputMode="numeric"
              placeholder="Enter 10-digit mobile number"
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
              maxLength={10}
              required
              className="w-full px-4 py-3.5 text-lg border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-[var(--program-accent)] focus:border-[var(--program-accent)] transition-all placeholder:text-gray-400"
            />
            {mobile && !isMobileValid && (
              <p className="text-xs text-red-600 mt-2">Please enter a valid 10-digit number</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !isMobileValid || !sessionId}
            className="w-full py-4 bg-[var(--program-accent)] hover:bg-[var(--program-accent-dark)] disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all text-lg shadow-lg shadow-black/10 disabled:shadow-none"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Checking...
              </span>
            ) : (
              "Mark Attendance"
            )}
          </button>
        </form>

        <p className="text-center text-xs text-[#24324A]/50 mt-4">New member? Enter your number to register</p>
      </div>
    </div>
  )
}
