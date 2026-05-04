"use client"

import type React from "react"
import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Header } from "@/components/header"

interface FormData {
  name: string
  mobile: string
  age: string
  occupation: string
  year: string
  location: string
}

function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")
  const [formData, setFormData] = useState<FormData>({
    name: "",
    mobile: "",
    age: "",
    occupation: "",
    year: "",
    location: "",
  })

  useEffect(() => {
    const mobileParam = searchParams.get("mobile")
    if (mobileParam) {
      setFormData((prev) => ({ ...prev, mobile: mobileParam }))
    }
  }, [searchParams])

  const isMobileValid = formData.mobile.length === 10

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleOccupationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    setFormData((prev) => ({
      ...prev,
      occupation: value,
      year: value === "Working" ? "Unknown" : prev.year,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      const res = await fetch("/api/registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      const data = await res.json()

      if (res.status === 202 && data.queued) {
        setError("You are offline. Your registration will be submitted when you're back online.")
        setIsLoading(false)

        if ("serviceWorker" in navigator && "sync" in ServiceWorkerRegistration.prototype) {
          const registration = await navigator.serviceWorker.ready
          await registration.sync.register("sync-requests")
        }
        return
      }

      if (res.status === 409 && data.alreadyRegistered) {
        setError("You are already registered! Redirecting to attendance...")
        setTimeout(() => router.push("/attend"), 2000)
        return
      }

      if (!res.ok) {
        throw new Error(data.error || "Failed to register")
      }

      setSuccess(true)
      setTimeout(() => router.push("/attend"), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-8 text-center animate-fade-in-up">
        <div className="mx-auto w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4 animate-checkmark">
          <svg className="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-[#24324A] mb-2 font-[family-name:var(--font-poppins)]">
          Welcome to FOLK Chennai!
        </h2>
        <p className="text-green-600 font-medium">Registration Successful</p>
        <p className="text-[#24324A]/50 text-sm mt-2">Redirecting to attendance...</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
      <div className="bg-gradient-to-r from-[#0F1E54] to-[#1a2d6d] px-6 py-6 text-white text-center">
        <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <span className="text-3xl">📝</span>
        </div>
        <h2 className="text-xl sm:text-2xl font-bold font-[family-name:var(--font-poppins)]">Join FOLK Chennai</h2>
        <p className="text-white/70 text-sm mt-1">Register to start your journey</p>
      </div>

      <div className="p-6">
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
            <span className="text-red-500">⚠️</span>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-[#24324A] mb-1.5">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              placeholder="Enter your full name"
              value={formData.name}
              onChange={handleChange}
              required
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0F1E54]/20 focus:border-[#0F1E54] transition-all"
            />
          </div>

          <div>
            <label htmlFor="mobile" className="block text-sm font-medium text-[#24324A] mb-1.5">
              Mobile Number <span className="text-red-500">*</span>
            </label>
            <input
              id="mobile"
              name="mobile"
              type="tel"
              inputMode="numeric"
              placeholder="10-digit mobile number"
              value={formData.mobile}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, "").slice(0, 10)
                setFormData((prev) => ({ ...prev, mobile: value }))
              }}
              maxLength={10}
              required
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0F1E54]/20 focus:border-[#0F1E54] transition-all"
            />
            {formData.mobile && !isMobileValid && (
              <p className="text-xs text-red-600 mt-1">Mobile number must be 10 digits</p>
            )}
          </div>

          <div>
            <label htmlFor="age" className="block text-sm font-medium text-[#24324A] mb-1.5">
              Age <span className="text-red-500">*</span>
            </label>
            <input
              id="age"
              name="age"
              type="number"
              inputMode="numeric"
              placeholder="Enter your age"
              value={formData.age}
              onChange={handleChange}
              required
              min={1}
              max={120}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0F1E54]/20 focus:border-[#0F1E54] transition-all"
            />
          </div>

          <div>
            <label htmlFor="occupation" className="block text-sm font-medium text-[#24324A] mb-1.5">
              Occupation <span className="text-red-500">*</span>
            </label>
            <select
              id="occupation"
              name="occupation"
              value={formData.occupation}
              onChange={handleOccupationChange}
              required
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0F1E54]/20 focus:border-[#0F1E54] transition-all bg-white"
            >
              <option value="">Select occupation</option>
              <option value="Studying">Student</option>
              <option value="Working">Working Professional</option>
            </select>
          </div>

          {formData.occupation === "Studying" && (
            <div>
              <label htmlFor="year" className="block text-sm font-medium text-[#24324A] mb-1.5">
                Year <span className="text-red-500">*</span>
              </label>
              <select
                id="year"
                name="year"
                value={formData.year}
                onChange={(e) => setFormData((prev) => ({ ...prev, year: e.target.value }))}
                required
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0F1E54]/20 focus:border-[#0F1E54] transition-all bg-white"
              >
                <option value="">Select year</option>
                <option value="1st year">1st Year</option>
                <option value="2nd year">2nd Year</option>
                <option value="3rd year">3rd Year</option>
                <option value="4th year">4th Year</option>
                <option value="Passed Out">Passed Out</option>
              </select>
            </div>
          )}

          <div>
            <label htmlFor="location" className="block text-sm font-medium text-[#24324A] mb-1.5">
              Location
            </label>
            <input
              id="location"
              name="location"
              type="text"
              placeholder="Enter your location"
              value={formData.location}
              onChange={handleChange}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0F1E54]/20 focus:border-[#0F1E54] transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !isMobileValid}
            className="w-full py-4 bg-[#F98B1C] hover:bg-[#e07a10] disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all text-lg shadow-lg shadow-[#F98B1C]/30 disabled:shadow-none mt-6"
          >
            {isLoading ? "Registering..." : "Register"}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-[#FFF9F0]">
      <Header />
      <main className="container mx-auto px-4 py-6 sm:py-10 max-w-lg">
        <Suspense fallback={<div className="text-center py-8">Loading...</div>}>
          <RegisterForm />
        </Suspense>
      </main>
    </div>
  )
}
