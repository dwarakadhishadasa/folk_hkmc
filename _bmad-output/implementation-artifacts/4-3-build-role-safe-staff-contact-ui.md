# Story 4.3: Build Role-Safe Staff Contact UI

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a staff member,
I want the Contact page to show only fields and actions my role can use,
So that I can capture contacts quickly without creating ownership mistakes.

## Acceptance Criteria

1. Given an active Volunteer opens Contact
When the page renders
Then they can enter allowed contact identity, profile, location, source, and comment fields
And they do not see assigned Preacher selection, dashboard links, session links, invite links, or manage links.
2. Given an active Preacher opens Contact
When the page renders
Then the UI indicates contacts will be assigned to the signed-in Preacher
And it does not imply the Preacher can assign contacts to another Preacher.
3. Given an active Admin opens Contact
When the page renders
Then assigned Preacher selection is available and required
And selectable Preachers are validated from active Program data.
4. Given the Contact page is used on a 360px-wide mobile viewport
When staff enter and submit contact details
Then the form has no horizontal scrolling
And required actions and status messages remain visible.
5. Given the Contact page is used with keyboard or assistive technology
When fields, buttons, errors, and success messages are inspected
Then labels, focus states, and status messaging meet the shared accessibility expectations.

## Tasks / Subtasks

- [ ] Read and protect the existing brownfield behavior before implementation (AC: 1-5)
  - [ ] Open every listed UPDATE file before editing and note current route/component behavior.
  - [ ] Confirm the work follows the in-place Turborepo migration sequence rather than replacing the app.
- [ ] Implement `Build Role-Safe Staff Contact UI` according to the acceptance criteria (AC: 1-5)
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

- Epic context: Staff Contact Capture And Ownership Routing: authenticated contact capture with role-safe ownership.
- Implementation focus: Make the Contact UI role-safe on mobile while relying on server enforcement for actual permission decisions.
- Dependency/decision gate: Depends on Story 0.3 for role-specific visibility rules and Story 4.2 for server-side ownership rules.
- Preserve: Staff contact writes are online-only for MVP; do not silently connect the inactive localStorage offline queue.
- Preserve: Server route ownership rules are authoritative even if the UI hides invalid controls.
- Current working application is the source of truth for behavior. The architecture target is a migration/extraction path, not permission to discard existing flows.

### Files / Areas To Read Before Editing

- `app/contact/page.tsx`
- `components/contact-form.tsx`
- `app/api/contact/route.ts`
- `lib/authz.ts`
- `lib/airtable.ts`

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
- `app/contact/page.tsx`
- `components/contact-form.tsx`
- `app/api/contact/route.ts`
- `lib/authz.ts`
- `lib/airtable.ts`

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List

