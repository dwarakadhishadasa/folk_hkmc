# Story 2.2: Resolve Program-Aware Staff Context

Status: ready-for-dev

<!-- Freshly generated from `_bmad-output/planning-artifacts/epics.md` on 2026-06-13T00:44:20+05:30. -->

## Story

As an authenticated staff user,
I want each Program App to verify my active membership and role,
so that I only reach the surfaces allowed for that Program.

## Acceptance Criteria

1. Given a request reaches protected staff code
   When the shared authz helper resolves staff context
   Then it reads the verified Supabase user from the request-scoped server client
   And it does not treat browser localStorage, client role state, or Supabase identity alone as authorization.
2. Given a Supabase user exists
   When staff context is resolved for `folk` or `gita-life`
   Then the helper requires an active staff membership for that Program
   And it returns the staff role, status, Airtable user mapping, location scope, assigned Preacher where relevant, and sync timestamp.
3. Given a staff user belongs to both Programs
   When they access one Program App
   Then the request uses only that Program's membership and Airtable identity for authorization
   And different roles across Programs are supported without role leakage.
4. Given the staff membership is missing, inactive, suspended, revoked, or stale beyond the configured threshold
   When a protected request is evaluated
   Then authorization fails closed with a typed error or safe redirect
   And no Program-scoped data is returned.
5. Given auth decisions are evaluated
   When failures or stale-sync decisions occur
   Then logs or audit events include Program, actor where known, role where known, action, sync state, and timestamp
   And logs do not include secret tokens or OTP values.

## Tasks / Subtasks

- [ ] Re-read the source story and dependent decisions before implementation (AC: 1, 2, 3, 4, 5)
  - [ ] Confirm unresolved DD gates are resolved or explicitly waived where this story depends on them.
  - [ ] Identify every existing route/component/helper listed below that will be updated and read it before editing.
- [ ] Implement `Resolve Program-Aware Staff Context` according to the acceptance criteria (AC: 1, 2, 3, 4, 5)
  - [ ] Keep Program context explicit at every server boundary.
  - [ ] Reuse existing helpers, contracts, UI primitives, and route patterns before adding new abstractions.
  - [ ] Preserve current FOLK behavior unless the acceptance criteria explicitly require a change.
- [ ] Verify the implementation
  - [ ] Run required lint/type checks for product code changes.
  - [ ] Record manual smoke-test notes for affected staff/public flows.

## Dev Notes

### Epic Context

- Epic: Program-Scoped Staff Access And Data Trust.
- Epic goal: Staff can sign in with one shared identity, land in the correct Program/Role surface, and trust that access, Airtable mapping, sync status, and audit behavior are Program-scoped.
- Story source: `_bmad-output/planning-artifacts/epics.md` section `Story 2.2: Resolve Program-Aware Staff Context`.

### Non-Negotiable Guardrails

- Resolve Program context before reading or writing Program-scoped data; never trust a client-supplied Program ID for cross-program access.
- Keep Airtable REST access, Airtable credentials, Supabase service-role operations, and authz server helpers out of client components.
- Preserve current FOLK parity contracts for registration, attendance, session-backed registration, duplicate handling, mobile normalization, sessions, dashboard polling, invite flows, manage handoff, and service-worker queueing unless this story explicitly changes them.
- Use stable Program IDs `folk` and `gita-life`; API payloads use `camelCase`, while Supabase tables and columns use `snake_case`.
- Keep errors safe and actionable. API error responses should use `{ error: string, code?: string }` and must not expose Airtable API details, Supabase service-role errors, tokens, or OTP values.
- Reuse existing `components/ui/*`, feature components, `lib/utils.ts`, Supabase helpers, and Airtable helper patterns before adding new primitives or route contracts.

### Story-Specific Notes

- Supabase Auth identity is not sufficient authorization; every protected path must prove active Program membership and role server-side.
- Before implementation, check lower-numbered stories in Epic 2 and any completed readiness gates for decisions this story depends on.

### Files / Areas To Read Before Editing

- `lib/authz.ts`
- `lib/supabase/server.ts`
- `lib/supabase/proxy.ts`
- `proxy.ts`
- `components/staff-auth-shell.tsx`
- `app/contact/page.tsx`
- `app/sessions/page.tsx`
- `app/dashboard/page.tsx`
- `app/manage/page.tsx`

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

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Fresh story context generated from current epic and architecture sources.

### File List
