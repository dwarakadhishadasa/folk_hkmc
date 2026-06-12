# Story 5.1: Create Scoped Sessions With Attendance URLs

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Preacher or Admin,
I want to create an active Session with a public attendance URL,
So that attendees can check in for the correct Program event.

## Acceptance Criteria

1. Given an active Preacher or Admin submits a Session creation request
When `POST /api/sessions` handles the payload
Then it resolves Program-aware staff context server-side
And it rejects Volunteers and inactive or stale staff.
2. Given a Preacher selects a location
When the route validates scope
Then the location must be within the Preacher's allowed Program location scope
And out-of-scope locations are rejected before Airtable mutation.
3. Given an Admin selects a location
When the route validates scope
Then any active location for the Program may be used
And unknown or inactive locations are rejected.
4. Given the Session payload is valid
When Airtable is written
Then the Session record includes name, date/time where configured, location, owner or Preacher, public attendance enabled state, open time, and close time
And the owner/preacher comes from server context or validated Admin input, not untrusted browser ownership data.
5. Given the Session is created
When the attendance URL is generated
Then it uses the active Program App's configured `NEXT_PUBLIC_SITE_URL` and `/attend?session=<sessionId>`
And the URL is stored back to the Program Airtable Session record.
6. Given attendance URLs depend on deployed app domains
When this story is assigned for implementation
Then Story 0.2 has resolved or explicitly waived DD-10 for interim development and production-domain planning
And generated URLs are accepted only against documented `NEXT_PUBLIC_SITE_URL` values.

## Tasks / Subtasks

- [ ] Read and protect the existing brownfield behavior before implementation (AC: 1-6)
  - [ ] Open every listed UPDATE file before editing and note current route/component behavior.
  - [ ] Confirm the work follows the in-place Turborepo migration sequence rather than replacing the app.
- [ ] Implement `Create Scoped Sessions With Attendance URLs` according to the acceptance criteria (AC: 1-6)
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

- Epic context: Session Operations And Live Attendance: scoped sessions, attendance URLs/QR, and live incremental dashboard.
- Implementation focus: Preserve session creation and generated `/attend?session=` URLs while selecting Program app URL and Airtable mapping from config.
- Dependency/decision gate: Depends on Story 0.2 for DD-10 and Story 0.1 for Session/Location/User mappings.
- Preserve: Session attendance links depend on `NEXT_PUBLIC_SITE_URL`; generated links must match the active Program App.
- Preserve: Dashboard refresh depends on stable Airtable Attendance record IDs and knownAttendanceIds.
- Current working application is the source of truth for behavior. The architecture target is a migration/extraction path, not permission to discard existing flows.

### Files / Areas To Read Before Editing

- `app/sessions/page.tsx`
- `components/sessions-manager.tsx`
- `app/api/sessions/route.ts`
- `app/dashboard/page.tsx`
- `components/live-attendance-dashboard.tsx`
- `app/attendance/route.ts`

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
- `app/sessions/page.tsx`
- `components/sessions-manager.tsx`
- `app/api/sessions/route.ts`
- `app/dashboard/page.tsx`
- `components/live-attendance-dashboard.tsx`
- `app/attendance/route.ts`

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List

