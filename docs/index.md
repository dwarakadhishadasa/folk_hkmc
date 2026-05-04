# folk_hkmc Documentation Index

**Type:** monolith
**Primary Language:** TypeScript
**Architecture:** Client-heavy Next.js App Router web application with Airtable-backed server logic and PWA offline support
**Last Updated:** 2026-04-23

## Project Overview

`folk_hkmc` is the frontend application for the FOLK Chennai program. It combines a public landing experience, a registration journey, attendance capture, a protected contact-entry flow, and a live attendance dashboard for staff users. The product is implemented as a single Next.js App Router application, with most user-facing logic in client components and a small server surface for attendance operations.

The current system is best understood as a brownfield web monolith with three important architectural characteristics:

- Client-side authentication and route gating for staff experiences
- Airtable as the operational data store for contacts and attendance
- Progressive Web App behavior with a service worker and offline POST queueing

## Quick Reference

- **Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, shadcn/Radix UI primitives, Airtable REST API
- **Entry Point:** `app/layout.tsx` and `app/page.tsx`
- **Architecture Pattern:** Single-part App Router monolith
- **Primary Data Store:** Airtable base `apprnbZdVhoog9vgG`
- **Offline Support:** `public/sw.js` + IndexedDB queue in the browser
- **Package Manager:** `pnpm`

## Generated Documentation

### Core Documentation

- [Project Overview](./project-overview.md) - Executive summary, classification, and high-level technology picture
- [Source Tree Analysis](./source-tree-analysis.md) - Annotated repository structure and key entry points
- [Architecture](./architecture.md) - Runtime architecture, flows, constraints, and integration details
- [Component Inventory](./component-inventory.md) - Reusable, route-specific, and infrastructure UI components
- [Development Guide](./development-guide.md) - Local setup, commands, credentials, and manual verification notes
- [API Contracts](./api-contracts.md) - Implemented route contracts plus client-assumed but missing APIs
- [Data Models](./data-models.md) - Airtable records, local session shapes, offline queue records, and legacy store types

## Existing Documentation

- [NestJS Backend Reference](./nestjs-backend.md) - Reference notes for a future separate backend implementation

## Getting Started

### Prerequisites

- Node.js 20+ recommended
- `pnpm`
- `AIRTABLE_API_TOKEN` for any flow that touches Airtable-backed server logic

### Setup

```bash
pnpm install
pnpm dev
```

### Common Commands

```bash
pnpm dev
pnpm lint
pnpm build
pnpm start
```

### Tests

There is no automated test suite configured in this repository today. Validation is currently manual.

## For AI-Assisted Development

This documentation is intended to make brownfield planning and implementation safer. Before changing behavior in this app, read:

- `architecture.md` for route, auth, Airtable, and offline constraints
- `api-contracts.md` before wiring or changing requests
- `data-models.md` before changing payload shapes or Airtable field assumptions
- `component-inventory.md` before adding new primitives or duplicating UI

For brownfield planning artifacts, also see:

- [`_bmad-output/planning-artifacts/prd.md`](../_bmad-output/planning-artifacts/prd.md)
- [`_bmad-output/planning-artifacts/architecture.md`](../_bmad-output/planning-artifacts/architecture.md)

---

Generated as part of the BMAD `document-project` brownfield scan.
