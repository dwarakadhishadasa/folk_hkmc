# Story 6.4: Open Airtable Management Handoff Safely

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an authorized Admin or Preacher,
I want to open the configured Airtable management interface,
So that deeper operational review remains available when needed.

## Acceptance Criteria

1. Given an active Admin or permitted Preacher opens Manage
When the route authorizes the request
Then it verifies active Program membership and role server-side
And it redirects only to the active Program's configured Airtable Interface URL.
2. Given an active Volunteer opens Manage
When server authorization runs
Then access is denied
And no Airtable Interface URL is returned to the browser.
3. Given an unauthenticated or inactive user opens Manage
When the route handles the request
Then the user is redirected or shown a safe denial state
And no Program operational data is exposed.
4. Given the active Program's Airtable Interface URL is missing or invalid
When an authorized staff user opens Manage
Then the app shows a clear unavailable state
And the issue is logged for operators without exposing secret environment values.
5. Given management links are configured for both Programs
When Gita Life and FOLK users open Manage from their respective apps
Then each user lands only in the matching Program's Airtable management surface
And cross-program access requires explicit permission checks.

## Tasks / Subtasks

- [ ] Read and protect the existing brownfield behavior before implementation (AC: 1-5)
  - [ ] Open every listed UPDATE file before editing and note current route/component behavior.
  - [ ] Confirm the work follows the in-place Turborepo migration sequence rather than replacing the app.
- [ ] Implement `Open Airtable Management Handoff Safely` according to the acceptance criteria (AC: 1-5)
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
- Implementation focus: Preserve Manage handoff but redirect only to the active Program's configured Airtable Interface after server role checks.
- Dependency/decision gate: Depends on Story 2.5 Program management URL config and role guards from Story 2.2.
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

