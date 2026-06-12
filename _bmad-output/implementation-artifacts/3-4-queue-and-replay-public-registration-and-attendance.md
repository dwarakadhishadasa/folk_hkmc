# Story 3.4: Queue And Replay Public Registration And Attendance

Status: ready-for-dev

<!-- Freshly generated from `_bmad-output/planning-artifacts/epics.md` on 2026-06-13T00:44:20+05:30. -->

## Story

As a public visitor or attendee,
I want registration and attendance submissions to queue during connectivity loss,
so that event-day participation can continue when the network is unreliable.

## Acceptance Criteria

1. Given the browser supports the app's offline queue mechanism
   When public registration is submitted while offline
   Then the request is queued with Program context, normalized mobile where available, and allowed registration fields
   And the UI shows a pending queued state.
2. Given attendance is submitted from a Session link while offline
   When the request is queued
   Then the queued payload preserves mobile and session ID
   And replay posts the same shape expected by the attendance route.
3. Given queued requests replay after connectivity returns
   When the server responds with success, duplicate, not-registered, closed, or failed states
   Then the UI reflects the final state clearly
   And duplicate replay is treated as completed where appropriate.
4. Given a queued registration came from a session-backed attendance flow
   When replay creates or reuses a Contact
   Then the session context is preserved for attendance follow-through
   And replay remains idempotent.
5. Given staff contact creation is attempted offline
   When no explicit staff-offline strategy exists
   Then the app does not silently queue the authenticated write
   And the staff user sees an online-required message.

## Tasks / Subtasks

- [ ] Re-read the source story and dependent decisions before implementation (AC: 1, 2, 3, 4, 5)
  - [ ] Confirm unresolved DD gates are resolved or explicitly waived where this story depends on them.
  - [ ] Identify every existing route/component/helper listed below that will be updated and read it before editing.
- [ ] Implement `Queue And Replay Public Registration And Attendance` according to the acceptance criteria (AC: 1, 2, 3, 4, 5)
  - [ ] Keep Program context explicit at every server boundary.
  - [ ] Reuse existing helpers, contracts, UI primitives, and route patterns before adding new abstractions.
  - [ ] Preserve current FOLK behavior unless the acceptance criteria explicitly require a change.
- [ ] Preserve duplicate, validation, mobile normalization, and safe status-message behavior in affected public or staff forms.
- [ ] Verify the implementation
  - [ ] Run required lint/type checks for product code changes.
  - [ ] Record manual smoke-test notes for affected staff/public flows.

## Dev Notes

### Epic Context

- Epic: Public Registration And Session Attendance.
- Epic goal: Public visitors and attendees can register, mark Session attendance by mobile number, recover from unknown-mobile handoff, and rely on offline queueing where supported.
- Story source: `_bmad-output/planning-artifacts/epics.md` section `Story 3.4: Queue And Replay Public Registration And Attendance`.

### Non-Negotiable Guardrails

- Resolve Program context before reading or writing Program-scoped data; never trust a client-supplied Program ID for cross-program access.
- Keep Airtable REST access, Airtable credentials, Supabase service-role operations, and authz server helpers out of client components.
- Preserve current FOLK parity contracts for registration, attendance, session-backed registration, duplicate handling, mobile normalization, sessions, dashboard polling, invite flows, manage handoff, and service-worker queueing unless this story explicitly changes them.
- Use stable Program IDs `folk` and `gita-life`; API payloads use `camelCase`, while Supabase tables and columns use `snake_case`.
- Keep errors safe and actionable. API error responses should use `{ error: string, code?: string }` and must not expose Airtable API details, Supabase service-role errors, tokens, or OTP values.
- Reuse existing `components/ui/*`, feature components, `lib/utils.ts`, Supabase helpers, and Airtable helper patterns before adding new primitives or route contracts.

### Story-Specific Notes

- Mobile numbers must normalize to the last 10 digits at both client and server boundaries; duplicate behavior must remain safe and user-understandable.
- Public registration and attendance stay unauthenticated, Program-scoped, duplicate-safe, and compatible with service-worker queueing where the story touches offline behavior.
- Before implementation, check lower-numbered stories in Epic 3 and any completed readiness gates for decisions this story depends on.

### Files / Areas To Read Before Editing

- `public/sw.js`
- `components/service-worker-register.tsx`
- `components/offline-indicator.tsx`
- `components/registration-form.tsx`
- `components/attendance-form.tsx`
- `app/api/registration/route.ts`
- `app/attendance/route.ts`

### Architecture Compliance

- Target architecture is an adapted in-place Turborepo workspace with `apps/folk`, `apps/gita-life`, and shared packages for `ui`, `program-config`, `data-contracts`, `authz`, and `airtable`.
- Each Program App should deploy as its own Vercel Project with app-specific `NEXT_PUBLIC_SITE_URL`, Supabase redirect URLs, Airtable Base/table env vars, and management interface configuration.
- Shared staff identity lives in one Supabase project; authorization is Program-scoped through memberships, role cache, Airtable identity mapping, sync state, and audit data.
- Airtable remains the operational source for Contacts, Attendance, Sessions, Users/Staff, Locations, and management interfaces. Supabase is the runtime authorization mirror, not the primary store for operational records.
- Admin and role-changing actions fail closed when sync state is stale, unknown, or unresolved by policy.

### Testing Requirements

- Run `pnpm lint` for product code changes.
- Run `pnpm exec tsc --noEmit` because this repo can ignore TypeScript errors during Next builds.
- For UI work, manually verify the affected workflow at 360px width, keyboard navigation, focus visibility, labels, and status messaging.
- For auth/server-route work, smoke-test authorized, unauthorized, wrong-role, inactive/revoked, and stale-sync paths as applicable.
- For Airtable/PWA work, smoke-test success, duplicate/already-existing, validation failure, offline/queued, replay, and safe error states as applicable.

### Project Structure Notes

- Current workspace still contains a top-level brownfield app plus a nascent `apps/gita-life` boundary; verify current file locations before moving or importing code.
- Keep app-local pages and Program-specific copy/assets in the relevant app boundary once the split exists.
- Shared contracts, Program config, authz helpers, Airtable adapters, and UI primitives should move into packages only when the story owns or requires that extraction.

### References

- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/prds/prd-gita-life-operations/prd.md`
- `_bmad-output/planning-artifacts/prds/prd-gita-life-operations/architecture.md`
- `_bmad-output/planning-artifacts/prds/prd-gita-life-operations/addendum.md`
- `_bmad-output/project-context.md`

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Fresh story context generated from current epic and architecture sources.

### File List
