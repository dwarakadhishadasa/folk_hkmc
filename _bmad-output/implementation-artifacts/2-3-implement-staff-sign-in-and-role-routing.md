# Story 2.3: Implement Staff Sign-In And Role Routing

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an invited staff user,
I want to sign in once and land in the correct Program/Role surface,
So that I can start the work I am authorized to do.

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

- [ ] Read and protect the existing brownfield behavior before implementation (AC: 1-7)
  - [ ] Open every listed UPDATE file before editing and note current route/component behavior.
  - [ ] Confirm the work follows the in-place Turborepo migration sequence rather than replacing the app.
- [ ] Implement `Implement Staff Sign-In And Role Routing` according to the acceptance criteria (AC: 1-7)
  - [ ] Keep Program context explicit in server-side reads/writes and avoid unscoped cross-program data paths.
  - [ ] Reuse existing components/helpers before adding new primitives or route contracts.
- [ ] Keep server-only integration boundaries intact (AC: 1-5)
  - [ ] Do not import Airtable, Supabase admin, or authz server helpers into client components.
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

- Epic context: Program-Scoped Staff Access And Data Trust: shared identity, membership, authz, sync, audit, and Airtable trust boundaries.
- Implementation focus: Preserve current Supabase cookie-backed auth while adding Program-specific routing and removing any demo/local role-switching assumptions.
- Dependency/decision gate: Depends on Story 0.2 recording Supabase email OTP/invite as the default login method or an explicit product-owner change.
- Preserve: Current Supabase staff auth is real and cookie-backed; do not reintroduce localStorage/demo-user authorization.
- Preserve: `proxy.ts`, `/api/auth/me`, `/api/auth/signin`, `/auth/confirm`, `/auth/hash-callback`, and `/api/auth/complete-implicit` must stay aligned.
- Current working application is the source of truth for behavior. The architecture target is a migration/extraction path, not permission to discard existing flows.

### Files / Areas To Read Before Editing

- `supabase/migrations/**`
- `lib/supabase/**`
- `lib/authz.ts`
- `lib/auth-context.tsx`
- `proxy.ts`
- `app/api/auth/**`
- `app/auth/**`
- `app/login/**`

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
- `supabase/migrations/**`
- `lib/supabase/**`
- `lib/authz.ts`
- `lib/auth-context.tsx`
- `proxy.ts`
- `app/api/auth/**`
- `app/auth/**`
- `app/login/**`

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List

