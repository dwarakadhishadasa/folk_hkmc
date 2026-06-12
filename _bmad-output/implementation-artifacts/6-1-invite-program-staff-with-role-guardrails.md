# Story 6.1: Invite Program Staff With Role Guardrails

Status: ready-for-dev

<!-- Freshly generated from `_bmad-output/planning-artifacts/epics.md` on 2026-06-13T00:44:20+05:30. -->

## Story

As an Admin,
I want to invite staff with Program-scoped roles and access details,
so that each person receives the correct operational access.

## Acceptance Criteria

1. Given an active Admin submits a staff invite
   When the invite API validates the request
   Then it accepts only `Admin`, `Preacher`, or `Volunteer` roles for the active Program
   And it denies Preacher, Volunteer, unauthenticated, inactive, or stale callers for Admin-only invite actions.
2. Given the Admin invites a Volunteer
   When assigned Preacher is missing or invalid
   Then the request is rejected before Airtable or Supabase mutation
   And the UI can show an actionable validation message.
3. Given the Admin invites an Admin or Preacher
   When location access is provided
   Then selected locations are validated against active Program locations
   And raw or unknown Airtable IDs are rejected.
4. Given the target email already belongs to a Supabase Auth user or another Program membership
   When the invite is processed
   Then the system reuses the shared Supabase identity where possible
   And creates or updates only the active Program membership and Airtable identity mapping.
5. Given Airtable user upsert and Supabase invite are attempted
   When the flow succeeds or fails
   Then the invite-log persistence needed by Admin invite outcomes is created or reused
   And the log records inviter, invitee email, role, Program, Airtable user ID where available, status, safe error message, and timestamps
   And no secret keys or raw provider tokens are exposed.
6. Given invite logs and staff profile mirrors may contain operationally sensitive data
   When this story is assigned for implementation
   Then Story 0.3 has resolved or explicitly waived DD-8 and DD-9 where they affect invite visibility and retention.

## Tasks / Subtasks

- [ ] Re-read the source story and dependent decisions before implementation (AC: 1, 2, 3, 4, 5, 6)
  - [ ] Confirm unresolved DD gates are resolved or explicitly waived where this story depends on them.
  - [ ] Identify every existing route/component/helper listed below that will be updated and read it before editing.
- [ ] Implement `Invite Program Staff With Role Guardrails` according to the acceptance criteria (AC: 1, 2, 3, 4, 5, 6)
  - [ ] Keep Program context explicit at every server boundary.
  - [ ] Reuse existing helpers, contracts, UI primitives, and route patterns before adding new abstractions.
  - [ ] Preserve current FOLK behavior unless the acceptance criteria explicitly require a change.
- [ ] Validate privileged route authorization server-side and keep user-facing failures actionable but non-sensitive.
- [ ] Verify the implementation
  - [ ] Run required lint/type checks for product code changes.
  - [ ] Record manual smoke-test notes for affected staff/public flows.

## Dev Notes

### Epic Context

- Epic: Staff Administration And Airtable Handoff.
- Epic goal: Admins can invite staff, manage role/location access details, create locations inline, audit invite attempts, and authorized staff can open the Airtable management surface safely.
- Story source: `_bmad-output/planning-artifacts/epics.md` section `Story 6.1: Invite Program Staff With Role Guardrails`.

### Non-Negotiable Guardrails

- Resolve Program context before reading or writing Program-scoped data; never trust a client-supplied Program ID for cross-program access.
- Keep Airtable REST access, Airtable credentials, Supabase service-role operations, and authz server helpers out of client components.
- Preserve current FOLK parity contracts for registration, attendance, session-backed registration, duplicate handling, mobile normalization, sessions, dashboard polling, invite flows, manage handoff, and service-worker queueing unless this story explicitly changes them.
- Use stable Program IDs `folk` and `gita-life`; API payloads use `camelCase`, while Supabase tables and columns use `snake_case`.
- Keep errors safe and actionable. API error responses should use `{ error: string, code?: string }` and must not expose Airtable API details, Supabase service-role errors, tokens, or OTP values.
- Reuse existing `components/ui/*`, feature components, `lib/utils.ts`, Supabase helpers, and Airtable helper patterns before adding new primitives or route contracts.

### Story-Specific Notes

- Invite and management flows are privileged surfaces; validate roles, locations, assigned Preacher rules, logging, and safe error messages server-side.
- Before implementation, check lower-numbered stories in Epic 6 and any completed readiness gates for decisions this story depends on.

### Files / Areas To Read Before Editing

- `app/api/admin/invite-user/route.ts`
- `app/api/volunteers/invite/route.ts`
- `lib/invite-log.ts`
- `lib/supabase/admin.ts`
- `lib/authz.ts`
- `lib/airtable.ts`
- `supabase/migrations/**`

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
