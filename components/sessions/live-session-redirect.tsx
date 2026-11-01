"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { MAX_TIMEOUT_DELAY_MS } from "@/lib/sessions/format"

/**
 * The live dashboard is the live session's screen; the design's detail screen
 * takes over when the window closes. One timer at `attendance_closes_at`
 * replaces the URL with the completed session, so a dashboard left open does
 * not sit on a dead QR code.
 */
export function LiveSessionRedirect({
  sessionId,
  closesAt,
}: {
  sessionId: string
  closesAt: string | null
}) {
  const router = useRouter()

  useEffect(() => {
    if (!closesAt) {
      return
    }

    const target = Date.parse(closesAt)
    if (!Number.isFinite(target)) {
      return
    }

    const delay = Math.min(Math.max(target - Date.now() + 100, 0), MAX_TIMEOUT_DELAY_MS)
    const timer = window.setTimeout(() => router.replace(`/sessions/${sessionId}`), delay)

    return () => window.clearTimeout(timer)
  }, [closesAt, router, sessionId])

  return null
}
