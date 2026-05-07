const CACHE_NAME = "folk-chennai-v1"
const OFFLINE_URL = "/offline.html"
const DB_NAME = "folk-offline-db"
const DB_VERSION = 1
const STORE_NAME = "pending-requests"

const PRECACHE_ASSETS = [
  "/",
  "/attend",
  "/login",
  "/offline.html",
  "/manifest.json",
  "/icons/icon-192x192.jpg",
  "/icons/icon-512x512.jpg",
  "/icons/apple-touch-icon.jpg",
  "/images/folk-logo.png",
]

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true })
      }
    }
  })
}

async function addToQueue(url, method, body) {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, "readwrite")
  const store = tx.objectStore(STORE_NAME)

  await store.add({
    url,
    method,
    body,
    timestamp: Date.now(),
  })

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function getQueuedRequests() {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, "readonly")
  const store = tx.objectStore(STORE_NAME)

  return new Promise((resolve, reject) => {
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function removeFromQueue(id) {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, "readwrite")
  const store = tx.objectStore(STORE_NAME)

  await store.delete(id)

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function syncQueuedRequests() {
  const requests = await getQueuedRequests()

  for (const request of requests) {
    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: { "Content-Type": "application/json" },
        body: request.body,
      })

      if (response.ok || response.status === 409) {
        await removeFromQueue(request.id)
        console.log("[v0] Synced offline request:", request.url)
        await notifyPendingCount()
      }
    } catch (error) {
      console.error("[v0] Failed to sync request:", error)
    }
  }

  return notifyPendingCount()
}

async function getPendingCount() {
  try {
    const requests = await getQueuedRequests()
    return requests.length
  } catch {
    return 0
  }
}

async function notifyPendingCount() {
  const count = await getPendingCount()
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" })

  for (const client of clients) {
    client.postMessage({ type: "PENDING_COUNT_UPDATED", count })
  }

  return count
}

// Install event - cache essential assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((error) => {
        console.error("Failed to cache assets:", error)
      })
    }),
  )
  self.skipWaiting()
})

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))
    }),
  )
  self.clients.claim()
})

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url)

  // Handle public POST requests (registration, attendance) differently.
  // Staff contact writes are intentionally not queued because they need a live staff session.
  if (
    event.request.method === "POST" &&
    (url.pathname.includes("/registration") || url.pathname.includes("/attendance"))
  ) {
    event.respondWith(
      fetch(event.request.clone())
        .then((response) => response)
        .catch(async () => {
          // If offline, queue the request
          const body = await event.request.clone().text()
          await addToQueue(event.request.url, event.request.method, body)
          await notifyPendingCount()

          return new Response(
            JSON.stringify({
              success: false,
              queued: true,
              message: "Request queued for sync when online",
            }),
            {
              status: 202,
              headers: { "Content-Type": "application/json" },
            },
          )
        }),
    )
    return
  }

  // Skip non-GET requests
  if (event.request.method !== "GET") return

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone and cache successful responses
        if (response.status === 200) {
          const responseClone = response.clone()
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone)
          })
        }
        return response
      })
      .catch(async () => {
        // Try to get from cache
        const cachedResponse = await caches.match(event.request)
        if (cachedResponse) {
          return cachedResponse
        }
        // Return offline page for navigation requests
        if (event.request.mode === "navigate") {
          return caches.match(OFFLINE_URL)
        }
        return new Response("Offline", { status: 503 })
      }),
  )
})

self.addEventListener("sync", (event) => {
  if (event.tag === "sync-requests") {
    event.waitUntil(syncQueuedRequests())
  }
})

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "GET_PENDING_COUNT") {
    getPendingCount()
      .then((count) => {
        event.ports[0].postMessage({ count })
      })
      .catch(() => {
        event.ports[0].postMessage({ count: 0 })
      })
    return
  }

  if (event.data && event.data.type === "SYNC_QUEUE") {
    syncQueuedRequests()
      .then((count) => {
        event.ports[0].postMessage({ success: true, count })
      })
      .catch((error) => {
        event.ports[0].postMessage({ success: false, error: error.message })
      })
  }
})

self.addEventListener("online", () => {
  syncQueuedRequests()
})
