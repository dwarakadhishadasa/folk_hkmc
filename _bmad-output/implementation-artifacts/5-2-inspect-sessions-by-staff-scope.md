# Story 5.2: Inspect Sessions By Staff Scope

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Preacher or Admin,
I want to inspect only the Sessions I am allowed to operate,
So that Session management stays aligned with Program ownership and location rules.

## Acceptance Criteria

1. Given an active Admin requests the Sessions page or `GET /api/sessions`
When Sessions are loaded
Then the response includes all operational Sessions needed for Admin management in the active Program
And no Sessions from the other Program are returned.
2. Given an active Preacher requests Sessions
When Sessions are loaded
Then the response includes owned Sessions or allowed-location Sessions according to the approved scope rule
And unrelated Sessions are not returned.
3. Given an active Volunteer requests Sessions
When server authorization runs
Then access is denied
And no Session records are returned to the browser.
4. Given Airtable records contain missing optional fields
When Sessions are mapped to API payloads
Then the route returns stable typed JSON with safe null or empty values
And the client does not crash.
5. Given a Session has an attendance URL and open/close state
When the Sessions UI renders it
Then staff can see whether attendance is currently open
And the shown link matches server enforcement.

## Tasks / Subtasks

- [ ] Read and protect the existing brownfield behavior before implementation (AC: 1-5)
  - [ ] Open every listed UPDATE file before editing and note current route/component behavior.
  - [ ] Confirm the work follows the in-place Turborepo migration sequence rather than replacing the app.
- [ ] Implement `Inspect Sessions By Staff Scope` according to the acceptance criteria (AC: 1-5)
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
- Implementation focus: Preserve scoped session listing for Admin/Preacher and deny Volunteers server-side.
- Dependency/decision gate: Depends on Story 5.1 session contracts and Program-aware staff context from Epic 2.
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

