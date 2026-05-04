---
project_name: "folk_hkmc"
user_name: "Dwaraka"
date: "2026-04-21"
sections_completed:
  - technology_stack
  - language_rules
  - framework_rules
  - testing_rules
  - quality_rules
  - workflow_rules
  - anti_patterns
status: "complete"
rule_count: 22
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

- Next.js `16.0.7` with App Router
- React `19.2.0` and React DOM `19.2.0`
- TypeScript `^5` with `strict: true` and path alias `@/*`
- Tailwind CSS `^4.1.9` via `@tailwindcss/postcss`, plus `tw-animate-css` and `tailwindcss-animate`
- Radix UI primitives plus shadcn-style wrappers under `components/ui/*`
- Forms/validation libraries installed: `react-hook-form ^7.60.0`, `@hookform/resolvers ^3.10.0`, `zod 3.25.76`
- Utility libs in active use: `clsx`, `tailwind-merge`, `class-variance-authority`, `date-fns`
- Data/backend integration: Airtable REST API from server code in `lib/airtable.ts`
- PWA/offline support: `public/manifest.json`, `public/sw.js`, IndexedDB queue in the service worker
- Runtime config quirks: `next.config.mjs` sets `typescript.ignoreBuildErrors = true` and `images.unoptimized = true`

## Critical Implementation Rules

### Language-Specific Rules

- Keep TypeScript strict even though Next build ignores type errors; do not rely on `next build` to protect type safety.
- Use the `@/*` alias for local imports instead of long relative paths.
- Match the existing file’s style when editing: app/custom files mostly use double quotes, while many generated UI primitives use single quotes.
- Preserve explicit interfaces/types close to usage sites for form data, auth state, and Airtable payloads instead of introducing loose `any` shapes.

### Framework-Specific Rules

- This is a client-heavy App Router app. Any component using hooks, `window`, `navigator`, `localStorage`, `MessageChannel`, or service workers must start with `"use client"`.
- Protected pages rely on client hydration through `useAuth()` and `isHydrated`; do not read auth state during SSR or remove the loading/hydration guards.
- Authentication is entirely local and client-side in `lib/auth-context.tsx`, using `localStorage` key `folk_auth` plus hardcoded demo users. There is no server session layer.
- The live attendance endpoint is `/attendance` from `app/attendance/route.ts`, not `/api/attendance`. Frontend polling and submissions already depend on that path.
- Preserve the current branding system in `app/globals.css`: royal blue/saffron palette, `Poppins` headings, `Inter` body text, rounded cards, and warm ivory backgrounds.

### Testing Rules

- There is no test suite or test runner configured in this repo right now. If you add behavior, include manual verification notes instead of pretending coverage exists.
- At minimum, manually smoke-test affected flows in the browser for routing, auth redirects, attendance submission, Airtable-backed reads, and offline/PWA behavior when relevant.

### Code Quality & Style Rules

- Reuse existing primitives from `components/ui/*` and the shared `cn()` helper in `lib/utils.ts` before creating new base UI elements.
- Keep route files in App Router conventions: lowercase segment folders with `page.tsx`, `loading.tsx`, or `route.ts`; keep reusable components in `components/` with PascalCase exports.
- Follow the current state-management pattern unless the surface already differs: local `useState`, `useEffect`, and small helper functions are the norm; avoid introducing heavier global state libraries.
- Prefer small, explicit handlers for input normalization and submission logic. This codebase regularly normalizes mobile numbers inline with `replace(/\D/g, "").slice(0, 10)`.

### Development Workflow Rules

- Use `pnpm` conventions because the repo includes `pnpm-lock.yaml` and `package.json` scripts for `dev`, `build`, `start`, and `lint`.
- Treat `_bmad-output/`, `design-artifacts/`, and `docs/` as supporting artifacts and references; the actual product code lives under `app/`, `components/`, `hooks/`, `lib/`, `public/`, and `styles/`.

### Critical Don't-Miss Rules

- `lib/airtable.ts` depends on `AIRTABLE_API_TOKEN`; it defaults to Airtable base `apprnbZdVhoog9vgG` and supports overriding table identifiers via env vars. Keep this integration server-only and avoid moving secrets into client code.
- The UI expects `/api/registration` and `/api/contact`, and the service worker also queues `/registration` and `/attendance` requests, but the repo currently only contains `app/attendance/route.ts`. Do not assume registration/contact APIs exist locally without verifying or implementing them.
- Offline behavior is coupled across `public/sw.js`, `components/service-worker-register.tsx`, `components/offline-indicator.tsx`, and forms that react to `202 queued` responses. If you change request paths or payloads, update all of those pieces together.
- Attendance and registration flows assume Indian mobile numbers normalized to the last 10 digits. Preserve that normalization logic on both input and server boundaries.
- Dashboard refresh logic appends only new records by Airtable record id and polls every 20 seconds. If you change response shapes or ordering, maintain stable `id`, `userName`, `mobile`, and date fields so the incremental merge keeps working.

---

## Usage Guidelines

**For AI Agents:**

- Read this file before implementing any code.
- Treat client hydration, auth, route paths, and service-worker coupling as hard constraints.
- Prefer existing repo patterns over generic Next.js best practices when they conflict.
- Verify API existence from the codebase before wiring frontend calls to it.

**For Humans:**

- Update this file when route structure, Airtable integration, auth approach, or offline behavior changes.
- Keep this file lean; add only rules that prevent real implementation mistakes.
- If registration/contact APIs are added later, revise the current warning about missing handlers.

Last Updated: 2026-04-21
