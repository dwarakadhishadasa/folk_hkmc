# Story 2.2: Resolve Program-Aware Staff Context

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an authenticated staff user,
I want each Program App to verify my active membership and role,
So that I only reach the surfaces allowed for that Program.

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

- [ ] Read and protect the existing brownfield behavior before implementation (AC: 1-5)
  - [ ] Open every listed UPDATE file before editing and note current route/component behavior.
  - [ ] Confirm the work follows the in-place Turborepo migration sequence rather than replacing the app.
- [ ] Implement `Resolve Program-Aware Staff Context` according to the acceptance criteria (AC: 1-5)
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
- Implementation focus: Extract/extend `lib/authz.ts` into Program-aware server authorization that never treats Supabase identity alone as permission.
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

