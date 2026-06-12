# Story 1.1b: Add Gita Life App Shell And Shared Program Configuration

Status: ready-for-dev

<!-- Freshly generated from `_bmad-output/planning-artifacts/epics.md` on 2026-06-13T00:44:20+05:30. -->

## Story

As a staff user,
I want Gita Life to have its own portal shell backed by shared Program config,
so that Gita Life can start from the same operational foundation without copying FOLK-specific logic.

## Acceptance Criteria

1. Given `apps/folk` exists or is being introduced
   When `apps/gita-life` is added
   Then the Gita Life app has an independent App Router shell, metadata, assets slot, and local run/build configuration.
2. Given Program configuration is needed by both apps
   When either app resolves Program context
   Then it uses stable Program IDs `folk` and `gita-life`
   And Program labels, vocabulary, app URLs, enabled modules, and public asset references come from shared Program configuration or app-local assets.
3. Given Vercel will deploy the apps separately
   When app-level configuration is reviewed
   Then each app has a clear place for `NEXT_PUBLIC_SITE_URL` and server-only operational secrets
   And no shared component hard-codes one Program's vocabulary into the other Program.
4. Given Story 1.1b depends on launch and redirect configuration
   When it is assigned for implementation
   Then Story 0.2 has resolved or explicitly waived DD-10 for interim development and production-domain planning.

## Tasks / Subtasks

- [ ] Re-read the source story and dependent decisions before implementation (AC: 1, 2, 3, 4)
  - [ ] Confirm unresolved DD gates are resolved or explicitly waived where this story depends on them.
  - [ ] Identify every existing route/component/helper listed below that will be updated and read it before editing.
- [ ] Implement `Add Gita Life App Shell And Shared Program Configuration` according to the acceptance criteria (AC: 1, 2, 3, 4)
  - [ ] Keep Program context explicit at every server boundary.
  - [ ] Reuse existing helpers, contracts, UI primitives, and route patterns before adding new abstractions.
  - [ ] Preserve current FOLK behavior unless the acceptance criteria explicitly require a change.
- [ ] Verify the implementation
  - [ ] Run required lint/type checks for product code changes.
  - [ ] Record manual smoke-test notes for affected staff/public flows.

## Dev Notes

### Epic Context

- Epic: Branded Program Portal Entry.
- Epic goal: Public visitors and staff can reach the correct Gita Life or FOLK portal entry without disrupting public discovery and registration.
- Story source: `_bmad-output/planning-artifacts/epics.md` section `Story 1.1b: Add Gita Life App Shell And Shared Program Configuration`.

### Non-Negotiable Guardrails

- Resolve Program context before reading or writing Program-scoped data; never trust a client-supplied Program ID for cross-program access.
- Keep Airtable REST access, Airtable credentials, Supabase service-role operations, and authz server helpers out of client components.
- Preserve current FOLK parity contracts for registration, attendance, session-backed registration, duplicate handling, mobile normalization, sessions, dashboard polling, invite flows, manage handoff, and service-worker queueing unless this story explicitly changes them.
- Use stable Program IDs `folk` and `gita-life`; API payloads use `camelCase`, while Supabase tables and columns use `snake_case`.
- Keep errors safe and actionable. API error responses should use `{ error: string, code?: string }` and must not expose Airtable API details, Supabase service-role errors, tokens, or OTP values.
- Reuse existing `components/ui/*`, feature components, `lib/utils.ts`, Supabase helpers, and Airtable helper patterns before adding new primitives or route contracts.

### Story-Specific Notes

- This epic changes app boundaries and user entry points; protect existing FOLK operational routes while adding Program-specific shells and labels.
- Before implementation, check lower-numbered stories in Epic 1 and any completed readiness gates for decisions this story depends on.

### Files / Areas To Read Before Editing

- `apps/gita-life/**`
- `apps/folk/**`
- `package.json`
- `pnpm-workspace.yaml`
- `turbo.json`
- `app/layout.tsx`
- `app/page.tsx`
- `components/header.tsx`
- `public/**`

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
