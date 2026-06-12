# Story 3.1: Register Public Program Contacts

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a public visitor,
I want to register for the active Program with basic profile details,
So that I can join without staff intervention.

## Acceptance Criteria

1. Given a public visitor opens a Program registration page
When the form renders
Then it displays fields enabled for the active Program, including name, mobile number, age or date details where configured, occupation, year where relevant, and location
And the visitor does not need staff authentication.
2. Given the visitor submits a mobile number
When the client and server validate it
Then the value is normalized to the last 10 digits
And invalid values are rejected before Airtable mutation.
3. Given a normalized mobile number already exists in the active Program Airtable Contacts table
When registration is submitted
Then the route returns a clear already-registered state
And no duplicate Contact is created.
4. Given a valid new registration is submitted
When the API route writes Airtable
Then it creates a Contact only in the active Program Base
And it writes only fields allowed by that Program's Capability Profile.
5. Given the registration succeeds, duplicates, queues, or fails
When the response reaches the UI
Then the user sees a clear status message
And the message does not expose Airtable internals.

## Tasks / Subtasks

- [ ] Read and protect the existing brownfield behavior before implementation (AC: 1-5)
  - [ ] Open every listed UPDATE file before editing and note current route/component behavior.
  - [ ] Confirm the work follows the in-place Turborepo migration sequence rather than replacing the app.
- [ ] Implement `Register Public Program Contacts` according to the acceptance criteria (AC: 1-5)
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

- Epic context: Public Registration And Session Attendance: public contacts, attendance, unknown-attendee handoff, and offline queueing.
- Implementation focus: Preserve `/api/registration` duplicate/mobile behavior while making Contact writes Program-scoped and config-driven.
- Dependency/decision gate: Depends on Story 0.1 for Program Airtable mapping before production Airtable writes.
- Preserve: `/attendance` is the active live attendance route; do not rename it to `/api/attendance` unless every client and service-worker dependency is updated.
- Preserve: Preserve duplicate flags, already-registered states, not-registered session handoff, and 10-digit mobile normalization.
- Current working application is the source of truth for behavior. The architecture target is a migration/extraction path, not permission to discard existing flows.

### Files / Areas To Read Before Editing

- `app/register/page.tsx`
- `components/registration-form.tsx`
- `app/api/registration/route.ts`
- `app/attend/page.tsx`
- `components/attendance-form.tsx`
- `app/attendance/route.ts`
- `public/sw.js`
- `components/offline-indicator.tsx`

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
- `app/register/page.tsx`
- `components/registration-form.tsx`
- `app/api/registration/route.ts`
- `app/attend/page.tsx`
- `components/attendance-form.tsx`
- `app/attendance/route.ts`
- `public/sw.js`
- `components/offline-indicator.tsx`

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List

