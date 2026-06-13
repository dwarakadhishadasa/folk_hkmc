"use client"

import type React from "react"
import { useRef, useState } from "react"
import { Toaster } from "@/components/ui/toaster"
import { useToast } from "@/hooks/use-toast"
import { currentProgramProfile } from "@/lib/current-program"

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
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="bg-[var(--program-primary)] text-white p-6">
          <h2 className="text-xl font-bold">New Contact</h2>
          <p className="text-white/75 text-sm mt-1">Add a new contact to the {branding.shortName} database</p>
        </div>
        <div className="p-6">
          <div className="mb-4 rounded-md border border-black/10 bg-[#FFF9F0] px-4 py-3 text-sm text-[var(--program-primary)]">
            {staffRole === "Volunteer" && "Volunteer contacts are assigned to your Preacher and the location you enter."}
            {staffRole === "Preacher" && "Contacts you create are assigned to you and the location you enter."}
            {staffRole === "Admin" && "Choose the active Preacher who should own this contact."}
          </div>
          {message && (
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {message}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--program-accent)]"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="contactMobile" className="block text-sm font-medium text-gray-700">
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
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--program-accent)] ${
                  phoneError ? "border-red-500" : "border-gray-300"
                }`}
              />
              {phoneError && <p className="text-sm text-red-500">{phoneError}</p>}
            </div>

            <div className="space-y-2">
              <label htmlFor="dateOfBirth" className="block text-sm font-medium text-gray-700">
                Date of Birth
              </label>
              <input
                id="dateOfBirth"
                name="dateOfBirth"
                type="date"
                value={formData.dateOfBirth}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--program-accent)]"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="occupation" className="block text-sm font-medium text-gray-700">
                Occupation
              </label>
              <select
                id="occupation"
                name="occupation"
                value={formData.occupation}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--program-accent)]"
              >
                <option value="">Select occupation type</option>
                <option value="Studying">Student</option>
                <option value="Working">Working Professional</option>
              </select>
            </div>

            {formData.occupation === "Studying" && (
              <>
                <div className="space-y-2">
                  <label htmlFor="year" className="block text-sm font-medium text-gray-700">
                    Year
                  </label>
                  <select
                    id="year"
                    name="year"
                    value={formData.year}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--program-accent)]"
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
                  <label htmlFor="college" className="block text-sm font-medium text-gray-700">
                    College
                  </label>
                  <input
                    id="college"
                    name="college"
                    type="text"
                    placeholder="Enter college name"
                    value={formData.college}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--program-accent)]"
                  />
                </div>
              </>
            )}

            {formData.occupation === "Working" && (
              <div className="space-y-2">
                <label htmlFor="company" className="block text-sm font-medium text-gray-700">
                  Company
                </label>
                <input
                  id="company"
                  name="company"
                  type="text"
                  placeholder="Enter company name"
                  value={formData.company}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--program-accent)]"
                />
              </div>
            )}

            {staffRole === "Admin" && (
              <div className="space-y-2">
                <label htmlFor="assignedPreacherAirtableUserId" className="block text-sm font-medium text-gray-700">
                  Assigned Preacher *
                </label>
                <select
                  id="assignedPreacherAirtableUserId"
                  name="assignedPreacherAirtableUserId"
                  value={formData.assignedPreacherAirtableUserId}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--program-accent)]"
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
              <label htmlFor="location" className="block text-sm font-medium text-gray-700">
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--program-accent)]"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="comments" className="block text-sm font-medium text-gray-700">
                Comments
              </label>
              <textarea
                id="comments"
                name="comments"
                placeholder="Add any additional comments"
                value={formData.comments}
                onChange={handleChange}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--program-accent)]"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || phoneError !== "" || !formData.location.trim()}
              className="w-full py-3 bg-[var(--program-accent)] text-white font-medium rounded-md hover:bg-[var(--program-accent-dark)] disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
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
