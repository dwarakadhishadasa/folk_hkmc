"use client"

import type React from "react"
import { useState } from "react"

interface ContactData {
  name: string
  mobile: string
  age: string
  occupation: string
  year: string
  location: string
}

const initialFormData: ContactData = {
  name: "",
  mobile: "",
  age: "",
  occupation: "",
  year: "Unknown",
  location: "",
}

export function ContactForm() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [formData, setFormData] = useState<ContactData>(initialFormData)
  const [phoneError, setPhoneError] = useState("")

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

  const handleAddAnother = () => {
    setFormData(initialFormData)
    setIsSuccess(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (formData.mobile.length !== 10) {
      setPhoneError("Phone number must be exactly 10 digits")
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      if (!response.ok) throw new Error("Failed to generate contact")

      setIsSuccess(true)
    } catch (error) {
      alert("Failed to save contact. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isSuccess) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
            <span className="text-4xl text-green-600">✓</span>
          </div>
          <h2 className="text-2xl font-semibold text-gray-900">Contact Added Successfully!</h2>
          <p className="text-gray-600">The contact has been saved to the FOLK database.</p>
          <button
            onClick={handleAddAnother}
            className="mt-4 px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
          >
            + Add New Contact
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
      <div className="bg-blue-600 text-white p-6">
        <h2 className="text-xl font-bold">Contact Generation</h2>
        <p className="text-blue-100 text-sm mt-1">Add a new contact to the FOLK database</p>
      </div>
      <div className="p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              Full Name *
            </label>
            <input
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
              Location *
            </label>
            <input
              id="location"
              name="location"
              type="text"
              placeholder="Enter city/area (e.g., Chennai, Thiruvanmiyur)"
              value={formData.location}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || phoneError !== ""}
            className="w-full py-3 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? "Generating Contact..." : "Generate Contact"}
          </button>
        </form>
      </div>
    </div>
  )
}
