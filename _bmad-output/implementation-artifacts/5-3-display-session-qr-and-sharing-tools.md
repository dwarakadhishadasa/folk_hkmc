# Story 5.3: Display Session QR And Sharing Tools

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Preacher or Admin,
I want to share the Session attendance link and QR code,
So that attendees can check in quickly during the event.

## Acceptance Criteria

1. Given a created Session has an attendance URL
When the Session appears in the UI
Then the page displays a QR code that encodes that exact URL
And it does not fall back to a generic attendance URL.
2. Given staff need to share the link
When they use the Session sharing controls
Then the URL can be copied or opened according to the app's supported controls
And the displayed URL uses the active Program App domain.
3. Given attendance is disabled or outside the window
When the QR/link area renders
Then the UI clearly communicates the unavailable state
And staff are not misled into sharing an active-looking link.
4. Given the Sessions page is used during an event on mobile
When QR, link, and Session status are displayed
Then the QR remains scannable and core actions remain reachable
And the layout avoids horizontal scrolling at 360px width.

## Tasks / Subtasks

- [ ] Read and protect the existing brownfield behavior before implementation (AC: 1-4)
  - [ ] Open every listed UPDATE file before editing and note current route/component behavior.
  - [ ] Confirm the work follows the in-place Turborepo migration sequence rather than replacing the app.
- [ ] Implement `Display Session QR And Sharing Tools` according to the acceptance criteria (AC: 1-4)
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
- Implementation focus: Display QR/share controls using the exact server-generated attendance URL.
- Dependency/decision gate: Depends on Story 5.1 generated attendance URL contract.
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

