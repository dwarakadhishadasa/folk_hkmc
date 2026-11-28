"use client"

import type React from "react"
import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { CloudOff } from "lucide-react"
import { Header } from "@/components/header"
import {
  AUTH_ERROR_CLASS,
  AUTH_FIELD_CLASS,
  AUTH_LABEL_CLASS,
  AUTH_NOTICE_CLASS,
  AUTH_PANEL_BODY_CLASS,
  AUTH_PANEL_CLASS,
  AUTH_PANEL_HEADER_CLASS,
  AUTH_PRIMARY_BUTTON_CLASS,
} from "@/components/auth-form-styles"
import { cn } from "@/lib/utils"

import { AuthFormSkeleton, ButtonLoading, LoadingRegion } from "../_components/loading"

const SERVER_FAILURE_MESSAGE = "We couldn't submit your registration. Please try again."
const UNKNOWN_OUTCOME_MESSAGE =
  "We couldn't confirm whether your registration was received. Please check with us before submitting again."

interface FormData {
  name: string
  mobile: string
  dateOfBirth: string
  occupation: string
  college: string
  company: string
  address: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function requestBackgroundSync() {
  if (!("serviceWorker" in navigator) || typeof ServiceWorkerRegistration === "undefined") {
    return
  }

  if (!("sync" in ServiceWorkerRegistration.prototype)) {
    return
  }

  void navigator.serviceWorker.ready
    .then((registration) =>
      (
        registration as ServiceWorkerRegistration & {
          sync: { register: (tag: string) => Promise<void> }
        }
      ).sync.register("sync-requests"),
    )
    .catch(() => undefined)
}

function RegisterForm() {
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [queued, setQueued] = useState(false)
  const [error, setError] = useState("")
  const [sessionId, setSessionId] = useState("")
  const [successMessage, setSuccessMessage] = useState("Registration Successful")
  const [formData, setFormData] = useState<FormData>({
    name: "",
    mobile: "",
    dateOfBirth: "",
    occupation: "",
    college: "",
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleOccupationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    setFormData((prev) => ({
      ...prev,
      occupation: value,
      college: value === "Studying" ? prev.college : "",
      company: value === "Working" ? prev.company : "",
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isLoading) {
      return
    }
    setError("")
    setIsLoading(true)

    try {
      const res = await fetch("/api/registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, sessionId }),
      })

      const data: unknown = await res.json().catch(() => null)

      if (res.status === 202 && isRecord(data) && data.queued === true) {
        setQueued(true)
        requestBackgroundSync()
        return
      }

      if (res.status === 409 && isRecord(data) && data.alreadyRegistered === true) {
        setError("You are already registered. Please use your session attendance link to mark attendance.")
        return
      }

      if (!res.ok) {
        setError(
          res.status < 500 && isRecord(data) && typeof data.error === "string" && data.error.trim()
            ? data.error
            : SERVER_FAILURE_MESSAGE,
        )
        return
      }

      if (!isRecord(data)) {
        setError(UNKNOWN_OUTCOME_MESSAGE)
        return
      }

      if (sessionId && (data.completed !== true || !isRecord(data.contact))) {
        setError("Your registration was received, but attendance was not confirmed. Contact us before trying again.")
        return
      }

      if (!sessionId && !isRecord(data.contact)) {
        setError(UNKNOWN_OUTCOME_MESSAGE)
        return
      }

      if (sessionId) {
        setSuccessMessage("Registration complete and attendance marked")
      } else {
        setSuccessMessage("Registration Successful")
      }
      setSuccess(true)
    } catch {
      setError(UNKNOWN_OUTCOME_MESSAGE)
    } finally {
      setIsLoading(false)
    }
  }

  if (queued) {
    return (
      <div
        className={cn(AUTH_PANEL_CLASS, "animate-fade-in-up p-8 text-center motion-reduce:animate-none")}
        role="status"
        aria-live="polite"
      >
        <div className="mx-auto mb-4 flex size-20 items-center justify-center rounded-full bg-amber-500/10">
          <CloudOff className="size-12 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        </div>
        <h2 className="mb-2 font-[family-name:var(--font-poppins)] text-2xl font-bold text-foreground">
          Registration queued
        </h2>
        <p className="font-medium text-amber-700 dark:text-amber-300">
          You&apos;re offline. Your registration is saved on this device and will be sent automatically when
          you&apos;re back online.
        </p>
        {sessionId ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Your attendance is not marked yet. It will be marked once your registration reaches the server.
          </p>
        ) : null}
        <p className="mt-4 text-sm text-muted-foreground">
          You can close this page. The saved registration will still be sent.
        </p>
      </div>
    )
  }

  if (success) {
    return (
      <div
        className={cn(AUTH_PANEL_CLASS, "animate-fade-in-up p-8 text-center motion-reduce:animate-none")}
        role="status"
        aria-live="polite"
      >
        <div className="mx-auto mb-4 flex size-20 items-center justify-center rounded-full bg-emerald-500/10">
          <svg
            className="size-12 text-emerald-600 dark:text-emerald-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="mb-2 font-[family-name:var(--font-poppins)] text-2xl font-bold text-foreground">
          Welcome to FOLK Chennai!
        </h2>
        <p className="font-medium text-emerald-600 dark:text-emerald-400">{successMessage}</p>
        <p className="mt-2 text-sm text-muted-foreground">Thank you for joining us.</p>
      </div>
    )
  }

  return (
    <div className={AUTH_PANEL_CLASS}>
      <div className={AUTH_PANEL_HEADER_CLASS}>
        <h2 className="font-[family-name:var(--font-poppins)] text-xl font-bold">Join FOLK Chennai</h2>
        <p className="mt-1 text-sm text-white/75">Register to start your journey</p>
      </div>

      <div className={AUTH_PANEL_BODY_CLASS}>
        {error && (
          <div className={cn(AUTH_ERROR_CLASS, "mb-4")} role="alert">
            {error}
          </div>
        )}
        {sessionId && (
          <div className={cn(AUTH_NOTICE_CLASS, "mb-4")} role="status">
            Your attendance will be completed automatically after registration.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="name" className={AUTH_LABEL_CLASS}>
              Full Name <span className="text-destructive">*</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              placeholder="Enter your full name"
              value={formData.name}
              onChange={handleChange}
              required
              className={AUTH_FIELD_CLASS}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="mobile" className={AUTH_LABEL_CLASS}>
              Mobile Number <span className="text-destructive">*</span>
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
              className={AUTH_FIELD_CLASS}
            />
            {formData.mobile && !isMobileValid && (
              <p className="text-xs text-destructive">Mobile number must be 10 digits</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="dateOfBirth" className={AUTH_LABEL_CLASS}>
              Date of Birth <span className="text-destructive">*</span>
            </label>
            <input
              id="dateOfBirth"
              name="dateOfBirth"
              type="date"
              value={formData.dateOfBirth}
              onChange={handleChange}
              required
              className={AUTH_FIELD_CLASS}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="occupation" className={AUTH_LABEL_CLASS}>
              Occupation <span className="text-destructive">*</span>
            </label>
            <select
              id="occupation"
              name="occupation"
              value={formData.occupation}
              onChange={handleOccupationChange}
              required
              className={AUTH_FIELD_CLASS}
            >
              <option value="">Select occupation</option>
              <option value="Studying">Student</option>
              <option value="Working">Working Professional</option>
            </select>
          </div>

          {formData.occupation === "Studying" && (
            <div className="space-y-2">
              <label htmlFor="college" className={AUTH_LABEL_CLASS}>
                College
              </label>
              <input
                id="college"
                name="college"
                type="text"
                placeholder="Enter college name"
                value={formData.college}
                onChange={handleChange}
                className={AUTH_FIELD_CLASS}
              />
            </div>
          )}

          {formData.occupation === "Working" && (
            <div className="space-y-2">
              <label htmlFor="company" className={AUTH_LABEL_CLASS}>
                Company
              </label>
              <input
                id="company"
                name="company"
                type="text"
                placeholder="Enter company name"
                value={formData.company}
                onChange={handleChange}
                className={AUTH_FIELD_CLASS}
              />
            </div>
          )}

          {!sessionId && (
            <div className="space-y-2">
              <label htmlFor="address" className={AUTH_LABEL_CLASS}>
                Address
              </label>
              <input
                id="address"
                name="address"
                type="text"
                placeholder="Enter your address"
                value={formData.address}
                onChange={handleChange}
                className={AUTH_FIELD_CLASS}
              />
            </div>
          )}

          <ButtonLoading
            type="submit"
            busy={isLoading}
            loadingLabel="Registering..."
            disabled={!isMobileValid}
            className={AUTH_PRIMARY_BUTTON_CLASS}
          >
            Register
          </ButtonLoading>
        </form>
      </div>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto max-w-lg px-4 py-6 sm:py-10">
        <Suspense
          fallback={
            <LoadingRegion label="Loading the registration form">
              <AuthFormSkeleton fields={4} />
            </LoadingRegion>
          }
        >
          <RegisterForm />
        </Suspense>
      </main>
    </div>
  )
}
