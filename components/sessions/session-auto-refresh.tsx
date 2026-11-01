"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { MAX_TIMEOUT_DELAY_MS, nextSessionBoundary } from "@/lib/sessions/format"

/**
 * Arms one timer at the nearest open/close boundary in the rendered rows and
 * re-arms after each refresh, so a page left open flips `Upcoming` and
 * `Live now` without a reload. No row is written: the status is derived on
 * every server render.
 *
 * `boundaries` is a JSON string rather than an array so the effect can depend
 * on its content instead of a new array identity each render.
 */
export function SessionsAutoRefresh({ boundaries }: { boundaries: string }) {
  const router = useRouter()

  useEffect(() => {
    let rows: Array<{ opensAt: string | null; closesAt: string | null }>

    try {
      rows = JSON.parse(boundaries) as Array<{ opensAt: string | null; closesAt: string | null }>
    } catch {
      return
    }

    const boundary = nextSessionBoundary(rows, Date.now())
    if (boundary === null) {
      return
    }

    const delay = Math.min(Math.max(boundary - Date.now() + 50, 0), MAX_TIMEOUT_DELAY_MS)
    const timer = window.setTimeout(() => router.refresh(), delay)

    return () => window.clearTimeout(timer)
  }, [boundaries, router])

  return null
}
