"use client"

import type React from "react"
import { useState } from "react"
import { Plus } from "lucide-react"
import type { StaffRole } from "@/lib/authz"
import { cn } from "@/lib/utils"

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

const fieldClass =
  "w-full rounded-lg border border-[var(--input)] bg-white px-4 py-3 text-sm text-[var(--program-text)] shadow-sm transition-all placeholder:text-[var(--muted-foreground)]/60 focus:border-[var(--program-accent)] focus:outline-none focus:ring-4 focus:ring-[var(--program-accent)]/15 disabled:bg-muted disabled:text-muted-foreground"
const labelClass = "block space-y-1.5 text-sm font-semibold text-[var(--program-text)]"
const noticeClass = "rounded-lg border px-4 py-3 text-sm leading-6"

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
      const data = (await response.json()) as { delivery?: "invite" | "sign-in-link"; error?: string }

      if (!response.ok) {
        throw new Error(data.error || "Invite failed.")
      }

      setMessage(data.delivery === "sign-in-link" ? "This user already exists. A sign-in email was sent." : "Invite sent.")
      setForm(emptyInviteForm())
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invite failed.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-card p-5 shadow-[0_18px_50px_rgba(45,10,10,0.08)] sm:p-6">
      <h1 className="font-[family-name:var(--font-poppins)] text-2xl font-bold text-[var(--program-text)]">
        {mode === "volunteer" ? "Invite Volunteer" : "Invite Staff User"}
      </h1>
      <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
        {mode === "volunteer"
          ? "Volunteers you invite are assigned to your Preacher account."
          : "Admins can invite Admin, Preacher, and Volunteer users."}
      </p>

      {message && (
        <div className={cn(noticeClass, "mt-4 border-amber-200 bg-amber-50 text-amber-800")} role="status">
          {message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <label className={labelClass}>
          Name
          <input
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            required
            className={fieldClass}
          />
        </label>

        <label className={labelClass}>
          Email
          <input
            type="email"
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            required
            className={fieldClass}
          />
        </label>

        {mode === "admin" && (
          <label className={labelClass}>
            Role
            <select
              value={form.role}
              onChange={handleRoleChange}
              className={fieldClass}
            >
              <option value="Admin">Admin</option>
              <option value="Preacher">Preacher</option>
              <option value="Volunteer">Volunteer</option>
            </select>
          </label>
        )}

        {role === "Volunteer" && mode === "admin" && (
          <label className={labelClass}>
            Assigned Preacher
            <select
              value={form.assignedPreacherAirtableUserId}
              onChange={(event) =>
                setForm((current) => ({ ...current, assignedPreacherAirtableUserId: event.target.value }))
              }
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
          </label>
        )}

        {mode === "admin" && role !== "Volunteer" && (
          <fieldset className="space-y-3 rounded-lg border border-[var(--border)] bg-muted/70 p-4">
            <legend className="text-sm font-semibold text-[var(--program-text)]">Location access</legend>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-xs leading-5 text-[var(--muted-foreground)]">
                Select the locations this staff user can access.
              </p>
              <span
                className="rounded-full bg-black/5 px-3 py-1 text-xs font-semibold text-[var(--program-primary)]"
                aria-live="polite"
              >
                {selectedLocationCount} selected
              </span>
            </div>

            {availableLocations.length > 0 ? (
              <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-[var(--border)] bg-white p-2">
                {availableLocations.map((location) => {
                  const checkboxId = `invite-location-${location.id}`
                  const checked = form.locationIds.includes(location.id)

                  return (
                    <label
                      key={location.id}
                      htmlFor={checkboxId}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm transition-colors",
                        checked
                          ? "border-[var(--program-accent)] bg-muted text-[var(--program-text)]"
                          : "border-transparent text-[var(--program-text)] hover:border-black/10 hover:bg-black/5",
                      )}
                    >
                      <input
                        id={checkboxId}
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => setLocationSelected(location.id, event.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-[var(--program-accent)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{location.name}</span>
                        {location.status && location.status !== "Active" && (
                          <span className="block text-xs text-[var(--muted-foreground)]">{location.status}</span>
                        )}
                      </span>
                    </label>
                  )
                })}
              </div>
            ) : (
              <div className={cn(noticeClass, "border-amber-200 bg-amber-50 text-amber-800")}>
                No locations are available yet. Add one below to assign it.
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <label className={labelClass}>
                Add new location
                <input
                  value={newLocationName}
                  onChange={(event) => setNewLocationName(event.target.value)}
                  onKeyDown={handleNewLocationKeyDown}
                  placeholder="e.g. Anna Nagar"
                  className={fieldClass}
                />
              </label>
              <button
                type="button"
                onClick={handleAddLocation}
                disabled={isAddingLocation || isSubmitting}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-[var(--program-accent)] px-5 text-sm font-semibold text-[var(--program-primary)] transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-accent)] disabled:border-gray-200 disabled:text-gray-400 disabled:hover:translate-y-0 sm:self-end"
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
          className="inline-flex h-12 w-full items-center justify-center rounded-full bg-[var(--program-accent)] px-5 text-sm font-semibold text-white shadow-lg shadow-[var(--program-accent)]/20 transition-[background-color,box-shadow,transform] hover:-translate-y-0.5 hover:bg-[var(--program-accent-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--program-primary)] disabled:bg-gray-300 disabled:shadow-none disabled:hover:translate-y-0"
        >
          {isSubmitting ? "Sending..." : "Send Invite"}
        </button>
      </form>
    </div>
  )
}
