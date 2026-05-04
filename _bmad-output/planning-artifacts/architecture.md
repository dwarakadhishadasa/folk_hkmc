---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
workflowType: 'architecture'
lastStep: 8
status: 'complete'
completedAt: '2026-04-23'
project_name: 'folk_hkmc'
user_name: 'Dwaraka'
date: '2026-04-23'
---

# Architecture Decision Document

## Executive Summary

`folk_hkmc` is a single Next.js App Router application that delivers both participant-facing flows and staff-facing operational tooling. The system depends on Airtable as the data backend, uses browser-local auth for privileged views, and adds PWA/offline behavior through a service worker and IndexedDB queue.

This architecture is lightweight and pragmatic, but it has important consistency requirements for future work:

- keep client-only auth assumptions explicit
- preserve the `/attendance` route contract and mobile-number normalization
- treat offline behavior as a cross-cutting concern that spans UI, service worker, and server responses
- do not assume registration/contact backend support exists locally unless it is added

## Decision Summary

| Category | Decision | Version | Affects Capabilities | Rationale |
| --- | --- | --- | --- | --- |
| App framework | Use Next.js App Router monolith | Next.js 16.0.7 | All | Existing route structure and deployment model are already built around this |
| UI runtime | Prefer client components for feature flows | React 19.2.0 | Login, register, contact, dashboard | Browser APIs, auth hydration, and local state dominate the design |
| Data backend | Use Airtable as the active system of record | Airtable REST | Attendance and contact lookup | Already implemented in `lib/airtable.ts` |
| Auth model | Use localStorage-backed role auth | Custom | Contact and dashboard access | Lightweight internal workflow without server session infrastructure |
| Offline support | Use service worker + IndexedDB queue | Browser APIs | Attendance and registration queueing | Supports intermittent connectivity during field usage |
| Route surface | Keep `/attendance` as the implemented backend entry point | Next route handler | Attendance and dashboard | Only completed server route in this repo |

## Project Structure

```text
folk_hkmc/
├── app/
│   ├── attendance/route.ts
│   ├── attend/page.tsx
│   ├── contact/page.tsx
│   ├── dashboard/page.tsx
│   ├── login/page.tsx
│   ├── register/page.tsx
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── attendance-form.tsx
│   ├── contact-form.tsx
│   ├── header.tsx
│   ├── live-attendance-dashboard.tsx
│   ├── providers.tsx
│   ├── service-worker-register.tsx
│   ├── offline-indicator.tsx
│   ├── pwa-install-prompt.tsx
│   └── ui/...
├── lib/
│   ├── airtable.ts
│   ├── auth-context.tsx
│   ├── offline-sync.ts
│   └── store.ts
└── public/
    ├── manifest.json
    ├── offline.html
    └── sw.js
```

## Technology Stack Details

### Core Technologies

- Next.js 16.0.7
- React 19.2.0
- TypeScript with `strict: true`
- Tailwind CSS v4
- Radix UI primitives and shadcn-style wrappers
- Airtable REST API
- Browser platform APIs for localStorage, service workers, background sync, and IndexedDB

### Integration Points

- `lib/airtable.ts` -> Airtable Contacts table
- `lib/airtable.ts` -> Airtable Attendance table
- `components/live-attendance-dashboard.tsx` -> QR server image URL generation
- `public/sw.js` -> browser cache, queue, and sync infrastructure

## Implementation Patterns

### Route and Page Pattern

- App routes live under `app/`
- Public and protected pages are rendered as client components when they depend on auth or browser APIs
- Route-specific logic may stay inline in `page.tsx` when the page owns the whole workflow

### Data Access Pattern

- All implemented server-side Airtable access flows through `lib/airtable.ts`
- UI code should not call Airtable directly from the browser
- Server routes should normalize mobile numbers before lookup or mutation

### Offline Pattern

- POST requests to attendance and registration paths are intercepted by the service worker
- Offline POST bodies are stored in IndexedDB and replayed later
- UI surfaces a queued state when the service worker returns `202`

### Dashboard Refresh Pattern

- Dashboard polling uses periodic fetches to `GET /attendance`
- New records are appended by record ID rather than replacing the full list

## Consistency Rules

### Naming Conventions

- Use lowercase App Router segment names
- Use PascalCase component exports
- Use the `@/*` path alias for local imports

### Code Organization

- Keep browser-specific concerns in client components
- Keep external integration logic in `lib/`
- Keep base UI primitives in `components/ui/`

### Error Handling

- Return explicit JSON error payloads from route handlers
- Show clear success/duplicate/offline/error states in forms
- Prefer user-facing messages that explain next action, not only failure

### Logging Strategy

- Current implementation relies on `console.log` and `console.error`
- Airtable integration already emits detailed debug logs
- Keep sensitive values out of client logs if this area is hardened later

## Data Architecture

### Primary External Records

- **Contact record:** `Name`, `Phone`, `Year`, `Source`, `Age`, `Location`
- **Attendance record:** `Phone`, `Name`, `Attendance Date`

### Local Browser Data

- `folk_auth` localStorage session
- IndexedDB `pending-requests` queue
- Optional localStorage queue model in `lib/offline-sync.ts`

### Transitional Data

- `lib/store.ts` holds legacy in-memory registration and attendance types but is not part of the active attendance architecture

## API Contracts

### Implemented

- `POST /attendance`
- `GET /attendance`

### Assumed but Missing

- `POST /api/registration`
- `POST /api/contact`

Future work should either implement these routes inside the monolith or explicitly document that they are provided by another deployed service.

## Security Architecture

- UI authorization is role-based through `AuthProvider`
- Roles are `volunteer` and `preacher`
- Session state is local-only and stored in the browser
- Server-side authorization is effectively absent for the implemented attendance route

## Performance Considerations

- Attendance dashboard uses 20-second polling
- Attendance queries are cache-busted and `no-store`
- Image optimization is disabled in Next config
- PWA caching helps repeat visits and limited offline support

## Deployment Architecture

- Suitable for a standard Next.js deployment target
- Requires `AIRTABLE_API_TOKEN` at runtime for implemented backend functionality
- Requires secure context for service worker features
- Current deployable completeness is strongest for attendance, not registration/contact, unless missing APIs are added

## Development Environment

### Prerequisites

- Node.js 20+
- `pnpm`
- `AIRTABLE_API_TOKEN`

### Setup Commands

```bash
pnpm install
pnpm dev
pnpm lint
pnpm build
pnpm start
```

## Architecture Decision Records (ADRs)

### ADR-001: Keep the product as a single Next.js monolith

Chosen because the current feature set is small, UI-heavy, and already organized around App Router routes.

### ADR-002: Use Airtable as the operational backend

Chosen because attendance and contact data already live there and the existing server route depends on it.

### ADR-003: Use local role-based browser auth for staff-only pages

Chosen for implementation simplicity, with the tradeoff that this is not a hardened security model.

### ADR-004: Support offline submission through the service worker

Chosen to improve reliability during in-person attendance capture and intermittent connectivity.

### ADR-005: Treat missing registration/contact routes as explicit brownfield gaps

Chosen so future work does not mistake UI assumptions for implemented backend behavior.

## Architecture Validation Results

### Coherence Validation

- The chosen stack is internally consistent for a small operational web app
- The route structure and component organization align with the Next.js App Router model
- Airtable integration is centralized enough to be reusable for future route additions

### Implementation Readiness

- The architecture is ready to guide brownfield fixes and incremental features
- The biggest blockers are functional gaps rather than structural ambiguity

### Primary Risks

- client-only auth
- missing registration/contact APIs
- split offline behavior across multiple mechanisms
- ignored TypeScript errors during build
