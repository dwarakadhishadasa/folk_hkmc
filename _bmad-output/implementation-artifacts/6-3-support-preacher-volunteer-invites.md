# Story 6.3: Support Preacher Volunteer Invites

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Preacher,
I want to invite Volunteers assigned to me,
So that I can onboard contact-capture help without Admin-only access.

## Acceptance Criteria

1. Given an active Preacher opens the Volunteer invite surface
When the page renders
Then it shows only Volunteer invite controls
And it does not show Admin or Preacher role invite controls.
2. Given an active Preacher submits a Volunteer invite
When the invite API validates the request
Then the invitee role is forced or validated as `Volunteer`
And the assigned Preacher is the current Preacher from server context.
3. Given the Preacher attempts to invite an Admin or Preacher
When the request reaches the server
Then it is rejected with a 403 or validation error
And no Airtable user or Supabase invite is created.
4. Given the Volunteer invite succeeds
When the invitee accepts and signs in
Then they are routed to Contact capture for the active Program
And they cannot access dashboard, sessions, admin invite, or manage surfaces.
5. Given the invite attempt succeeds or fails
When logging completes
Then invite audit data records Program, inviter, invitee, role, status, and safe error message where applicable.

## Tasks / Subtasks

- [ ] Read and protect the existing brownfield behavior before implementation (AC: 1-5)
  - [ ] Open every listed UPDATE file before editing and note current route/component behavior.
  - [ ] Confirm the work follows the in-place Turborepo migration sequence rather than replacing the app.
- [ ] Implement `Support Preacher Volunteer Invites` according to the acceptance criteria (AC: 1-5)
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
- Implementation focus: Keep Preacher invites Volunteer-only and force assigned Preacher from server context.
- Dependency/decision gate: Depends on Story 6.1 invite logging and shared Volunteer role routing.
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

