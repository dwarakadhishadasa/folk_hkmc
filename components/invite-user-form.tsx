"use client"

import type React from "react"
import { useState } from "react"
import { Plus } from "lucide-react"
import type { StaffRole } from "@/lib/authz"

interface LocationOption {
  id: string
  name: string
  status?: string
}

interface InviteFormState {
  name: string
  email: string
  role: StaffRole
  assignedPreacherAirtableUserId: string
  locationIds: string[]
}

function emptyInviteForm(): InviteFormState {
  return {
    name: "",
    email: "",
    role: "Volunteer",
    assignedPreacherAirtableUserId: "",
    locationIds: [],
  }
}

function normalizeLocationName(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}

function updateLocationSelection(locationIds: string[], locationId: string, selected: boolean): string[] {
  if (selected) {
    return [...new Set([...locationIds, locationId])]
  }

  return locationIds.filter((currentLocationId) => currentLocationId !== locationId)
}

export function InviteUserForm({
  mode,
  preachers = [],
  locations = [],
}: {
  mode: "volunteer" | "admin"
  preachers?: Array<{ id: string; name: string }>
  locations?: LocationOption[]
}) {
  const [form, setForm] = useState<InviteFormState>(emptyInviteForm)
  const [availableLocations, setAvailableLocations] = useState<LocationOption[]>(locations)
  const [newLocationName, setNewLocationName] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isAddingLocation, setIsAddingLocation] = useState(false)
  const [message, setMessage] = useState("")

  const role = mode === "volunteer" ? "Volunteer" : form.role
  const selectedLocationCount = form.locationIds.length

  const setLocationSelected = (locationId: string, selected: boolean) => {
    setForm((current) => ({
      ...current,
      locationIds: updateLocationSelection(current.locationIds, locationId, selected),
    }))
  }

  const handleRoleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextRole = event.target.value as StaffRole

    setForm((current) => ({
      ...current,
      role: nextRole,
      assignedPreacherAirtableUserId:
        nextRole === "Volunteer" ? current.assignedPreacherAirtableUserId : "",
      locationIds: nextRole === "Volunteer" ? [] : current.locationIds,
    }))
  }

  const handleAddLocation = async () => {
    const name = normalizeLocationName(newLocationName)
    if (!name) {
      setMessage("Enter a location name before adding it.")
      return
    }

    const existingLocation = availableLocations.find(
      (location) => normalizeLocationName(location.name).toLowerCase() === name.toLowerCase(),
    )

    if (existingLocation) {
      setLocationSelected(existingLocation.id, true)
      setNewLocationName("")
      setMessage(`${existingLocation.name} already exists and is now selected.`)
      return
    }

    setIsAddingLocation(true)
    setMessage("")

    try {
      const response = await fetch("/api/admin/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      const data = (await response.json().catch(() => ({}))) as {
        location?: LocationOption
        existing?: boolean
        error?: string
      }

      if (!response.ok || !data.location) {
        throw new Error(data.error || "Location could not be added.")
      }

      const location = data.location
      setAvailableLocations((current) => {
        const nextLocations = current.some((currentLocation) => currentLocation.id === location.id)
          ? current
          : [...current, location]

        return [...nextLocations].sort((left, right) => left.name.localeCompare(right.name))
      })
      setLocationSelected(location.id, true)
      setNewLocationName("")
      setMessage(
        data.existing ? `${location.name} already exists and is now selected.` : `${location.name} added and selected.`,
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Location could not be added.")
    } finally {
      setIsAddingLocation(false)
    }
  }

  const handleNewLocationKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault()
      void handleAddLocation()
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsSubmitting(true)
    setMessage("")

    try {
      const endpoint = mode === "volunteer" ? "/api/volunteers/invite" : "/api/admin/invite-user"
      const locationIds = mode === "admin" && role !== "Volunteer" ? form.locationIds : []
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          role,
          locationIds,
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Invite failed.")
      }

      setMessage("Invite sent.")
      setForm(emptyInviteForm())
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
              onChange={handleRoleChange}
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
          <fieldset className="space-y-3 rounded-2xl border border-[#0F1E54]/10 bg-[#FFF9F0]/60 p-4">
            <legend className="text-sm font-semibold text-[#24324A]">Location access</legend>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-xs text-[#24324A]/65">
                Select the locations this staff user can access.
              </p>
              <span
                className="rounded-full bg-[#0F1E54]/10 px-3 py-1 text-xs font-semibold text-[#0F1E54]"
                aria-live="polite"
              >
                {selectedLocationCount} selected
              </span>
            </div>

            {availableLocations.length > 0 ? (
              <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-[#0F1E54]/10 bg-white p-2">
                {availableLocations.map((location) => {
                  const checkboxId = `invite-location-${location.id}`
                  const checked = form.locationIds.includes(location.id)

                  return (
                    <label
                      key={location.id}
                      htmlFor={checkboxId}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${
                        checked
                          ? "border-[#F98B1C] bg-[#F98B1C]/10 text-[#24324A]"
                          : "border-transparent text-[#24324A] hover:border-[#0F1E54]/10 hover:bg-[#0F1E54]/5"
                      }`}
                    >
                      <input
                        id={checkboxId}
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => setLocationSelected(location.id, event.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-[#F98B1C]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{location.name}</span>
                        {location.status && location.status !== "Active" && (
                          <span className="block text-xs text-[#24324A]/60">{location.status}</span>
                        )}
                      </span>
                    </label>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                No locations are available yet. Add one below to assign it.
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <label className="block space-y-1 text-sm font-medium text-[#24324A]">
                Add new location
                <input
                  value={newLocationName}
                  onChange={(event) => setNewLocationName(event.target.value)}
                  onKeyDown={handleNewLocationKeyDown}
                  placeholder="e.g. Anna Nagar"
                  className="w-full rounded-xl border-2 border-gray-200 px-4 py-3"
                />
              </label>
              <button
                type="button"
                onClick={handleAddLocation}
                disabled={isAddingLocation || isSubmitting}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border-2 border-[#F98B1C] px-4 text-sm font-semibold text-[#0F1E54] transition-colors hover:bg-[#F98B1C]/10 disabled:border-gray-200 disabled:text-gray-400 sm:self-end"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {isAddingLocation ? "Adding..." : "Add"}
              </button>
            </div>
          </fieldset>
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
