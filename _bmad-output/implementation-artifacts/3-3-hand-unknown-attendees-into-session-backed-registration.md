# Story 3.3: Hand Unknown Attendees Into Session-Backed Registration

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an unregistered attendee,
I want the attendance flow to carry my mobile and Session into registration,
So that I do not repeat work before attendance is completed.

## Acceptance Criteria

1. Given an attendance submission has a valid Session but no matching Contact
When `POST /attendance` responds
Then it returns a not-registered state with normalized mobile and preserved session ID
And it does not create Attendance.
2. Given the attendance UI receives a not-registered state
When it redirects the attendee
Then the destination includes `mobile=<normalized mobile>` and `session=<sessionId>`
And the session parameter is not dropped during navigation.
3. Given the registration page opens with mobile and session parameters
When the form renders
Then the mobile field is prefilled where appropriate
And the session ID is retained for registration submission and follow-through.
4. Given session-backed registration creates or reuses a Contact
When registration completes
Then the client attempts attendance completion for the same mobile and Session
And duplicate attendance after registration is treated as a completed outcome.
5. Given the Session becomes invalid or closed during registration
When attendance follow-through runs
Then the user sees a clear follow-up state
And the system does not create another Contact or invalid Attendance record.

## Tasks / Subtasks

- [ ] Read and protect the existing brownfield behavior before implementation (AC: 1-5)
  - [ ] Open every listed UPDATE file before editing and note current route/component behavior.
  - [ ] Confirm the work follows the in-place Turborepo migration sequence rather than replacing the app.
- [ ] Implement `Hand Unknown Attendees Into Session-Backed Registration` according to the acceptance criteria (AC: 1-5)
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
- Implementation focus: Preserve mobile and session context from attendance not-registered state through registration and attendance completion.
- Dependency/decision gate: Depends on stories 3.1 and 3.2 contracts staying compatible for session-backed registration.
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

