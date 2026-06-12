# Story 2.6: Surface Critical Sync And Audit Status

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an Admin,
I want critical sync, invite, queue, and management-link failures to be visible,
So that operational drift does not hide behind a successful-looking UI.

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

- [ ] Read and protect the existing brownfield behavior before implementation (AC: 1-6)
  - [ ] Open every listed UPDATE file before editing and note current route/component behavior.
  - [ ] Confirm the work follows the in-place Turborepo migration sequence rather than replacing the app.
- [ ] Implement `Surface Critical Sync And Audit Status` according to the acceptance criteria (AC: 1-6)
  - [ ] Keep Program context explicit in server-side reads/writes and avoid unscoped cross-program data paths.
  - [ ] Reuse existing components/helpers before adding new primitives or route contracts.
- [ ] Keep server-only integration boundaries intact (AC: 1-5)
  - [ ] Do not import Airtable, Supabase admin, or authz server helpers into client components.
- [ ] Verify the implementation
  - [ ] Run `pnpm lint` and `pnpm exec tsc --noEmit` for code changes.
  - [ ] Manually smoke-test the affected flow on a 360px-wide viewport when UI or route behavior changes.

## Dev Notes

### Non-Negotiable Brownfield Guardrails

- Use the Turborepo workspace as an adapted in-place target, not as a fresh generated replacement. Preserve the current working app while moving/extracting it.
- Follow the architecture sequence: workspace first, `apps/folk` split, shared packages, Supabase membership schema, `apps/gita-life`, Vercel/env/domain setup, then sync/audit/Program-scoped contracts.
- Keep `lib/airtable.ts` and future Airtable helpers server-only. Frontend code must never call Airtable directly or import server-only Airtable/Supabase admin/authz helpers.
- Preserve current FOLK parity contracts for registration, attendance, session-backed registration, duplicate handling, mobile normalization, session creation, dashboard polling, invite flows, and service-worker queueing.
- Resolve Program context before every Program-scoped read/write; never trust a client-supplied Program ID for cross-program access.
- Run `pnpm lint` and `pnpm exec tsc --noEmit` for code changes because Next build ignores TypeScript errors in this repo.

### Story-Specific Implementation Notes

- Epic context: Program-Scoped Staff Access And Data Trust: shared identity, membership, authz, sync, audit, and Airtable trust boundaries.
- Implementation focus: Make sync, queue, invite, and management-link failures visible and auditable with Program-scoped events.
- Preserve: Current Supabase staff auth is real and cookie-backed; do not reintroduce localStorage/demo-user authorization.
- Preserve: `proxy.ts`, `/api/auth/me`, `/api/auth/signin`, `/auth/confirm`, `/auth/hash-callback`, and `/api/auth/complete-implicit` must stay aligned.
- Current working application is the source of truth for behavior. The architecture target is a migration/extraction path, not permission to discard existing flows.

### Files / Areas To Read Before Editing

- `supabase/migrations/**`
- `lib/supabase/**`
- `lib/authz.ts`
- `lib/auth-context.tsx`
- `proxy.ts`
- `app/api/auth/**`
- `app/auth/**`
- `app/login/**`

### Architecture Compliance

- App-local routes keep current nouns: `/api/registration`, `/api/contact`, `/api/sessions`, `/attendance`, auth routes, invite routes, and Manage unless a story explicitly migrates all dependents.
- Program IDs are stable slugs: `folk` and `gita-life`.
- API payloads use `camelCase`; Supabase tables/columns use `snake_case`; Airtable field labels remain external mapping strings.
- Shared package targets are `packages/ui`, `packages/program-config`, `packages/data-contracts`, `packages/authz`, `packages/airtable`, and supporting utilities.
- Do not create a third combined operations app or a single runtime app that multiplexes both Programs.

### Testing Requirements

- Run `pnpm lint`.
- Run `pnpm exec tsc --noEmit`.
- For UI work, manually verify a 360px-wide viewport and keyboard/focus behavior.
- For auth or server route work, smoke-test authorized, unauthorized, stale/inactive where applicable, and wrong-role access.
- For Airtable/PWA work, smoke-test success, duplicate/already-existing, validation error, and offline/queued states where applicable.

### References

- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/prds/prd-gita-life-operations/architecture.md`
- `_bmad-output/planning-artifacts/prds/prd-gita-life-operations/addendum.md`
- `_bmad-output/planning-artifacts/prds/prd-gita-life-operations/prd.md`
- `_bmad-output/project-context.md`
- `supabase/migrations/**`
- `lib/supabase/**`
- `lib/authz.ts`
- `lib/auth-context.tsx`
- `proxy.ts`
- `app/api/auth/**`
- `app/auth/**`
- `app/login/**`

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List

