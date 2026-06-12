---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-gita-life-operations/prd.md
  - _bmad-output/planning-artifacts/prds/prd-gita-life-operations/addendum.md
  - _bmad-output/planning-artifacts/prds/prd-gita-life-operations/validation-report.md
  - _bmad-output/planning-artifacts/prds/prd-gita-life-operations/.decision-log.md
  - _bmad-output/project-context.md
  - docs/architecture.md
  - docs/api-contracts.md
  - docs/data-models.md
  - docs/project-overview.md
workflowType: 'architecture'
lastStep: 8
status: 'complete'
completedAt: '2026-06-12'
project_name: 'folk_hkmc'
architecture_subject: 'HKM Program Operations Portals'
source_prd: '_bmad-output/planning-artifacts/prds/prd-gita-life-operations/prd.md'
user_name: 'Dwaraka'
date: '2026-06-12'
---

# Architecture Decision Document: HKM Program Operations Portals

_This document builds collaboratively through the BMAD create-architecture workflow. It is scoped to the `prd-gita-life-operations` PRD and preserves the existing top-level architecture artifact as historical context._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
The PRD defines 22 functional requirements across portal entry, staff authentication, program-scoped access, Airtable integration, public registration, attendance, staff contact capture, sessions, live dashboard, invites, location management, and Airtable handoff. Architecturally, this is a two-app operations platform, not an extension of the current single FOLK runtime.

**Non-Functional Requirements:**
Security, authorization, program data isolation, performance, reliability, WCAG 2.2 AA accessibility, mobile-first workflows, observability, cross-app consistency, configurability, and Vercel compatibility all directly shape the architecture.

**Scale & Complexity:**
- Primary domain: full-stack web operations platform
- Complexity level: high
- Estimated architectural components: two Next.js Program Apps, shared Supabase identity/membership schema, two Airtable integration profiles, shared contracts package or conventions, public registration/attendance flows, staff role guards, sync/audit layer, PWA/offline queue, deployment/domain configuration

### Technical Constraints & Dependencies

- Use two program-specific Next.js App Router applications: Gita Life Ops and FOLK Ops.
- Use one shared Supabase project/database for staff identity, membership, role cache, auth sessions, audit, and runtime authorization.
- Use two separate Airtable Bases as operational sources of truth.
- Keep Airtable and Supabase service credentials server-only.
- Preserve current FOLK parity flows while making Program scope explicit.
- Keep current V1 staff roles exactly: `Admin`, `Preacher`, `Volunteer`.
- Current repo is a single FOLK monolith; Gita Life public-page/API ownership is unverified.
- Current implementation context includes Supabase staff auth, `/api/contact`, `/api/registration`, `/api/sessions`, `/attendance`, invite routes, and service-worker queueing.

### Architecture Decision Points From PRD Section 12

- DD-1: Airtable Base IDs and table structures
- DD-2: Staff registry model
- DD-3: Revocation sync window and stale-sync policy
- DD-6: Login method
- DD-7: Cross-subdomain session policy
- DD-8: Staff visibility into contact comments and profile details
- DD-9: Data retention policy
- DD-10: Final production domains

### Cross-Cutting Concerns Identified

- Program isolation across schemas, API routes, caches, audit events, and Airtable credentials
- Shared identity with program-scoped memberships and roles
- Airtable-to-Supabase sync freshness and fail-closed authorization
- Two branded app experiences without duplicating business logic unsafely
- Offline public registration and attendance idempotency
- Session-backed registration and attendance consistency
- Admin/preacher/volunteer authorization boundaries
- Vercel-compatible server route design
- Observability for auth, sync, invites, queued writes, and Airtable failures

## Starter Template Evaluation

### Primary Technology Domain

Full-stack Next.js App Router web platform with two deployable Program Apps, shared Supabase authorization, Airtable integrations, and shared UI/contracts.

### Starter Options Considered

1. **Next.js `create-next-app` per app**
   - Current official scaffold for a single Next.js app.
   - Good for isolated apps, but weaker for shared schemas, shared UI, shared role contracts, and cross-app consistency.

2. **Turborepo basic starter**
   - Provides a monorepo foundation with two deployable apps and shared libraries.
   - Best match for Gita Life Ops + FOLK Ops plus shared packages.

3. **Vercel template catalog / enterprise boilerplates**
   - Offers richer pre-bundled choices, but likely too opinionated for this brownfield Supabase/Airtable architecture.
   - Useful as a reference for Vercel monorepo deployment shape rather than as a direct replacement.

### Selected Starter: Turborepo Workspace, Adapted In-Place

**Rationale for Selection:**
The architecture should evolve this repo into a workspace with two app boundaries and shared packages, rather than cloning business logic into separate apps. Turborepo supports this shape cleanly and aligns with Vercel monorepo deployment.

**Reference Initialization Command:**

```bash
pnpm dlx create-turbo@latest hkm-program-ops
```

**Brownfield Implementation Note:**
Use the generated structure as a reference. The first implementation story should migrate this repo in place instead of blindly replacing it.

Target shape:

```text
apps/
  folk/
  gita-life/
packages/
  ui/
  program-config/
  data-contracts/
  authz/
  airtable/
```

**Architectural Decisions Provided by Starter:**

**Language & Runtime:**
TypeScript, Next.js App Router, and React-compatible project shape.

**Styling Solution:**
Keep Tailwind CSS and existing shadcn/Radix-style primitives, then move reusable primitives into `packages/ui`.

**Build Tooling:**
Use pnpm workspaces with Turborepo task orchestration for app/package builds, linting, and type checks.

**Testing Framework:**
Do not accept a heavy starter test stack by default. Add focused tests in later architecture decisions around auth, program isolation, Airtable mapping, and critical public flows.

**Code Organization:**
Two deployable apps with shared program config, shared role/membership types, shared Airtable contracts, and shared UI components.

**Development Experience:**
Preserve existing `pnpm` conventions. Add workspace scripts for per-app and all-app lint/type/build checks.

**Vercel Deployment Constraint:**
Deploy each Program App as its own Vercel Project from the same monorepo, with app-specific environment variables and domains. Prefer standard Next.js Route Handlers on the Vercel-supported runtime needed by each integration; use Edge Runtime only where dependencies and behavior are explicitly verified.

**Verification Sources:**
- Next.js `create-next-app` CLI documentation
- Turborepo installation documentation
- Vercel monorepo documentation
- Supabase SSR for Next.js documentation

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions:**
- Use a Turborepo monorepo with `apps/folk` and `apps/gita-life`.
- Deploy each app as a separate Vercel Project from the same repo.
- Use one shared Supabase project for staff identity, profiles, memberships, role cache, audit, and invite logs.
- Use two Airtable Bases as Program operational sources of truth.
- Resolve Program context per deployed app/domain, not by one multiplexed runtime app.
- Keep roles exactly `Admin`, `Preacher`, `Volunteer`.
- Use Supabase email OTP/invite login, preserving the current FOLK auth model.

**Important Decisions:**
- Use Program Capability Profiles to control branding, labels, enabled modules, field mappings, dashboard widgets, and management URLs.
- Keep public attendee/contact records Airtable-backed for MVP.
- Keep public registration and attendance available without staff auth.
- Keep staff contact creation online-only for MVP; only public registration and attendance require offline queueing.

**Deferred Decisions:**
- Exact Airtable Base IDs, table IDs, and field schemas remain DD-1.
- Exact revocation sync threshold remains DD-3.
- Detailed contact/profile visibility and retention policies remain DD-8 and DD-9.
- Final DNS values remain DD-10.

### Data Architecture

- Supabase Auth user is the central staff identity.
- Staff access is modeled as Program-scoped memberships derived from each Program Airtable Base.
- No third central Airtable staff registry for MVP.
- Each Program gets a versioned Program Capability Profile with Airtable base/table/field mappings, labels, enabled modules, and management interface config.
- Airtable remains source of truth for operational records; Supabase is the runtime authorization mirror.
- Exact Airtable Base IDs/table structures remain a carried decision point under DD-1.

### Authentication & Security

- Use Supabase SSR/cookie auth in both Program Apps.
- Use app-local sessions per subdomain for MVP; shared identity does not require cross-subdomain browser SSO.
- Authorization must run server-side through Program-aware membership/role guards.
- Admin and role-changing actions fail closed when sync state is stale or unknown.
- Staff visibility into contact comments/profile details uses least privilege: Admin full Program scope, Preacher assigned/location scope, Volunteer create-only unless explicitly granted.

### API & Communication Patterns

- Use Next.js Route Handlers and REST-style JSON contracts.
- Preserve current public flow contracts: registration, attendance, session-backed registration, duplicate handling, and mobile normalization.
- API routes must be Program-scoped by app config/domain.
- Shared Zod schemas/types should live in `packages/data-contracts`.
- Offline public registration and attendance need idempotent replay semantics.

### Frontend Architecture

- Shared UI primitives move to `packages/ui`.
- Program-specific vocabulary, branding, fields, and module toggles live in `packages/program-config`.
- Keep app-local pages for each Program so Gita Life and FOLK can evolve without unsafe one-off forks.
- Staff contact creation is not required to queue offline in MVP.

### Infrastructure & Deployment

- Vercel is the deployment target.
- `apps/folk` and `apps/gita-life` deploy as separate Vercel Projects with separate domains and env vars.
- Use standard Next.js Route Handlers on the Vercel-supported runtime needed by each integration; use Edge Runtime only when explicitly verified.
- Keep app-specific `NEXT_PUBLIC_SITE_URL`, Airtable token/base/table IDs, and Airtable interface page IDs.
- CI should run workspace lint, typecheck, and build; do not rely on Next build alone for TypeScript safety.

### PRD Section 12 Decision Register

- DD-1: Carry forward exact Airtable Base IDs/table structures as required before sync implementation.
- DD-2: Resolve with Supabase central identity plus Program memberships sourced from separate Airtable Bases.
- DD-3: Carry forward exact revocation sync threshold; architecture requires fail-closed stale-sync behavior.
- DD-6: Resolve with Supabase email OTP/invite login.
- DD-7: Resolve MVP with app-local sessions per subdomain; defer cross-subdomain SSO.
- DD-8: Carry forward detailed field visibility policy; architecture defaults to least privilege.
- DD-9: Carry forward retention durations; architecture must make retention/audit deletions possible.
- DD-10: Carry forward final DNS confirmation; architecture targets Vercel subdomain deployments.

### Decision Impact Analysis

**Implementation Sequence:**
1. Convert the repo to a Turborepo/pnpm workspace.
2. Split current FOLK runtime into `apps/folk`.
3. Extract shared UI, Program config, authz, data contracts, and Airtable helpers into packages.
4. Add shared Supabase membership/schema migrations.
5. Add `apps/gita-life` using the shared packages and Gita Life Program Capability Profile.
6. Configure two Vercel Projects, environment variables, and domains.
7. Implement sync, audit, role guards, and Program-scoped API contracts.

**Cross-Component Dependencies:**
- Program config drives Airtable routing, labels, module availability, management URLs, and public attendance link generation.
- Supabase memberships depend on Airtable staff records and sync freshness.
- Public registration, attendance, dashboard polling, service worker queueing, and session URLs must stay route-contract compatible.
- Vercel deployment configuration must align with Supabase redirect URLs and `NEXT_PUBLIC_SITE_URL` for each Program App.

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:**
AI agents could diverge on Program scoping, package boundaries, API response shape, Supabase table naming, Airtable field mappings, offline replay, auth guards, and Vercel env/domain configuration.

### Naming Patterns

**Database Naming Conventions:**
- Supabase tables use lowercase plural `snake_case`: `programs`, `staff_memberships`, `airtable_identities`, `audit_events`.
- Columns use `snake_case`: `program_id`, `airtable_base_id`, `last_synced_at`.
- Program IDs use stable slugs: `folk`, `gita-life`.
- Airtable field labels remain external strings and must be mapped through Program Capability Profiles.

**API Naming Conventions:**
- App-local routes keep current nouns: `/api/registration`, `/api/contact`, `/api/sessions`, `/attendance`.
- Query/body JSON uses `camelCase`: `sessionId`, `knownAttendanceIds`, `assignedPreacherAirtableUserId`.
- Never add unscoped cross-program APIs unless the route explicitly checks cross-program permission.

**Code Naming Conventions:**
- React components use `PascalCase`.
- Helpers, variables, and functions use `camelCase`.
- App route folders stay lowercase.
- Shared packages use kebab-case folder names: `program-config`, `data-contracts`.

### Structure Patterns

**Project Organization:**
- `apps/folk` owns FOLK-specific pages, metadata, env, assets, and deployment config.
- `apps/gita-life` owns Gita Life-specific pages, metadata, env, assets, and deployment config.
- `packages/ui` contains shared UI primitives only.
- `packages/program-config` contains Program Capability Profiles.
- `packages/data-contracts` contains Zod schemas, shared TypeScript types, role constants, and API payload contracts.
- `packages/authz` contains Program-aware staff context and role guard helpers.
- `packages/airtable` contains server-only Airtable helpers and mapping adapters.

**File Structure Patterns:**
- Tests should be colocated with the code they protect as `*.test.ts` or `*.test.tsx`.
- Program-specific copy/branding stays in Program config or app-local files, not shared business logic.
- Server-only modules must use clear server-only package boundaries and must not be imported into client components.

### Format Patterns

**API Response Formats:**
- Success responses return direct typed payloads for existing parity routes.
- Error responses use `{ error: string, code?: string }`.
- Duplicate responses keep current flags where applicable: `{ duplicate: true }`, `{ alreadyRegistered: true }`.
- Queued offline responses use status `202` with `{ queued: true, message: string }`.

**Data Exchange Formats:**
- Dates in APIs use ISO strings.
- Mobile numbers are normalized to the last 10 digits at client and server boundaries.
- Supabase internal records use `snake_case`; API payloads use `camelCase`.
- Airtable linked records are represented as Airtable record ID arrays at the adapter boundary.

### Communication Patterns

**Audit/Event Patterns:**
- Audit action names use dot notation: `staff.invited`, `role.revoked`, `sync.failed`, `attendance.marked`.
- Every audit event includes `programId`, `actorId`, `actorRole`, `action`, `targetId`, `source`, and `createdAt` where available.
- Sync state records include `programId`, `source`, `status`, `lastSyncedAt`, and `errorMessage`.

**State Management Patterns:**
- Keep durable auth in Supabase cookies/session state.
- React auth state is hydrated view state only.
- Avoid introducing global state libraries unless a later story proves the need.
- Program config should be read as static configuration, not mutated by runtime UI.

### Process Patterns

**Error Handling Patterns:**
- Auth and role failures fail closed.
- Staff/admin errors should be actionable, not silent.
- Public registration/attendance errors should preserve entered mobile/session context.
- Server logs must not include Airtable tokens, Supabase secret keys, or OTP values.

**Loading State Patterns:**
- Forms use local pending state.
- Dashboard polling appends new records by stable Airtable record ID.
- Offline queue UI must distinguish queued, synced, duplicate, and failed states.

### Enforcement Guidelines

**All AI Agents MUST:**
- Resolve Program context before reading or writing Program-scoped data.
- Use shared role constants for `Admin`, `Preacher`, and `Volunteer`.
- Keep Airtable access server-only.
- Keep Supabase secret/service-role operations server-only.
- Update shared contracts before changing app-local API consumers.
- Run typecheck separately from build.

**Pattern Enforcement:**
- Add or update shared schemas in `packages/data-contracts` before app-local payload changes.
- Add or update Program Capability Profiles before hard-coding Program-specific Airtable fields.
- Verify protected route handlers use Program-aware authz helpers.
- Treat any client import of server-only Airtable/Supabase admin helpers as a blocking review issue.

### Pattern Examples

**Good Examples:**
- `staff_memberships.program_id = "folk"` and API payload `programId: "folk"`.
- `packages/program-config/src/programs/folk.ts` maps Airtable field labels for FOLK only.
- `apps/gita-life/app/api/contact/route.ts` reuses shared contact schemas and Gita Life config.

**Anti-Patterns:**
- Reintroducing localStorage staff auth.
- Creating a third combined operations app.
- Letting Gita Life and FOLK Airtable mappings drift into duplicated hard-coded helpers.
- Calling Airtable from client components.
- Treating shared Supabase identity as permission without Program membership checks.

## Project Structure & Boundaries

### Complete Project Directory Structure

```text
folk_hkmc/
├── apps/
│   ├── folk/
│   │   ├── app/
│   │   │   ├── api/
│   │   │   │   ├── auth/
│   │   │   │   ├── registration/
│   │   │   │   ├── contact/
│   │   │   │   ├── sessions/
│   │   │   │   ├── admin/
│   │   │   │   └── volunteers/
│   │   │   ├── attendance/route.ts
│   │   │   ├── attend/page.tsx
│   │   │   ├── register/page.tsx
│   │   │   ├── contact/page.tsx
│   │   │   ├── sessions/page.tsx
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── manage/page.tsx
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   ├── components/
│   │   ├── public/
│   │   └── next.config.mjs
│   └── gita-life/
│       ├── app/
│       │   ├── api/
│       │   │   ├── auth/
│       │   │   ├── registration/
│       │   │   ├── contact/
│       │   │   ├── sessions/
│       │   │   ├── admin/
│       │   │   └── volunteers/
│       │   ├── attendance/route.ts
│       │   ├── attend/page.tsx
│       │   ├── register/page.tsx
│       │   ├── contact/page.tsx
│       │   ├── sessions/page.tsx
│       │   ├── dashboard/page.tsx
│       │   ├── manage/page.tsx
│       │   ├── layout.tsx
│       │   └── page.tsx
│       ├── components/
│       ├── public/
│       └── next.config.mjs
├── packages/
│   ├── ui/
│   ├── program-config/
│   │   └── src/programs/
│   │       ├── folk.ts
│   │       └── gita-life.ts
│   ├── data-contracts/
│   ├── authz/
│   ├── airtable/
│   └── utils/
├── supabase/
│   ├── migrations/
│   └── seed.sql
├── docs/
├── _bmad-output/
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── eslint.config.mjs
└── .github/
    └── workflows/
```

### Architectural Boundaries

**API Boundaries:**
Each app owns its own route handlers. Shared request/response schemas live in `packages/data-contracts`. Route handlers resolve Program context from app config before touching Airtable or Supabase membership data.

**Component Boundaries:**
Shared primitives live in `packages/ui`; Program-specific pages, copy, assets, and composition stay inside the app.

**Service Boundaries:**
`packages/authz` owns Program-aware staff context and role guards. `packages/airtable` owns server-only Airtable adapters. No client component imports server-only packages.

**Data Boundaries:**
Supabase stores shared staff identity, memberships, audit, sync state, and invite logs. Airtable stores Program operational records. Program Capability Profiles map each app to its Airtable Base, tables, fields, labels, and Airtable Interface URL.

### Requirements to Structure Mapping

**Feature Mapping:**
- FR-1 to FR-3: app-local landing/public portal pages plus `packages/program-config`.
- FR-4 to FR-7: `packages/authz`, Supabase migrations, app auth routes.
- FR-8 to FR-10: `packages/airtable`, Program Capability Profiles, audit/sync tables.
- FR-11 to FR-13: registration, attendance routes, service worker, shared schemas.
- FR-14 to FR-16: contact route, contact forms, role routing helpers.
- FR-17 to FR-20: sessions, dashboard pages, attendance route contracts.
- FR-21 to FR-22: admin invite/location routes, invite audit, manage handoff.

**Cross-Cutting Concerns:**
- Program isolation: `packages/program-config`, `packages/authz`, Supabase membership tables, API route guards.
- Shared identity: Supabase Auth plus `packages/authz`.
- Data contracts: `packages/data-contracts`.
- Airtable server access: `packages/airtable`.
- Shared UI: `packages/ui`.
- Deployment: app-local Vercel Project configuration and app-specific environment variables.

### Integration Points

**Internal Communication:**
Apps call shared packages through TypeScript imports. Server routes call Supabase and Airtable through shared server-only helpers.

**External Integrations:**
Vercel hosts each app as a separate Project. Supabase provides auth/database. Airtable provides Program records. Public QR/attendance links use each app's `NEXT_PUBLIC_SITE_URL`.

**Data Flow:**
Browser -> app route handler -> Program config -> authz/membership check where needed -> Airtable adapter and/or Supabase -> typed JSON response.

### File Organization Patterns

**Configuration Files:**
Root workspace config lives at repository root. App deployment/runtime config lives under each app. Program-specific business config lives in `packages/program-config`.

**Source Organization:**
App-local source owns routes, pages, and Program-specific composition. Shared packages own reusable contracts, adapters, UI primitives, and authorization helpers.

**Test Organization:**
Unit tests are colocated with source files as `*.test.ts` or `*.test.tsx`. Cross-app integration tests should live with the package or route they primarily validate. End-to-end tests, when added, should cover both Program Apps.

**Asset Organization:**
Program-specific logos, icons, and PWA assets live under each app's `public/`. Shared design tokens and primitive UI behavior live in `packages/ui`.

### Development Workflow Integration

**Development Server Structure:**
Use `pnpm` workspaces and Turborepo tasks for app-specific development, with separate dev commands for `apps/folk` and `apps/gita-life`.

**Build Process Structure:**
Use Turborepo pipelines for `lint`, `typecheck`, and `build`. TypeScript checking must run explicitly because the current Next.js config has ignored build-time type errors.

**Deployment Structure:**
Vercel deploys `apps/folk` and `apps/gita-life` independently from the monorepo. Each Vercel Project owns its own domains, Supabase redirect URLs, Airtable Base/table env vars, and `NEXT_PUBLIC_SITE_URL`.

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**
The architecture is coherent: Turborepo, two Next.js apps, Vercel Projects, shared Supabase identity, separate Airtable Bases, Program Capability Profiles, and shared packages all support the same two-app product direction.

**Pattern Consistency:**
Naming, API shape, data formats, audit events, server-only integration rules, and Program scoping patterns align with the core decisions.

**Structure Alignment:**
The proposed `apps/*` and `packages/*` boundaries support two branded apps without duplicating auth, contracts, Airtable adapters, or UI primitives.

### Requirements Coverage Validation ✅

**Functional Requirements Coverage:**
FR-1 through FR-22 are covered by the structure and decision set. Public portal entry, registration, attendance, staff auth, role routing, Airtable integration, Sessions, dashboard, invites, and management handoff all have assigned app/package homes.

**Non-Functional Requirements Coverage:**
Security, authorization, data isolation, reliability, accessibility, mobile-first behavior, observability, consistency, configurability, and Vercel deployment are addressed architecturally.

### Implementation Readiness Validation ✅

**Decision Completeness:**
Critical platform, identity, app-boundary, deployment, API, data, and auth decisions are documented. PRD section 12 items are carried as explicit implementation gates where still unresolved.

**Structure Completeness:**
The monorepo structure is concrete enough for AI agents to place app code, shared packages, Supabase migrations, assets, tests, and deployment config consistently.

**Pattern Completeness:**
The document defines naming, structure, response, data, event, state, error, loading, and enforcement patterns.

### Gap Analysis Results

**Critical Gaps:**
None for architecture handoff.

**Important Carried Implementation Gates:**
- DD-1: Exact Airtable Base/table/field schemas before Airtable sync implementation.
- DD-3: Exact revocation stale-sync threshold before access-control stories are accepted.
- DD-8: Detailed sensitive field visibility policy before contact management surfaces are finalized.
- DD-9: Retention durations before production launch.
- DD-10: Final DNS values before Vercel production setup.

**Minor Follow-Up:**
- Keep PRD/addendum wording aligned around Vercel. The architecture and PRD now use Vercel as authoritative.

### Validation Issues Addressed

- Stale April architecture assumptions were replaced: auth is Supabase-backed, `/api/contact` and `/api/registration` exist, and Vercel is the deployment target.
- PRD section 12 deferred decisions were not lost; each is either resolved or carried as a named architecture gate.

### Architecture Completeness Checklist

**Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**Architectural Decisions**
- [x] Critical decisions documented with versions
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed

**Implementation Patterns**
- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented

**Project Structure**
- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** high

**Key Strengths:**
- Clear two-app boundary
- Shared Supabase identity with Program-scoped membership checks
- Separate Airtable operational sources of truth
- Explicit Program Capability Profiles to prevent unsafe duplication
- Vercel deployment model is now captured
- Strong AI-agent consistency rules

**Areas for Future Enhancement:**
- Add automated tests for auth, role scoping, sync freshness, duplicate handling, and offline replay.
- Define detailed report/dashboard widgets at story level.
- Finalize retention and sensitive-data visibility policies.

### Implementation Handoff

**AI Agent Guidelines:**
- Follow all architectural decisions exactly as documented.
- Use implementation patterns consistently across both Program Apps.
- Respect app/package boundaries.
- Treat Program context as mandatory for Program-scoped reads and writes.
- Never use Supabase identity alone as authorization.

**First Implementation Priority:**
Convert this repository into a pnpm/Turborepo monorepo and move the current FOLK runtime into `apps/folk` before creating `apps/gita-life`.
