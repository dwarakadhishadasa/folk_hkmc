# Project Overview

## Summary

`folk_hkmc` is a program-scoped HKMC operations monorepo. It currently ships two Next.js applications, FOLK Chennai and Gita Life, with shared staff-auth, Airtable, UI, and program-configuration packages. Each app supports three public flows and several staff-only workflows:

- Program-branded public landing page
- Public registration, including registration from an attendance session link
- Public session attendance marking
- Staff contact capture
- Staff session creation and QR-based live attendance monitoring
- Staff invitation flows for Admin, Preacher, and Volunteer users
- Airtable interface redirect for operational management

Each program app is a standalone Next.js App Router deployment under `apps/*`. Supabase provides staff authentication plus a program-scoped authorization cache. Airtable remains the operational data store for program records, with program-specific env overrides and shared table mappings.

## Current-State Delta From Previous Docs

The prior documentation from 2026-04-23 is stale. Current code includes:

- Program-scoped app workspaces under `apps/folk` and `apps/gita-life`
- Shared packages under `packages/*` for data contracts, program config, server auth exports, Airtable exports, and UI primitives
- Supabase auth clients under `lib/supabase/*`
- Supabase migrations under `supabase/migrations/*`
- `staff_profiles`, `staff_memberships`, `programs`, `airtable_identities`, `airtable_sync_state`, `audit_events`, and `invite_log` local tables
- Root `proxy.ts` plus app-local `apps/*/proxy.ts` files for Supabase cookie refresh on protected paths
- Implemented `/api/registration`, `/api/contact`, `/api/sessions`, `/api/admin/*`, `/api/volunteers/invite`, `/api/auth/*`, and `/attendance` routes in each program app
- Server-seeded staff auth shells through `StaffAuthShell`
- Program-aware staff membership scoping for Admin, Preacher, and Volunteer roles
- Admin location creation and staff invitation
- Session-specific attendance windows and QR links
- ESLint config, monorepo guardrails, app build filters, GitHub quality gates, and branch-policy workflows

## Classification

| Area | Current classification |
| --- | --- |
| Repository shape | pnpm/Turborepo monorepo with two program app workspaces |
| Primary framework | Next.js 16 App Router |
| Runtime split | Server route handlers plus client-heavy React UI |
| Auth architecture | Supabase email OTP/invite session cookies plus local `staff_memberships` authorization cache |
| Operational data | Airtable REST API, resolved through program-scoped config |
| Local relational data | Supabase Postgres for programs, staff memberships, legacy staff profiles, Airtable identities, audit events, and invite log |
| Offline support | Service worker queue for selected POST requests |
| Tests | No automated product test suite; guardrails, workspace typecheck, builds, and linting are configured |

## Main User Roles

| Role | Access |
| --- | --- |
| Public visitor | Landing page, registration, attendance link |
| Volunteer | `/contact` only; contacts route to assigned Preacher |
| Preacher | Contact capture, sessions, live dashboard, volunteer invite, Airtable manage redirect |
| Admin | All staff actions, including staff invite and location creation |

## Product Capabilities

### Public Onboarding

The landing page at `/` is program-branded by the active app. `/register` captures name, mobile, age, occupation, year, and optional location. When opened with `?session=<sessionId>`, registration also marks attendance for that session.

### Attendance

`/attend?session=<sessionId>` lets a participant mark attendance with a 10-digit mobile number. Unknown mobile numbers are redirected to `/register` with the mobile and session pre-filled. The route exists separately in each program deployment.

### Staff Contact Capture

`/contact` is staff-only. Admins choose an active Preacher owner. Preachers own their own contacts. Volunteers create contacts assigned to their configured Preacher.

### Session Operations

`/sessions` lets Admin and Preacher users create an attendance session for a location and duration. The app generates a public `/attend` link and QR code, then shows live attendance while the session is active.

### Staff Invites

Admins can invite Admin, Preacher, or Volunteer users from `/admin/invite`. Admin/Preacher users can invite Volunteers from `/volunteers`. Invites upsert Airtable Users, send Supabase invite email, and write an `invite_log` row.

## High-Level Dependencies

| Category | Technology |
| --- | --- |
| Framework | Next.js `16.0.7` |
| UI | React `19.2.0`, Tailwind CSS `4.1.9`, Radix/shadcn-style primitives |
| Auth | `@supabase/ssr`, `@supabase/supabase-js` |
| Workspace packages | `@hkmc/data-contracts`, `@hkmc/program-config`, `@hkmc/authz`, `@hkmc/airtable`, `@hkmc/ui` |
| Operational API | Airtable REST API through program-scoped env/profile resolution |
| Forms | Native React forms plus installed `react-hook-form`/`zod` support |
| Animation | GSAP, `tw-animate-css` |
| QR | `qrcode.react` |
| Monitoring | Vercel Speed Insights |

## Principal Risks

- `next build` ignores TypeScript errors, so type checking must be run separately.
- Program workspaces must stay in parity for shared flows unless a program intentionally diverges.
- Supabase service-role access is required server-side for admin/auth bridge operations.
- Airtable schema/table IDs are environment-driven and can be overridden per program.
- The service worker has both active and legacy queue paths; keep request paths synchronized if routes change.
- Several legacy helpers/components remain in the repo but are not active runtime paths.
