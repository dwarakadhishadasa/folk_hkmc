# Story 1.3: Build Program-Branded Landing Pages

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Program user,
I want each portal landing page to match that Program's identity and vocabulary,
So that the experience feels native to Gita Life or FOLK.

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

- [ ] Read and protect the existing brownfield behavior before implementation (AC: 1-6)
  - [ ] Open every listed UPDATE file before editing and note current route/component behavior.
  - [ ] Confirm the work follows the in-place Turborepo migration sequence rather than replacing the app.
- [ ] Implement `Build Program-Branded Landing Pages` according to the acceptance criteria (AC: 1-6)
  - [ ] Keep Program context explicit in server-side reads/writes and avoid unscoped cross-program data paths.
  - [ ] Reuse existing components/helpers before adding new primitives or route contracts.
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

- Epic context: Branded Program Portal Entry: introduce app boundaries and portal entry while preserving current public/staff behavior.
- Implementation focus: Build app-local Program landing pages with Program config-driven labels, assets, and modules.
- Preserve: Current FOLK public, staff, auth, registration, contact, sessions, dashboard, invite, manage, PWA, and `/attendance` behavior must remain route-compatible.
- Preserve: Use the Turborepo starter only as a reference; migrate this repo in place instead of replacing the working app with generated scaffold code.
- Current working application is the source of truth for behavior. The architecture target is a migration/extraction path, not permission to discard existing flows.

### Files / Areas To Read Before Editing

- `package.json`
- `pnpm-lock.yaml`
- `next.config.mjs`
- `tsconfig.json`
- `app/**`
- `components/**`
- `public/**`
- `proxy.ts`

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
- `package.json`
- `pnpm-lock.yaml`
- `next.config.mjs`
- `tsconfig.json`
- `app/**`
- `components/**`
- `public/**`
- `proxy.ts`

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List

