# Story 2.6: Surface Critical Sync And Audit Status

Status: ready-for-dev

<!-- Freshly generated from `_bmad-output/planning-artifacts/epics.md` on 2026-06-13T00:44:20+05:30. -->

## Story

As an Admin,
I want critical sync, invite, queue, and management-link failures to be visible,
so that operational drift does not hide behind a successful-looking UI.

## Acceptance Criteria

1. Given a staff profile sync fails
   When the affected user or Admin-facing surface handles the failure
   Then the UI shows an actionable status or denial state
   And the audit log records Program, actor where known, source, error category, and timestamp.
2. Given an invite send fails after an Airtable user change
   When the invite flow completes with error
   Then the failure follows the shared audit conventions defined by this story
   And invite-log persistence is implemented in Story 6.1 or as an explicit prerequisite to Story 6.1.
3. Given a public registration or attendance write is queued
   When queue status changes
   Then the user sees pending, synced, duplicate, or failed states as applicable
   And the status preserves Program and request context for auditability.
4. Given the Airtable management URL is misconfigured
   When an authorized staff user opens Manage
   Then the app shows a clear unavailable state
   And the issue is logged without exposing secret environment values.
5. Given sync failure, stale authorization, queued public write, or management-link failure events need operational visibility
   When Story 2.6 is implemented
   Then it introduces or completes the sync-state and audit-event storage needed for those visible states
   And event names use dot notation such as `role.revoked`, `sync.failed`, `attendance.marked`, and `management.misconfigured`.
6. Given staff invite attempts become user-visible in Epic 6
   When invite logging is required
   Then invite-log persistence is implemented in Story 6.1 or as an explicit prerequisite to Story 6.1
   And Story 2.6 only owns shared audit conventions that invite logs must follow.

## Tasks / Subtasks

- [ ] Re-read the source story and dependent decisions before implementation (AC: 1, 2, 3, 4, 5, 6)
  - [ ] Confirm unresolved DD gates are resolved or explicitly waived where this story depends on them.
  - [ ] Identify every existing route/component/helper listed below that will be updated and read it before editing.
- [ ] Implement `Surface Critical Sync And Audit Status` according to the acceptance criteria (AC: 1, 2, 3, 4, 5, 6)
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
- Story source: `_bmad-output/planning-artifacts/epics.md` section `Story 2.6: Surface Critical Sync And Audit Status`.

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

- `lib/invite-log.ts`
- `supabase/migrations/**`
- `components/offline-indicator.tsx`
- `components/service-worker-register.tsx`
- `public/sw.js`
- `app/manage/page.tsx`
- `app/api/admin/invite-user/route.ts`

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
