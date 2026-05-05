"use client"

import type React from "react"
import { useRef, useState } from "react"
import { Toaster } from "@/components/ui/toaster"
import { useToast } from "@/hooks/use-toast"

interface ContactData {
  name: string
  mobile: string
  age: string
  occupation: string
  year: string
  location: string
  assignedPreacherAirtableUserId: string
}

const initialFormData: ContactData = {
  name: "",
  mobile: "",
  age: "",
  occupation: "",
  year: "Unknown",
  location: "",
  assignedPreacherAirtableUserId: "",
}

export function ContactForm({
  staffRole,
  preachers = [],
}: {
  staffRole: "Admin" | "Preacher" | "Volunteer"
  preachers?: Array<{ id: string; name: string }>
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState<ContactData>(initialFormData)
  const [phoneError, setPhoneError] = useState("")
  const [message, setMessage] = useState("")
  const nameInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
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

    if (name === "age") {
      const digitsOnly = value.replace(/\D/g, "")
      setFormData((prev) => ({ ...prev, [name]: digitsOnly }))
      return
    }

    if (name === "occupation") {
      setFormData((prev) => ({
        ...prev,
        occupation: value,
        year: value === "Working" ? "Unknown" : prev.year,
      }))
      return
    }

    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const resetFormAfterSave = () => {
    setFormData((prev) => ({
      ...initialFormData,
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

    setIsSubmitting(true)
    setMessage("")

    try {
      if (!navigator.onLine) {
        setMessage("Staff contact capture requires an online staff session. Please reconnect and submit again.")
        return
      }

      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

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
        <div className="bg-blue-600 text-white p-6">
          <h2 className="text-xl font-bold">New Contact</h2>
          <p className="text-blue-100 text-sm mt-1">Add a new contact to the FOLK database</p>
        </div>
        <div className="p-6">
          <div className="mb-4 rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            {staffRole === "Volunteer" && "Volunteer contacts are automatically assigned to your Preacher."}
            {staffRole === "Preacher" && "Contacts you create are assigned to you."}
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  phoneError ? "border-red-500" : "border-gray-300"
                }`}
              />
              {phoneError && <p className="text-sm text-red-500">{phoneError}</p>}
            </div>

            <div className="space-y-2">
              <label htmlFor="age" className="block text-sm font-medium text-gray-700">
                Age
              </label>
              <input
                id="age"
                name="age"
                type="tel"
                inputMode="numeric"
                placeholder="Enter age"
                value={formData.age}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select occupation type</option>
                <option value="Studying">Student</option>
                <option value="Working">Working Professional</option>
              </select>
            </div>

            {formData.occupation === "Studying" && (
              <div className="space-y-2">
                <label htmlFor="year" className="block text-sm font-medium text-gray-700">
                  Year
                </label>
                <select
                  id="year"
                  name="year"
                  value={formData.year}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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

            <div className="space-y-2">
              <label htmlFor="location" className="block text-sm font-medium text-gray-700">
                Location
              </label>
              <input
                id="location"
                name="location"
                type="text"
                placeholder="Enter city/area (e.g., Chennai, Thiruvanmiyur)"
                value={formData.location}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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

            <button
              type="submit"
              disabled={isSubmitting || phoneError !== ""}
              className="w-full py-3 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
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
