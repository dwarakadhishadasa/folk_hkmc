# folk_hkmc - Project Overview

**Date:** 2026-04-23
**Type:** Web Application
**Architecture:** Single-part Next.js App Router monolith

## Executive Summary

`folk_hkmc` supports the FOLK Chennai registration and attendance workflow. Public users can discover the program, register, and mark attendance. Logged-in staff can add contacts and, if they have the preacher role, access a live attendance dashboard. The system is implemented as a client-heavy Next.js application backed by Airtable for operational data.

Although the product includes a protected staff experience, authentication is entirely local to the browser and uses hardcoded credentials stored in `localStorage`. The only implemented server route in this repository is `app/attendance/route.ts`, which handles attendance lookup, duplicate checks, creation, and dashboard reads against Airtable. Registration and contact submission are expected by the UI but do not currently have matching route handlers in this repo.

## Project Classification

- **Repository Type:** Monolith
- **Project Type(s):** Web application
- **Primary Language(s):** TypeScript, CSS
- **Architecture Pattern:** Client-heavy App Router UI with a thin server integration layer

## Technology Stack Summary

| Category | Technology | Notes |
| --- | --- | --- |
| Framework | Next.js 16.0.7 | App Router project under `app/` |
| UI Runtime | React 19.2.0 | Client components drive most feature logic |
| Language | TypeScript | `strict: true`, path alias `@/*` |
| Styling | Tailwind CSS v4 | Brand palette defined in `app/globals.css` |
| UI Toolkit | Radix + shadcn-style wrappers | Large `components/ui/*` inventory |
| Data Integration | Airtable REST API | Contacts and attendance tables in `lib/airtable.ts` |
| Offline/PWA | Service worker + manifest + IndexedDB | Request queue handled in `public/sw.js` |
| Package Manager | pnpm | `pnpm-lock.yaml` present |

## Key Features

- Public marketing homepage for the FOLK Chennai program
- Registration flow for new users
- Attendance capture using a mobile-number-based lookup
- Duplicate-attendance prevention for same-day check-ins
- Protected contact-entry workflow for authenticated staff
- Protected live attendance dashboard with QR code sharing
- PWA installation prompt and offline request queueing

## Architecture Highlights

- The app is a single deployable unit with both UI routes and one server route in the same Next.js project.
- Authentication and authorization are enforced in client components, not at the API boundary.
- Airtable is the live system of record for attendance and contact lookups used by implemented backend logic.
- Offline support is coordinated through the service worker, browser APIs, and UI messaging.
- Some code paths reflect an unfinished transition: the UI expects `/api/registration` and `/api/contact`, but those endpoints are absent from the repository.

## Development Overview

### Prerequisites

- Node.js 20+
- `pnpm`
- `AIRTABLE_API_TOKEN`

### Getting Started

Install dependencies, provide `AIRTABLE_API_TOKEN`, and run the dev server with `pnpm dev`. Use the attendance flow to exercise the implemented server route. Staff-only views require local credentials from `lib/auth-context.tsx`.

### Key Commands

- **Install:** `pnpm install`
- **Dev:** `pnpm dev`
- **Build:** `pnpm build`
- **Lint:** `pnpm lint`

## Repository Structure

The active product code lives primarily under:

- `app/` for route entry points and the attendance route handler
- `components/` for feature UI, provider wiring, and infrastructure widgets
- `lib/` for auth, Airtable integration, offline utilities, and legacy store types
- `public/` for PWA assets, manifest, icons, and service worker

Supporting brownfield/planning material also exists under:

- `docs/`
- `_bmad/`
- `.agents/`
- `_bmad-output/`
- `design-artifacts/`

## Documentation Map

- [index.md](./index.md) - Master documentation index
- [architecture.md](./architecture.md) - Runtime and integration architecture
- [source-tree-analysis.md](./source-tree-analysis.md) - Directory structure and entry points
- [development-guide.md](./development-guide.md) - Local development and validation workflow

---

Generated using the BMAD `document-project` workflow pattern.
