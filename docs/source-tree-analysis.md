# folk_hkmc - Source Tree Analysis

**Date:** 2026-04-23

## Overview

This repository is organized as a single web application with supporting BMAD planning assets. The product code is concentrated in `app/`, `components/`, `lib/`, `hooks/`, and `public/`. The rest of the tree mainly supports planning, design artifacts, or generated outputs.

## Complete Directory Structure

```text
folk_hkmc/
├── app/
│   ├── attendance/route.ts
│   ├── attend/page.tsx
│   ├── contact/page.tsx
│   ├── dashboard/page.tsx
│   ├── login/
│   │   ├── loading.tsx
│   │   └── page.tsx
│   ├── register/
│   │   ├── loading.tsx
│   │   └── page.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── attendance-form.tsx
│   ├── contact-form.tsx
│   ├── header.tsx
│   ├── live-attendance-dashboard.tsx
│   ├── offline-indicator.tsx
│   ├── offline-sync-provider.tsx
│   ├── providers.tsx
│   ├── pwa-install-prompt.tsx
│   ├── registration-form.tsx
│   ├── service-worker-register.tsx
│   └── ui/...
├── lib/
│   ├── airtable.ts
│   ├── auth-context.tsx
│   ├── offline-sync.ts
│   ├── store.ts
│   └── utils.ts
├── hooks/
│   ├── use-mobile.ts
│   └── use-toast.ts
├── public/
│   ├── icons/...
│   ├── images/...
│   ├── manifest.json
│   ├── offline.html
│   └── sw.js
├── docs/
├── design-artifacts/
├── _bmad/
├── _bmad-output/
├── package.json
├── next.config.mjs
├── tsconfig.json
├── postcss.config.mjs
└── components.json
```

## Critical Directories

### `app/`

**Purpose:** Next.js App Router entry points and the only implemented backend route.
**Contains:** Public pages, protected staff pages, loading boundaries, global layout, brand CSS, and `app/attendance/route.ts`.
**Entry Points:** `app/layout.tsx`, `app/page.tsx`, `app/attendance/route.ts`

### `components/`

**Purpose:** Feature UI, shared layout, and browser integration components.
**Contains:** Forms, dashboard views, auth-aware header, PWA helpers, and shadcn-style UI primitives.

### `components/ui/`

**Purpose:** Reusable base UI primitives.
**Contains:** Buttons, inputs, select, toast, dialogs, navigation, tables, and other generated wrappers around Radix primitives.

### `lib/`

**Purpose:** Non-visual application logic and integration code.
**Contains:** Airtable fetch helpers, local auth context, local offline queue helpers, and legacy in-memory store types.

### `public/`

**Purpose:** Static assets and PWA infrastructure.
**Contains:** Icons, logos, manifest, offline page, and the service worker implementation.

### `docs/`

**Purpose:** Brownfield documentation for this system.
**Contains:** Existing reference docs plus generated project documentation.

### `_bmad/`, `.agents/`, `design-artifacts/`, `_bmad-output/`

**Purpose:** Planning, workflow, and AI-assistance assets rather than runtime product code.
**Contains:** BMAD configurations, skills, design outputs, and generated planning artifacts.

## Entry Points

- **Main UI Bootstrap:** `app/layout.tsx`
- **Public Homepage:** `app/page.tsx`
- **Attendance Server Endpoint:** `app/attendance/route.ts`
- **Global Providers:** `components/providers.tsx`
- **Service Worker:** `public/sw.js`
- **PWA Manifest:** `public/manifest.json`

## File Organization Patterns

- Route folders under `app/` contain `page.tsx` and optional `loading.tsx`.
- Feature components live directly in `components/`, while generated/shared primitives live in `components/ui/`.
- Browser-only logic is isolated in client components and provider helpers.
- External integration and data-shape logic are stored under `lib/`.
- Static assets required by branding and PWA installation live under `public/`.

## Key File Types

### Route files

- **Pattern:** `app/**/page.tsx`, `app/**/route.ts`
- **Purpose:** User-facing pages and server handlers
- **Examples:** `app/register/page.tsx`, `app/attendance/route.ts`

### Infrastructure components

- **Pattern:** `components/*provider*.tsx`, `components/*indicator*.tsx`, `components/*register*.tsx`
- **Purpose:** App-wide browser integrations and bootstrapping
- **Examples:** `components/providers.tsx`, `components/service-worker-register.tsx`

### Integration files

- **Pattern:** `lib/*.ts`, `lib/*.tsx`
- **Purpose:** Airtable, auth, offline, and utility logic
- **Examples:** `lib/airtable.ts`, `lib/auth-context.tsx`

### Static platform assets

- **Pattern:** `public/*`
- **Purpose:** PWA installability, offline fallback, branding assets
- **Examples:** `public/manifest.json`, `public/sw.js`, `public/images/folk-logo.jpg`

## Asset Locations

- **Brand images:** `public/images/`
- **PWA icons:** `public/icons/`
- **Fallback/offline HTML:** `public/offline.html`
- **Generic placeholders:** `public/placeholder*`

## Configuration Files

- **`package.json`**: Scripts and runtime dependencies
- **`next.config.mjs`**: Build/runtime behavior, including ignored TS build errors and unoptimized images
- **`tsconfig.json`**: TypeScript configuration with `@/*` alias
- **`postcss.config.mjs`**: Tailwind CSS PostCSS integration
- **`components.json`**: shadcn/ui generator configuration
- **`app/globals.css`**: Brand tokens and base Tailwind theme variables

## Notes for Development

- `components/registration-form.tsx` appears to be an older or alternate implementation; the active registration UX is the inline form inside `app/register/page.tsx`.
- `lib/store.ts` contains in-memory registrations and attendances, but the implemented attendance flow uses Airtable instead.
- The dashboard and contact pages are protected in the UI, but the only implemented server route is still public at the HTTP layer.

---

Generated using the BMAD `document-project` workflow pattern.
