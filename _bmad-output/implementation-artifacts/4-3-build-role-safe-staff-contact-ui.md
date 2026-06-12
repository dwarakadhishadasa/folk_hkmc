# Story 4.3: Build Role-Safe Staff Contact UI

Status: ready-for-dev

<!-- Freshly generated from `_bmad-output/planning-artifacts/epics.md` on 2026-06-13T00:44:20+05:30. -->

## Story

As a staff member,
I want the Contact page to show only fields and actions my role can use,
so that I can capture contacts quickly without creating ownership mistakes.

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

- [ ] Re-read the source story and dependent decisions before implementation (AC: 1, 2, 3, 4, 5)
  - [ ] Confirm unresolved DD gates are resolved or explicitly waived where this story depends on them.
  - [ ] Identify every existing route/component/helper listed below that will be updated and read it before editing.
- [ ] Implement `Build Role-Safe Staff Contact UI` according to the acceptance criteria (AC: 1, 2, 3, 4, 5)
  - [ ] Keep Program context explicit at every server boundary.
  - [ ] Reuse existing helpers, contracts, UI primitives, and route patterns before adding new abstractions.
  - [ ] Preserve current FOLK behavior unless the acceptance criteria explicitly require a change.
- [ ] Preserve duplicate, validation, mobile normalization, and safe status-message behavior in affected public or staff forms.
- [ ] Verify mobile, keyboard, focus, and status-message behavior for every changed user-facing surface.
- [ ] Verify the implementation
  - [ ] Run required lint/type checks for product code changes.
  - [ ] Record manual smoke-test notes for affected staff/public flows.

## Dev Notes

### Epic Context

- Epic: Staff Contact Capture And Ownership Routing.
- Epic goal: Volunteers, Preachers, and Admins can capture contacts with duplicate prevention, location, collector, comments, and correct assigned-Preacher ownership.
- Story source: `_bmad-output/planning-artifacts/epics.md` section `Story 4.3: Build Role-Safe Staff Contact UI`.

### Non-Negotiable Guardrails

- Resolve Program context before reading or writing Program-scoped data; never trust a client-supplied Program ID for cross-program access.
- Keep Airtable REST access, Airtable credentials, Supabase service-role operations, and authz server helpers out of client components.
- Preserve current FOLK parity contracts for registration, attendance, session-backed registration, duplicate handling, mobile normalization, sessions, dashboard polling, invite flows, manage handoff, and service-worker queueing unless this story explicitly changes them.
- Use stable Program IDs `folk` and `gita-life`; API payloads use `camelCase`, while Supabase tables and columns use `snake_case`.
- Keep errors safe and actionable. API error responses should use `{ error: string, code?: string }` and must not expose Airtable API details, Supabase service-role errors, tokens, or OTP values.
- Reuse existing `components/ui/*`, feature components, `lib/utils.ts`, Supabase helpers, and Airtable helper patterns before adding new primitives or route contracts.

### Story-Specific Notes

- Mobile numbers must normalize to the last 10 digits at both client and server boundaries; duplicate behavior must remain safe and user-understandable.
- Volunteer assigned-Preacher resolution is server-owned and fail-closed; browser-provided ownership fields cannot override staff context.
- Before implementation, check lower-numbered stories in Epic 4 and any completed readiness gates for decisions this story depends on.

### Files / Areas To Read Before Editing

- `app/contact/page.tsx`
- `components/contact-form.tsx`
- `components/header.tsx`
- `components/staff-auth-shell.tsx`
- `components/ui/**`
- `app/globals.css`

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
