# Story 5.4: Monitor Live Attendance With Incremental Refresh

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Preacher or Admin,
I want to monitor live attendance for the active Session,
So that I can trust the count and attendee list during the event.

## Acceptance Criteria

1. Given an active Preacher or Admin opens the live dashboard
When the dashboard loads
Then it resolves the active Program and authorized Session scope
And it shows Session name, location, attendance URL or QR access, count, and attendee list.
2. Given a Preacher views the dashboard
When attendance data is loaded
Then only owned or allowed-location Sessions are visible according to the approved scope rule
And other Program or out-of-scope records are not returned.
3. Given an Admin views the dashboard
When attendance data is loaded
Then active Program data is visible for Admin management
And cross-program data is hidden unless explicit permission is granted.
4. Given polling or refresh loads new Attendance Records
When known attendance IDs are sent by the client
Then the response appends only new records with stable IDs and display fields
And duplicate rows are not added to the UI.
5. Given no active Session exists
When the dashboard renders
Then it shows a clear empty state that points authorized staff to Sessions
And Volunteers and unauthenticated users cannot use the dashboard.

## Tasks / Subtasks

- [ ] Read and protect the existing brownfield behavior before implementation (AC: 1-5)
  - [ ] Open every listed UPDATE file before editing and note current route/component behavior.
  - [ ] Confirm the work follows the in-place Turborepo migration sequence rather than replacing the app.
- [ ] Implement `Monitor Live Attendance With Incremental Refresh` according to the acceptance criteria (AC: 1-5)
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
- Implementation focus: Preserve live dashboard incremental refresh using stable Airtable Attendance record IDs.
- Dependency/decision gate: Depends on Story 5.1 and Story 5.2 for scoped Session access and stable Attendance record IDs.
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

