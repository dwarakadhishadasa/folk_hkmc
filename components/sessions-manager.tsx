"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { QRCodeSVG } from "qrcode.react"

interface SessionSummary {
  id: string
  name: string
  sessionDate: string | null
  locationIds: string[]
  publicAttendanceEnabled: boolean
  attendanceOpensAt: string | null
  attendanceClosesAt: string | null
  attendanceUrl: string | null
}

interface SessionForm {
  name: string
  sessionDate: string
  locationId: string
  publicAttendanceEnabled: boolean
  attendanceOpensAt: string
  attendanceClosesAt: string
}

export function SessionsManager({ locationIds }: { locationIds: string[] }) {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState("")
  const [form, setForm] = useState<SessionForm>({
    name: "",
    sessionDate: "",
    locationId: locationIds[0] || "",
    publicAttendanceEnabled: true,
    attendanceOpensAt: "",
    attendanceClosesAt: "",
  })

  async function loadSessions() {
    setIsLoading(true)
    setMessage("")
    const response = await fetch("/api/sessions", { cache: "no-store" })
    const data = await response.json()
    if (response.ok) {
      setSessions(data.sessions || [])
    } else {
      setMessage(data.error || "Failed to load sessions.")
    }
    setIsLoading(false)
  }

  useEffect(() => {
    loadSessions()
  }, [])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsSubmitting(true)
    setMessage("")

    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to create session.")
      }

      setSessions((current) => [data.session, ...current])
      setForm({
        name: "",
        sessionDate: "",
        locationId: locationIds[0] || "",
        publicAttendanceEnabled: true,
        attendanceOpensAt: "",
        attendanceClosesAt: "",
      })
      setMessage("Session created with a session-specific attendance link.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create session.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-6 shadow-lg">
        <h1 className="font-[family-name:var(--font-poppins)] text-2xl font-bold text-[#24324A]">
          Session Management
        </h1>
        <p className="mt-1 text-sm text-[#24324A]/70">Create sessions and share their attendance QR links.</p>

        {message && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm font-medium text-[#24324A]">
            Session Name
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              required
              className="w-full rounded-xl border-2 border-gray-200 px-4 py-3"
            />
          </label>

          <label className="space-y-1 text-sm font-medium text-[#24324A]">
            Session Date
            <input
              type="datetime-local"
              value={form.sessionDate}
              onChange={(event) => setForm((current) => ({ ...current, sessionDate: event.target.value }))}
              required
              className="w-full rounded-xl border-2 border-gray-200 px-4 py-3"
            />
          </label>

          <label className="space-y-1 text-sm font-medium text-[#24324A]">
            Location Record ID
            {locationIds.length > 0 ? (
              <select
                value={form.locationId}
                onChange={(event) => setForm((current) => ({ ...current, locationId: event.target.value }))}
                required
                className="w-full rounded-xl border-2 border-gray-200 px-4 py-3"
              >
                {locationIds.map((locationId) => (
                  <option key={locationId} value={locationId}>
                    {locationId}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={form.locationId}
                onChange={(event) => setForm((current) => ({ ...current, locationId: event.target.value }))}
                required
                placeholder="rec..."
                className="w-full rounded-xl border-2 border-gray-200 px-4 py-3"
              />
            )}
          </label>

          <label className="flex items-center gap-3 self-end rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-[#24324A]">
            <input
              type="checkbox"
              checked={form.publicAttendanceEnabled}
              onChange={(event) =>
                setForm((current) => ({ ...current, publicAttendanceEnabled: event.target.checked }))
              }
              className="h-5 w-5"
            />
            Public attendance enabled
          </label>

          <label className="space-y-1 text-sm font-medium text-[#24324A]">
            Opens At
            <input
              type="datetime-local"
              value={form.attendanceOpensAt}
              onChange={(event) => setForm((current) => ({ ...current, attendanceOpensAt: event.target.value }))}
              className="w-full rounded-xl border-2 border-gray-200 px-4 py-3"
            />
          </label>

          <label className="space-y-1 text-sm font-medium text-[#24324A]">
            Closes At
            <input
              type="datetime-local"
              value={form.attendanceClosesAt}
              onChange={(event) => setForm((current) => ({ ...current, attendanceClosesAt: event.target.value }))}
              className="w-full rounded-xl border-2 border-gray-200 px-4 py-3"
            />
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-xl bg-[#F98B1C] px-5 py-3 font-semibold text-white disabled:bg-gray-300 md:col-span-2"
          >
            {isSubmitting ? "Creating..." : "Create Session"}
          </button>
        </form>
      </section>

      <section className="space-y-3">
        {isLoading && <div className="rounded-2xl bg-white p-6 shadow-lg">Loading sessions...</div>}
        {!isLoading &&
          sessions.map((session) => (
            <article key={session.id} className="rounded-2xl bg-white p-5 shadow-lg">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="font-[family-name:var(--font-poppins)] text-lg font-semibold text-[#24324A]">
                    {session.name}
                  </h2>
                  <p className="text-sm text-[#24324A]/60">{session.sessionDate || "No date set"}</p>
                  <p className="mt-1 text-xs text-[#24324A]/50">Location: {session.locationIds.join(", ") || "None"}</p>
                  <p className="mt-1 text-xs font-medium text-[#24324A]">
                    {session.publicAttendanceEnabled ? "Attendance enabled" : "Attendance disabled"}
                  </p>
                </div>
                {session.attendanceUrl && (
                  <div className="flex items-center gap-4">
                    <QRCodeSVG value={session.attendanceUrl} size={96} />
                    <a className="max-w-[220px] break-all text-xs text-blue-700" href={session.attendanceUrl}>
                      {session.attendanceUrl}
                    </a>
                  </div>
                )}
              </div>
            </article>
          ))}
      </section>
    </div>
  )
}
