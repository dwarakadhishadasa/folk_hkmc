# Story 0.3: Resolve Contact Privacy And Retention Gates DD-8, DD-9

Status: ready-for-dev

<!-- Freshly generated from `_bmad-output/planning-artifacts/epics.md` on 2026-06-13T00:44:20+05:30. -->

## Story

As an implementation agent,
I want staff visibility and retention rules for contact comments, profile details, attendance, invite logs, and staff profile mirrors,
so that sensitive data behavior is not invented during implementation.

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

- [ ] Produce or update the decision artifact for `Resolve Contact Privacy And Retention Gates DD-8, DD-9` (AC: 1, 2, 3)
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
- Story source: `_bmad-output/planning-artifacts/epics.md` section `Story 0.3: Resolve Contact Privacy And Retention Gates DD-8, DD-9`.

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
- `components/contact-form.tsx`
- `app/api/contact/route.ts`
- `app/api/admin/invite-user/route.ts`
- `lib/invite-log.ts`
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
