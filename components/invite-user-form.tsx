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
  assignedPreacherUserId: string
  locationIds: string[]
}

function emptyInviteForm(): InviteFormState {
  return {
    name: "",
    email: "",
    role: "Volunteer",
    assignedPreacherUserId: "",
    locationIds: [],
  }
}

function normalizeLocationName(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}

function isPreacherScopedRole(role: StaffRole): boolean {
  return role === "Volunteer" || role === "Assistant"
}

function updateLocationSelection(locationIds: string[], locationId: string, selected: boolean): string[] {
  if (selected) {
    return [...new Set([...locationIds, locationId])]
  }

  return locationIds.filter((currentLocationId) => currentLocationId !== locationId)
}

const fieldClass =
  "w-full rounded-lg border border-input bg-field px-4 py-3 text-sm text-foreground shadow-sm transition-all placeholder:text-muted-foreground/60 focus:border-[var(--program-accent)] focus:outline-none focus:ring-4 focus:ring-ring/15 disabled:bg-muted disabled:text-muted-foreground"
const labelClass = "block space-y-1.5 text-sm font-semibold text-foreground"
const noticeClass = "rounded-lg border px-4 py-3 text-sm leading-6"

export function InviteUserForm({
  mode,
  preachers = [],
  locations = [],
}: {
  mode: "volunteer" | "admin"
  preachers?: Array<{ id: string; name: string; role?: StaffRole }>
  locations?: LocationOption[]
}) {
  const [form, setForm] = useState<InviteFormState>(emptyInviteForm)
  const [availableLocations, setAvailableLocations] = useState<LocationOption[]>(locations)
  const [newLocationName, setNewLocationName] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isAddingLocation, setIsAddingLocation] = useState(false)
  const [message, setMessage] = useState("")

  const role = form.role
  const isPreacherScoped = isPreacherScopedRole(role)
  const selectedLocationCount = form.locationIds.length
  // A Volunteer's binding is form routing through a Preacher, so its picker
  // stays Preacher-only. An Assistant may be bound to an Admin or a Preacher.
  const assignablePreachers =
    role === "Volunteer"
      ? preachers.filter((preacher) => !preacher.role || preacher.role === "Preacher")
      : preachers

  const setLocationSelected = (locationId: string, selected: boolean) => {
    setForm((current) => ({
      ...current,
      locationIds: updateLocationSelection(current.locationIds, locationId, selected),
    }))
  }

  const handleRoleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextRole = event.target.value as StaffRole

    setForm((current) => {
      const selected = preachers.find((preacher) => preacher.id === current.assignedPreacherUserId)
      const keepsBinding =
        isPreacherScopedRole(nextRole) &&
        !(nextRole === "Volunteer" && selected?.role === "Admin")

      return {
        ...current,
        role: nextRole,
        assignedPreacherUserId: keepsBinding ? current.assignedPreacherUserId : "",
        locationIds: isPreacherScopedRole(nextRole) ? [] : current.locationIds,
      }
    })
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
      const locationIds = mode === "admin" && !isPreacherScoped ? form.locationIds : []
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          role,
          locationIds,
        }),
      })
      const data = (await response.json()) as { delivery?: "invite" | "sign-in-link"; upgraded?: boolean; error?: string }

      if (!response.ok) {
        throw new Error(data.error || "Invite failed.")
      }

      if (data.upgraded) {
        setMessage("Existing Volunteer upgraded to Assistant. A sign-in email was sent.")
      } else {
        setMessage(data.delivery === "sign-in-link" ? "A sign-in email was sent." : "Invite sent.")
      }
      setForm(emptyInviteForm())
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invite failed.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-overlay sm:p-6">
      <h1 className="font-[family-name:var(--font-poppins)] text-2xl font-bold text-foreground">
        {mode === "volunteer" ? "Invite Volunteer or Assistant" : "Invite Staff User"}
      </h1>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        {mode === "volunteer"
          ? "People you invite are assigned to your Preacher account. Use Assistant when they should also create sessions and take attendance on your behalf."
          : "Admins can invite Admin, Preacher, Volunteer, and Assistant users."}
      </p>

      {message && (
        <div className={cn(noticeClass, "mt-4 border-border bg-muted/50 text-foreground")} role="status">
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
              <option value="Assistant">Assistant</option>
            </select>
          </label>
        )}

        {mode === "volunteer" && (
          <label className={labelClass}>
            Role
            <select
              value={form.role}
              onChange={handleRoleChange}
              className={fieldClass}
            >
              <option value="Volunteer">Volunteer</option>
              <option value="Assistant">Assistant</option>
            </select>
          </label>
        )}

        {isPreacherScoped && mode === "admin" && (
          <label className={labelClass}>
            Assigned Preacher
            <select
              value={form.assignedPreacherUserId}
              onChange={(event) =>
                setForm((current) => ({ ...current, assignedPreacherUserId: event.target.value }))
              }
              required
              className={fieldClass}
            >
              <option value="">Select Preacher</option>
              {assignablePreachers.map((preacher) => (
                <option key={preacher.id} value={preacher.id}>
                  {preacher.role ? `${preacher.name} — ${preacher.role}` : preacher.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {mode === "admin" && !isPreacherScoped && (
          <fieldset className="space-y-3 rounded-lg border border-border bg-muted/70 p-4">
            <legend className="text-sm font-semibold text-foreground">Location access</legend>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-xs leading-5 text-muted-foreground">
                Select the locations this staff user can access.
              </p>
              <span
                className="rounded-full bg-foreground/5 px-3 py-1 text-xs font-semibold text-foreground"
                aria-live="polite"
              >
                {selectedLocationCount} selected
              </span>
            </div>

            {availableLocations.length > 0 ? (
              <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-border bg-card p-2">
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
                          ? "border-[var(--program-accent)] bg-muted text-foreground"
                          : "border-transparent text-foreground hover:border-border hover:bg-foreground/5",
                      )}
                    >
                      <input
                        id={checkboxId}
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => setLocationSelected(location.id, event.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-input accent-[var(--program-accent)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{location.name}</span>
                        {location.status && location.status !== "Active" && (
                          <span className="block text-xs text-muted-foreground">{location.status}</span>
                        )}
                      </span>
                    </label>
                  )
                })}
              </div>
            ) : (
              <div className={cn(noticeClass, "border-border bg-muted/50 text-foreground")}>
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
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-[var(--program-accent)] px-5 text-sm font-semibold text-foreground transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:border-border disabled:text-muted-foreground disabled:hover:translate-y-0 sm:self-end"
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
          className="inline-flex h-12 w-full items-center justify-center rounded-full bg-[var(--program-accent)] px-5 text-sm font-semibold text-[var(--accent-foreground)] shadow-lg shadow-[var(--program-accent)]/20 transition-[background-color,box-shadow,transform] hover:-translate-y-0.5 hover:bg-[var(--program-accent-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none disabled:hover:translate-y-0"
        >
          {isSubmitting ? "Sending..." : "Send Invite"}
        </button>
      </form>
    </div>
  )
}
