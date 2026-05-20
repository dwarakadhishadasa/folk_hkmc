"use client"

import { useCallback, useEffect, useState } from "react"

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)

  const sendServiceWorkerMessage = useCallback(async (type: "GET_PENDING_COUNT" | "SYNC_QUEUE") => {
    if (!("serviceWorker" in navigator)) return null

    const registration = await navigator.serviceWorker.ready
    const worker = registration.active || navigator.serviceWorker.controller
    if (!worker) return null

    const messageChannel = new MessageChannel()

    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        reject(new Error("Service worker did not respond."))
      }, 5000)

      messageChannel.port1.onmessage = (event) => {
        window.clearTimeout(timeoutId)
        resolve((event.data ?? {}) as Record<string, unknown>)
      }

      worker.postMessage({ type }, [messageChannel.port2])
    })
  }, [])

  const checkPendingRequests = useCallback(async () => {
    if ("serviceWorker" in navigator) {
      try {
        const data = await sendServiceWorkerMessage("GET_PENDING_COUNT")
        if (typeof data?.count === "number") {
          setPendingCount(data.count)
        }
      } catch (error) {
        console.error("[v0] Failed to check pending requests:", error)
      }
    }
  }, [sendServiceWorkerMessage])

  const syncQueuedRequests = useCallback(async () => {
    if ("serviceWorker" in navigator) {
      try {
        const data = await sendServiceWorkerMessage("SYNC_QUEUE")
        console.log("[v0] Sync result:", data)
        if (typeof data?.count === "number") {
          setPendingCount(data.count)
          return
        }
      } catch (error) {
        console.error("[v0] Failed to sync:", error)
      }
    }

    void checkPendingRequests()
  }, [checkPendingRequests, sendServiceWorkerMessage])

  useEffect(() => {
    const updateOnlineStatus = () => {
      setIsOnline(navigator.onLine)
      console.log("[v0] Online status:", navigator.onLine)
    }

    updateOnlineStatus()
    window.addEventListener("online", updateOnlineStatus)
    window.addEventListener("offline", updateOnlineStatus)

    return () => {
      window.removeEventListener("online", updateOnlineStatus)
      window.removeEventListener("offline", updateOnlineStatus)
    }
  }, [])

  useEffect(() => {
    const refreshWhenOnline = () => {
      if (navigator.onLine) {
        void syncQueuedRequests()
        return
      }

      void checkPendingRequests()
    }

    const refreshWhenVisible = () => {
      if (!document.hidden) {
        if (navigator.onLine) {
          void syncQueuedRequests()
          return
        }

        void checkPendingRequests()
      }
    }

    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === "PENDING_COUNT_UPDATED" && typeof event.data.count === "number") {
        setPendingCount(event.data.count)
      }
    }

    if (navigator.onLine) {
      void syncQueuedRequests()
    } else {
      void checkPendingRequests()
    }
    window.addEventListener("online", refreshWhenOnline)
    document.addEventListener("visibilitychange", refreshWhenVisible)
    navigator.serviceWorker?.addEventListener("message", handleServiceWorkerMessage)

    return () => {
      window.removeEventListener("online", refreshWhenOnline)
      document.removeEventListener("visibilitychange", refreshWhenVisible)
      navigator.serviceWorker?.removeEventListener("message", handleServiceWorkerMessage)
    }
  }, [checkPendingRequests, syncQueuedRequests])

  const handleSync = async () => {
    await syncQueuedRequests()
  }

  if (isOnline && pendingCount === 0) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-auto z-50">
      <div className="flex items-center gap-3 bg-white border border-gray-300 rounded-lg shadow-lg p-3">
        {!isOnline ? (
          <>
            <span className="text-red-600">📵</span>
            <span className="text-sm font-medium">Offline Mode</span>
          </>
        ) : (
          <>
            <span className="text-blue-600">☁️</span>
            <span className="text-sm font-medium">{pendingCount} pending</span>
          </>
        )}
        {pendingCount > 0 && isOnline && (
          <button onClick={handleSync} className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">
            🔄 Sync Now
          </button>
        )}
      </div>
    </div>
  )
}
