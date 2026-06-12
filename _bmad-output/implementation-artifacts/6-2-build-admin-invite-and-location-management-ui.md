# Story 6.2: Build Admin Invite And Location Management UI

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an Admin,
I want invite controls with role, assigned Preacher, and location guardrails,
So that staff setup can be completed without raw Airtable IDs.

## Acceptance Criteria

1. Given an active Admin opens the staff invite surface
When the page renders
Then it supports inviting Admin, Preacher, and Volunteer users
And it hides the surface from non-Admin staff.
2. Given the selected role is Volunteer
When the form validates
Then assigned Preacher selection is required
And only active Program Preachers are selectable.
3. Given the selected role is Admin or Preacher
When location access is configured
Then the Admin can select active Program locations without typing raw Airtable IDs
And selected values are validated before submit.
4. Given the needed location is missing
When the Admin adds a location inline
Then the new active location is created in the active Program data source
And it becomes selectable for the current invite after successful creation.
5. Given the invite succeeds, partially fails, or fails
When the UI receives the response
Then it displays a clear status message and next step
And it does not expose Airtable API details or Supabase service-role errors.

## Tasks / Subtasks

- [ ] Read and protect the existing brownfield behavior before implementation (AC: 1-5)
  - [ ] Open every listed UPDATE file before editing and note current route/component behavior.
  - [ ] Confirm the work follows the in-place Turborepo migration sequence rather than replacing the app.
- [ ] Implement `Build Admin Invite And Location Management UI` according to the acceptance criteria (AC: 1-5)
  - [ ] Keep Program context explicit in server-side reads/writes and avoid unscoped cross-program data paths.
  - [ ] Reuse existing components/helpers before adding new primitives or route contracts.
- [ ] Keep server-only integration boundaries intact (AC: 1-5)
  - [ ] Do not import Airtable, Supabase admin, or authz server helpers into client components.
- [ ] Preserve existing FOLK parity API response shapes where this story touches active flows
  - [ ] Keep `{ error: string, code?: string }` errors and existing duplicate/queued flags where applicable.
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

- Epic context: Staff Administration And Airtable Handoff: staff invites, location management, Volunteer invite support, and Airtable handoff.
- Implementation focus: Build Admin invite/location UI that hides raw Airtable IDs behind validated selectors.
- Dependency/decision gate: Depends on Story 6.1 invite API behavior and active Preacher/Location reference data.
- Preserve: Invite flows must keep Supabase service-role access server-only and must log safe invite outcomes.
- Preserve: Manage links are privileged server-side redirects; do not expose configured Airtable management URLs to unauthorized users.
- Current working application is the source of truth for behavior. The architecture target is a migration/extraction path, not permission to discard existing flows.

### Files / Areas To Read Before Editing

- `app/admin/invite/page.tsx`
- `components/invite-user-form.tsx`
- `app/api/admin/invite-user/route.ts`
- `app/api/admin/locations/route.ts`
- `app/volunteers/page.tsx`
- `app/api/volunteers/invite/route.ts`
- `app/manage/page.tsx`
- `lib/invite-log.ts`

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
- `app/admin/invite/page.tsx`
- `components/invite-user-form.tsx`
- `app/api/admin/invite-user/route.ts`
- `app/api/admin/locations/route.ts`
- `app/volunteers/page.tsx`
- `app/api/volunteers/invite/route.ts`
- `app/manage/page.tsx`
- `lib/invite-log.ts`

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List

