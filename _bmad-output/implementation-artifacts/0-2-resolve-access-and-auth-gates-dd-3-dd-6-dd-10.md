# Story 0.2: Resolve Access And Auth Gates DD-3, DD-6, DD-10

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an implementation agent,
I want revocation threshold, login method, and launch domain decisions recorded,
So that auth, stale-sync, redirects, and deployment configuration can be accepted cleanly.

## Acceptance Criteria

1. Given revocation and stale-sync behavior gates staff authorization
When DD-3 is resolved
Then the approved revocation stale-sync threshold is recorded in product or architecture configuration guidance
And dependent access-control stories can fail closed against a concrete threshold.
2. Given the architecture has selected the staff login method
When DD-6 is recorded in the backlog
Then Supabase email OTP/invite is the accepted implementation default unless the product owner changes it
And Story 2.3 does not reopen login-method selection during implementation.
3. Given Vercel, Supabase redirects, and generated attendance links require launch URLs
When DD-10 is resolved or temporarily waived
Then final or interim production domains are recorded for Vercel, Supabase redirect URLs, and `NEXT_PUBLIC_SITE_URL` planning
And dependent deployment setup and Story 5.1 can be accepted against documented values.
4. Given dependent implementation stories need access and deployment decisions
When stories 1.1b, 2.3, 2.4, 5.1, or deployment setup are assigned
Then DD-3, DD-6, and DD-10 are complete where applicable or explicitly waived with acceptance risk.

## Tasks / Subtasks

- [ ] Read and protect the existing brownfield behavior before implementation (AC: 1-4)
  - [ ] Open every listed UPDATE file before editing and note current route/component behavior.
  - [ ] Confirm the work follows the in-place Turborepo migration sequence rather than replacing the app.
- [ ] Implement `Resolve Access And Auth Gates DD-3, DD-6, DD-10` according to the acceptance criteria (AC: 1-4)
  - [ ] Keep Program context explicit in server-side reads/writes and avoid unscoped cross-program data paths.
  - [ ] Reuse existing components/helpers before adding new primitives or route contracts.
- [ ] Update planning artifacts with the resolved decision or explicit waiver (AC: 1-3)
  - [ ] Include owner, date, accepted values, dependent stories unblocked, and acceptance risk if waived.
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

- Epic context: Implementation readiness gates that remove deferred-decision ambiguity before code work proceeds.
- Implementation focus: Record revocation stale-sync threshold, Supabase email OTP/invite login default, and final/interim domain values without implementing auth flows.
- Dependency/decision gate: Decision gate for DD-3, DD-6, and DD-10. Unblocks stories 1.1b, 2.3, 2.4, 5.1, and deployment setup.
- Current working application is the source of truth for behavior. The architecture target is a migration/extraction path, not permission to discard existing flows.

### Files / Areas To Read Before Editing

- `_bmad-output/planning-artifacts/prds/prd-gita-life-operations/*.md`
- `_bmad-output/planning-artifacts/epics.md`

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
- `_bmad-output/planning-artifacts/prds/prd-gita-life-operations/*.md`

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List

