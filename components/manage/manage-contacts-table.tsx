"use client"

import { useMemo, useState } from "react"
import type { ManageContact, ManagePortalPayload } from "@/components/manage/manage-types"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const ALL_LOCATIONS = "all"

type SortKey =
  | "name"
  | "phone"
  | "location"
  | "totalAttendanceCount"
  | "past60DayAttendanceCount"
  | "lastContactedOn"
  | "notes"
  | "collectedBy"

interface SortState {
  key: SortKey
  direction: "asc" | "desc"
}

type Status = { kind: "idle" | "busy" | "ok" | "error"; message: string }

const IDLE_STATUS: Status = { kind: "idle", message: "" }

function readError(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const value = (payload as { error?: unknown }).error
    if (typeof value === "string" && value) {
      return value
    }
  }

  return fallback
}

const COLUMNS: Array<{ key: SortKey; label: string; className?: string }> = [
  { key: "name", label: "Name" },
  { key: "phone", label: "Phone" },
  { key: "location", label: "Location" },
  { key: "totalAttendanceCount", label: "Total Attendance" },
  { key: "past60DayAttendanceCount", label: "Past 60 Days" },
  { key: "lastContactedOn", label: "Last Contacted On" },
  { key: "notes", label: "Notes", className: "max-w-[18rem] whitespace-normal" },
  { key: "collectedBy", label: "Collected By" },
]

function compareText(left: string, right: string): number {
  return left.localeCompare(right, "en", { sensitivity: "base", numeric: true })
}

function timestamp(value: string | null): number {
  if (!value) {
    return Number.NEGATIVE_INFINITY
  }

  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY
}

export function ManageContactsTable({ payload }: { payload: ManagePortalPayload }) {
  const [query, setQuery] = useState("")
  const [locationFilter, setLocationFilter] = useState(ALL_LOCATIONS)
  const [sort, setSort] = useState<SortState>({ key: "name", direction: "asc" })
  const [favoriteOverrides, setFavoriteOverrides] = useState<Record<string, boolean>>({})
  const [pendingContactId, setPendingContactId] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>(IDLE_STATUS)

  const locationNameById = useMemo(
    () => new Map(payload.locations.map((location) => [location.id, location.name])),
    [payload.locations],
  )

  const locationLabel = useMemo(() => {
    const counts = new Map<string, number>()
    for (const contact of payload.contacts) {
      for (const locationId of contact.locationIds) {
        counts.set(locationId, (counts.get(locationId) ?? 0) + 1)
      }
    }
    return counts
  }, [payload.contacts])

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = payload.contacts.filter((contact) => {
      if (locationFilter !== ALL_LOCATIONS && !contact.locationIds.includes(locationFilter)) {
        return false
      }

      if (!needle) {
        return true
      }

      const haystack = [
        contact.name,
        contact.phone,
        contact.notes ?? "",
        contact.college ?? "",
        ...contact.locationIds.map((id) => locationNameById.get(id) ?? ""),
        payload.staffNames[contact.collectedById ?? ""] ?? "",
      ]
        .join(" ")
        .toLowerCase()

      return haystack.includes(needle)
    })
      .map((contact) =>
        contact.id in favoriteOverrides
          ? { ...contact, isFavorite: favoriteOverrides[contact.id] }
          : contact,
      )

    const value = (contact: ManageContact): string | number => {
      switch (sort.key) {
        case "name":
          return contact.name
        case "phone":
          return contact.phone
        case "location":
          return contact.locationIds.map((id) => locationNameById.get(id) ?? id).join(", ")
        case "totalAttendanceCount":
          return contact.totalAttendanceCount
        case "past60DayAttendanceCount":
          return contact.past60DayAttendanceCount
        case "lastContactedOn":
          return timestamp(contact.lastContactedOn)
        case "notes":
          return contact.notes ?? ""
        case "collectedBy":
          return payload.staffNames[contact.collectedById ?? ""] ?? ""
      }
    }

    return [...filtered].sort((left, right) => {
      const leftValue = value(left)
      const rightValue = value(right)
      const comparison =
        typeof leftValue === "number" && typeof rightValue === "number"
          ? leftValue - rightValue
          : compareText(String(leftValue), String(rightValue))

      return sort.direction === "asc" ? comparison : -comparison
    })
  }, [
    favoriteOverrides,
    locationFilter,
    locationNameById,
    payload.contacts,
    payload.staffNames,
    query,
    sort,
  ])

  const toggleSort = (key: SortKey) => {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" },
    )
  }

  const toggleFavorite = async (contact: ManageContact) => {
    const nextValue = !contact.isFavorite

    setPendingContactId(contact.id)
    setStatus({ kind: "busy", message: `Saving ${contact.name}…` })

    try {
      const response = await fetch("/api/manage/contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: contact.id, isFavorite: nextValue }),
      })

      const body: unknown = await response.json()

      if (!response.ok) {
        setStatus({ kind: "error", message: readError(body, "Unable to save the favorite.") })
        return
      }

      setFavoriteOverrides((current) => ({ ...current, [contact.id]: nextValue }))
      setStatus({
        kind: "ok",
        message: `${contact.name} ${nextValue ? "added to" : "removed from"} favorites.`,
      })
    } catch {
      setStatus({ kind: "error", message: "Unable to reach the server." })
    } finally {
      setPendingContactId(null)
    }
  }

  return (
    <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-card shadow-[0_18px_50px_rgba(45,10,10,0.08)]">
      <div className="bg-[var(--program-primary)] px-5 py-4 text-white">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-[family-name:var(--font-poppins)] text-lg font-semibold">Contacts</h2>
            <p className="text-sm text-white/70">
              {rows.length.toLocaleString("en-IN")} of {payload.contacts.length.toLocaleString("en-IN")} in scope
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, phone, notes"
              aria-label="Search contacts"
              className="sm:w-64"
            />
            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger className="sm:w-48" aria-label="Filter by location">
                <SelectValue placeholder="All locations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_LOCATIONS}>All locations</SelectItem>
                {payload.locations.map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name} ({locationLabel.get(location.id) ?? 0})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {status.kind !== "idle" ? (
        <p
          role="status"
          className={
            status.kind === "error"
              ? "border-b border-[var(--border)] px-5 py-2 text-sm font-medium text-red-700"
              : "border-b border-[var(--border)] px-5 py-2 text-sm font-medium text-[var(--muted-foreground)]"
          }
        >
          {status.message}
        </p>
      ) : null}

      <div className="max-h-[70vh] overflow-y-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead className="w-10">
                <span className="sr-only">Favorite</span>
              </TableHead>
              {COLUMNS.map((column) => {
                const active = sort.key === column.key
                return (
                  <TableHead
                    key={column.key}
                    className={column.className}
                    aria-sort={
                      active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"
                    }
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      className="inline-flex items-center gap-1 text-left"
                    >
                      {column.label}
                      <span aria-hidden="true" className={active ? "opacity-100" : "opacity-30"}>
                        {active && sort.direction === "asc" ? "▲" : "▼"}
                      </span>
                    </button>
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLUMNS.length + 1} className="py-10 text-center text-[var(--muted-foreground)]">
                  No contacts match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell>
                  <button
                    type="button"
                    onClick={() => void toggleFavorite(contact)}
                    disabled={pendingContactId === contact.id}
                    aria-pressed={contact.isFavorite}
                    aria-label={
                      contact.isFavorite
                        ? `Remove ${contact.name} from favorites`
                        : `Add ${contact.name} to favorites`
                    }
                    className="text-lg leading-none text-[var(--program-accent)] disabled:opacity-40"
                  >
                    {contact.isFavorite ? "★" : "☆"}
                  </button>
                </TableCell>
                <TableCell className="font-medium text-[var(--program-text)]">{contact.name}</TableCell>
                  <TableCell>{contact.phone || "—"}</TableCell>
                  <TableCell>
                    {contact.locationIds.length === 0
                      ? "—"
                      : contact.locationIds.map((id) => locationNameById.get(id) ?? id).join(", ")}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">{contact.totalAttendanceCount}</TableCell>
                  <TableCell className="font-mono tabular-nums">{contact.past60DayAttendanceCount}</TableCell>
                  <TableCell>{contact.lastContactedOn ?? "—"}</TableCell>
                  <TableCell className="max-w-[18rem] whitespace-normal text-[var(--muted-foreground)]">
                    {contact.notes ?? "—"}
                  </TableCell>
                  <TableCell>
                    {contact.collectedById ? (payload.staffNames[contact.collectedById] ?? "—") : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}