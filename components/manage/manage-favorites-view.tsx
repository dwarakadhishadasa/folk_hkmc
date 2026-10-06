"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import type {
  ManageContact,
  ManageContactWriteResult,
  ManagePortalPayload,
} from "@/components/manage/manage-types"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

const ALL_LOCATIONS = "all"
const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const PHOTO_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"]
/** Signed URLs are minted for 300 s; re-mint ahead of that so a preview left
 * open does not expire mid-session. */
const SIGNED_URL_REFRESH_MS = 240_000

type PhotoState = "idle" | "loading" | "ready" | "failed"

interface ContactDraft {
  name: string
  phone: string
  college: string
  company: string
  rounds: string
  booksRead: string[]
  dateOfBirth: string
  notes: string
  initialContact: string
  locationIds: string[]
}

type Status = { kind: "idle" | "busy" | "ok" | "error"; message: string }

const IDLE_STATUS: Status = { kind: "idle", message: "" }

function toDraft(contact: ManageContact): ContactDraft {
  return {
    name: contact.name,
    phone: contact.phone,
    college: contact.college ?? "",
    company: contact.company ?? "",
    rounds: contact.rounds ?? "",
    booksRead: contact.booksRead,
    dateOfBirth: contact.dateOfBirth ?? "",
    notes: contact.notes ?? "",
    initialContact: contact.initialContact ?? "",
    locationIds: contact.locationIds,
  }
}

function readError(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const value = (payload as { error?: unknown }).error
    if (typeof value === "string" && value) {
      return value
    }
  }

  return fallback
}

export function ManageFavoritesView({ payload }: { payload: ManagePortalPayload }) {
  const [query, setQuery] = useState("")
  const [locationFilter, setLocationFilter] = useState(ALL_LOCATIONS)
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const [overrides, setOverrides] = useState<Record<string, ManageContactWriteResult>>({})
  const [photoPaths, setPhotoPaths] = useState<Record<string, string | null>>({})
  const [draft, setDraft] = useState<ContactDraft | null>(null)
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [photoState, setPhotoState] = useState<PhotoState>("idle")
  const [photoUrlVersion, setPhotoUrlVersion] = useState(0)
  const [status, setStatus] = useState<Status>(IDLE_STATUS)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const favorites = useMemo(() => {
    const needle = query.trim().toLowerCase()

    return payload.contacts
      .filter((contact) => contact.isFavorite)
      .filter((contact) => {
        if (locationFilter !== ALL_LOCATIONS && !contact.locationIds.includes(locationFilter)) {
          return false
        }

        if (!needle) {
          return true
        }

        return `${contact.name} ${contact.phone}`.toLowerCase().includes(needle)
      })
      .sort((left, right) => left.name.localeCompare(right.name, "en", { sensitivity: "base" }))
  }, [locationFilter, payload.contacts, query])

  const mergedContacts = useMemo(() => {
    const merged = new Map<string, ManageContact>()
    for (const contact of payload.contacts) {
      const override = overrides[contact.id]
      const photoOverride = photoPaths[contact.id]
      merged.set(
        contact.id,
        override
          ? { ...contact, ...override, photoPath: photoOverride ?? contact.photoPath }
          : photoOverride !== undefined
            ? { ...contact, photoPath: photoOverride }
            : contact,
      )
    }
    return merged
  }, [overrides, payload.contacts, photoPaths])

  const selectedContact = selectedContactId ? (mergedContacts.get(selectedContactId) ?? null) : null

  // Keyed on the id, not on `selectedContact`: uploading a photo rewrites
  // `photoPaths`, which rebuilds the merged object and would otherwise discard
  // every unsaved field the user has typed.
  const selectContact = (contactId: string) => {
    const next = mergedContacts.get(contactId) ?? null
    setSelectedContactId(contactId)
    setDraft(next ? toDraft(next) : null)
    setStatus(IDLE_STATUS)
  }

  // Photos live in a private bucket, so the preview is a short-lived signed URL
  // minted server-side rather than a stable object URL. A failed mint has to end
  // in its own state — otherwise a deleted object or a 403 leaves the panel
  // saying "Loading…" forever — and the URL is refreshed before its TTL expires.
  useEffect(() => {
    let cancelled = false

    if (!selectedContact?.photoPath) {
      setPhotoState("idle")
      setSignedUrl(null)
      return () => {
        cancelled = true
      }
    }

    setPhotoState("loading")

    const load = async () => {
      try {
        const response = await fetch(
          `/api/manage/contacts/photo?contactId=${encodeURIComponent(selectedContact.id)}`,
          { cache: "no-store" },
        )

        if (!response.ok) {
          if (!cancelled) {
            setSignedUrl(null)
            setPhotoState("failed")
          }
          return
        }

        const body = (await response.json()) as { url?: string }
        if (cancelled) {
          return
        }

        if (typeof body.url === "string" && body.url) {
          setSignedUrl(body.url)
          setPhotoState("ready")
        } else {
          setSignedUrl(null)
          setPhotoState("failed")
        }
      } catch {
        if (!cancelled) {
          setSignedUrl(null)
          setPhotoState("failed")
        }
      }
    }

    void load()

    const refreshTimer = window.setTimeout(() => {
      setPhotoUrlVersion((version) => version + 1)
    }, SIGNED_URL_REFRESH_MS)

    return () => {
      cancelled = true
      window.clearTimeout(refreshTimer)
    }
  }, [selectedContact?.id, selectedContact?.photoPath, photoUrlVersion])

  const updateDraft = <Key extends keyof ContactDraft>(key: Key, value: ContactDraft[Key]) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current))
  }

  const toggleDraftValue = (key: "booksRead" | "locationIds", value: string) => {
    setDraft((current) => {
      if (!current) {
        return current
      }

      const values = current[key]
      return {
        ...current,
        [key]: values.includes(value) ? values.filter((item) => item !== value) : [...values, value],
      }
    })
  }

  const handleSave = async () => {
    if (!selectedContact || !draft) {
      return
    }

    setStatus({ kind: "busy", message: "Saving changes…" })

    try {
      const response = await fetch("/api/manage/contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: selectedContact.id, ...draft }),
      })

      const body: unknown = await response.json()

      if (!response.ok) {
        setStatus({ kind: "error", message: readError(body, "Unable to save this contact.") })
        return
      }

      const updated = (body as { contact?: ManageContactWriteResult }).contact
      if (!updated) {
        setStatus({ kind: "error", message: "The server did not return the updated contact." })
        return
      }

      setOverrides((current) => ({ ...current, [updated.id]: updated }))
      setStatus({ kind: "ok", message: "Saved." })
    } catch {
      setStatus({ kind: "error", message: "Unable to reach the server." })
    }
  }

  const handlePhotoUpload = async (file: File) => {
    if (!selectedContact) {
      return
    }

    if (!PHOTO_CONTENT_TYPES.includes(file.type)) {
      setStatus({ kind: "error", message: "Photos must be JPEG, PNG or WebP images." })
      return
    }

    if (file.size > MAX_PHOTO_BYTES) {
      setStatus({ kind: "error", message: "Photos must be 5 MB or smaller." })
      return
    }

    setStatus({ kind: "busy", message: "Uploading photo…" })

    try {
      const form = new FormData()
      form.append("contactId", selectedContact.id)
      form.append("file", file)

      const response = await fetch("/api/manage/contacts/photo", { method: "POST", body: form })
      const body: unknown = await response.json()

      if (!response.ok) {
        setStatus({ kind: "error", message: readError(body, "Unable to upload the photo.") })
        return
      }

      const photoPath = (body as { photoPath?: string }).photoPath
      if (typeof photoPath !== "string" || !photoPath) {
        setStatus({ kind: "error", message: "The server did not return the stored photo path." })
        return
      }

      setPhotoPaths((current) => ({ ...current, [selectedContact.id]: photoPath }))
      setStatus({ kind: "ok", message: "Photo uploaded." })
    } catch {
      setStatus({ kind: "error", message: "Unable to reach the server." })
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-card shadow-[0_18px_50px_rgba(45,10,10,0.08)]">
        <div className="bg-[var(--program-primary)] px-5 py-4 text-white">
          <h2 className="font-[family-name:var(--font-poppins)] text-lg font-semibold">Favorites</h2>
          <p className="text-sm text-white/70">
            {favorites.length.toLocaleString("en-IN")} favorite contacts in scope
          </p>
        </div>

        <div className="space-y-3 p-4">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search favorites"
            aria-label="Search favorites"
          />
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="w-full" aria-label="Filter favorites by location">
              <SelectValue placeholder="All locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_LOCATIONS}>All locations</SelectItem>
              {payload.locations.map((location) => (
                <SelectItem key={location.id} value={location.id}>
                  {location.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ul className="max-h-[60vh] overflow-y-auto border-t border-[var(--border)]">
          {favorites.length === 0 ? (
            <li className="px-4 py-10 text-center text-sm text-[var(--muted-foreground)]">
              No favorites match the current filters.
            </li>
          ) : (
            favorites.map((contact) => (
              <li key={contact.id}>
                <button
                  type="button"
                  onClick={() => selectContact(contact.id)}
                  aria-current={contact.id === selectedContactId ? "true" : undefined}
                  className={
                    contact.id === selectedContactId
                      ? "w-full border-l-4 border-[var(--program-primary)] bg-black/5 px-4 py-3 text-left"
                      : "w-full border-l-4 border-transparent px-4 py-3 text-left transition-colors hover:bg-black/5"
                  }
                >
                  <p className="font-medium text-[var(--program-text)]">{contact.name}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {contact.phone || "No phone"} · {contact.past60DayAttendanceCount} in past 60 days
                  </p>
                </button>
              </li>
            ))
          )}
        </ul>
      </section>

      {selectedContact && draft ? (
        <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-card shadow-[0_18px_50px_rgba(45,10,10,0.08)]">
          <div className="flex flex-col gap-2 bg-[var(--program-primary)] px-5 py-4 text-white sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-[family-name:var(--font-poppins)] text-lg font-semibold">
                {selectedContact.name}
              </h3>
              <p className="text-sm text-white/70">Contact detail</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{selectedContact.totalAttendanceCount} total sessions</Badge>
              <Badge variant="secondary">{selectedContact.past60DayAttendanceCount} past 60 days</Badge>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-[14rem_minmax(0,1fr)]">
            <div className="space-y-3">
              <div className="flex h-48 w-full items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-black/5">
                {signedUrl ? (
                  <img src={signedUrl} alt={selectedContact.name} className="h-full w-full object-cover" />
                ) : photoState === "loading" ? (
                  <p className="px-4 text-center text-xs text-[var(--muted-foreground)]">
                    Loading a signed preview…
                  </p>
                ) : selectedContact.photoPath ? (
                  <p className="px-4 text-center text-xs text-[var(--muted-foreground)]">
                    The photo preview is unavailable right now.
                  </p>
                ) : (
                  <p className="px-4 text-center text-xs text-[var(--muted-foreground)]">
                    No photo on file. Uploads stay in a private bucket.
                  </p>
                )}
              </div>

              <Label htmlFor="manage-photo" className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                Photo
              </Label>
              <input
                id="manage-photo"
                ref={fileInputRef}
                type="file"
                accept={PHOTO_CONTENT_TYPES.join(",")}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) {
                    void handlePhotoUpload(file)
                  }
                }}
                className="block w-full text-sm text-[var(--muted-foreground)] file:mr-3 file:rounded-full file:border-0 file:bg-[var(--program-primary)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
              />
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Name" id="manage-name">
                  <Input
                    id="manage-name"
                    value={draft.name}
                    onChange={(event) => updateDraft("name", event.target.value)}
                  />
                </Field>
                <Field label="Phone" id="manage-phone">
                  <Input
                    id="manage-phone"
                    value={draft.phone}
                    onChange={(event) => updateDraft("phone", event.target.value)}
                  />
                </Field>
                <Field label="College" id="manage-college">
                  <Input
                    id="manage-college"
                    value={draft.college}
                    onChange={(event) => updateDraft("college", event.target.value)}
                  />
                </Field>
                <Field label="Rounds" id="manage-rounds">
                  <Input
                    id="manage-rounds"
                    value={draft.rounds}
                    onChange={(event) => updateDraft("rounds", event.target.value)}
                  />
                </Field>
                <Field label="Company" id="manage-company">
                  <Input
                    id="manage-company"
                    value={draft.company}
                    onChange={(event) => updateDraft("company", event.target.value)}
                  />
                </Field>
                <Field label="Date of Birth" id="manage-dob">
                  <Input
                    id="manage-dob"
                    value={draft.dateOfBirth}
                    placeholder="YYYY-MM-DD"
                    onChange={(event) => updateDraft("dateOfBirth", event.target.value)}
                  />
                </Field>
                <Field label="Initial Contact" id="manage-initial">
                  <Input
                    id="manage-initial"
                    value={draft.initialContact}
                    placeholder="YYYY-MM-DD"
                    onChange={(event) => updateDraft("initialContact", event.target.value)}
                  />
                </Field>
              </div>

              <fieldset>
                <legend className="mb-2 text-sm font-medium">Books Read</legend>
                {payload.booksReadOptions.length === 0 ? (
                  <p className="text-sm text-[var(--muted-foreground)]">
                    No books recorded yet. Values appear here once a contact has one.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {payload.booksReadOptions.map((book) => {
                      const active = draft.booksRead.includes(book)
                      return (
                        <button
                          key={book}
                          type="button"
                          onClick={() => toggleDraftValue("booksRead", book)}
                          aria-pressed={active}
                          className={
                            active
                              ? "rounded-full bg-[var(--program-primary)] px-4 py-1.5 text-sm font-semibold text-white"
                              : "rounded-full border border-[var(--border)] px-4 py-1.5 text-sm font-semibold text-[var(--muted-foreground)] transition-colors hover:bg-black/5"
                          }
                        >
                          {book}
                        </button>
                      )
                    })}
                  </div>
                )}
              </fieldset>

              <fieldset>
                <legend className="mb-2 text-sm font-medium">Location</legend>
                {payload.locations.length === 0 ? (
                  <p className="text-sm text-[var(--muted-foreground)]">No locations in scope.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {payload.locations.map((location) => {
                      const active = draft.locationIds.includes(location.id)
                      return (
                        <button
                          key={location.id}
                          type="button"
                          onClick={() => toggleDraftValue("locationIds", location.id)}
                          aria-pressed={active}
                          className={
                            active
                              ? "rounded-full bg-[var(--program-primary)] px-4 py-1.5 text-sm font-semibold text-white"
                              : "rounded-full border border-[var(--border)] px-4 py-1.5 text-sm font-semibold text-[var(--muted-foreground)] transition-colors hover:bg-black/5"
                          }
                        >
                          {location.name}
                        </button>
                      )
                    })}
                  </div>
                )}
              </fieldset>

              <Field label="Notes" id="manage-notes">
                <Textarea
                  id="manage-notes"
                  rows={5}
                  value={draft.notes}
                  onChange={(event) => updateDraft("notes", event.target.value)}
                />
              </Field>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p
                  role="status"
                  className={
                    status.kind === "error"
                      ? "text-sm font-medium text-red-700"
                      : "text-sm font-medium text-[var(--muted-foreground)]"
                  }
                >
                  {status.message}
                </p>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={status.kind === "busy"}
                  className="rounded-full bg-[var(--program-primary)] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--program-primary-light)] disabled:opacity-50"
                >
                  Save contact
                </button>
              </div>

              <p className="text-xs text-[var(--muted-foreground)]">
                Assigned preacher: {selectedContact.assignedPreacherId
                  ? (payload.staffNames[selectedContact.assignedPreacherId] ?? "Unknown")
                  : "Unassigned"}{" "}
                · Last contacted on: {selectedContact.lastContactedOn ?? "never"}
              </p>
            </div>
          </div>
        </section>
      ) : (
        <section className="flex min-h-[20rem] items-center justify-center rounded-lg border border-[var(--border)] bg-card px-6 py-12 shadow-[0_18px_50px_rgba(45,10,10,0.08)]">
          <p className="text-sm text-[var(--muted-foreground)]">
            Select a favorite contact to edit its detail and photo.
          </p>
        </section>
      )}
    </div>
  )
}

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}