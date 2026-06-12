# Story 1.2: Add Portal Buttons To Public Program Pages

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an existing staff user,
I want a clear Portal button on each public Program page,
So that I can reach the correct staff portal without distracting new visitors.

## Acceptance Criteria

1. Given the public Gita Life page exists in this repo or its ownership has been confirmed
When the page renders
Then it includes a `Gita Life Portal` entry that links to the configured Gita Life Program App URL
And the Portal entry is visually secondary to public discovery, inquiry, and registration actions.
2. Given the public FOLK page exists in this repo or its ownership has been confirmed
When the page renders
Then it includes a `FOLK Portal` entry that links to the configured FOLK Program App URL
And the Portal entry is visually secondary to public discovery, inquiry, and registration actions.
3. Given a Portal button is displayed on either public Program page
When the user views it on desktop or mobile
Then the label uses public-friendly Portal language
And it does not use internal terms such as backend, admin, or operations.
4. Given Program App URLs differ by environment
When the Portal button href is resolved
Then it comes from Program configuration or environment-backed app configuration
And it does not hard-code production-only domains in reusable UI.
5. Given the page is used by keyboard and screen-reader users
When the Portal entry receives focus or is announced
Then it has an accessible name matching the Program-specific Portal label
And focus visibility meets the shared portal accessibility expectations.

## Tasks / Subtasks

- [ ] Read and protect the existing brownfield behavior before implementation (AC: 1-5)
  - [ ] Open every listed UPDATE file before editing and note current route/component behavior.
  - [ ] Confirm the work follows the in-place Turborepo migration sequence rather than replacing the app.
- [ ] Implement `Add Portal Buttons To Public Program Pages` according to the acceptance criteria (AC: 1-5)
  - [ ] Keep Program context explicit in server-side reads/writes and avoid unscoped cross-program data paths.
  - [ ] Reuse existing components/helpers before adding new primitives or route contracts.
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

- Epic context: Branded Program Portal Entry: introduce app boundaries and portal entry while preserving current public/staff behavior.
- Implementation focus: Add public Portal entry points from Program pages to configured Program App URLs; keep public discovery/registration primary.
- Preserve: Current FOLK public, staff, auth, registration, contact, sessions, dashboard, invite, manage, PWA, and `/attendance` behavior must remain route-compatible.
- Preserve: Use the Turborepo starter only as a reference; migrate this repo in place instead of replacing the working app with generated scaffold code.
- Current working application is the source of truth for behavior. The architecture target is a migration/extraction path, not permission to discard existing flows.

### Files / Areas To Read Before Editing

- `package.json`
- `pnpm-lock.yaml`
- `next.config.mjs`
- `tsconfig.json`
- `app/**`
- `components/**`
- `public/**`
- `proxy.ts`

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
- `package.json`
- `pnpm-lock.yaml`
- `next.config.mjs`
- `tsconfig.json`
- `app/**`
- `components/**`
- `public/**`
- `proxy.ts`

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List

