# folk_hkmc Documentation Index

**Type:** pnpm/Turborepo monorepo
**Primary Language:** TypeScript
**Architecture:** Program-scoped Next.js App Router apps with Supabase staff authentication, Supabase Postgres operational data, and PWA offline queueing
**Last Updated:** 2026-06-13
## Current State Check

The older generated docs described a single root app and no longer reflected the current codebase. The current code now includes program-scoped Next.js app workspaces, Supabase authentication, a program-scoped staff membership bridge, implemented registration/contact/session/admin APIs in each app, role-scoped staff pages, monorepo guardrails, quality gates, and additional operational scripts.

## Project Overview

`folk_hkmc` contains separate FOLK and Gita Life Next.js 16 App Router apps under `apps/`. They share Supabase staff authentication, Supabase-backed operational workflows, and common packages while keeping program-specific app shells and environment files.

## Quick Reference

- **Entry points:** `apps/folk/app/layout.tsx`, `apps/gita-life/app/layout.tsx`
- **Public pages:** `/`, `/register`, `/attend`
- **Staff pages:** `/contact`, `/sessions`, `/dashboard`, `/volunteers`, `/admin/invite`, `/manage`
- **Auth:** Supabase email OTP/invite flow with server cookies and program-scoped `public.users`
- **Operational store:** Supabase Postgres via `lib/supabase/data.ts`
- **Core tables:** `users`, `contacts`, `attendance`, `sessions`, `locations`, `programs`, `audit_events`, and `invite_log`
- **Offline/PWA:** `public/sw.js`, `public/manifest.json`, `components/offline-indicator.tsx`
- **Package manager:** `pnpm`

## Generated Documentation

- [Executive Deck](./executive-deck.md) - Leadership-facing summary of the current product and risks
- [Project Overview](./project-overview.md) - Purpose, capabilities, classification, and current-state delta
- [Architecture](./architecture.md) - Runtime architecture, auth, data flows, and constraints
- [Source Tree Analysis](./source-tree-analysis.md) - Annotated repository structure and critical files
- [Component Inventory](./component-inventory.md) - Active UI surfaces, infrastructure components, and legacy leftovers
- [Development Guide](./development-guide.md) - Local setup, commands, environment, and verification notes
- [Deployment Guide](./deployment-guide.md) - Deployment prerequisites, secrets, Supabase, and PWA concerns
- [Contribution Guide](./contribution-guide.md) - Branch, PR, owner-review, and local verification workflow
- [API Contracts](./api-contracts.md) - Implemented route handlers, auth requirements, payloads, and responses
- [Data Models](./data-models.md) - Supabase records and tables, RLS scoping, auth context, and offline queue shapes

## Existing Reference Documentation

- [Testing Architecture and Policy](./architecture/testing.md) - **Read before changing code.** What to run at each level, the feature-to-test registry, which shared files widen the regression blast radius, and how to diagnose a failure. Notes that `pnpm test` runs zero tests and exits 0.
- [Manage Grid Pattern](./manage-grid-pattern.md) - The contract every `/manage` table follows: column conventions, commit/rollback, selection, bulk semantics, and the URL state contract. Read it before porting a table onto `components/grid/`.
- [Claiming a Matrix Row](./claiming-a-matrix-row.md) - How to satisfy the six rules that turn a matrix row from Manual to Covered, and what evidence to record.
- [Airtable Legacy Base](./airtable-legacy-base.md) - Reference snapshot of the retired Airtable base: table and field identities with types, the Interface pages it served, and a field-by-field validation of the migration map in `scripts/migrate-airtable-data.mjs`
- [Airtable Mobile Interface](./airtable-mobile-interface.md) - The Airtable Android app's rendering of the same "Admin Portal" interface: the list → field sheet → expanded record stack, and why its field labels differ from the base's field names. Read it before changing the contact surface in `components/manage/`.
- [NestJS Backend Reference](./nestjs-backend.md) - Historical/reference notes for a possible separate backend

## Getting Started

```bash
pnpm install
pnpm supabase:start
pnpm supabase:push
pnpm supabase:env
pnpm dev
```

For production-like behavior, provide Supabase credentials and `PROGRAM_ID`/`NEXT_PUBLIC_PROGRAM_ID` from `.env.example`. Do not commit Supabase service-role keys.

## Common Checks

```bash
pnpm test:static   # guardrails + typecheck + lint
pnpm test:e2e      # full Playwright suite (needs the local stack)
```

Note that `pnpm test` runs **zero tests** and exits 0 — no package defines a
`test` script. There is no unit-test runner in this repository; the automated
suites are the `scripts/` verification gates and the Playwright specs under
`e2e/specs/`. See [Testing Architecture and Policy](./architecture/testing.md)
for the feature-to-test registry and the three testing levels.

## For AI-Assisted Development

Read these first before planning or implementation:

- `architecture.md` for system constraints and auth/data flow
- `api-contracts.md` before wiring or changing requests
- `data-models.md` before changing Supabase fields or RLS scoping
- `component-inventory.md` before adding or replacing UI
- `development-guide.md` before running local checks
- `architecture/testing.md` before changing code — what to run, and what "green" actually means here

Important current caveats:

- The app configs import shared root `next.config.mjs`, which still ignores TypeScript build errors, so run `pnpm typecheck:workspace` explicitly.
- `components/registration-form.tsx`, `components/offline-sync-provider.tsx`, `lib/offline-sync.ts`, and `lib/store.ts` are present but not part of the active mounted runtime path.
- Staff access is not localStorage-based anymore; Supabase cookies and `public.users` are the primary source for program staff authorization. The `staff_memberships`/`staff_profiles`/`airtable_identities`/`airtable_sync_state` bridge tables have been dropped.

Updated through a BMAD `document-project` documentation freshness pass on 2026-06-13.
