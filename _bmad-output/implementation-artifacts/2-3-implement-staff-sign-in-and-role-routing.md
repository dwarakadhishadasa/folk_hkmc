# Story 2.3: Implement Staff Sign-In And Role Routing

Status: ready-for-dev

<!-- Freshly generated from `_bmad-output/planning-artifacts/epics.md` on 2026-06-13T00:44:20+05:30. -->

## Story

As an invited staff user,
I want to sign in once and land in the correct Program/Role surface,
so that I can start the work I am authorized to do.

## Acceptance Criteria

1. Given a staff user opens the Program App sign-in flow
   When they submit their invited staff email or approved login method
   Then the app starts a Supabase-backed authentication flow for that email
   And the UI does not expose demo credentials or local role-switching controls.
2. Given the login method was deferred as DD-6
   When this story is assigned for implementation
   Then Story 0.2 has recorded Supabase email OTP/invite as the implementation default or documents an explicit product-owner change
   And the story does not proceed with multiple competing login methods.
3. Given Supabase completes authentication
   When the auth callback or confirmation route runs
   Then it establishes a secure cookie-backed session
   And it resolves Program-aware staff context before redirecting to any protected staff surface.
4. Given an active Volunteer signs in
   When routing completes
   Then they land on the staff Contact surface
   And dashboard, sessions, invite, admin, and manage surfaces are not exposed as available destinations.
5. Given an active Preacher signs in
   When routing completes
   Then they can reach Contact, Sessions, Live Attendance, Volunteer Invite where enabled, and Manage where permitted
   And Admin-only invite or location-management actions remain inaccessible.
6. Given an active Admin signs in
   When routing completes
   Then they can reach Contact, Sessions, Live Attendance, staff invite, location management, and Manage surfaces for the active Program
   And final data access still depends on server-side authz checks.
7. Given sign-out is requested
   When the sign-out route completes
   Then Supabase session cookies are cleared
   And the user is redirected away from protected staff pages.

## Tasks / Subtasks

- [ ] Re-read the source story and dependent decisions before implementation (AC: 1, 2, 3, 4, 5, 6, 7)
  - [ ] Confirm unresolved DD gates are resolved or explicitly waived where this story depends on them.
  - [ ] Identify every existing route/component/helper listed below that will be updated and read it before editing.
- [ ] Implement `Implement Staff Sign-In And Role Routing` according to the acceptance criteria (AC: 1, 2, 3, 4, 5, 6, 7)
  - [ ] Keep Program context explicit at every server boundary.
  - [ ] Reuse existing helpers, contracts, UI primitives, and route patterns before adding new abstractions.
  - [ ] Preserve current FOLK behavior unless the acceptance criteria explicitly require a change.
- [ ] Verify the implementation
  - [ ] Run required lint/type checks for product code changes.
  - [ ] Record manual smoke-test notes for affected staff/public flows.

## Dev Notes

### Epic Context

- Epic: Program-Scoped Staff Access And Data Trust.
- Epic goal: Staff can sign in with one shared identity, land in the correct Program/Role surface, and trust that access, Airtable mapping, sync status, and audit behavior are Program-scoped.
- Story source: `_bmad-output/planning-artifacts/epics.md` section `Story 2.3: Implement Staff Sign-In And Role Routing`.

### Non-Negotiable Guardrails

- Resolve Program context before reading or writing Program-scoped data; never trust a client-supplied Program ID for cross-program access.
- Keep Airtable REST access, Airtable credentials, Supabase service-role operations, and authz server helpers out of client components.
- Preserve current FOLK parity contracts for registration, attendance, session-backed registration, duplicate handling, mobile normalization, sessions, dashboard polling, invite flows, manage handoff, and service-worker queueing unless this story explicitly changes them.
- Use stable Program IDs `folk` and `gita-life`; API payloads use `camelCase`, while Supabase tables and columns use `snake_case`.
- Keep errors safe and actionable. API error responses should use `{ error: string, code?: string }` and must not expose Airtable API details, Supabase service-role errors, tokens, or OTP values.
- Reuse existing `components/ui/*`, feature components, `lib/utils.ts`, Supabase helpers, and Airtable helper patterns before adding new primitives or route contracts.

### Story-Specific Notes

- Supabase Auth identity is not sufficient authorization; every protected path must prove active Program membership and role server-side.
- Before implementation, check lower-numbered stories in Epic 2 and any completed readiness gates for decisions this story depends on.

### Files / Areas To Read Before Editing

- `app/login/**`
- `app/auth/**`
- `app/api/auth/**`
- `components/auth-hash-callback.tsx`
- `components/staff-auth-shell.tsx`
- `lib/auth-context.tsx`
- `lib/authz.ts`
- `lib/supabase/**`

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
