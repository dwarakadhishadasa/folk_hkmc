# folk_hkmc - Architecture

**Date:** 2026-04-23
**Type:** Single-part web application

## Executive Summary

`folk_hkmc` is a single Next.js App Router application that combines public marketing content, user onboarding, attendance capture, staff workflows, and basic offline/PWA support. Most application logic runs in client components. The backend surface is intentionally thin: this repository only implements the `/attendance` route, which acts as a server-side adapter over Airtable for attendance and contact lookup operations.

The architecture is effective for a lightweight operational tool, but it carries brownfield constraints that any future work needs to respect:

- staff authentication is browser-local and not backed by a server session
- public and protected experiences coexist in the same frontend codebase
- offline support is coupled across the service worker, forms, and UI indicators
- the UI expects registration and contact APIs that are not currently implemented here

## System Context

### Primary Actors

- **Visitor / participant:** views the program site, registers, and marks attendance
- **Volunteer:** authenticates locally and accesses the contact-entry screen
- **Preacher:** authenticates locally and accesses the live dashboard in addition to the contact-entry screen
- **Airtable:** system of record for contacts and attendance records

### External Systems

- **Airtable REST API:** contact lookup, attendance reads, attendance writes, and registration writes if corresponding routes are added
- **Browser platform APIs:** localStorage, service workers, IndexedDB, background sync, install prompt APIs
- **QR image service:** dashboard generates QR codes through `api.qrserver.com`

## Architecture Pattern

The app follows a **client-heavy monolith** pattern:

- **Presentation layer:** App Router pages and feature components
- **Browser integration layer:** auth hydration, service worker registration, offline state, PWA prompts
- **Thin server adapter layer:** `app/attendance/route.ts`
- **External data layer:** Airtable REST tables for contacts and attendance

This is not a strict API-first architecture. UI flows directly assume route paths and response shapes, and some behaviors such as `202 queued` are injected by the service worker rather than a server implementation.

## Runtime Components

### 1. App Router UI Layer

- `app/page.tsx` serves the public marketing homepage
- `app/register/page.tsx` implements the registration journey
- `app/attend/page.tsx` hosts attendance capture
- `app/contact/page.tsx` gates contact entry behind client-side auth
- `app/dashboard/page.tsx` gates the dashboard behind client-side auth and preacher role checks

### 2. Shared Browser Infrastructure

- `components/providers.tsx` wires global client-only providers
- `components/service-worker-register.tsx` registers `public/sw.js` in secure contexts
- `components/offline-indicator.tsx` reads queue status from the service worker
- `components/pwa-install-prompt.tsx` manages browser install affordances
- `lib/auth-context.tsx` hydrates and stores auth in `localStorage`

### 3. Server Integration Layer

- `app/attendance/route.ts` exposes:
  - `POST /attendance`
  - `GET /attendance?date=YYYY-MM-DD`
- `lib/airtable.ts` encapsulates Airtable calls used by the route handler

### 4. Offline/PWA Layer

- `public/sw.js` precaches key assets and intercepts POST requests to attendance and registration paths
- failed POSTs are written into IndexedDB and replayed later
- UI components interpret `202 queued` as a successful offline capture event

## Key Flows

### Registration Flow

1. User opens `/register`
2. `app/register/page.tsx` collects participant details
3. UI posts to `/api/registration`
4. When offline, the service worker can queue matching POST requests
5. In the current repo, there is no route implementation for `/api/registration`

### Attendance Flow

1. User opens `/attend`
2. `components/attendance-form.tsx` normalizes the mobile number to 10 digits
3. UI posts to `/attendance`
4. Route handler looks up the user in Airtable contacts, checks for same-day duplicates, and writes attendance
5. Success returns `{ id, mobile, userName, createdAt }`
6. If not found, the UI redirects the user to `/register?mobile=...`

### Dashboard Flow

1. Preacher logs in through the local auth screen
2. `app/dashboard/page.tsx` client-gates the page
3. `components/live-attendance-dashboard.tsx` polls `GET /attendance` every 20 seconds
4. Newly returned records are appended by record ID
5. QR code points participants to `/attend`

### Contact Flow

1. Logged-in staff open `/contact`
2. `components/contact-form.tsx` posts to `/api/contact`
3. In the current repo, no `/api/contact` route exists

## Technology Stack

| Category | Decision | Notes |
| --- | --- | --- |
| UI framework | Next.js 16 App Router | Route segments under `app/` |
| Rendering style | Mostly client-side | Hooks, browser APIs, and auth hydration dominate |
| Language | TypeScript | Strict mode enabled in TS config |
| Styling | Tailwind CSS v4 + brand CSS vars | Defined in `app/globals.css` |
| UI primitives | Radix + shadcn wrappers | `components/ui/*` |
| Data store | Airtable | Contacts and Attendance tables |
| Auth | Client-side localStorage auth | No real backend session or token model |
| Offline | Service worker + IndexedDB | Queue replay logic in `public/sw.js` |

## State and Auth

- Auth state is stored in `localStorage` key `folk_auth`
- Valid users are hardcoded in `lib/auth-context.tsx`
- Role checks (`volunteer`, `preacher`) are enforced only in client components
- Feature state is local React state rather than centralized global state
- There is a secondary local offline queue helper in `lib/offline-sync.ts`, but the active UX also depends on the service worker queue

## Data Architecture

### Airtable Contacts Record

Used to resolve participants and, if implemented, to create registrations.

Fields used in code:

- `Name`
- `Phone`
- `Year`
- `Source`
- `Age`
- `Location`

### Airtable Attendance Record

Used by the implemented attendance route.

Fields used in code:

- `Phone`
- `Name`
- `Attendance Date`

### Local Browser Models

- `folk_auth` localStorage session
- IndexedDB `pending-requests` queue inside `public/sw.js`
- Optional localStorage queue under `lib/offline-sync.ts`

## API Surface

### Implemented

- `POST /attendance`
- `GET /attendance`

### Expected by the UI but Missing in This Repo

- `POST /api/registration`
- `POST /api/contact`

This mismatch is one of the most important brownfield constraints in the system.

## Security and Operational Considerations

- Credentials are hardcoded in client code and visible to anyone with repo or bundle access
- Protected pages rely on client redirects rather than server authorization checks
- `GET /attendance` is not access-controlled even though the dashboard page is
- Airtable base and table identifiers are embedded in the source; only the API token is environment-backed
- Service worker registration only happens in secure contexts

## Performance Considerations

- Dashboard polling is interval-based every 20 seconds
- Attendance reads bypass cache with query-string busting and `no-store`
- Images are configured as `unoptimized`, so the app does not rely on Next.js image optimization
- The app is small enough for this architecture today, but polling and repeated Airtable queries will become more expensive as usage grows

## Deployment Architecture

- The app can run anywhere that supports a standard Next.js App Router deployment
- `AIRTABLE_API_TOKEN` must be present for implemented server-side Airtable access
- PWA capabilities require HTTPS or localhost for service worker registration
- Because registration and contact routes are missing, deployments only fully support the attendance flow unless those endpoints exist elsewhere

## Testing and Quality

- No automated tests are configured
- `next.config.mjs` ignores TypeScript build errors during production build
- Manual QA is the only reliable validation path today

Recommended smoke checks:

- public homepage rendering
- login redirect behavior
- attendance success, not-found, and duplicate cases
- dashboard polling and QR generation
- offline queue behavior on supported browsers

## Known Gaps and Brownfield Risks

- Registration and contact routes are assumed but absent
- `components/registration-form.tsx` is likely unused duplicate UI
- `lib/store.ts` suggests an earlier in-memory design that no longer matches the Airtable-backed flow
- Two offline queue strategies exist (`public/sw.js` and `lib/offline-sync.ts`), which increases maintenance risk
- Contact and dashboard protection is UI-only, not API-level

---

Generated using the BMAD `document-project` workflow pattern.
