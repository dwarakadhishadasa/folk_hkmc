"use client"

import type React from "react"
import { useRef, useState } from "react"
import { Toaster } from "@/components/ui/toaster"
import { useToast } from "@/hooks/use-toast"
import { currentProgramProfile } from "@/lib/current-program"
import { cn } from "@/lib/utils"

interface ContactData {
  name: string
  mobile: string
  dateOfBirth: string
  occupation: string
  year: string
  college: string
  company: string
  location: string
  comments: string
  assignedPreacherAirtableUserId: string
}

interface PreacherOption {
  id: string
  name: string
}

const initialFormData: ContactData = {
  name: "",
  mobile: "",
  dateOfBirth: "",
  occupation: "",
  year: "Unknown",
  college: "",
  company: "",
  location: "",
  comments: "",
  assignedPreacherAirtableUserId: "",
}

async function registerBackgroundSync() {
  if (!("serviceWorker" in navigator)) return
  if (typeof ServiceWorkerRegistration === "undefined" || !("sync" in ServiceWorkerRegistration.prototype)) return

  const registration = await navigator.serviceWorker.ready
  await (registration as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } }).sync.register(
    "sync-requests",
  )
}

const panelClass =
  "overflow-hidden rounded-lg border border-[var(--border)] bg-card shadow-[0_18px_50px_rgba(45,10,10,0.08)]"
const fieldClass =
  "w-full rounded-lg border border-[var(--input)] bg-white px-4 py-3 text-sm text-[var(--program-text)] shadow-sm transition-all placeholder:text-[var(--muted-foreground)]/60 focus:border-[var(--program-accent)] focus:outline-none focus:ring-4 focus:ring-[var(--program-accent)]/15 disabled:bg-muted disabled:text-muted-foreground"
const labelClass = "block text-sm font-semibold text-[var(--program-text)]"
const noticeClass = "rounded-lg border px-4 py-3 text-sm leading-6"

export function ContactForm({
  staffRole,
  preachers = [],
}: {
  staffRole: "Admin" | "Preacher" | "Volunteer"
  preachers?: PreacherOption[]
}) {
  const { branding } = currentProgramProfile
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState<ContactData>(initialFormData)
  const [phoneError, setPhoneError] = useState("")
  const [message, setMessage] = useState("")
  const nameInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target

    if (name === "mobile") {
      const digitsOnly = value.replace(/\D/g, "").slice(0, 10)
      setFormData((prev) => ({ ...prev, [name]: digitsOnly }))
      if (digitsOnly.length > 0 && digitsOnly.length !== 10) {
        setPhoneError("Phone number must be exactly 10 digits")
      } else {
        setPhoneError("")
      }
      return
    }

    if (name === "occupation") {
      setFormData((prev) => ({
        ...prev,
        occupation: value,
        year: value === "Studying" ? prev.year : "Unknown",
        college: value === "Studying" ? prev.college : "",
        company: value === "Working" ? prev.company : "",
      }))
      return
    }

    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const resetFormAfterSave = () => {
    setFormData((prev) => ({
      ...initialFormData,
      location: prev.location,
      assignedPreacherAirtableUserId: staffRole === "Admin" ? prev.assignedPreacherAirtableUserId : "",
    }))
    setPhoneError("")
    requestAnimationFrame(() => nameInputRef.current?.focus())
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (formData.mobile.length !== 10) {
      setPhoneError("Phone number must be exactly 10 digits")
      return
    }

    if (staffRole === "Admin" && !formData.assignedPreacherAirtableUserId) {
      setMessage("Choose an assigned Preacher before saving this contact.")
      return
    }

    if (!formData.location.trim()) {
      setMessage("Enter a location before saving this contact.")
      return
    }

    setIsSubmitting(true)
    setMessage("")

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (response.status === 202 && data.queued) {
        toast({
          title: "Contact saved offline",
          description: "It will sync when the app is back online.",
        })
        setMessage("Contact saved offline. It will sync when the app is back online.")
        resetFormAfterSave()

        try {
          await registerBackgroundSync()
        } catch (error) {
          console.error("[v0] Failed to register background sync:", error)
        }
        return
      }

      if (response.status === 409 && data.duplicate) {
        toast({
          title: "Contact already exists",
          description: "No duplicate contact was created.",
        })
        return
      }

      if (!response.ok) throw new Error(data.error || "Failed to save contact")

      toast({
        title: "Contact saved",
        description: "Ready for the next contact.",
      })
      resetFormAfterSave()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save contact. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <div className={panelClass}>
        <div className="border-b border-white/10 bg-[var(--program-primary)] px-6 py-5 text-white">
          <h2 className="font-[family-name:var(--font-poppins)] text-xl font-bold">New Contact</h2>
          <p className="mt-1 text-sm text-white/75">Add a new contact to the {branding.shortName} database</p>
        </div>
        <div className="p-5 sm:p-6">
          <div className={cn(noticeClass, "mb-4 border-[var(--program-accent)]/20 bg-muted text-[var(--program-primary)]")}>
            {staffRole === "Volunteer" && "Volunteer contacts are assigned to your Preacher and the location you enter."}
            {staffRole === "Preacher" && "Contacts you create are assigned to you and the location you enter."}
            {staffRole === "Admin" && "Choose the active Preacher who should own this contact."}
          </div>
          {message && (
            <div className={cn(noticeClass, "mb-4 border-amber-200 bg-amber-50 text-amber-800")} role="status">
              {message}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="name" className={labelClass}>
                Full Name *
              </label>
              <input
                ref={nameInputRef}
                id="name"
                name="name"
                type="text"
                placeholder="Enter full name"
                value={formData.name}
                onChange={handleChange}
                required
                className={fieldClass}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="contactMobile" className={labelClass}>
                Mobile Number *
              </label>
              <input
                id="contactMobile"
                name="mobile"
                type="tel"
                inputMode="numeric"
                placeholder="Enter 10 digit mobile number"
                value={formData.mobile}
                onChange={handleChange}
                required
                maxLength={10}
                className={cn(fieldClass, phoneError && "border-red-500 focus:border-red-500 focus:ring-red-500/15")}
              />
              {phoneError && <p className="text-sm text-red-500">{phoneError}</p>}
            </div>

            <div className="space-y-2">
              <label htmlFor="dateOfBirth" className={labelClass}>
                Date of Birth
              </label>
              <input
                id="dateOfBirth"
                name="dateOfBirth"
                type="date"
                value={formData.dateOfBirth}
                onChange={handleChange}
                className={fieldClass}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="occupation" className={labelClass}>
                Occupation
              </label>
              <select
                id="occupation"
                name="occupation"
                value={formData.occupation}
                onChange={handleChange}
                className={fieldClass}
              >
                <option value="">Select occupation type</option>
                <option value="Studying">Student</option>
                <option value="Working">Working Professional</option>
              </select>
            </div>

            {formData.occupation === "Studying" && (
              <>
                <div className="space-y-2">
                  <label htmlFor="year" className={labelClass}>
                    Year
                  </label>
                  <select
                    id="year"
                    name="year"
                    value={formData.year}
                    onChange={handleChange}
                    className={fieldClass}
                  >
                    <option value="">Select year</option>
                    <option value="1st year">1st Year</option>
                    <option value="2nd year">2nd Year</option>
                    <option value="3rd year">3rd Year</option>
                    <option value="4th year">4th Year</option>
                    <option value="Passed Out">Passed Out</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="college" className={labelClass}>
                    College
                  </label>
                  <input
                    id="college"
                    name="college"
                    type="text"
                    placeholder="Enter college name"
                    value={formData.college}
                    onChange={handleChange}
                    className={fieldClass}
                  />
                </div>
              </>
            )}

            {formData.occupation === "Working" && (
              <div className="space-y-2">
                <label htmlFor="company" className={labelClass}>
                  Company
                </label>
                <input
                  id="company"
                  name="company"
                  type="text"
                  placeholder="Enter company name"
                  value={formData.company}
                  onChange={handleChange}
                  className={fieldClass}
                />
              </div>
            )}

            {staffRole === "Admin" && (
              <div className="space-y-2">
                <label htmlFor="assignedPreacherAirtableUserId" className={labelClass}>
                  Assigned Preacher *
                </label>
                <select
                  id="assignedPreacherAirtableUserId"
                  name="assignedPreacherAirtableUserId"
                  value={formData.assignedPreacherAirtableUserId}
                  onChange={handleChange}
                  required
                  className={fieldClass}
                >
                  <option value="">Select Preacher</option>
                  {preachers.map((preacher) => (
                    <option key={preacher.id} value={preacher.id}>
                      {preacher.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="location" className={labelClass}>
                Location *
              </label>
              <input
                id="location"
                name="location"
                type="text"
                placeholder="Enter location"
                value={formData.location}
                onChange={handleChange}
                required
                className={fieldClass}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="comments" className={labelClass}>
                Comments
              </label>
              <textarea
                id="comments"
                name="comments"
                placeholder="Add any additional comments"
                value={formData.comments}
                onChange={handleChange}
                rows={3}
                className={fieldClass}
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || phoneError !== "" || !formData.location.trim()}
              className="inline-flex h-12 w-full items-center justify-center rounded-full bg-[var(--program-accent)] px-5 text-sm font-semibold text-white shadow-lg shadow-[var(--program-accent)]/20 transition-[background-color,box-shadow,transform] hover:-translate-y-0.5 hover:bg-[var(--program-accent-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-primary)] disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none disabled:hover:translate-y-0"
            >
              {isSubmitting ? "Saving..." : "Save"}
            </button>
          </form>
        </div>
      </div>
      <Toaster />
    </>
  )
}
