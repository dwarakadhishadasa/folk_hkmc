# Project Overview

## Summary

`folk_hkmc` is a program-scoped HKMC operations monorepo. It currently ships two Next.js applications, FOLK Chennai and Gita Life, with shared staff-auth, UI, and program-configuration packages. Each app supports three public flows and several staff-only workflows:

- Program-branded public landing page
- Public registration, including registration from an attendance session link
- Public session attendance marking
- Staff contact capture
- Staff session creation and QR-based live attendance monitoring
- Staff invitation flows for Admin, Preacher, and Volunteer users
- An in-app `/manage` portal for operational management

Each program app is a standalone Next.js App Router deployment under `apps/*`. Supabase provides both staff authentication and the operational data store: `public.users` is the staff source of truth and `contacts`, `attendance`, `sessions`, and `locations` hold program records, separated by a `program_id` column.

## Current-State Delta From Previous Docs

The prior documentation from 2026-04-23 is stale. Current code includes:

- Program-scoped app workspaces under `apps/folk` and `apps/gita-life`
- Shared packages under `packages/*` for data contracts, program config, server auth exports, and UI primitives
- Supabase auth clients under `lib/supabase/*`
- Supabase migrations under `supabase/migrations/*`
- `users`, `contacts`, `attendance`, `sessions`, `locations`, `programs`, `audit_events`, and `invite_log` tables, plus the `contact_attendance_counts` rollup view
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
| Auth architecture | Supabase email OTP/invite session cookies plus `public.users` staff-context resolution |
| Operational data | Supabase Postgres, accessed server-side through `lib/supabase/data.ts` |
| Local relational data | Supabase Postgres for users, contacts, attendance, sessions, locations, programs, audit events, and invite log, with RLS-scoped authenticated reads |
| Offline support | Service worker queue for selected POST requests |
| Tests | No automated product test suite; guardrails, workspace typecheck, builds, and linting are configured |

## Main User Roles

| Role | Access |
| --- | --- |
| Public visitor | Landing page, registration, attendance link |
| Volunteer | `/contact` only; contacts route to assigned Preacher |
| Preacher | Contact capture, sessions, live dashboard, volunteer invite, `/manage` portal |
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

Admins can invite Admin, Preacher, Volunteer, or Assistant users from `/admin/invite`. Admin/Preacher users can invite Volunteers from `/volunteers`. Invites upsert `public.users`, send Supabase invite email, and write an `invite_log` row.

## High-Level Dependencies

| Category | Technology |
| --- | --- |
| Framework | Next.js `16.0.7` |
| UI | React `19.2.0`, Tailwind CSS `4.1.9`, Radix/shadcn-style primitives |
| Auth | `@supabase/ssr`, `@supabase/supabase-js` |
| Workspace packages | `@hkmc/data-contracts`, `@hkmc/program-config`, `@hkmc/authz`, `@hkmc/ui` |
| Operational API | Supabase PostgREST and Storage through the server-only Supabase clients in `lib/supabase/*` |
| Forms | Native React forms plus installed `react-hook-form`/`zod` support |
| Animation | GSAP, `tw-animate-css` |
| QR | `qrcode.react` |
| Monitoring | Vercel Speed Insights |

## Principal Risks

- `next build` ignores TypeScript errors, so type checking must be run separately.
- Program workspaces must stay in parity for shared flows unless a program intentionally diverges.
- Supabase service-role access is required server-side for staff-context resolution and all writes; RLS governs authenticated reads only.
- Database-enforced RLS policies must stay in step with the role scoping contract in `rls-policy-matrix.md`.
- The service worker has both active and legacy queue paths; keep request paths synchronized if routes change.
- Several legacy helpers/components remain in the repo but are not active runtime paths.
