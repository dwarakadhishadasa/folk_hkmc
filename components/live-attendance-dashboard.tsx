"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Copy, Share2 } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"

interface AttendanceRecord {
  id: string
  mobile: string
  userName: string
  createdAt: string
}

export interface DashboardSessionContext {
  id: string
  name: string
  locationNames: string[]
  attendanceClosesAt: string | null
  attendanceUrl: string | null
}

const backgroundColors = [
  "bg-blue-50",
  "bg-green-50",
  "bg-amber-50",
  "bg-pink-50",
  "bg-purple-50",
  "bg-cyan-50",
  "bg-orange-50",
  "bg-rose-50",
  "bg-indigo-50",
  "bg-teal-50",
]

const MAX_TIMEOUT_DELAY_MS = 2_147_483_647

function getBackgroundColor(index: number): string {
  return backgroundColors[index % backgroundColors.length]
}

export function LiveAttendanceDashboard({ activeSession }: { activeSession?: DashboardSessionContext }) {
  const [attendanceList, setAttendanceList] = useState<AttendanceRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [shareMessage, setShareMessage] = useState<string | null>(null)
  const [timeSignal, setTimeSignal] = useState(() => Date.now())
  const attendanceIdsRef = useRef<string[]>([])

  const activeSessionExpiresAt = activeSession?.attendanceClosesAt ? Date.parse(activeSession.attendanceClosesAt) : null
  const hasActiveSession =
    Boolean(activeSession) &&
    activeSessionExpiresAt !== null &&
    Number.isFinite(activeSessionExpiresAt) &&
    activeSessionExpiresAt > timeSignal
  const activeSessionId = hasActiveSession && activeSession ? activeSession.id : ""

  useEffect(() => {
    if (!activeSession?.attendanceClosesAt || activeSessionExpiresAt === null || !Number.isFinite(activeSessionExpiresAt)) {
      return
    }

    const delay = Math.min(Math.max(activeSessionExpiresAt - Date.now() + 50, 0), MAX_TIMEOUT_DELAY_MS)
    const timeout = window.setTimeout(() => setTimeSignal(Date.now()), delay)
    return () => window.clearTimeout(timeout)
  }, [activeSession?.attendanceClosesAt, activeSessionExpiresAt])

  useEffect(() => {
    setAttendanceList([])
    setLastRefresh(null)
  }, [activeSessionId])

  useEffect(() => {
    attendanceIdsRef.current = attendanceList.map((record) => record.id)
  }, [attendanceList])

  const fetchAttendance = useCallback(async () => {
    if (!activeSessionId || document.hidden) {
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const attendanceUrl = new URL("/attendance", window.location.origin)
      attendanceUrl.searchParams.set("session", activeSessionId)
      attendanceUrl.searchParams.set("t", String(Date.now()))

      const knownAttendanceIds = attendanceIdsRef.current.slice(-100)
      if (knownAttendanceIds.length > 0) {
        attendanceUrl.searchParams.set("knownAttendanceIds", knownAttendanceIds.join(","))
      }

      const res = await fetch(attendanceUrl, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      })

      if (res.ok) {
        const data = await res.json()
        setAttendanceList((prevList) => {
          const newRecords = data as AttendanceRecord[]
          const existingIds = new Set(prevList.map((r) => r.id))
          const addedRecords = newRecords.filter((r) => !existingIds.has(r.id))
          return [...prevList, ...addedRecords]
        })
        setLastRefresh(new Date())
      } else {
        const errorText = await res.text()
        setError(`Failed to fetch: ${res.status}`)
        console.error("[v0] Dashboard fetch error:", errorText)
      }
    } catch (err) {
      setError(`Error: ${err}`)
      console.error("[v0] Failed to fetch attendance:", err)
    } finally {
      setIsLoading(false)
    }
  }, [activeSessionId])

  useEffect(() => {
    if (!activeSessionId) {
      return
    }

    fetchAttendance()
    const interval = setInterval(fetchAttendance, 20000)
    return () => clearInterval(interval)
  }, [activeSessionId, fetchAttendance])

  useEffect(() => {
    if (!activeSessionId) {
      return
    }

    function refreshWhenVisible() {
      if (!document.hidden) {
        fetchAttendance()
      }
    }

    document.addEventListener("visibilitychange", refreshWhenVisible)
    return () => document.removeEventListener("visibilitychange", refreshWhenVisible)
  }, [activeSessionId, fetchAttendance])

  const attendanceLink = hasActiveSession && activeSession?.attendanceUrl ? activeSession.attendanceUrl : ""
  const activeSessionName = activeSession?.name.trim()
  const sessionSubtitle = hasActiveSession && activeSessionName ? activeSessionName : "No active session"

  const copyAttendanceLink = async () => {
    if (!attendanceLink) {
      return
    }

    await navigator.clipboard.writeText(attendanceLink)
    setShareMessage("Attendance link copied.")
  }

  const shareAttendanceLink = async () => {
    if (!attendanceLink) {
      return
    }

    if (navigator.share) {
      await navigator.share({
        title: activeSessionName || "Attendance",
        text: "Mark attendance using this session link.",
        url: attendanceLink,
      })
      setShareMessage("Attendance link shared.")
      return
    }

    await copyAttendanceLink()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#24324A] font-[family-name:var(--font-poppins)]">
            Live Attendance
          </h1>
          <p className="text-[#24324A]/70 text-sm">{sessionSubtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-full text-sm font-medium">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            Live
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-[#0F1E54] to-[#1a2d6d] px-6 py-4 text-white">
            <h2 className="text-lg font-semibold font-[family-name:var(--font-poppins)]">Attendance QR Code</h2>
            <p className="text-white/70 text-sm">Show this QR to members for quick check-in</p>
          </div>
          <div className="flex min-h-[356px] flex-col items-center justify-center p-6">
            {attendanceLink ? (
              <>
                <div className="rounded-2xl border-2 border-gray-100 bg-white p-4 shadow-inner">
                  <QRCodeSVG value={attendanceLink} size={220} className="rounded-lg" />
                </div>
                <div className="mt-4 text-center">
                  <span className="inline-block rounded-full bg-[#0F1E54]/5 px-4 py-2 text-sm font-medium text-[#0F1E54]">
                    FOLK Chennai Attendance
                  </span>
                  <p className="mt-2 max-w-[250px] break-all text-xs text-[#24324A]/50">{attendanceLink}</p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={copyAttendanceLink}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#0F1E54]/15 px-3 text-sm font-semibold text-[#0F1E54] transition-colors hover:bg-[#0F1E54]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F98B1C]"
                    >
                      <Copy className="h-4 w-4" aria-hidden="true" />
                      Copy
                    </button>
                    <button
                      type="button"
                      onClick={shareAttendanceLink}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#F98B1C] px-3 text-sm font-semibold text-white transition-colors hover:bg-[#e07a10] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F1E54]"
                    >
                      <Share2 className="h-4 w-4" aria-hidden="true" />
                      Share
                    </button>
                  </div>
                  {shareMessage && (
                    <p className="mt-3 text-xs font-medium text-green-700" role="status">
                      {shareMessage}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="max-w-sm text-center">
                <p className="text-sm font-medium text-[#24324A]">No active attendance QR code</p>
                <p className="mt-2 text-sm text-[#24324A]/60">
                  Start a session to generate a session-specific attendance link and QR code.
                </p>
                <a
                  href="/sessions"
                  className="mt-4 inline-flex rounded-xl bg-[#0F1E54] px-5 py-3 text-sm font-semibold text-white"
                >
                  Open Sessions
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Attendance List Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-[#0F1E54] to-[#1a2d6d] px-6 py-4 text-white">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold font-[family-name:var(--font-poppins)] flex items-center gap-2">
                  {"Today's Attendance"}
                  <span className="inline-block bg-[#F98B1C] text-white px-2.5 py-0.5 rounded-full text-xs font-bold">
                    {attendanceList.length}
                  </span>
                </h2>
                <p className="text-white/70 text-sm">Live updates from Airtable</p>
              </div>
              <button
                onClick={fetchAttendance}
                disabled={isLoading}
                className="px-4 py-2 text-sm bg-white/10 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50"
              >
                {isLoading ? "..." : "Refresh"}
              </button>
            </div>
            {lastRefresh && (
              <p className="text-xs text-white/50 mt-2">Last updated: {lastRefresh.toLocaleTimeString()}</p>
            )}
            {error && <p className="text-xs text-red-300 mt-1">{error}</p>}
          </div>
          <div className="p-4">
            {attendanceList.length === 0 ? (
              <div className="text-center py-12 text-[#24324A]/50">
                <div className="text-5xl mb-3 opacity-30">📋</div>
                <p className="font-medium">No attendance recorded yet</p>
                <p className="text-xs mt-1">Attendance will appear here in real-time</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {attendanceList.map((record, index) => (
                  <div
                    key={record.id}
                    className={`flex items-center justify-between p-3 ${getBackgroundColor(index)} rounded-xl transition-all hover:scale-[1.01]`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex items-center justify-center h-9 w-9 rounded-full bg-[#0F1E54] text-white text-sm font-bold">
                        {index + 1}
                      </span>
                      <div>
                        <p className="font-medium text-[#24324A]">{record.userName}</p>
                        <p className="text-xs text-[#24324A]/60">{record.mobile}</p>
                      </div>
                    </div>
                    <span className="text-xs text-[#24324A]/40">
                      {new Date(record.createdAt).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
