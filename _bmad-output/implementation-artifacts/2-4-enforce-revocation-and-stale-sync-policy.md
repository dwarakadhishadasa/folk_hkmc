# Story 2.4: Enforce Revocation And Stale-Sync Policy

Status: ready-for-dev

<!-- Freshly generated from `_bmad-output/planning-artifacts/epics.md` on 2026-06-13T00:44:20+05:30. -->

## Story

As a Program admin,
I want revoked or stale staff access to fail closed,
so that Airtable role changes are respected by both portals.

## Acceptance Criteria

1. Given Airtable marks a staff membership or role inactive, suspended, or revoked
   When sync updates the Supabase mirror
   Then subsequent protected requests for that Program are denied
   And the user cannot keep access through cached client state.
2. Given the exact revocation sync window is still a deferred implementation decision
   When this story is accepted for implementation
   Then Story 0.2 has resolved DD-3 or an explicit threshold is recorded in configuration
   And admin or role-changing actions fail closed until the threshold is defined.
3. Given a membership sync timestamp is older than the allowed threshold
   When a user attempts an admin or role-changing action
   Then the action is blocked with an actionable stale-sync error
   And no Airtable mutation or privileged Supabase mutation occurs.
4. Given a non-privileged staff page is accessed with stale sync
   When the product policy permits a login-time refresh
   Then the app attempts the approved refresh path
   And fails closed if refresh cannot prove active status and role.
5. Given revocation or stale-sync denial occurs
   When the denial is recorded
   Then audit data includes Program, actor, attempted action, sync state, source, and timestamp
   And the user-facing message does not expose sensitive membership internals.

## Tasks / Subtasks

- [ ] Re-read the source story and dependent decisions before implementation (AC: 1, 2, 3, 4, 5)
  - [ ] Confirm unresolved DD gates are resolved or explicitly waived where this story depends on them.
  - [ ] Identify every existing route/component/helper listed below that will be updated and read it before editing.
- [ ] Implement `Enforce Revocation And Stale-Sync Policy` according to the acceptance criteria (AC: 1, 2, 3, 4, 5)
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
- Story source: `_bmad-output/planning-artifacts/epics.md` section `Story 2.4: Enforce Revocation And Stale-Sync Policy`.

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
- `lib/supabase/**`
- `proxy.ts`
- `supabase/migrations/**`
- `packages/authz/**`
- `packages/data-contracts/**`

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
