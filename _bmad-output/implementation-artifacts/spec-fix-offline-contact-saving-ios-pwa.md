---
title: 'Fix offline contact saving for iOS PWA'
type: 'bugfix'
created: '2026-05-20'
status: 'done'
route: 'one-shot'
---

# Fix offline contact saving for iOS PWA

## Intent

**Problem:** Staff contact saving failed while offline because the contact form blocked submission before the service worker could queue it, and the service worker intentionally excluded `/api/contact` from its offline queue.

**Approach:** Allow contact submissions to reach the service worker, queue `/api/contact` alongside registration and attendance writes, and trigger queued replay from the foreground UI when the app returns online so iOS PWAs do not depend on unsupported background sync behavior.

## Suggested Review Order

**Queue Capture**

- Contact submit now reaches the service worker and handles queued responses.
  [`contact-form.tsx:39`](../../components/contact-form.tsx#L39)

- Offline contact saves reset the form with explicit queued feedback.
  [`contact-form.tsx:131`](../../components/contact-form.tsx#L131)

**Service Worker**

- `/api/contact` is now a first-class queued write path.
  [`sw.js:6`](../../public/sw.js#L6)

- Replay keeps same-origin credentials for staff-authenticated contact writes.
  [`sw.js:79`](../../public/sw.js#L79)

- Fetch interception queues known JSON writes while offline.
  [`sw.js:158`](../../public/sw.js#L158)

**iOS Replay Fallback**

- UI messaging now asks the active service worker to sync pending writes.
  [`offline-indicator.tsx:9`](../../components/offline-indicator.tsx#L9)

- Online and foreground events trigger replay without relying on SyncManager.
  [`offline-indicator.tsx:78`](../../components/offline-indicator.tsx#L78)
