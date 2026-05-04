"use client"

import { useEffect, useState, createContext, useContext, type ReactNode } from "react"
import { syncOfflineRecords, getOfflineRecords, isOnline } from "@/lib/offline-sync"
import { useToast } from "@/hooks/use-toast"

interface OfflineSyncContextType {
  isOnline: boolean
  pendingCount: number
  syncNow: () => Promise<void>
}

const OfflineSyncContext = createContext<OfflineSyncContextType | undefined>(undefined)

export function OfflineSyncProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)
  const { toast } = useToast()

  // Update pending count
  const updatePendingCount = () => {
    setPendingCount(getOfflineRecords().length)
  }

  // Sync pending records
  const syncNow = async () => {
    if (!isOnline()) return

    const { synced, failed } = await syncOfflineRecords()
    updatePendingCount()

    if (synced > 0) {
      toast({
        title: "Sync Complete",
        description: `${synced} record(s) synced successfully${failed > 0 ? `, ${failed} failed` : ""}`,
      })
    }
  }

  useEffect(() => {
    // Initial state
    setOnline(isOnline())
    updatePendingCount()

    // Online/offline event handlers
    const handleOnline = () => {
      setOnline(true)
      toast({
        title: "Back Online",
        description: "Syncing pending records...",
      })
      syncNow()
    }

    const handleOffline = () => {
      setOnline(false)
      toast({
        title: "You're Offline",
        description: "Data will be saved locally and synced when online.",
        variant: "destructive",
      })
    }

    // Storage event to track changes from forms
    const handleStorage = () => {
      updatePendingCount()
    }

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    window.addEventListener("storage", handleStorage)

    // Periodic check for pending records
    const interval = setInterval(() => {
      updatePendingCount()
      if (isOnline() && getOfflineRecords().length > 0) {
        syncNow()
      }
    }, 30000) // Check every 30 seconds

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
      window.removeEventListener("storage", handleStorage)
      clearInterval(interval)
    }
  }, [])

  return (
    <OfflineSyncContext.Provider value={{ isOnline: online, pendingCount, syncNow }}>
      {children}
    </OfflineSyncContext.Provider>
  )
}

export function useOfflineSync() {
  const context = useContext(OfflineSyncContext)
  if (context === undefined) {
    throw new Error("useOfflineSync must be used within an OfflineSyncProvider")
  }
  return context
}
