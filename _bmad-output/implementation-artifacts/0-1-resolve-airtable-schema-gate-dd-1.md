# Story 0.1: Resolve Airtable Schema Gate DD-1

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an implementation agent,
I want exact Airtable Base, table, field, linked-record, and interface mappings for Gita Life and FOLK,
so that Program Capability Profiles and Airtable adapters can be implemented without guesswork.

## Acceptance Criteria

1. Given Gita Life and FOLK Airtable workspaces are ready for implementation mapping, when DD-1 is resolved, then Base IDs, table IDs, writable fields, read-only lookup fields, linked-record fields, and interface page IDs are documented for both Programs, and Program Capability Profile placeholders can be filled without raw Airtable IDs appearing in client code.
2. Given dependent implementation stories need Airtable mappings, when stories 2.5, 3.1-3.4, 4.1-4.3, 5.1-5.4, or 6.1-6.4 are assigned, then DD-1 is complete or an explicit waiver records the temporary mapping source and acceptance risk.
3. Given current FOLK operations already depend on Airtable, when the mapping is documented, then it covers every existing active table key used by `lib/airtable.ts`: contacts, attendance, sessions, users, and locations.
4. Given the future architecture requires Program Capability Profiles, when the mapping is documented, then it separates external Airtable labels/IDs from internal code contracts and identifies the target profile slots for `folk` and `gita-life`.
5. Given Airtable credentials are privileged, when DD-1 outputs are committed, then no personal access token, OAuth token, Supabase service key, or other secret value is written to docs, client code, or public config.

## Tasks / Subtasks

- [ ] Create the DD-1 Airtable mapping artifact (AC: 1, 2, 4, 5)
  - [ ] Add `_bmad-output/planning-artifacts/prds/prd-gita-life-operations/airtable-schema-dd-1.md`.
  - [ ] Record decision status as either `resolved` or `waived`, with owner, date, mapping source, and review notes.
  - [ ] If waived, document the temporary source, exact stories allowed to proceed, expiry condition, and acceptance risk.
- [ ] Capture Program-level Airtable configuration for both Programs (AC: 1, 4, 5)
  - [ ] For `folk`, document Airtable Base ID, table IDs, required environment variable names, and Airtable Interface page ID(s).
  - [ ] For `gita-life`, document the same values or mark each unknown as a blocking gap.
  - [ ] Document scoped credential expectations without recording token values. Include required scopes/resources, not secrets.
- [ ] Capture table schemas and adapter contracts (AC: 1, 3, 4)
  - [ ] For Contacts, Attendance, Sessions, Users/Staff, Locations, and Analytics if still used, list fields with Airtable label, field ID if available, Airtable field type, read/write mode, required/optional status, linked target table, select choices, and internal contract name.
  - [ ] Mark formulas, lookups, rollups, auto-number, created time, and last-modified fields as read-only.
  - [ ] Record linked-record directions and cardinality for Contact, Session, Preacher/User, Location, Attendance Records, Assigned Preacher, Collected By, Invited By, and Analytics relationships.
- [ ] Compare the mapping against current FOLK implementation behavior (AC: 3, 4)
  - [ ] Verify the documented FOLK fields cover current `ContactFields`, `AttendanceFields`, `SessionFields`, `UserFields`, and `LocationFields` in `lib/airtable.ts`.
  - [ ] Preserve current mobile normalization, duplicate contact lookup, session-backed attendance, active preacher lookup, location cache, session attendance URL, and dashboard incremental refresh assumptions in the mapping notes.
  - [ ] Identify any current hard-coded/default values that must become Program Capability Profile entries, especially `DEFAULT_ANALYTICS_RECORD_ID` and Airtable Interface page defaults.
- [ ] Define the Program Capability Profile target shape (AC: 1, 4, 5)
  - [ ] Specify profile keys for base/table IDs, field labels, field IDs where useful, linked-record mappings, management interface URL/page ID, enabled modules, and labels.
  - [ ] State that raw Airtable IDs may live in server-only environment/config artifacts and mapping docs, but must not be emitted into client bundles or client-readable API payloads.
  - [ ] Name the future implementation homes from architecture: `packages/program-config` for profiles and `packages/airtable` for server-only adapters.
- [ ] Update dependent planning artifacts (AC: 2)
  - [ ] Add a short DD-1 completion or waiver note to `_bmad-output/planning-artifacts/prds/prd-gita-life-operations/addendum.md`.
  - [ ] If the schema is resolved, update DD-1 references in architecture/planning notes from "deferred" to "resolved" where appropriate.
  - [ ] Do not remove the dependency gate from dependent stories unless the new mapping artifact is complete or the waiver is explicit.
- [ ] Validate the story output (AC: 1-5)
  - [ ] Check the mapping artifact includes both Programs and all table categories.
  - [ ] Check no token or secret value is present.
  - [ ] If product code is changed unexpectedly, run `pnpm lint` and `pnpm exec tsc --noEmit`; otherwise document that this was a planning/docs-only gate.

## Dev Notes

### Story Purpose

This is an implementation readiness gate, not a feature route. Its output should make later Airtable implementation stories safe to assign by eliminating unknown table IDs, field labels, linked-record semantics, and management interface targets.

Do not implement story 2.5 or downstream Airtable adapters as part of this story unless the user explicitly broadens scope. The expected deliverable is a durable mapping/decision artifact plus dependent artifact updates.

### Source Requirements

- `DD-1` is "Airtable Base IDs and table structures"; owner is Program admins and architecture; it blocks Airtable sync implementation. [Source: `_bmad-output/planning-artifacts/prds/prd-gita-life-operations/prd.md` section 12]
- Implementation readiness gates must be completed or explicitly waived before dependent implementation stories are assigned. [Source: `_bmad-output/planning-artifacts/epics.md` section "Implementation Readiness Gates"]
- Story 0.1 specifically requires Base IDs, table IDs, writable fields, read-only lookup fields, linked-record fields, and interface page IDs for both Gita Life and FOLK. [Source: `_bmad-output/planning-artifacts/epics.md` section "Story 0.1"]
- Dependent stories are 2.5, 3.1-3.4, 4.1-4.3, 5.1-5.4, and 6.1-6.4. [Source: `_bmad-output/planning-artifacts/epics.md` section "Story 0.1"]
- Architecture requires two separate Airtable Bases, one shared Supabase project, server-only credentials, Program Capability Profiles, and Program-scoped API/data isolation. [Source: `_bmad-output/planning-artifacts/prds/prd-gita-life-operations/architecture.md` sections "Technical Constraints & Dependencies" and "Data Architecture"]

### Current Code Intelligence

Current repo state is still a single FOLK App Router runtime; `apps/` and `packages/` do not exist yet. Later stories will migrate toward `apps/folk`, `apps/gita-life`, `packages/program-config`, `packages/data-contracts`, `packages/authz`, and `packages/airtable`. [Source: `_bmad-output/planning-artifacts/prds/prd-gita-life-operations/architecture.md` section "Project Structure & Boundaries"]

Existing Airtable access is centralized in `lib/airtable.ts` and is already marked `server-only`. Preserve that server-only boundary. Current env names are:

- `AIRTABLE_API_TOKEN`
- `AIRTABLE_BASE_ID`
- `AIRTABLE_CONTACTS_TABLE_ID`
- `AIRTABLE_ATTENDANCE_TABLE_ID`
- `AIRTABLE_SESSIONS_TABLE_ID`
- `AIRTABLE_USERS_TABLE_ID`
- `AIRTABLE_LOCATIONS_TABLE_ID`
- `AIRTABLE_ANALYTICS_RECORD_ID`
- `AIRTABLE_INTERFACE_DASHBOARD_PAGE_ID` in `app/manage/page.tsx`

Current active field labels to reconcile in the DD-1 mapping:

- Contacts: `Name`, `Phone`, `Age`, `Date of Birth`, `Year`, `College`, `Company`, `Source`, `Notes`, `Initial Contact`, `Last Contacted On`, `Location`, `Assigned Preacher`, `Collected By`, `Analytics`.
- Attendance: `Phone`, `Name`, `Attendance Date`, `Contact`, `Session`, `Processed?`.
- Sessions: `Name`, `Session Date`, `Preacher`, `Location`, `Analytics`, `Attendance Records`, `Public Attendance Enabled`, `Attendance Opens At`, `Attendance Closes At`, `Duration Minutes`, `Attendance URL`.
- Users/Staff: `Name`, `Email`, `Role`, `Status`, `Locations`, `Portal Account`, `Supabase User ID`, `Invited By`, `Assigned Preacher`.
- Locations: `Name`, `Status`.

Current behaviors that the mapping must preserve for later adapter extraction:

- Linked Airtable record cells are handled as Airtable record ID arrays.
- Mobile numbers normalize to the last 10 digits on client and server boundaries.
- Contact duplicate lookup checks `Phone` as both string and number.
- Session attendance relies on session `Attendance Records` to fetch stable Attendance record IDs.
- Dashboard incremental refresh sends `knownAttendanceIds` and expects stable Airtable record IDs.
- `listCachedLocations()` and `listCachedActivePreachers()` use Next `unstable_cache` with 20-minute TTL and revalidate tags.
- `DEFAULT_ANALYTICS_RECORD_ID` and the default Airtable Interface dashboard page ID are hard-coded compatibility values today; the DD-1 mapping should identify whether they become per-Program config, env values, or are removed.

### Architecture Compliance

- Use stable Program IDs `folk` and `gita-life`.
- Keep Airtable field labels as external strings mapped through Program Capability Profiles; do not spread labels through duplicated app-local helpers.
- Keep Airtable access in server-only code. No client component may import Airtable tokens, adapters, `lib/airtable.ts`, future `packages/airtable`, Supabase admin clients, or authz server helpers.
- Shared request/response schemas should eventually live in `packages/data-contracts`; this story may define schema expectations in docs but should not prematurely create package code unless instructed.
- Program config is static configuration, not runtime UI state.
- Never add an unscoped cross-program API to read or write Airtable data.
- Preserve API error response convention `{ error: string, code?: string }` for later stories.

### Latest Technical Notes

- Airtable's Web API uses REST semantics and JSON objects for records. [Source: https://airtable.com/developers/web/api/introduction.md]
- Airtable authentication requires HTTPS requests with bearer tokens; legacy `api_key` URL authentication is no longer supported. Document token scopes/resources, but never token values. [Source: https://airtable.com/developers/web/api/authentication.md]
- Airtable personal access/OAuth tokens require both scopes and resource access; write operations require both appropriate base access and scopes such as record write scope. [Source: https://airtable.com/developers/web/api/authentication.md]
- Airtable linked-record fields use `multipleRecordLinks`; writable cell values are arrays of linked record IDs. [Source: https://airtable.com/developers/web/api/field-model.md]
- Airtable may add field types/properties without treating that as a breaking change, so future adapters should handle unknown field types gracefully in schema validation. [Source: https://airtable.com/developers/web/api/field-model.md]
- Next.js exposes only `NEXT_PUBLIC_` variables to browser bundles by design, and those public values are inlined at build time. Keep Airtable IDs/secrets in server-only env/config unless a value is explicitly safe and intended for the browser. [Source: https://nextjs.org/docs/app/guides/environment-variables]

### Testing Requirements

Docs-only completion:

- Manually inspect the DD-1 artifact for both Programs, all required table categories, and all linked-record relationships.
- Search the new/updated artifacts for token-like values before completing the story. Airtable Base IDs and table IDs are expected; PAT/OAuth/Supabase secrets are not.
- Confirm dependent story list is included and no dependent story is unblocked without a resolved mapping or explicit waiver.

If implementation code is touched:

- Run `pnpm lint`.
- Run `pnpm exec tsc --noEmit` because `next build` ignores TypeScript errors in this repo.
- Smoke-check any touched Airtable route manually only if route behavior changes; this story should normally avoid route behavior changes.

### Project Structure Notes

Expected docs target:

- NEW: `_bmad-output/planning-artifacts/prds/prd-gita-life-operations/airtable-schema-dd-1.md`
- UPDATE: `_bmad-output/planning-artifacts/prds/prd-gita-life-operations/addendum.md`
- UPDATE only if DD-1 is resolved/waived cleanly: relevant DD-1 notes in planning architecture or readiness artifacts.

Do not create `apps/*` or `packages/*` as part of this story. Those boundaries belong to later implementation stories.

### References

- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/prds/prd-gita-life-operations/prd.md`
- `_bmad-output/planning-artifacts/prds/prd-gita-life-operations/architecture.md`
- `_bmad-output/planning-artifacts/prds/prd-gita-life-operations/addendum.md`
- `_bmad-output/planning-artifacts/sprint-change-proposal-2026-06-12.md`
- `_bmad-output/project-context.md`
- `lib/airtable.ts`
- `app/manage/page.tsx`
- `app/api/contact/route.ts`
- `app/api/registration/route.ts`
- `app/api/sessions/route.ts`
- `app/attendance/route.ts`
- `app/api/admin/invite-user/route.ts`
- `app/api/admin/locations/route.ts`
- `app/api/volunteers/invite/route.ts`
- https://airtable.com/developers/web/api/introduction.md
- https://airtable.com/developers/web/api/authentication.md
- https://airtable.com/developers/web/api/field-model.md
- https://nextjs.org/docs/app/guides/environment-variables

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List

