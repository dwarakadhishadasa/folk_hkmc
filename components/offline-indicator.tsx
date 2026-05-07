"use client"

import { useCallback, useEffect, useState } from "react"

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)

  const checkPendingRequests = useCallback(async () => {
    if ("serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready
        const messageChannel = new MessageChannel()

        messageChannel.port1.onmessage = (event) => {
          if (event.data && event.data.count !== undefined) {
            setPendingCount(event.data.count)
          }
        }

        registration.active?.postMessage({ type: "GET_PENDING_COUNT" }, [messageChannel.port2])
      } catch (error) {
        console.error("[v0] Failed to check pending requests:", error)
      }
    }
  }, [])

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
      void checkPendingRequests()
    }

    const refreshWhenVisible = () => {
      if (!document.hidden) {
        void checkPendingRequests()
      }
    }

    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === "PENDING_COUNT_UPDATED" && typeof event.data.count === "number") {
        setPendingCount(event.data.count)
      }
    }

    void checkPendingRequests()
    window.addEventListener("online", refreshWhenOnline)
    document.addEventListener("visibilitychange", refreshWhenVisible)
    navigator.serviceWorker?.addEventListener("message", handleServiceWorkerMessage)

    return () => {
      window.removeEventListener("online", refreshWhenOnline)
      document.removeEventListener("visibilitychange", refreshWhenVisible)
      navigator.serviceWorker?.removeEventListener("message", handleServiceWorkerMessage)
    }
  }, [checkPendingRequests])

  const handleSync = async () => {
    if ("serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready
        const messageChannel = new MessageChannel()

        messageChannel.port1.onmessage = (event) => {
          console.log("[v0] Sync result:", event.data)
          if (typeof event.data?.count === "number") {
            setPendingCount(event.data.count)
            return
          }
          void checkPendingRequests()
        }

        registration.active?.postMessage({ type: "SYNC_QUEUE" }, [messageChannel.port2])
      } catch (error) {
        console.error("[v0] Failed to sync:", error)
      }
    }
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
