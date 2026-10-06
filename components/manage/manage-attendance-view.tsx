"use client"

import { useMemo, useState } from "react"
import type { ManageAttendanceRecord, ManageContact, ManagePortalPayload } from "@/components/manage/manage-types"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type SortKey = "name" | "phone" | "attendance"
type Direction = "asc" | "desc"

export function ManageAttendanceView({ payload }: { payload: ManagePortalPayload }) {
  const [query, setQuery] = useState("")
  const [selectedLocations, setSelectedLocations] = useState<string[]>([])
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [direction, setDirection] = useState<Direction>("asc")
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)

  const locationNameById = useMemo(
    () => new Map(payload.locations.map((location) => [location.id, location.name])),
    [payload.locations],
  )

  const recordsByContact = useMemo(() => {
    const grouped = new Map<string, ManageAttendanceRecord[]>()
    for (const record of payload.attendance) {
      const bucket = grouped.get(record.contactId)
      if (bucket) {
        bucket.push(record)
      } else {
        grouped.set(record.contactId, [record])
      }
    }
    return grouped
  }, [payload.attendance])

  const contacts = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = payload.contacts.filter((contact) => {
      if (selectedLocations.length > 0 && !contact.locationIds.some((id) => selectedLocations.includes(id))) {
        return false
      }

      if (!needle) {
        return true
      }

      return `${contact.name} ${contact.phone}`.toLowerCase().includes(needle)
    })

    return [...filtered].sort((left, right) => {
      let comparison = 0
      if (sortKey === "attendance") {
        comparison =
          (recordsByContact.get(left.id)?.length ?? 0) - (recordsByContact.get(right.id)?.length ?? 0)
      } else {
        comparison = left[sortKey].localeCompare(right[sortKey], "en", { sensitivity: "base", numeric: true })
      }

      return direction === "asc" ? comparison : -comparison
    })
  }, [direction, payload.contacts, query, recordsByContact, selectedLocations, sortKey])

  const selectedContact: ManageContact | null =
    payload.contacts.find((contact) => contact.id === selectedContactId) ?? null

  const selectedRecords = useMemo(() => {
    if (!selectedContactId) {
      return []
    }

    return [...(recordsByContact.get(selectedContactId) ?? [])].sort((left, right) => {
      const leftTime = left.sessionDate ? Date.parse(left.sessionDate) : Number.NaN
      const rightTime = right.sessionDate ? Date.parse(right.sessionDate) : Number.NaN
      const leftValue = Number.isFinite(leftTime) ? leftTime : 0
      const rightValue = Number.isFinite(rightTime) ? rightTime : 0
      return rightValue - leftValue
    })
  }, [recordsByContact, selectedContactId])

  const toggleLocation = (locationId: string) => {
    setSelectedLocations((current) =>
      current.includes(locationId)
        ? current.filter((id) => id !== locationId)
        : [...current, locationId],
    )
  }

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }

    setSortKey(key)
    setDirection("asc")
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-card shadow-[0_18px_50px_rgba(45,10,10,0.08)]">
        <div className="bg-[var(--program-primary)] px-5 py-4 text-white">
          <h2 className="font-[family-name:var(--font-poppins)] text-lg font-semibold">Attendance</h2>
          <p className="text-sm text-white/70">
            Filter by location, pick a contact, then read its session history.
          </p>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {payload.locations.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">No locations in scope.</p>
              ) : (
                payload.locations.map((location) => {
                  const active = selectedLocations.includes(location.id)
                  return (
                    <button
                      key={location.id}
                      type="button"
                      onClick={() => toggleLocation(location.id)}
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
                })
              )}
              {selectedLocations.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setSelectedLocations([])}
                  className="rounded-full border border-[var(--border)] px-4 py-1.5 text-sm font-semibold text-[var(--muted-foreground)] transition-colors hover:bg-black/5"
                >
                  Clear
                </button>
              ) : null}
            </div>

            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name or phone"
              aria-label="Search contacts"
              className="lg:w-64"
            />
          </div>

          <p className="text-sm text-[var(--muted-foreground)]">
            {contacts.length.toLocaleString("en-IN")} contacts listed
          </p>
        </div>

        <div className="max-h-[60vh] overflow-y-auto border-t border-[var(--border)]">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead>
                  <button
                    type="button"
                    onClick={() => toggleSort("name")}
                    className="inline-flex items-center gap-1 text-left"
                  >
                    Name
                    <span aria-hidden="true" className={sortKey === "name" ? "opacity-100" : "opacity-30"}>
                      {sortKey === "name" && direction === "asc" ? "▲" : "▼"}
                    </span>
                  </button>
                </TableHead>
                <TableHead>
                  <button
                    type="button"
                    onClick={() => toggleSort("phone")}
                    className="inline-flex items-center gap-1 text-left"
                  >
                    Phone
                    <span aria-hidden="true" className={sortKey === "phone" ? "opacity-100" : "opacity-30"}>
                      {sortKey === "phone" && direction === "asc" ? "▲" : "▼"}
                    </span>
                  </button>
                </TableHead>
                <TableHead>
                  <button
                    type="button"
                    onClick={() => toggleSort("attendance")}
                    className="inline-flex items-center gap-1 text-left"
                  >
                    Sessions
                    <span aria-hidden="true" className={sortKey === "attendance" ? "opacity-100" : "opacity-30"}>
                      {sortKey === "attendance" && direction === "asc" ? "▲" : "▼"}
                    </span>
                  </button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-10 text-center text-[var(--muted-foreground)]">
                    No contacts match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                contacts.map((contact) => (
                  <TableRow
                    key={contact.id}
                    data-state={contact.id === selectedContactId ? "selected" : undefined}
                    onClick={() => setSelectedContactId(contact.id)}
                    className="cursor-pointer"
                  >
                    <TableCell className="font-medium text-[var(--program-text)]">{contact.name}</TableCell>
                    <TableCell>{contact.phone || "—"}</TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {(recordsByContact.get(contact.id)?.length ?? 0).toLocaleString("en-IN")}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      {selectedContact ? (
        <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-card shadow-[0_18px_50px_rgba(45,10,10,0.08)]">
          <div className="flex flex-col gap-2 bg-[var(--program-primary)] px-5 py-4 text-white sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-[family-name:var(--font-poppins)] text-lg font-semibold">
                {selectedContact.name}
              </h3>
              <p className="text-sm text-white/70">
                {selectedContact.phone || "No phone"} ·{" "}
                {selectedContact.locationIds.length > 0
                  ? selectedContact.locationIds.map((id) => locationNameById.get(id) ?? id).join(", ")
                  : "No location"}
              </p>
            </div>
            <Badge variant="secondary">
              {selectedContact.past60DayAttendanceCount} in the past 60 days
            </Badge>
          </div>

          <div className="p-5">
            <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
              Records
            </h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Session</TableHead>
                  <TableHead>Session Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="py-8 text-center text-[var(--muted-foreground)]">
                      No attendance records for this contact.
                    </TableCell>
                  </TableRow>
                ) : (
                  selectedRecords.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>{record.sessionName ?? "Untitled session"}</TableCell>
                      <TableCell>{record.sessionDate ?? "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : (
        <p className="rounded-lg border border-[var(--border)] bg-card px-5 py-8 text-center text-sm text-[var(--muted-foreground)]">
          Select a contact to see its attendance records.
        </p>
      )}
    </div>
  )
}