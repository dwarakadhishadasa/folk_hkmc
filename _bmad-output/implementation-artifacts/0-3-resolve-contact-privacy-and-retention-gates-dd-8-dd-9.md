# Story 0.3: Resolve Contact Privacy And Retention Gates DD-8, DD-9

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an implementation agent,
I want staff visibility and retention rules for contact comments, profile details, attendance, invite logs, and staff profile mirrors,
So that sensitive data behavior is not invented during implementation.

## Acceptance Criteria

1. Given staff contact and profile fields can contain sensitive details
When DD-8 is resolved
Then Admin, Preacher, and Volunteer visibility rules are documented for contact comments and profile details
And dependent UI and API stories can enforce least-privilege behavior consistently.
2. Given operational data is stored across Airtable, Supabase, invite logs, audit events, and sync state
When DD-9 is resolved
Then retention expectations are documented for contacts, attendance, invite logs, audit events, staff profiles, and sync state
And implementation stories do not invent retention behavior independently.
3. Given dependent implementation stories touch sensitive contact or retention behavior
When stories 4.1, 4.2, 4.3, 6.1, or 6.2 are assigned
Then DD-8 and DD-9 are complete where applicable or explicitly waived with acceptance risk.

## Tasks / Subtasks

- [ ] Read and protect the existing brownfield behavior before implementation (AC: 1-3)
  - [ ] Open every listed UPDATE file before editing and note current route/component behavior.
  - [ ] Confirm the work follows the in-place Turborepo migration sequence rather than replacing the app.
- [ ] Implement `Resolve Contact Privacy And Retention Gates DD-8, DD-9` according to the acceptance criteria (AC: 1-3)
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
- Implementation focus: Record role-based sensitive contact visibility and retention rules without inventing UI behavior during later stories.
- Dependency/decision gate: Decision gate for DD-8 and DD-9. Unblocks sensitive contact, invite-log, audit, and retention behavior in stories 4.1-4.3, 6.1, and 6.2.
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

