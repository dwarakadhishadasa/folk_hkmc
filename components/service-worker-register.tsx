"use client"

import { useEffect } from "react"

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return
    if (!("serviceWorker" in navigator)) return

    // Only register service worker in secure contexts (HTTPS or localhost)
    const isSecureContext =
      window.isSecureContext || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"

    if (!isSecureContext) {
      console.log("[v0] Skipping Service Worker registration - not a secure context")
      return
    }

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log("[v0] Service Worker registered successfully:", registration.scope)
      })
      .catch((error) => {
        // Silently handle registration failures in preview environments
        console.log("[v0] Service Worker registration skipped:", error.message)
      })
  }, [])

  return null
}
