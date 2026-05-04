// Offline data sync utility
// Stores submissions in localStorage when offline and syncs when online

interface OfflineRecord {
  id: string
  type: "registration" | "attendance" | "contact"
  data: Record<string, unknown>
  timestamp: number
}

const OFFLINE_STORAGE_KEY = "folk_offline_records"

export function getOfflineRecords(): OfflineRecord[] {
  if (typeof window === "undefined") return []
  const stored = localStorage.getItem(OFFLINE_STORAGE_KEY)
  return stored ? JSON.parse(stored) : []
}

export function saveOfflineRecord(type: OfflineRecord["type"], data: Record<string, unknown>): OfflineRecord {
  const record: OfflineRecord = {
    id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    data,
    timestamp: Date.now(),
  }

  const records = getOfflineRecords()
  records.push(record)
  localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(records))

  return record
}

export function removeOfflineRecord(id: string): void {
  const records = getOfflineRecords().filter((r) => r.id !== id)
  localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(records))
}

export function clearOfflineRecords(): void {
  localStorage.removeItem(OFFLINE_STORAGE_KEY)
}

export async function syncOfflineRecords(): Promise<{
  synced: number
  failed: number
}> {
  const records = getOfflineRecords()
  let synced = 0
  let failed = 0

  for (const record of records) {
    try {
      const endpoint = `/api/${record.type}`
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record.data),
      })

      if (response.ok) {
        removeOfflineRecord(record.id)
        synced++
      } else {
        failed++
      }
    } catch {
      failed++
    }
  }

  return { synced, failed }
}

export function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true
}
