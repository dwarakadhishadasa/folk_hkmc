# Story 1.1b: Add Gita Life App Shell And Shared Program Configuration

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a staff user,
I want Gita Life to have its own portal shell backed by shared Program config,
So that Gita Life can start from the same operational foundation without copying FOLK-specific logic.

## Acceptance Criteria

1. Given `apps/folk` exists or is being introduced
When `apps/gita-life` is added
Then the Gita Life app has an independent App Router shell, metadata, assets slot, and local run/build configuration.
2. Given Program configuration is needed by both apps
When either app resolves Program context
Then it uses stable Program IDs `folk` and `gita-life`
And Program labels, vocabulary, app URLs, enabled modules, and public asset references come from shared Program configuration or app-local assets.
3. Given Vercel will deploy the apps separately
When app-level configuration is reviewed
Then each app has a clear place for `NEXT_PUBLIC_SITE_URL` and server-only operational secrets
And no shared component hard-codes one Program's vocabulary into the other Program.
4. Given Story 1.1b depends on launch and redirect configuration
When it is assigned for implementation
Then Story 0.2 has resolved or explicitly waived DD-10 for interim development and production-domain planning.

## Tasks / Subtasks

- [ ] Read and protect the existing brownfield behavior before implementation (AC: 1-4)
  - [ ] Open every listed UPDATE file before editing and note current route/component behavior.
  - [ ] Confirm the work follows the in-place Turborepo migration sequence rather than replacing the app.
- [ ] Implement `Add Gita Life App Shell And Shared Program Configuration` according to the acceptance criteria (AC: 1-4)
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
- Implementation focus: Create `apps/gita-life` as a thin shell using shared config/package foundations; do not fork FOLK business logic.
- Dependency/decision gate: Depends on Story 0.2 resolving or waiving DD-10 for interim app URLs, Supabase redirects, and NEXT_PUBLIC_SITE_URL planning.
- Preserve: Current FOLK public, staff, auth, registration, contact, sessions, dashboard, invite, manage, PWA, and `/attendance` behavior must remain route-compatible.
- Preserve: Use the Turborepo starter only as a reference; migrate this repo in place instead of replacing the working app with generated scaffold code.
- Current working application is the source of truth for behavior. The architecture target is a migration/extraction path, not permission to discard existing flows.

### Files / Areas To Read Before Editing

- `apps/folk/** if created by 1.1a`
- `app/** for shell patterns`
- `components/header.tsx`
- `app/layout.tsx`
- `app/globals.css`

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
- `apps/folk/** if created by 1.1a`
- `app/** for shell patterns`
- `components/header.tsx`
- `app/layout.tsx`
- `app/globals.css`

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List

