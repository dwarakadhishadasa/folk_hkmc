---
project_name: "folk_hkmc"
user_name: "Dwaraka"
date: "2026-06-11"
sections_completed:
  - technology_stack
  - language_rules
  - framework_rules
  - testing_rules
  - quality_rules
  - workflow_rules
  - anti_patterns
status: "complete"
rule_count: 28
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

- Next.js `16.0.7` with App Router and `proxy.ts`
- React `19.2.0` and React DOM `19.2.0`
- TypeScript `^5` with `strict: true` and path alias `@/*`
- Tailwind CSS `^4.1.9` via `@tailwindcss/postcss`, plus `tw-animate-css` and `tailwindcss-animate`
- Radix UI primitives plus shadcn-style wrappers under `components/ui/*`
- Supabase auth and local Postgres bridge via `@supabase/ssr`, `@supabase/supabase-js`, `lib/supabase/*`, and `supabase/migrations/*`
- Airtable REST API integration from server-only code in `lib/airtable.ts`
- PWA/offline support through `public/manifest.json`, `public/sw.js`, IndexedDB request queueing, and `components/offline-indicator.tsx`
- Animation/UX helpers include GSAP, Vercel Speed Insights, and `qrcode.react`
- Runtime config quirks: `next.config.mjs` sets `typescript.ignoreBuildErrors = true` and `images.unoptimized = true`

## Critical Implementation Rules

### Language-Specific Rules

- Keep TypeScript strict even though Next build ignores type errors; run `pnpm exec tsc --noEmit` explicitly for type safety.
- Use the `@/*` alias for local imports instead of long relative paths.
- Match existing file style when editing: app/custom files mostly use double quotes, while many generated UI primitives use single quotes.
- Preserve explicit interfaces/types close to usage sites for auth state, Airtable payloads, route payloads, and Supabase row shapes.

### Framework-Specific Rules

- This is a client-heavy App Router app with server route handlers. Components using hooks, browser APIs, localStorage, service workers, `MessageChannel`, or GSAP must be client components.
- Staff pages commonly validate staff on the server with `getStaffContext()` and seed client auth with `StaffAuthShell`.
- Do not replace the current Supabase staff auth model with the old localStorage/demo-user model. Durable auth state comes from Supabase cookies; React auth state is only a hydrated view of `/api/auth/me`.
- `proxy.ts` refreshes Supabase sessions for protected staff pages and protected API paths. Update its matcher if new staff-only routes are added.
- The live attendance endpoint is `/attendance`, not `/api/attendance`. Frontend attendance submission, dashboard polling, and service-worker queueing depend on that path.
- Preserve the current branding system in `app/globals.css`: royal blue/saffron palette, `Poppins` headings, `Inter` body text, rounded cards, and warm ivory backgrounds.

### Auth & Authorization Rules

- `lib/authz.ts` is the server authorization boundary. Use `getStaffContext()` and `requireRole()` for staff-only server logic.
- Staff roles are exactly `Admin`, `Preacher`, and `Volunteer`.
- `staff_profiles` is a Supabase Postgres authorization cache keyed by Supabase Auth user ID. It is synced from Airtable staff users during sign-in/callback flows.
- Airtable Users remain the source for staff email, role, status, locations, Supabase user ID, and assigned Preacher.
- Volunteer staff should only land on and use `/contact`; Preacher/Admin users can access sessions/dashboard/invite flows according to route guards.
- Keep Supabase service-role access server-only. Never import `createSupabaseAdminClient()` into client components.

### API & Route Rules

- Implemented route handlers include `/api/auth/me`, `/api/auth/signin`, `/api/auth/complete-implicit`, `/api/registration`, `/api/contact`, `/api/sessions`, `/api/admin/invite-user`, `/api/admin/locations`, `/api/volunteers/invite`, `/attendance`, `/auth/confirm`, and `/auth/signout`.
- Public registration without `sessionId` creates a Contact and rejects duplicates. Registration with `sessionId` creates/reuses the Contact and also marks attendance for that session.
- Attendance requires a session-specific link and validates `Public Attendance Enabled`, open/close window, duplicate attendance, and known contact.
- Session creation depends on `NEXT_PUBLIC_SITE_URL` to generate `/attend?session=...` links.
- Staff contact creation is role-routed: Volunteer -> assigned Preacher, Preacher -> self, Admin -> explicit active Preacher.
- Admin invites can create Admin/Preacher/Volunteer users; `/api/volunteers/invite` creates only Volunteers.

### Data & Integration Rules

- `lib/airtable.ts` requires `AIRTABLE_API_TOKEN`, `AIRTABLE_BASE_ID`, and table ID env vars for contacts, attendance, sessions, users, and locations.
- Airtable calls must remain server-only. Do not move Airtable tokens or Airtable REST calls into client components.
- Mobile numbers are normalized to the last 10 digits by `normalizeMobile()` and by client input handlers. Preserve this on both input and server boundaries.
- Airtable Session records drive live attendance. Dashboard incremental refresh sends known attendance record IDs and expects stable Airtable record IDs.
- `listCachedLocations()` and `listCachedActivePreachers()` use Next `unstable_cache` with a 20-minute TTL. Revalidate tags when mutating cached reference data.
- Supabase migrations currently define `staff_profiles` and `invite_log`; update `lib/supabase/types.ts` when schema changes.

### Offline/PWA Rules

- Offline behavior is coupled across `public/sw.js`, `components/service-worker-register.tsx`, `components/offline-indicator.tsx`, and forms that react to `202 queued` responses.
- `public/sw.js` queues selected POST paths: `/api/contact`, `/api/registration`, `/registration` legacy path, and `/attendance`.
- Staff contact replay depends on the Supabase session cookie still being valid when the browser reconnects.
- `components/offline-sync-provider.tsx` and `lib/offline-sync.ts` are present but not mounted in `components/providers.tsx`; do not assume their localStorage queue is active.

### Testing Rules

- There is no automated product test suite configured in this repo right now.
- ESLint is configured with `eslint.config.mjs`; run `pnpm lint` for lint checks.
- Because `next build` ignores TypeScript errors, run `pnpm exec tsc --noEmit` before relying on build results.
- At minimum, manually smoke-test affected flows in the browser for staff auth redirects, attendance submission, session-backed registration, staff contact creation, Airtable-backed reads, invite flows, and offline/PWA behavior when relevant.

### Code Quality & Style Rules

- Reuse existing primitives from `components/ui/*`, existing feature components, and the shared `cn()` helper in `lib/utils.ts` before adding new base UI elements.
- Keep route files in App Router conventions: lowercase segment folders with `page.tsx`, `loading.tsx`, or `route.ts`; keep reusable components in `components/` with PascalCase exports.
- Follow current state-management patterns: local React state, small helpers, and `AuthProvider` for staff auth view state.
- Prefer small explicit handlers for input normalization, validation, and submission logic.
- Treat `components/registration-form.tsx`, `lib/store.ts`, `lib/offline-sync.ts`, and `components/offline-sync-provider.tsx` as legacy or inactive unless reconnecting them intentionally.

### Development Workflow Rules

- Use `pnpm` conventions because the repo includes `pnpm-lock.yaml` and package scripts for `dev`, `build`, `start`, `lint`, and Supabase helpers.
- Use `pnpm supabase:start`, `pnpm supabase:env`, and `pnpm dev` for local Supabase-backed development.
- Branch workflow: normal work happens on `feature/*` branches, targeting `dev`; `main` is owner-controlled production.
- Treat `_bmad-output/`, `design-artifacts/`, and `docs/` as supporting artifacts and references; the actual product code lives under `app/`, `components/`, `hooks/`, `lib/`, `public/`, `scripts/`, `supabase/`, and `styles/`.

### Critical Don't-Miss Rules

- The old warning that `/api/registration` and `/api/contact` are missing is obsolete; both routes exist.
- The old claim that authentication is entirely local/client-side is obsolete; current staff auth is Supabase-backed with a server-side staff profile bridge.
- Do not import server-only modules (`lib/airtable.ts`, `lib/authz.ts`, `lib/supabase/admin.ts`, `lib/invite-log.ts`) into client components.
- Keep Supabase redirect handling aligned across `/login`, `/auth/confirm`, `/auth/hash-callback`, `AuthHashCallback`, and `/api/auth/complete-implicit`.
- `NEXT_PUBLIC_SITE_URL` is required for session attendance link generation and Supabase invite redirects.
- The Airtable manage page redirects to an Airtable interface using `AIRTABLE_BASE_ID` and `AIRTABLE_INTERFACE_DASHBOARD_PAGE_ID`.

---

## Usage Guidelines

**For AI Agents:**

- Read this file before implementing product code.
- Treat Supabase staff auth, Airtable integration, route paths, and service-worker coupling as hard constraints.
- Prefer existing repo patterns over generic Next.js best practices when they conflict.
- Verify API existence and active component usage from the codebase before wiring frontend calls.

**For Humans:**

- Update this file when route structure, staff auth, Airtable schema, Supabase schema, or offline behavior changes.
- Keep this file lean; add only rules that prevent real implementation mistakes.
- If inactive legacy files are removed or reconnected, revise the current warnings.

Last Updated: 2026-06-11
