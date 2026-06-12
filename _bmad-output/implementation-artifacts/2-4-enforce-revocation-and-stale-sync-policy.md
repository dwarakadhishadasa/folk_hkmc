# Story 2.4: Enforce Revocation And Stale-Sync Policy

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Program admin,
I want revoked or stale staff access to fail closed,
So that Airtable role changes are respected by both portals.

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

- [ ] Read and protect the existing brownfield behavior before implementation (AC: 1-5)
  - [ ] Open every listed UPDATE file before editing and note current route/component behavior.
  - [ ] Confirm the work follows the in-place Turborepo migration sequence rather than replacing the app.
- [ ] Implement `Enforce Revocation And Stale-Sync Policy` according to the acceptance criteria (AC: 1-5)
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
- Implementation focus: Enforce active/revoked/stale membership decisions fail-closed for privileged actions.
- Dependency/decision gate: Depends on Story 0.2 resolving or waiving DD-3 with a concrete stale-sync threshold.
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

