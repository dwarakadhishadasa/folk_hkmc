"use client"

import type React from "react"
import { useState } from "react"
import type { StaffRole } from "@/lib/authz"

interface InviteFormState {
  name: string
  email: string
  role: StaffRole
  assignedPreacherAirtableUserId: string
  locationIds: string
}

export function InviteUserForm({
  mode,
  preachers = [],
}: {
  mode: "volunteer" | "admin"
  preachers?: Array<{ id: string; name: string }>
}) {
  const [form, setForm] = useState<InviteFormState>({
    name: "",
    email: "",
    role: "Volunteer",
    assignedPreacherAirtableUserId: "",
    locationIds: "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState("")

  const role = mode === "volunteer" ? "Volunteer" : form.role

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsSubmitting(true)
    setMessage("")

    try {
      const endpoint = mode === "volunteer" ? "/api/volunteers/invite" : "/api/admin/invite-user"
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          role,
          locationIds: form.locationIds
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Invite failed.")
      }

      setMessage("Invite sent.")
      setForm({
        name: "",
        email: "",
        role: "Volunteer",
        assignedPreacherAirtableUserId: "",
        locationIds: "",
      })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invite failed.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-xl">
      <h1 className="font-[family-name:var(--font-poppins)] text-2xl font-bold text-[#24324A]">
        {mode === "volunteer" ? "Invite Volunteer" : "Invite Staff User"}
      </h1>
      <p className="mt-1 text-sm text-[#24324A]/70">
        {mode === "volunteer"
          ? "Volunteers you invite are assigned to your Preacher account."
          : "Admins can invite Admin, Preacher, and Volunteer users."}
      </p>

      {message && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <label className="block space-y-1 text-sm font-medium text-[#24324A]">
          Name
          <input
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            required
            className="w-full rounded-xl border-2 border-gray-200 px-4 py-3"
          />
        </label>

        <label className="block space-y-1 text-sm font-medium text-[#24324A]">
          Email
          <input
            type="email"
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            required
            className="w-full rounded-xl border-2 border-gray-200 px-4 py-3"
          />
        </label>

        {mode === "admin" && (
          <label className="block space-y-1 text-sm font-medium text-[#24324A]">
            Role
            <select
              value={form.role}
              onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as StaffRole }))}
              className="w-full rounded-xl border-2 border-gray-200 px-4 py-3"
            >
              <option value="Admin">Admin</option>
              <option value="Preacher">Preacher</option>
              <option value="Volunteer">Volunteer</option>
            </select>
          </label>
        )}

        {role === "Volunteer" && mode === "admin" && (
          <label className="block space-y-1 text-sm font-medium text-[#24324A]">
            Assigned Preacher
            <select
              value={form.assignedPreacherAirtableUserId}
              onChange={(event) =>
                setForm((current) => ({ ...current, assignedPreacherAirtableUserId: event.target.value }))
              }
              required
              className="w-full rounded-xl border-2 border-gray-200 px-4 py-3"
            >
              <option value="">Select Preacher</option>
              {preachers.map((preacher) => (
                <option key={preacher.id} value={preacher.id}>
                  {preacher.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {mode === "admin" && role !== "Volunteer" && (
          <label className="block space-y-1 text-sm font-medium text-[#24324A]">
            Location Record IDs
            <input
              value={form.locationIds}
              onChange={(event) => setForm((current) => ({ ...current, locationIds: event.target.value }))}
              placeholder="rec123, rec456"
              className="w-full rounded-xl border-2 border-gray-200 px-4 py-3"
            />
          </label>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-xl bg-[#F98B1C] px-5 py-3 font-semibold text-white disabled:bg-gray-300"
        >
          {isSubmitting ? "Sending..." : "Send Invite"}
        </button>
      </form>
    </div>
  )
}
