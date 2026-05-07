# Story 5.2: Replace Global Pending-Count Polling With Event-Driven Refresh

Status: review

## Story

As a user with offline queued requests,
I want pending sync state to update when it can actually change,
so that the app avoids unnecessary background work.

## Acceptance Criteria

1. Given `OfflineIndicator` is mounted, when the app first loads, then it checks the service-worker pending count once if service workers are available.
2. Given the browser fires `online` or the document becomes visible, when pending count may have changed, then the app refreshes pending count from the service worker, and it does not run a global 5-second polling interval.
3. Given a public attendance or registration request is queued, when the UI receives the queued response, then pending count refreshes or the service worker notifies clients, and the user can see that work is pending.
4. Given manual sync or background sync completes, when queued requests are removed, then pending count refreshes to the current value, and the pending banner disappears when the count reaches zero and the browser is online.
5. Given staff contact creation is offline, when the staff contact form submits, then it remains online-only and shows the existing reconnect message, and no staff contact write is silently queued.

## Tasks / Subtasks

- [x] Replace the `setInterval(checkPendingRequests, 5000)` in `components/offline-indicator.tsx` with event-driven refreshes. (AC: 1, 2)
  - [x] Check once on mount.
  - [x] Refresh on `online`.
  - [x] Refresh on `visibilitychange` when visible.
- [x] Add a service-worker-to-client notification when `public/sw.js` queues a request or finishes sync, or add a small client event contract that forms can trigger after receiving `202 queued`. (AC: 3, 4)
- [x] Update manual sync handling so `OfflineIndicator` asks for the real pending count after sync instead of always assuming zero. (AC: 4)
- [x] Confirm service worker still queues only public `/registration` and `/attendance` POSTs. (AC: 5)
- [x] Verify staff contact offline behavior remains online-only and visible to the user. (AC: 5)

## Dev Notes

- Current `OfflineIndicator` polls pending count every 5 seconds whenever mounted, and its effect depends on `isOnline`.
- Current `public/sw.js` queues POST requests whose path includes `/registration` or `/attendance`. It intentionally does not queue `/api/contact`.
- `syncQueuedRequests()` removes queued requests when replay returns `ok` or `409`, which preserves duplicate replay as a completed outcome.
- `app/register/page.tsx` handles `202 queued` for `/api/registration` and registers background sync when available.
- Staff contact creation must stay online-only because it requires a live staff session and server-side authorization.
- Prefer a simple message contract, for example `{ type: "PENDING_COUNT_UPDATED", count }` or reuse `GET_PENDING_COUNT` after events. Keep it robust when no service worker controller exists.

### Project Structure Notes

- Browser pending UI lives in `components/offline-indicator.tsx`.
- Queue storage and replay live in `public/sw.js`.
- Public forms should not import service-worker internals directly; use browser messages/events.

### References

- [Source: _bmad-output/planning-artifacts/performance-responsiveness-epics.md#Story-5.2]
- [Source: components/offline-indicator.tsx]
- [Source: public/sw.js]
- [Source: app/register/page.tsx]
- [Source: _bmad-output/implementation-artifacts/spec-all-epics-staff-auth-attendance.md#Rollout-Notes]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `pnpm exec tsc --noEmit` passed.
- `pnpm build` passed.
- Code search confirmed `setInterval(checkPendingRequests, 5000)` was removed from `OfflineIndicator`.
- Code-path review confirmed the service worker queues only POST paths containing `/registration` or `/attendance`; `/api/contact` is not matched.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Replaced pending-count polling with mount, online, visibility, service-worker message, and manual-sync refreshes.
- Added service-worker pending-count notifications after queue changes and sync completion.
- Manual sync now uses the real pending count returned by the service worker instead of assuming zero.
- Staff contact writes remain online-only because the service worker does not queue `/api/contact`.

### File List

- `components/offline-indicator.tsx`
- `public/sw.js`

### Change Log

- 2026-05-07: Replaced service-worker pending-count polling with event-driven refresh.
