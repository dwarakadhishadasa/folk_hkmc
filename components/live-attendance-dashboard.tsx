"use client"

import { useState, useEffect, useCallback } from "react"

interface AttendanceRecord {
  id: string
  mobile: string
  userName: string
  createdAt: string
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

function getBackgroundColor(index: number): string {
  return backgroundColors[index % backgroundColors.length]
}

export function LiveAttendanceDashboard() {
  const [attendanceList, setAttendanceList] = useState<AttendanceRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [origin, setOrigin] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const fetchAttendance = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const today = new Date().toISOString().split("T")[0]
      const res = await fetch(`/attendance?date=${today}&t=${Date.now()}`, {
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
  }, [])

  useEffect(() => {
    fetchAttendance()
    const interval = setInterval(fetchAttendance, 20000)
    return () => clearInterval(interval)
  }, [fetchAttendance])

  const todayFormatted = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  const qrCodeUrl = origin
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(origin + "/attend")}`
    : ""

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#24324A] font-[family-name:var(--font-poppins)]">
            Live Attendance
          </h1>
          <p className="text-[#24324A]/70 text-sm">{todayFormatted}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-full text-sm font-medium">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            Live
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* QR Code Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-[#0F1E54] to-[#1a2d6d] px-6 py-4 text-white">
            <h2 className="text-lg font-semibold font-[family-name:var(--font-poppins)]">Attendance QR Code</h2>
            <p className="text-white/70 text-sm">Show this QR to members for quick check-in</p>
          </div>
          <div className="p-6 flex flex-col items-center">
            <div className="bg-white p-4 rounded-2xl shadow-inner border-2 border-gray-100">
              {qrCodeUrl ? (
                <img
                  src={qrCodeUrl || "/placeholder.svg"}
                  alt="Attendance QR Code"
                  width={220}
                  height={220}
                  className="rounded-lg"
                />
              ) : (
                <div className="w-[220px] h-[220px] flex items-center justify-center bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-400">Loading QR...</span>
                </div>
              )}
            </div>
            <div className="mt-4 text-center">
              <span className="inline-block bg-[#0F1E54]/5 text-[#0F1E54] px-4 py-2 rounded-full text-sm font-medium">
                FOLK Chennai Attendance
              </span>
              <p className="text-xs text-[#24324A]/50 mt-2 break-all max-w-[250px]">
                {origin ? `${origin}/attend` : "Generating URL..."}
              </p>
            </div>
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
