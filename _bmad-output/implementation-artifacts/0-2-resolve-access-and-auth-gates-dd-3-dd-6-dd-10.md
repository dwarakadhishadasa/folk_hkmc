# Story 0.2: Resolve Access And Auth Gates DD-3, DD-6, DD-10

Status: ready-for-dev

<!-- Freshly generated from `_bmad-output/planning-artifacts/epics.md` on 2026-06-13T00:44:20+05:30. -->

## Story

As an implementation agent,
I want revocation threshold, login method, and launch domain decisions recorded,
so that auth, stale-sync, redirects, and deployment configuration can be accepted cleanly.

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

- [ ] Produce or update the decision artifact for `Resolve Access And Auth Gates DD-3, DD-6, DD-10` (AC: 1, 2, 3, 4)
  - [ ] Record decision status, owner, date, source of truth, dependent stories, waiver expiry if applicable, and acceptance risk.
  - [ ] Keep secrets out of docs and client-readable config.
- [ ] Update dependent planning references without pretending unresolved decisions are complete
  - [ ] Leave blocking dependencies visible when a gate is only waived.
- [ ] Verify the implementation
  - [ ] Run required lint/type checks for product code changes.
  - [ ] Record manual smoke-test notes for affected staff/public flows.

## Dev Notes

### Epic Context

- Epic: Implementation Readiness Gates.
- Epic goal: Decision gates that must be resolved or explicitly waived before dependent implementation stories proceed.
- Story source: `_bmad-output/planning-artifacts/epics.md` section `Story 0.2: Resolve Access And Auth Gates DD-3, DD-6, DD-10`.

### Non-Negotiable Guardrails

- Resolve Program context before reading or writing Program-scoped data; never trust a client-supplied Program ID for cross-program access.
- Keep Airtable REST access, Airtable credentials, Supabase service-role operations, and authz server helpers out of client components.
- Preserve current FOLK parity contracts for registration, attendance, session-backed registration, duplicate handling, mobile normalization, sessions, dashboard polling, invite flows, manage handoff, and service-worker queueing unless this story explicitly changes them.
- Use stable Program IDs `folk` and `gita-life`; API payloads use `camelCase`, while Supabase tables and columns use `snake_case`.
- Keep errors safe and actionable. API error responses should use `{ error: string, code?: string }` and must not expose Airtable API details, Supabase service-role errors, tokens, or OTP values.
- Reuse existing `components/ui/*`, feature components, `lib/utils.ts`, Supabase helpers, and Airtable helper patterns before adding new primitives or route contracts.

### Story-Specific Notes

- This is an implementation readiness gate. Prefer durable planning/configuration artifacts and explicit waiver language over product-code changes unless the acceptance criteria require code updates.
- Record owner, date, decision status, source of truth, dependent stories allowed to proceed, expiry conditions, and acceptance risk for any unresolved gate.
- Do not unblock dependent implementation stories silently; unresolved gates must remain visible in the artifact.
- This readiness-gate story may unblock later implementation stories only through a resolved decision or explicit waiver.

### Files / Areas To Read Before Editing

- `_bmad-output/planning-artifacts/prds/prd-gita-life-operations/addendum.md`
- `app/login/**`
- `app/auth/**`
- `app/api/auth/**`
- `lib/authz.ts`
- `lib/supabase/**`
- `proxy.ts`

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
