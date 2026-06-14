---
title: 'Fix attend hydration mismatch from stale runtime assets'
type: 'bugfix'
created: '2026-06-13'
status: 'draft'
context:
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The `/attend?session=...` page can hydrate with client JavaScript that still contains older literal FOLK color classes while the server sends newer CSS-variable classes. The visible React warning is "A tree hydrated but some attributes of the server rendered HTML didn't match the client properties", with mismatches in `Header` and `AttendanceForm` classes.

**Approach:** Treat this as a stale client-runtime asset problem, not a form or header rendering problem. Keep the service worker's offline write queue, but stop it from caching Next-generated runtime assets and prevent development service-worker caches from serving old Turbopack chunks next to fresh server HTML.

## Boundaries & Constraints

**Always:** Preserve offline queueing for public attendance and registration POSTs; keep `/attendance` as the live attendance endpoint; keep Supabase/Airtable server-only boundaries untouched; keep program branding class names deterministic between server and client; apply the fix to both FOLK and Gita Life because the service worker is shared from `public/sw.js`.

**Ask First:** Any change that removes PWA registration in production, changes the offline queue schema, removes `/attend` offline fallback behavior entirely, or rewrites `Header`/`AttendanceForm` styling beyond the mismatch cause.

**Never:** Do not paper over the warning with `suppressHydrationWarning`; do not reintroduce literal FOLK-only color classes in shared components; do not cache authenticated staff pages or API responses; do not delete IndexedDB pending requests as part of cache cleanup.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fresh runtime online | Browser requests `/_next/...` script/style while online | Service worker fetches from network and does not write the response to the app cache | If network fails, the request fails normally instead of falling back to stale runtime code |
| Existing stale cache | Browser has an older `folk-chennai-*` cache containing old Next chunks | New service worker activation deletes old app caches and removes any Next runtime entries from the current cache | Offline queue data in IndexedDB remains untouched |
| Local development | Developer runs the app on localhost with `NODE_ENV !== "production"` | App unregisters existing service workers for the origin and clears app asset caches so Turbopack chunks come from the dev server | Registration failures remain non-fatal and are logged as before |
| Offline public write | User submits attendance or registration while offline in production | Service worker still queues supported POST paths and returns the existing `202 queued` JSON shape | Background sync still replays queued requests when supported |

</frozen-after-approval>

## Code Map

- `public/sw.js` -- Shared service worker that precaches assets, queues selected POSTs, caches runtime responses, and can currently retain stale Next chunks.
- `components/service-worker-register.tsx` -- Client-side registration point mounted by `components/providers.tsx`; controls whether service worker runs in local development.
- `components/header.tsx` -- Hydration warning surface; current source already uses CSS-variable class names and should not need styling rewrites.
- `components/attendance-form.tsx` -- Hydration warning surface; current source already uses CSS-variable class names and should not need styling rewrites.
- `apps/folk/app/attend/page.tsx` and `apps/gita-life/app/attend/page.tsx` -- Public attendance pages that render shared `Header` and `AttendanceForm`.

## Tasks & Acceptance

**Execution:**
- [ ] `public/sw.js` -- Add a Next-runtime path guard for `/_next/` requests, make those requests network-only, exclude them from service-worker caching, and bump the app cache name so old runtime entries are purged on activation.
- [ ] `public/sw.js` -- During activation, delete any `/_next/` requests that may already exist inside the current cache, while leaving IndexedDB queue data alone.
- [ ] `components/service-worker-register.tsx` -- In non-production builds, unregister existing service workers for the current origin and delete `folk-chennai-*` asset caches instead of registering `/sw.js`; keep production registration behavior intact.
- [ ] `components/service-worker-register.tsx` -- Keep secure-context checks and non-fatal logging so preview/local environments do not crash if service-worker APIs are unavailable.

**Acceptance Criteria:**
- Given a browser has an old cached Next JavaScript chunk, when it loads `/attend?session=abc` after this fix is active, then the service worker does not serve the stale chunk and the page hydrates with matching server/client class attributes.
- Given the app is running in local development, when `ServiceWorkerRegister` mounts, then existing local service workers are unregistered and app asset caches are cleared instead of registering `/sw.js`.
- Given the production app is online, when a request is made for a `/_next/` script, style, or worker asset, then the request goes to the network and is not stored in `folk-chennai-*`.
- Given a public attendance or registration POST fails because the device is offline, when the service worker handles the request in production, then it still queues the request and returns the existing `202` queued response shape.

## Spec Change Log

## Design Notes

The warning shows old literal classes on the client and current CSS-variable classes on the server, while the current `Header` and `AttendanceForm` source already uses CSS-variable classes. That makes service-worker/runtime cache invalidation the safer fix than changing component markup. Next runtime assets are already content/version sensitive, so a field PWA should prefer a failed script request over hydrating fresh HTML with stale JavaScript.

## Verification

**Commands:**
- `pnpm guardrails` -- expected: monorepo guardrails pass after changing `components/*` and `public/*`.
- `pnpm typecheck:workspace` -- expected: TypeScript checks pass across workspace packages.
- `pnpm lint` -- expected: ESLint passes for the edited service-worker registration code.

**Manual checks:**
- In local dev, inspect Application > Service Workers and Cache Storage after loading the app; no localhost `folk-chennai-*` cache should remain and `/sw.js` should not be newly registered.
- In a production-like build, verify `/sw.js` still registers over HTTPS/localhost and offline attendance POSTs still return the queued state.
