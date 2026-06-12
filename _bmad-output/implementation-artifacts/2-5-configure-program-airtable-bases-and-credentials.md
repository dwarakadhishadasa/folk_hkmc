# Story 2.5: Configure Program Airtable Bases And Credentials

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a portal maintainer,
I want each Program App to read and write only its configured Airtable Base,
So that Gita Life and FOLK operational data remain isolated.

## Acceptance Criteria

1. Given Program Capability Profiles are defined
When `folk` and `gita-life` configurations are loaded
Then each profile includes Airtable base, table, field mapping, label, module, and management URL configuration slots
And Story 0.1 has resolved DD-1 or explicitly waived the missing exact Airtable IDs before this story is assigned for implementation.
2. Given an API route needs Airtable access
When it resolves the active Program context
Then it selects only that Program's Airtable credential and base/table mapping
And it cannot write to the other Program's Base through a client-supplied Program ID.
3. Given scoped Airtable PATs are available
When environment variables are configured
Then the app supports separate credentials per Program
And credentials are read only from server-side environment variables.
4. Given required Airtable configuration is missing
When a server route initializes an Airtable adapter
Then the route fails fast with an actionable configuration error
And it does not fall back to legacy base IDs or production-only defaults.
5. Given Airtable helpers are used by app code
When imports are inspected
Then helper modules are server-only
And no client component imports Airtable tokens, adapters, or REST helpers.

## Tasks / Subtasks

- [ ] Read and protect the existing brownfield behavior before implementation (AC: 1-5)
  - [ ] Open every listed UPDATE file before editing and note current route/component behavior.
  - [ ] Confirm the work follows the in-place Turborepo migration sequence rather than replacing the app.
- [ ] Implement `Configure Program Airtable Bases And Credentials` according to the acceptance criteria (AC: 1-5)
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
- Implementation focus: Convert current `lib/airtable.ts` assumptions into Program-selected server-only credentials and Capability Profile mappings.
- Dependency/decision gate: Depends on Story 0.1 resolving or waiving DD-1 exact Airtable Base/table/field mappings.
- Preserve: Current Supabase staff auth is real and cookie-backed; do not reintroduce localStorage/demo-user authorization.
- Preserve: `proxy.ts`, `/api/auth/me`, `/api/auth/signin`, `/auth/confirm`, `/auth/hash-callback`, and `/api/auth/complete-implicit` must stay aligned.
- Current working application is the source of truth for behavior. The architecture target is a migration/extraction path, not permission to discard existing flows.

### Files / Areas To Read Before Editing

- `lib/airtable.ts`
- `app/manage/page.tsx`
- `app/api/**/route.ts`
- `_bmad-output/implementation-artifacts/0-1-resolve-airtable-schema-gate-dd-1.md`

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
- `lib/airtable.ts`
- `app/manage/page.tsx`
- `app/api/**/route.ts`
- `_bmad-output/implementation-artifacts/0-1-resolve-airtable-schema-gate-dd-1.md`

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List

