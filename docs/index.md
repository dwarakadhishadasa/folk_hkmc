# folk_hkmc Documentation Index

**Type:** pnpm/Turborepo monorepo
**Primary Language:** TypeScript
**Architecture:** Program-scoped Next.js App Router apps with Supabase staff authentication, Airtable operational data, and PWA offline queueing
**Last Updated:** 2026-06-13

## Current State Check

The previous generated docs were last updated on 2026-04-23 and no longer reflected the codebase. The current code now includes Supabase authentication, a local Supabase staff profile bridge, implemented registration/contact/session/admin APIs, role-scoped staff pages, an ESLint setup, and additional operational scripts.

## Project Overview

`folk_hkmc` contains separate FOLK and Gita Life Next.js 16 App Router apps under `apps/`. They share Supabase staff authentication, Airtable-backed operational workflows, and common packages while keeping program-specific app shells and environment files.

## Quick Reference

- **Entry points:** `apps/folk/app/layout.tsx`, `apps/gita-life/app/layout.tsx`
- **Public pages:** `/`, `/register`, `/attend`
- **Staff pages:** `/contact`, `/sessions`, `/dashboard`, `/volunteers`, `/admin/invite`, `/manage`
- **Auth:** Supabase email OTP/invite flow with server cookies and `staff_profiles`
- **Operational store:** Airtable REST API via `lib/airtable.ts`
- **Local auth bridge:** Supabase tables `staff_profiles` and `invite_log`
- **Offline/PWA:** `public/sw.js`, `public/manifest.json`, `components/offline-indicator.tsx`
- **Package manager:** `pnpm`

## Generated Documentation

- [Executive Deck](./executive-deck.md) - Leadership-facing summary of the current product and risks
- [Project Overview](./project-overview.md) - Purpose, capabilities, classification, and current-state delta
- [Architecture](./architecture.md) - Runtime architecture, auth, data flows, and constraints
- [Source Tree Analysis](./source-tree-analysis.md) - Annotated repository structure and critical files
- [Component Inventory](./component-inventory.md) - Active UI surfaces, infrastructure components, and legacy leftovers
- [Development Guide](./development-guide.md) - Local setup, commands, environment, and verification notes
- [Deployment Guide](./deployment-guide.md) - Deployment prerequisites, secrets, Supabase, Airtable, and PWA concerns
- [Contribution Guide](./contribution-guide.md) - Branch, PR, owner-review, and local verification workflow
- [API Contracts](./api-contracts.md) - Implemented route handlers, auth requirements, payloads, and responses
- [Data Models](./data-models.md) - Airtable records, Supabase tables, auth context, and offline queue shapes

## Existing Reference Documentation

- [NestJS Backend Reference](./nestjs-backend.md) - Historical/reference notes for a possible separate backend

## Getting Started

```bash
pnpm install
pnpm supabase:start
pnpm supabase:push
pnpm supabase:env
pnpm dev
```

For production-like behavior, provide Airtable table IDs and Supabase credentials from `.env.example`. Do not commit real Airtable tokens or Supabase service-role keys.

## Common Checks

```bash
pnpm typecheck:workspace
pnpm lint
pnpm build
```

There is no automated application test suite in this repository today. Use manual smoke checks for staff auth, route redirects, contact creation, session creation, attendance registration, live dashboard refresh, admin/volunteer invites, and offline queueing.

## For AI-Assisted Development

Read these first before planning or implementation:

- `architecture.md` for system constraints and auth/data flow
- `api-contracts.md` before wiring or changing requests
- `data-models.md` before changing Airtable or Supabase fields
- `component-inventory.md` before adding or replacing UI
- `development-guide.md` before running local checks

Important current caveats:

- The app configs import shared root `next.config.mjs`, which still ignores TypeScript build errors, so run `pnpm typecheck:workspace` explicitly.
- `components/registration-form.tsx`, `components/offline-sync-provider.tsx`, `lib/offline-sync.ts`, and `lib/store.ts` are present but not part of the active mounted runtime path.
- Staff access is not localStorage-based anymore; Supabase cookies and `staff_profiles` are the source for staff session state.

Generated as part of a BMAD `document-project` full rescan on 2026-06-11.
