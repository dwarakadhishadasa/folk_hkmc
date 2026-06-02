const CACHE_NAME = "folk-chennai-v3"
const OFFLINE_URL = "/offline.html"
const DB_NAME = "folk-offline-db"
const DB_VERSION = 1
const STORE_NAME = "pending-requests"
const QUEUED_POST_PATHS = new Set(["/api/contact", "/api/registration", "/registration", "/attendance"])
const STATIC_ASSET_DESTINATIONS = new Set(["font", "image", "manifest", "script", "style", "worker"])
const NETWORK_ONLY_PATH_PREFIXES = [
  "/api/",
  "/auth/",
  "/login",
  "/admin",
  "/contact",
  "/dashboard",
  "/manage",
  "/sessions",
  "/volunteers",
]

const PRECACHE_ASSETS = [
  "/",
  "/attend",
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
        credentials: "same-origin",
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

function isQueueablePost(request, url) {
  return request.method === "POST" && url.origin === self.location.origin && QUEUED_POST_PATHS.has(url.pathname)
}

function queuedMessageForPath(pathname) {
  if (pathname === "/api/contact") {
    return "Contact queued for sync when online"
  }

  return "Request queued for sync when online"
}

function isNetworkOnlyPath(pathname) {
  return NETWORK_ONLY_PATH_PREFIXES.some((prefix) => {
    if (prefix.endsWith("/")) {
      return pathname.startsWith(prefix)
    }

    return pathname === prefix || pathname.startsWith(`${prefix}/`)
  })
}

function isRscRequest(request, url) {
  const acceptHeader = request.headers.get("Accept") || ""
  return (
    url.searchParams.has("_rsc") ||
    request.headers.get("RSC") === "1" ||
    acceptHeader.includes("text/x-component")
  )
}

function responseDisallowsCache(response) {
  const cacheControl = (response.headers.get("Cache-Control") || "").toLowerCase()
  return cacheControl.includes("no-store") || cacheControl.includes("private")
}

function shouldUseNetworkOnly(request, url) {
  if (url.origin !== self.location.origin) {
    return true
  }

  return request.cache === "no-store" || isRscRequest(request, url) || isNetworkOnlyPath(url.pathname)
}

function shouldCacheResponse(request, url, response) {
  if (
    response.status !== 200 ||
    url.origin !== self.location.origin ||
    response.type === "opaqueredirect" ||
    responseDisallowsCache(response) ||
    isRscRequest(request, url) ||
    isNetworkOnlyPath(url.pathname)
  ) {
    return false
  }

  if (request.mode === "navigate") {
    return PRECACHE_ASSETS.includes(url.pathname) && url.search === ""
  }

  return STATIC_ASSET_DESTINATIONS.has(request.destination) || PRECACHE_ASSETS.includes(url.pathname)
}

async function offlineFallbackFor(request) {
  if (request.mode === "navigate") {
    const offlineResponse = await caches.match(OFFLINE_URL)
    if (offlineResponse) {
      return offlineResponse
    }
  }

  return new Response("Offline", { status: 503 })
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

  // Queue known JSON writes while offline. Staff contact replay still depends on the
  // Supabase session cookie being valid when the device reconnects.
  if (isQueueablePost(event.request, url)) {
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
              message: queuedMessageForPath(url.pathname),
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

  if (shouldUseNetworkOnly(event.request, url)) {
    event.respondWith(fetch(event.request).catch(() => offlineFallbackFor(event.request)))
    return
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (shouldCacheResponse(event.request, url, response)) {
          const responseClone = response.clone()
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone)
          })
        }
        return response
      })
      .catch(async () => {
        const cachedResponse = await caches.match(event.request)
        if (cachedResponse) {
          return cachedResponse
        }
        return offlineFallbackFor(event.request)
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
