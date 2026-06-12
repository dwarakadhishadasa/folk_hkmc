# Story 4.2: Enforce Role-Based Contact Ownership

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Program lead,
I want staff-created contacts assigned according to role rules,
So that follow-up ownership is trustworthy.

## Acceptance Criteria

1. Given a Volunteer creates a contact
When assigned Preacher is resolved
Then the server uses the Volunteer's active Airtable assigned Preacher relationship
And any browser-provided assigned Preacher value is ignored.
2. Given a Volunteer has no assigned active Preacher
When they attempt contact creation
Then the request fails closed with an actionable message
And no Contact is created.
3. Given a Preacher creates a contact
When assigned Preacher is resolved
Then the server assigns the Contact to the signed-in Preacher
And the collector is recorded as the signed-in staff user.
4. Given an Admin creates a contact
When no explicit assigned Preacher is provided
Then the request is rejected before Airtable mutation
And the UI can prompt for the missing assignment.
5. Given sensitive comments and profile details are captured
When DD-8 or DD-9 policy is unresolved
Then Story 0.3 records the policy dependency before this story is assigned for production implementation
And visibility defaults to least privilege.

## Tasks / Subtasks

- [ ] Read and protect the existing brownfield behavior before implementation (AC: 1-5)
  - [ ] Open every listed UPDATE file before editing and note current route/component behavior.
  - [ ] Confirm the work follows the in-place Turborepo migration sequence rather than replacing the app.
- [ ] Implement `Enforce Role-Based Contact Ownership` according to the acceptance criteria (AC: 1-5)
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
- Implementation focus: Keep role ownership enforced on the server: Volunteer assigned Preacher, Preacher self, Admin explicit active Preacher.
- Dependency/decision gate: Depends on Story 0.3 for sensitive field visibility and retention policy where comments/profile details are exposed.
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

