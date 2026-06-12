# Story 2.1: Create Program-Scoped Staff Identity Schema

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a staff operator,
I want staff identity and Program membership stored in a shared Supabase mirror,
So that both Program Apps can authorize staff without duplicating Airtable operational data.

## Acceptance Criteria

1. Given the shared Supabase project is available
When the minimum staff identity schema migration is applied
Then the database includes the minimum Program-scoped tables needed for staff authorization: programs, staff profiles, staff memberships, and Airtable staff identity mappings
And Program-specific rows include a stable Program ID of `folk` or `gita-life`.
2. Given sync state, invite logs, and audit events are required by later operational stories
When Story 2.1 is accepted
Then it documents the planned table boundaries for those later stories
And it does not require full invite-log or broad audit-event implementation before the first staff authorization flow needs them.
3. Given the V1 role taxonomy is fixed
When staff membership records are created or updated
Then role values are constrained to `Admin`, `Preacher`, or `Volunteer`
And status values support active and revoked/inactive access decisions.
4. Given Airtable remains the operational source of truth
When Supabase mirror tables are reviewed
Then they do not duplicate Contacts, Sessions, Attendance, Locations, or Analytics as primary operational tables
And this story stores only the runtime identity, membership, and mapping data needed for initial access enforcement.
5. Given app code needs typed database rows
When schema work is complete
Then generated or maintained TypeScript types are available for the new Supabase rows
And `pnpm` type checking can validate code using those types.
6. Given privileged database operations are required
When service-role or admin clients are used
Then they are imported only from server-only code
And no browser bundle exposes Supabase service-role credentials.

## Tasks / Subtasks

- [ ] Read and protect the existing brownfield behavior before implementation (AC: 1-6)
  - [ ] Open every listed UPDATE file before editing and note current route/component behavior.
  - [ ] Confirm the work follows the in-place Turborepo migration sequence rather than replacing the app.
- [ ] Implement `Create Program-Scoped Staff Identity Schema` according to the acceptance criteria (AC: 1-6)
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
- Implementation focus: Evolve Supabase schema from current `staff_profiles`/`invite_log` bridge into Program-scoped identity/membership/mapping tables.
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

