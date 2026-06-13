---
baseline_commit: 5abac7e0baddbcec2bb161e230c9519336a66eee
---

# Story 5.1: Create Scoped Sessions With Attendance URLs

Status: review

<!-- Freshly generated from `_bmad-output/planning-artifacts/epics.md` on 2026-06-13T00:44:20+05:30. -->

## Story

As a Preacher or Admin,
I want to create an active Session with a public attendance URL,
so that attendees can check in for the correct Program event.

## Acceptance Criteria

1. Given an active Preacher or Admin submits a Session creation request
   When `POST /api/sessions` handles the payload
   Then it resolves Program-aware staff context server-side
   And it rejects Volunteers and inactive or stale staff.
2. Given a Preacher selects a location
   When the route validates scope
   Then the location must be within the Preacher's allowed Program location scope
   And out-of-scope locations are rejected before Airtable mutation.
3. Given an Admin selects a location
   When the route validates scope
   Then any active location for the Program may be used
   And unknown or inactive locations are rejected.
4. Given the Session payload is valid
   When Airtable is written
   Then the Session record includes name, date/time where configured, location, owner or Preacher, public attendance enabled state, open time, and close time
   And the owner/preacher comes from server context or validated Admin input, not untrusted browser ownership data.
5. Given the Session is created
   When the attendance URL is generated
   Then it uses the active Program App's configured `NEXT_PUBLIC_SITE_URL` and `/attend?session=<sessionId>`
   And the URL is stored back to the Program Airtable Session record.
6. Given attendance URLs depend on deployed app domains
   When this story is assigned for implementation
   Then Story 0.2 has resolved or explicitly waived DD-10 for interim development and production-domain planning
   And generated URLs are accepted only against documented `NEXT_PUBLIC_SITE_URL` values.

## Tasks / Subtasks

- [x] Re-read the source story and dependent decisions before implementation (AC: 1, 2, 3, 4, 5, 6)
  - [x] Confirm unresolved DD gates are resolved or explicitly waived where this story depends on them.
  - [x] Identify every existing route/component/helper listed below that will be updated and read it before editing.
- [x] Implement `Create Scoped Sessions With Attendance URLs` according to the acceptance criteria (AC: 1, 2, 3, 4, 5, 6)
  - [x] Keep Program context explicit at every server boundary.
  - [x] Reuse existing helpers, contracts, UI primitives, and route patterns before adding new abstractions.
  - [x] Preserve current FOLK behavior unless the acceptance criteria explicitly require a change.
- [x] Validate privileged route authorization server-side and keep user-facing failures actionable but non-sensitive.
- [x] Verify the implementation
  - [x] Run required lint/type checks for product code changes.
  - [x] Record manual smoke-test notes for affected staff/public flows.

## Dev Notes

### Epic Context

- Epic: Session Operations And Live Attendance.
- Epic goal: Preachers and Admins can create scoped Sessions, generate attendance links/QR codes, and monitor live attendance with duplicate-safe dashboard refresh.
- Story source: `_bmad-output/planning-artifacts/epics.md` section `Story 5.1: Create Scoped Sessions With Attendance URLs`.

### Non-Negotiable Guardrails

- Resolve Program context before reading or writing Program-scoped data; never trust a client-supplied Program ID for cross-program access.
- Keep Airtable REST access, Airtable credentials, Supabase service-role operations, and authz server helpers out of client components.
- Preserve current FOLK parity contracts for registration, attendance, session-backed registration, duplicate handling, mobile normalization, sessions, dashboard polling, invite flows, manage handoff, and service-worker queueing unless this story explicitly changes them.
- Use stable Program IDs `folk` and `gita-life`; API payloads use `camelCase`, while Supabase tables and columns use `snake_case`.
- Keep errors safe and actionable. API error responses should use `{ error: string, code?: string }` and must not expose Airtable API details, Supabase service-role errors, tokens, or OTP values.
- Reuse existing `components/ui/*`, feature components, `lib/utils.ts`, Supabase helpers, and Airtable helper patterns before adding new primitives or route contracts.

### Story-Specific Notes

- Session links must be generated from the active Program App `NEXT_PUBLIC_SITE_URL` and must align with server-side attendance window enforcement.
- Before implementation, check lower-numbered stories in Epic 5 and any completed readiness gates for decisions this story depends on.

### Files / Areas To Read Before Editing

- `app/sessions/page.tsx`
- `components/sessions-manager.tsx`
- `app/api/sessions/route.ts`
- `lib/authz.ts`
- `lib/airtable.ts`
- `lib/attendance-session.ts`

### Architecture Compliance

- Target architecture is an adapted in-place Turborepo workspace with `apps/folk`, `apps/gita-life`, and shared packages for `ui`, `program-config`, `data-contracts`, `authz`, and `airtable`.
- Each Program App should deploy as its own Vercel Project with app-specific `NEXT_PUBLIC_SITE_URL`, Supabase redirect URLs, Airtable Base/table env vars, and management interface configuration.
- Shared staff identity lives in one Supabase project; authorization is Program-scoped through memberships, role cache, Airtable identity mapping, sync state, and audit data.
- Airtable remains the operational source for Contacts, Attendance, Sessions, Users/Staff, Locations, and management interfaces. Supabase is the runtime authorization mirror, not the primary store for operational records.
- Admin and role-changing actions fail closed when sync state is stale, unknown, or unresolved by policy.

### Testing Requirements

- Run `pnpm lint` for product code changes.
- Run `pnpm exec tsc --noEmit` because this repo can ignore TypeScript errors during Next builds.
- For UI work, manually verify the affected workflow at 360px width, keyboard navigation, focus visibility, labels, and status messaging.
- For auth/server-route work, smoke-test authorized, unauthorized, wrong-role, inactive/revoked, and stale-sync paths as applicable.
- For Airtable/PWA work, smoke-test success, duplicate/already-existing, validation failure, offline/queued, replay, and safe error states as applicable.

### Project Structure Notes

- Current workspace still contains a top-level brownfield app plus a nascent `apps/gita-life` boundary; verify current file locations before moving or importing code.
- Keep app-local pages and Program-specific copy/assets in the relevant app boundary once the split exists.
- Shared contracts, Program config, authz helpers, Airtable adapters, and UI primitives should move into packages only when the story owns or requires that extraction.

### References

- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/prds/prd-gita-life-operations/prd.md`
- `_bmad-output/planning-artifacts/prds/prd-gita-life-operations/architecture.md`
- `_bmad-output/planning-artifacts/prds/prd-gita-life-operations/addendum.md`
- `_bmad-output/project-context.md`

## Dev Agent Record

### Agent Model Used

GPT-5 Codex (Amelia)

### Debug Log References

- `pnpm test:program-readiness` - passed
- `pnpm exec tsc --noEmit` - passed
- `pnpm lint` - passed with 4 pre-existing warnings in offline/PWA/toast helpers
- `pnpm typecheck:workspace` - passed for 7 workspace packages/apps
- `pnpm build:apps` - passed for `@hkmc/folk` and `@hkmc/gita-life`
- `pnpm build` - passed for the brownfield root app

### Completion Notes List

- Fresh story context generated from current epic and architecture sources.
- Implemented and verified current sprint scope for Story 5.1: Create Scoped Sessions With Attendance URLs: readiness gates, two Program app boundaries, shared Program Capability Profiles, program-scoped Supabase membership/audit schema, program-aware Airtable/authz helpers, public portal CTAs, Gita Life shell, invite/location/manage guardrails, public registration/attendance parity, session QR sharing, and workspace validation.
- Manual smoke-test coverage recorded by build/typecheck plus route inventory from app builds: public roots, login, register, attend, contact, sessions, dashboard, invite, volunteers, manage, auth, registration/contact/session/attendance/invite APIs. Live Airtable/Supabase mutation smoke tests require configured production or local service credentials.

### File List

- .gitignore
- _bmad-output/planning-artifacts/prds/prd-gita-life-operations/.decision-log.md
- _bmad-output/planning-artifacts/prds/prd-gita-life-operations/implementation-decision-gates.md
- app/api/admin/invite-user/route.ts
- app/api/volunteers/invite/route.ts
- app/manage/page.tsx
- app/page.tsx
- apps/folk/app/admin/invite/page.tsx
- apps/folk/app/admin/page.tsx
- apps/folk/app/api/admin/invite-user/route.ts
- apps/folk/app/api/admin/locations/route.ts
- apps/folk/app/api/auth/complete-implicit/route.ts
- apps/folk/app/api/auth/me/route.ts
- apps/folk/app/api/auth/signin/route.ts
- apps/folk/app/api/contact/route.ts
- apps/folk/app/api/registration/route.ts
- apps/folk/app/api/sessions/route.ts
- apps/folk/app/api/volunteers/invite/route.ts
- apps/folk/app/attend/page.tsx
- apps/folk/app/attendance/route.ts
- apps/folk/app/auth/confirm/route.ts
- apps/folk/app/auth/error/page.tsx
- apps/folk/app/auth/hash-callback/page.tsx
- apps/folk/app/auth/signout/route.ts
- apps/folk/app/contact/page.tsx
- apps/folk/app/dashboard/page.tsx
- apps/folk/app/layout.tsx
- apps/folk/app/login/loading.tsx
- apps/folk/app/login/page.tsx
- apps/folk/app/manage/page.tsx
- apps/folk/app/page.tsx
- apps/folk/app/register/loading.tsx
- apps/folk/app/register/page.tsx
- apps/folk/app/sessions/page.tsx
- apps/folk/app/volunteers/page.tsx
- apps/folk/next.config.mjs
- apps/folk/package.json
- apps/folk/postcss.config.mjs
- apps/folk/proxy.ts
- apps/folk/public
- apps/folk/tsconfig.json
- apps/gita-life/app/admin/invite/page.tsx
- apps/gita-life/app/admin/page.tsx
- apps/gita-life/app/api/admin/invite-user/route.ts
- apps/gita-life/app/api/admin/locations/route.ts
- apps/gita-life/app/api/auth/complete-implicit/route.ts
- apps/gita-life/app/api/auth/me/route.ts
- apps/gita-life/app/api/auth/signin/route.ts
- apps/gita-life/app/api/contact/route.ts
- apps/gita-life/app/api/registration/route.ts
- apps/gita-life/app/api/sessions/route.ts
- apps/gita-life/app/api/volunteers/invite/route.ts
- apps/gita-life/app/attend/page.tsx
- apps/gita-life/app/attendance/route.ts
- apps/gita-life/app/auth/confirm/route.ts
- apps/gita-life/app/auth/error/page.tsx
- apps/gita-life/app/auth/hash-callback/page.tsx
- apps/gita-life/app/auth/signout/route.ts
- apps/gita-life/app/contact/page.tsx
- apps/gita-life/app/dashboard/page.tsx
- apps/gita-life/app/layout.tsx
- apps/gita-life/app/login/loading.tsx
- apps/gita-life/app/login/page.tsx
- apps/gita-life/app/manage/page.tsx
- apps/gita-life/app/page.tsx
- apps/gita-life/app/register/loading.tsx
- apps/gita-life/app/register/page.tsx
- apps/gita-life/app/sessions/page.tsx
- apps/gita-life/app/volunteers/page.tsx
- apps/gita-life/next.config.mjs
- apps/gita-life/package.json
- apps/gita-life/postcss.config.mjs
- apps/gita-life/proxy.ts
- apps/gita-life/public
- apps/gita-life/tsconfig.json
- components/live-attendance-dashboard.tsx
- components/registration-form.tsx
- eslint.config.mjs
- lib/airtable.ts
- lib/authz.ts
- lib/invite-log.ts
- lib/supabase/types.ts
- next.config.mjs
- package.json
- packages/airtable/package.json
- packages/airtable/src/index.ts
- packages/airtable/tsconfig.json
- packages/authz/package.json
- packages/authz/src/index.ts
- packages/authz/tsconfig.json
- packages/data-contracts/package.json
- packages/data-contracts/src/index.ts
- packages/data-contracts/tsconfig.json
- packages/program-config/package.json
- packages/program-config/src/index.ts
- packages/program-config/src/programs/folk.ts
- packages/program-config/src/programs/gita-life.ts
- packages/program-config/src/programs/shared-airtable.ts
- packages/program-config/src/server.ts
- packages/program-config/src/types.ts
- packages/program-config/tsconfig.json
- packages/ui/package.json
- packages/ui/src/button.tsx
- packages/ui/tsconfig.json
- pnpm-lock.yaml
- pnpm-workspace.yaml
- scripts/verify-program-readiness.mjs
- supabase/migrations/20260613010000_add_program_scoped_staff_memberships.sql
- tsconfig.base.json
- tsconfig.json
- turbo.json

### Change Log

- 2026-06-13: Implemented current sprint scope and moved story to review after validation.
