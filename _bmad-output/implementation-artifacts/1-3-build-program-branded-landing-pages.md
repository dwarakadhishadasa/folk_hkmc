# Story 1.3: Build Program-Branded Landing Pages

Status: ready-for-dev

<!-- Freshly generated from `_bmad-output/planning-artifacts/epics.md` on 2026-06-13T00:44:20+05:30. -->

## Story

As a Program user,
I want each portal landing page to match that Program's identity and vocabulary,
so that the experience feels native to Gita Life or FOLK.

## Acceptance Criteria

1. Given a user opens the Gita Life Program App root route
   When the landing page renders
   Then the page uses Gita Life branding, logo/assets where available, and participant/family/session vocabulary
   And it clearly identifies the active Program as Gita Life.
2. Given a user opens the FOLK Program App root route
   When the landing page renders
   Then the page uses FOLK branding, logo/assets where available, and member/contact/session vocabulary
   And it clearly identifies the active Program as FOLK.
3. Given the landing page is viewed before staff authentication
   When public registration and attendance flows are available
   Then those public actions remain reachable without staff sign-in
   And staff portal sign-in is available without becoming the only visible path.
4. Given shared UI primitives or layout patterns are reused
   When Program-specific content is rendered
   Then labels, colors, assets, and enabled modules come from Program configuration or app-local Program assets
   And reusable components do not hard-code one Program's vocabulary into the other Program's page.
5. Given the landing pages are used on a 360px-wide mobile viewport
   When core actions and Program identity are displayed
   Then there is no horizontal scrolling
   And primary public or staff actions are not hidden behind inaccessible layout behavior.
6. Given the landing page is tested for accessibility
   When headings, links, buttons, forms, focus states, and status text are inspected
   Then the page meets WCAG 2.2 AA expectations for contrast, focus visibility, keyboard navigation, labels, and status messaging.

## Tasks / Subtasks

- [ ] Re-read the source story and dependent decisions before implementation (AC: 1, 2, 3, 4, 5, 6)
  - [ ] Confirm unresolved DD gates are resolved or explicitly waived where this story depends on them.
  - [ ] Identify every existing route/component/helper listed below that will be updated and read it before editing.
- [ ] Implement `Build Program-Branded Landing Pages` according to the acceptance criteria (AC: 1, 2, 3, 4, 5, 6)
  - [ ] Keep Program context explicit at every server boundary.
  - [ ] Reuse existing helpers, contracts, UI primitives, and route patterns before adding new abstractions.
  - [ ] Preserve current FOLK behavior unless the acceptance criteria explicitly require a change.
- [ ] Verify mobile, keyboard, focus, and status-message behavior for every changed user-facing surface.
- [ ] Verify the implementation
  - [ ] Run required lint/type checks for product code changes.
  - [ ] Record manual smoke-test notes for affected staff/public flows.

## Dev Notes

### Epic Context

- Epic: Branded Program Portal Entry.
- Epic goal: Public visitors and staff can reach the correct Gita Life or FOLK portal entry without disrupting public discovery and registration.
- Story source: `_bmad-output/planning-artifacts/epics.md` section `Story 1.3: Build Program-Branded Landing Pages`.

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

- `apps/gita-life/app/page.tsx`
- `apps/folk/app/page.tsx`
- `app/page.tsx`
- `components/ui/**`
- `app/globals.css`
- `packages/program-config/**`
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
