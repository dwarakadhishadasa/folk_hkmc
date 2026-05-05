"use client"

import type { FormEvent } from "react"
import { useEffect, useMemo, useState } from "react"
import { LiveAttendanceDashboard, type DashboardSessionContext } from "@/components/live-attendance-dashboard"

interface LocationOption {
  id: string
  name: string
}

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
  locationId: string
}

function readTime(value: string | null): number | null {
  if (!value) {
    return null
  }

  const time = Date.parse(value)
  return Number.isFinite(time) ? time : null
}

function isActiveSession(session: SessionSummary, now: number): boolean {
  const opensAt = readTime(session.attendanceOpensAt)
  const closesAt = readTime(session.attendanceClosesAt)

  if (!session.publicAttendanceEnabled || closesAt === null || closesAt <= now) {
    return false
  }

  return opensAt === null || opensAt <= now
}

function sessionStartTime(session: SessionSummary): number {
  return readTime(session.attendanceOpensAt) || readTime(session.sessionDate) || 0
}

export function SessionsManager({ locations }: { locations: LocationOption[] }) {
  const defaultLocationId = locations[0]?.id || ""
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState("")
  const [now, setNow] = useState(() => Date.now())
  const [form, setForm] = useState<SessionForm>({
    name: "",
    locationId: defaultLocationId,
  })

  const locationById = useMemo(() => new Map(locations.map((location) => [location.id, location.name])), [locations])

  const activeSession = useMemo(() => {
    return sessions
      .filter((session) => isActiveSession(session, now))
      .sort((left, right) => sessionStartTime(right) - sessionStartTime(left))[0]
  }, [sessions, now])

  const dashboardSession = useMemo<DashboardSessionContext | undefined>(() => {
    if (!activeSession) {
      return undefined
    }

    return {
      id: activeSession.id,
      name: activeSession.name,
      locationNames: activeSession.locationIds.map((locationId) => locationById.get(locationId) || locationId),
      attendanceClosesAt: activeSession.attendanceClosesAt,
      attendanceUrl: activeSession.attendanceUrl,
    }
  }, [activeSession, locationById])

  useEffect(() => {
    async function loadSessions() {
      setIsLoading(true)
      setMessage("")

      try {
        const response = await fetch("/api/sessions", { cache: "no-store" })
        const data = await response.json()

        if (response.ok) {
          setSessions(data.sessions || [])
        } else {
          setMessage(data.error || "Failed to load sessions.")
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Failed to load sessions.")
      } finally {
        setIsLoading(false)
      }
    }

    void loadSessions()
  }, [])

  useEffect(() => {
    setForm((current) => {
      if (locations.some((location) => location.id === current.locationId)) {
        return current
      }

      return { ...current, locationId: defaultLocationId }
    })
  }, [defaultLocationId, locations])

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  const handleSubmit = async (event: FormEvent) => {
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
        throw new Error(data.error || "Failed to start session.")
      }

      setSessions((current) => [data.session, ...current])
      setForm({ name: "", locationId: defaultLocationId })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to start session.")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <section className="rounded-2xl bg-white p-6 shadow-lg">
        <p className="text-sm font-medium text-[#24324A]/70">Loading session state...</p>
      </section>
    )
  }

  if (dashboardSession) {
    return <LiveAttendanceDashboard activeSession={dashboardSession} />
  }

  return (
    <section className="rounded-2xl bg-white p-6 shadow-lg">
      <div>
        <h1 className="font-[family-name:var(--font-poppins)] text-2xl font-bold text-[#24324A]">Start Session</h1>
        <p className="mt-1 text-sm text-[#24324A]/70">
          Start a two-hour attendance window for one location.
        </p>
      </div>

      {message && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {message}
        </div>
      )}

      {locations.length === 0 && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          No locations are available for this staff account.
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm font-medium text-[#24324A]">
          Session Name
          <input
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            required
            placeholder="Enter session name"
            className="w-full rounded-xl border-2 border-gray-200 px-4 py-3"
          />
        </label>

        <label className="space-y-1 text-sm font-medium text-[#24324A]">
          Location
          <select
            value={form.locationId}
            onChange={(event) => setForm((current) => ({ ...current, locationId: event.target.value }))}
            required
            disabled={locations.length === 0}
            className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 disabled:bg-gray-100 disabled:text-gray-500"
          >
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          disabled={isSubmitting || locations.length === 0}
          className="rounded-xl bg-[#F98B1C] px-5 py-3 font-semibold text-white disabled:bg-gray-300 md:col-span-2"
        >
          {isSubmitting ? "Starting..." : "Start Session"}
        </button>
      </form>
    </section>
  )
}
