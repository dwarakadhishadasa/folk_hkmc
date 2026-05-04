# folk_hkmc - Component Inventory

**Date:** 2026-04-23

## Overview

The component layer mixes route-specific product components, app-wide infrastructure widgets, and a large shared UI primitive library. Most feature behavior is implemented directly inside client components with local state and inline fetch calls.

## Feature Components

| Component | Type | Responsibility | Notes |
| --- | --- | --- | --- |
| `Header` | Shared layout | Global navigation, auth-aware links, logout | Used on most pages |
| `AttendanceForm` | Feature form | Attendance lookup, duplicate handling, redirect to registration | Posts to `/attendance` |
| `ContactForm` | Feature form | Staff-only contact entry | Posts to missing `/api/contact` |
| `LiveAttendanceDashboard` | Feature dashboard | Polls attendance list and renders QR code | Uses `/attendance` GET |
| `RegistrationForm` | Feature form | Alternate registration implementation | Appears unused compared to `app/register/page.tsx` |

## Route-Embedded Components

These pages contain a meaningful amount of UI logic inline rather than delegating everything to `components/`.

| File | Responsibility |
| --- | --- |
| `app/page.tsx` | Marketing homepage, testimonials, course topics |
| `app/login/page.tsx` | Local credential login and redirect handling |
| `app/register/page.tsx` | Active registration form and success state |
| `app/contact/page.tsx` | Auth gate for contact entry |
| `app/dashboard/page.tsx` | Auth and role gate for dashboard |

## Infrastructure Components

| Component | Responsibility | Integration Points |
| --- | --- | --- |
| `Providers` | Mounts app-wide client providers/utilities | Wraps the app in `AuthProvider` plus PWA helpers |
| `ServiceWorkerRegister` | Registers `public/sw.js` | Depends on secure browser context |
| `OfflineIndicator` | Shows online/offline and pending sync state | Talks to service worker via `postMessage` |
| `PWAInstallPrompt` | Offers custom install UI | Uses `beforeinstallprompt` and iOS standalone checks |
| `OfflineSyncProvider` | Additional offline-sync context | Present in repo but not currently mounted in `Providers` |

## Auth and Context Components

| Component / Module | Responsibility |
| --- | --- |
| `AuthProvider` (`lib/auth-context.tsx`) | Maintains session state, role flags, login/logout |
| `useAuth()` | Reads auth state inside pages and shared components |

## Shared UI Primitives

`components/ui/*` contains the generated or curated primitive layer used across the app. Important primitives referenced by feature code include:

- `button`
- `card`
- `input`
- `label`
- `select`
- `toast`
- `toaster`

Many other primitives exist but are not clearly exercised by the current product flows.

## Reuse Notes

- `Header` is the main consistently reused product component.
- The active registration screen does not currently reuse `components/registration-form.tsx`.
- The attendance and contact forms each own their own validation and submission logic.
- There is an opportunity to extract repeated mobile normalization and success/error state patterns into shared helpers.

## Brownfield Observations

- The route pages and feature components do not consistently follow the same composition style.
- The codebase contains both shadcn-style primitives and raw HTML/Tailwind form implementations.
- `OfflineSyncProvider` is implemented but not currently part of the app bootstrapping path, so it should not be assumed active.

---

Generated using the BMAD `document-project` workflow pattern.
