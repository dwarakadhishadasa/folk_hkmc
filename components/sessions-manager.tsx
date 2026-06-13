"use client"

import type { FormEvent } from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { LiveAttendanceDashboard, type DashboardSessionContext } from "@/components/live-attendance-dashboard"
import { gsap, useGSAP } from "@/lib/gsap"

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
  durationMinutes: string
}

const DEFAULT_SESSION_DURATION_MINUTES = "15"
const MAX_SESSION_DURATION_MINUTES = 24 * 60

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

function nextSessionBoundary(sessions: SessionSummary[], now: number): number | null {
  const futureBoundaries = sessions.flatMap((session) =>
    [readTime(session.attendanceOpensAt), readTime(session.attendanceClosesAt)].filter(
      (time): time is number => time !== null && time > now,
    ),
  )

  return futureBoundaries.length > 0 ? Math.min(...futureBoundaries) : null
}

const MAX_TIMEOUT_DELAY_MS = 2_147_483_647

const SESSION_LOADING_ROWS = [
  { titleWidth: "w-44 sm:w-64", metaWidth: "w-28 sm:w-40", pillWidth: "w-16" },
  { titleWidth: "w-56 sm:w-80", metaWidth: "w-36 sm:w-52", pillWidth: "w-20" },
  { titleWidth: "w-48 sm:w-72", metaWidth: "w-24 sm:w-44", pillWidth: "w-14" },
]

function LoadingBar({ className }: { className: string }) {
  return (
    <span className={`relative block overflow-hidden rounded-full bg-black/5 ${className}`}>
      <span
        data-session-loader-shimmer
        className="absolute inset-y-0 left-0 w-1/2 rounded-full bg-gradient-to-r from-transparent via-white/90 to-transparent"
      />
    </span>
  )
}

function SessionsLoadingState() {
  const containerRef = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const root = containerRef.current

      if (!root) {
        return
      }

      const rows = gsap.utils.toArray<HTMLElement>("[data-session-loader-row]", root)
      const dots = gsap.utils.toArray<HTMLElement>("[data-session-loader-dot]", root)
      const shimmers = gsap.utils.toArray<HTMLElement>("[data-session-loader-shimmer]", root)
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

      if (prefersReducedMotion) {
        gsap.set(rows, { autoAlpha: 1, y: 0 })
        gsap.set(shimmers, { autoAlpha: 0.45, xPercent: 0 })
        return
      }

      gsap.fromTo(
        rows,
        { autoAlpha: 0, y: 8 },
        { autoAlpha: 1, y: 0, duration: 0.28, ease: "power2.out", stagger: 0.08 },
      )
      gsap.fromTo(
        dots,
        { scale: 0.86, autoAlpha: 0.72 },
        { scale: 1, autoAlpha: 1, duration: 0.75, ease: "sine.inOut", repeat: -1, yoyo: true, stagger: 0.12 },
      )
      gsap.fromTo(
        shimmers,
        { xPercent: -135 },
        { xPercent: 235, duration: 1.35, ease: "none", repeat: -1, stagger: 0.08 },
      )
    },
    { scope: containerRef },
  )

  return (
    <section
      ref={containerRef}
      aria-busy="true"
      aria-live="polite"
      className="mx-auto max-w-5xl rounded-2xl bg-white p-6 shadow-lg"
    >
      <span className="sr-only" role="status">
        Loading sessions...
      </span>
      <div className="space-y-4">
        {SESSION_LOADING_ROWS.map((row, index) => (
          <div
            key={index}
            data-session-loader-row
            className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-xl border border-black/10 bg-[#FFF9F0]/70 px-4 py-3 opacity-0"
          >
            <span
              data-session-loader-dot
              className="h-8 w-8 rounded-full bg-[#FFF3DF] ring-1 ring-[var(--program-accent)]"
              aria-hidden="true"
            />
            <span className="min-w-0 space-y-2">
              <LoadingBar className={`h-3 max-w-full ${row.titleWidth}`} />
              <LoadingBar className={`h-2.5 max-w-full ${row.metaWidth}`} />
            </span>
            <LoadingBar className={`hidden h-6 ${row.pillWidth} sm:block`} />
          </div>
        ))}
      </div>
    </section>
  )
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
    durationMinutes: DEFAULT_SESSION_DURATION_MINUTES,
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
          setNow(Date.now())
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
    const boundary = nextSessionBoundary(sessions, Date.now())
    if (boundary === null) {
      return
    }

    const delay = Math.min(Math.max(boundary - Date.now() + 50, 0), MAX_TIMEOUT_DELAY_MS)
    const timeout = window.setTimeout(() => setNow(Date.now()), delay)
    return () => window.clearTimeout(timeout)
  }, [sessions, now])

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
      setNow(Date.now())
      setForm({ name: "", locationId: defaultLocationId, durationMinutes: DEFAULT_SESSION_DURATION_MINUTES })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to start session.")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return <SessionsLoadingState />
  }

  if (dashboardSession) {
    return <LiveAttendanceDashboard activeSession={dashboardSession} />
  }

  return (
    <section className="mx-auto max-w-5xl rounded-2xl bg-white p-6 shadow-lg">
      <div>
        <h1 className="font-[family-name:var(--font-poppins)] text-2xl font-bold text-[#24324A]">Start Session</h1>
        <p className="mt-1 text-sm text-[#24324A]/70">
          Start an attendance window for one location.
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

      <form onSubmit={handleSubmit} className="mt-6 grid gap-4 md:grid-cols-3">
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

        <label className="space-y-1 text-sm font-medium text-[#24324A]">
          Duration (minutes)
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_SESSION_DURATION_MINUTES}
            step={1}
            value={form.durationMinutes}
            onChange={(event) => setForm((current) => ({ ...current, durationMinutes: event.target.value }))}
            required
            className="w-full rounded-xl border-2 border-gray-200 px-4 py-3"
          />
        </label>

        <button
          type="submit"
          disabled={isSubmitting || locations.length === 0}
          className="rounded-xl bg-[var(--program-accent)] px-5 py-3 font-semibold text-white disabled:bg-gray-300 md:col-span-3"
        >
          {isSubmitting ? "Starting..." : "Start Session"}
        </button>
      </form>
    </section>
  )
}
