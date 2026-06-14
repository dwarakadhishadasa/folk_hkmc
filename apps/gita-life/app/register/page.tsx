"use client"

import type React from "react"
import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { AlertTriangle, BookOpen } from "lucide-react"
import { Header } from "@/components/header"

interface FormData {
  name: string
  mobile: string
  dateOfBirth: string
  occupation: string
  company: string
  address: string
}

function isWorkingProfessional(value: string) {
  return value === "Working" || value === "Working Professional"
}

function RegisterForm() {
  const searchParams = useSearchParams()
  const source = searchParams.get("source")
  const showHkmcReturn = source === "hkmc-gita-life"
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")
  const [sessionId, setSessionId] = useState("")
  const [successMessage, setSuccessMessage] = useState("Registration Successful")
  const [formData, setFormData] = useState<FormData>({
    name: "",
    mobile: "",
    dateOfBirth: "",
    occupation: "",
    company: "",
    address: "",
  })

  useEffect(() => {
    const mobileParam = searchParams.get("mobile")
    if (mobileParam) {
      setFormData((prev) => ({ ...prev, mobile: mobileParam.replace(/\D/g, "").slice(-10) }))
    }
    const sessionParam = searchParams.get("session")
    if (sessionParam) {
      setSessionId(sessionParam)
    }
  }, [searchParams])

  const isMobileValid = formData.mobile.length === 10

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleOccupationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    setFormData((prev) => ({
      ...prev,
      occupation: value,
      company: isWorkingProfessional(value) ? prev.company : "",
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
        body: JSON.stringify({ ...formData, sessionId }),
      })

      const data = await res.json()

      if (res.status === 202 && data.queued) {
        setError("You are offline. Your registration will be submitted when you're back online.")
        setIsLoading(false)

        if ("serviceWorker" in navigator && "sync" in ServiceWorkerRegistration.prototype) {
          const registration = await navigator.serviceWorker.ready
          await (registration as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } }).sync.register(
            "sync-requests",
          )
        }
        return
      }

      if (res.status === 409 && data.alreadyRegistered) {
        setError("You are already registered. Please use your session attendance link to mark attendance.")
        return
      }

      if (!res.ok) {
        throw new Error(data.error || "Failed to register")
      }

      if (sessionId) {
        if (!data.completed) {
          throw new Error("Registration completed, but attendance status was not confirmed.")
        }
        setSuccessMessage("Registration complete and attendance marked")
        setSuccess(true)
      } else {
        setSuccessMessage("Registration Successful")
        setSuccess(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <div className="animate-fade-in-up rounded-lg border border-[var(--border)] bg-card p-8 text-center shadow-[0_18px_50px_rgba(45,10,10,0.08)]">
        <div className="animate-checkmark mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
          <svg className="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="mb-2 font-[family-name:var(--font-poppins)] text-2xl font-bold text-[#2D0A0A]">
          Welcome to Gita Life!
        </h2>
        <p className="text-green-600 font-medium">{successMessage}</p>
        <p className="mt-2 text-sm text-[#5F3B2E]/70">Thank you for joining us.</p>
        {showHkmcReturn && (
          <a
            href="https://hkmchennai.org"
            className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-[#EA580C] px-6 text-sm font-semibold text-white shadow-lg shadow-[#EA580C]/20 transition-[background-color,box-shadow,transform] hover:-translate-y-0.5 hover:bg-[#D97706] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2D0A0A]"
          >
            Visit HKM Chennai
          </a>
        )}
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-card shadow-[0_18px_50px_rgba(45,10,10,0.08)]">
      <div className="bg-[#2D0A0A] px-6 py-6 text-center text-white">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
          <BookOpen className="h-7 w-7 text-[#FFB81C]" aria-hidden="true" />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold font-[family-name:var(--font-poppins)]">Join Gita Life</h2>
        <p className="text-white/70 text-sm mt-1">Register for the next Bhagavad Gita session</p>
      </div>

      <div className="p-5 sm:p-6">
        {error && (
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
        {sessionId && (
          <div className="mb-4 rounded-lg border border-[#EA580C]/20 bg-[#FFF3DF] p-4 text-sm leading-6 text-[#2D0A0A]">
            Your attendance will be completed automatically after registration.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="mb-1.5 block text-sm font-semibold text-[#2D0A0A]">
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
              className="w-full rounded-lg border border-[var(--input)] bg-white px-4 py-3 text-sm text-[#2D0A0A] shadow-sm transition-all placeholder:text-[#6B4C3F]/60 focus:border-[#EA580C] focus:outline-none focus:ring-4 focus:ring-[#EA580C]/15"
            />
          </div>

          <div>
            <label htmlFor="mobile" className="mb-1.5 block text-sm font-semibold text-[#2D0A0A]">
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
              className="w-full rounded-lg border border-[var(--input)] bg-white px-4 py-3 text-sm text-[#2D0A0A] shadow-sm transition-all placeholder:text-[#6B4C3F]/60 focus:border-[#EA580C] focus:outline-none focus:ring-4 focus:ring-[#EA580C]/15"
            />
            {formData.mobile && !isMobileValid && (
              <p className="text-xs text-red-600 mt-1">Mobile number must be 10 digits</p>
            )}
          </div>

          <div>
            <label htmlFor="dateOfBirth" className="mb-1.5 block text-sm font-semibold text-[#2D0A0A]">
              Date of Birth
            </label>
            <input
              id="dateOfBirth"
              name="dateOfBirth"
              type="date"
              value={formData.dateOfBirth}
              onChange={handleChange}
              className="w-full rounded-lg border border-[var(--input)] bg-white px-4 py-3 text-sm text-[#2D0A0A] shadow-sm transition-all placeholder:text-[#6B4C3F]/60 focus:border-[#EA580C] focus:outline-none focus:ring-4 focus:ring-[#EA580C]/15"
            />
          </div>

          <div>
            <label htmlFor="occupation" className="mb-1.5 block text-sm font-semibold text-[#2D0A0A]">
              Occupation <span className="text-red-500">*</span>
            </label>
            <select
              id="occupation"
              name="occupation"
              value={formData.occupation}
              onChange={handleOccupationChange}
              required
              className="w-full rounded-lg border border-[var(--input)] bg-white px-4 py-3 text-sm text-[#2D0A0A] shadow-sm transition-all focus:border-[#EA580C] focus:outline-none focus:ring-4 focus:ring-[#EA580C]/15"
            >
              <option value="">Select occupation</option>
              <option value="Working Professional">Working Professional</option>
              <option value="Housewife">Housewife</option>
            </select>
          </div>

          {isWorkingProfessional(formData.occupation) && (
            <div>
              <label htmlFor="company" className="mb-1.5 block text-sm font-semibold text-[#2D0A0A]">
                Company
              </label>
              <input
                id="company"
                name="company"
                type="text"
                placeholder="Enter company name"
                value={formData.company}
                onChange={handleChange}
                className="w-full rounded-lg border border-[var(--input)] bg-white px-4 py-3 text-sm text-[#2D0A0A] shadow-sm transition-all focus:border-[#EA580C] focus:outline-none focus:ring-4 focus:ring-[#EA580C]/15"
              />
            </div>
          )}

          {!sessionId && (
            <div>
              <label htmlFor="address" className="mb-1.5 block text-sm font-semibold text-[#2D0A0A]">
                Address
              </label>
              <input
                id="address"
                name="address"
                type="text"
                placeholder="Enter your address"
                value={formData.address}
                onChange={handleChange}
                className="w-full rounded-lg border border-[var(--input)] bg-white px-4 py-3 text-sm text-[#2D0A0A] shadow-sm transition-all placeholder:text-[#6B4C3F]/60 focus:border-[#EA580C] focus:outline-none focus:ring-4 focus:ring-[#EA580C]/15"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !isMobileValid}
            className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full bg-[#EA580C] px-5 text-sm font-semibold text-white shadow-lg shadow-[#EA580C]/20 transition-[background-color,box-shadow,transform] hover:-translate-y-0.5 hover:bg-[#D97706] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2D0A0A] disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none disabled:hover:translate-y-0"
          >
            {isLoading ? "Registering..." : "Submit Registration"}
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
      <main className="container mx-auto max-w-lg px-4 py-6 sm:py-10">
        <Suspense fallback={<div className="py-8 text-center text-sm font-semibold text-[#2D0A0A]">Loading...</div>}>
          <RegisterForm />
        </Suspense>
      </main>
    </div>
  )
}
