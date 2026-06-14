---
title: Sprint Change Proposal - Implementation Readiness Corrections
project: folk_hkmc
date: 2026-06-12
sourceTrigger: _bmad-output/planning-artifacts/implementation-readiness-report-2026-06-12.md
status: approved
scopeClassification: moderate
recommendedPath: Direct Adjustment
approvedBy: Dwaraka
approvedAt: 2026-06-12 21:16:39 IST
---

# Sprint Change Proposal: Implementation Readiness Corrections

## 1. Issue Summary

The implementation-readiness assessment found that the active Gita Life operations planning set has complete functional traceability but is not yet ready for low-risk Phase 4 implementation assignment.

The triggering artifact is `_bmad-output/planning-artifacts/implementation-readiness-report-2026-06-12.md`. The report scoped its review to:

- `_bmad-output/planning-artifacts/prds/prd-gita-life-operations/prd.md`
- `_bmad-output/planning-artifacts/prds/prd-gita-life-operations/addendum.md`
- `_bmad-output/planning-artifacts/prds/prd-gita-life-operations/architecture.md`
- `_bmad-output/planning-artifacts/epics.md`

Evidence from the readiness report:

- All 22 PRD functional requirements are covered by epics.
- No critical FR coverage failure was found.
- Story 1.1 is too large because it combines app-boundary setup, shared Program config, scripts, deployment env shape, and security checks.
- Story 2.1 is too large because it front-loads staff schema, Airtable identities, sync state, invite logs, and audit events before all are needed by user-visible flows.
- Deferred decisions DD-1, DD-3, DD-6, DD-8, DD-9, and DD-10 are embedded inside acceptance criteria for implementation stories.
- No standalone UX document or story files were found.

The core problem is implementation readiness, not product scope. The PRD remains directionally sound and the FR coverage map should be preserved.

## 2. Change Analysis Checklist Results

| Item | Status | Finding |
| --- | --- | --- |
| 1.1 Triggering story identified | [x] Done | Trigger was readiness review, mainly Story 1.1 and Story 2.1. |
| 1.2 Core problem defined | [x] Done | Failed readiness due to oversized foundation stories, unresolved decision gates, missing UX/state source, and missing story sharding. |
| 1.3 Supporting evidence gathered | [x] Done | Readiness report provides concrete story, decision, and artifact findings. |
| 2.1 Current epic impact | [x] Done | Epic 1 and Epic 2 require story splits. Epic 6 absorbs invite-log timing. |
| 2.2 Epic-level changes | [x] Done | Add readiness/decision gate work and adjust story boundaries. |
| 2.3 Remaining epics reviewed | [x] Done | Epics 3-6 remain valid, but depend on DD resolution and UX/state checklist. |
| 2.4 New/obsolete epic need | [x] Done | No product epic is obsolete. Add a pre-implementation gate section or small readiness epic. |
| 2.5 Priority/order impact | [x] Done | Readiness gate work must precede implementation assignment. |
| 3.1 PRD conflicts | [x] Done | No MVP scope conflict. PRD section 12 already supports decision gates. |
| 3.2 Architecture conflicts | [!] Action-needed | Architecture says ready for implementation, but readiness report says backlog needs work. Add a handoff caveat. |
| 3.3 UI/UX conflicts | [!] Action-needed | No UX artifact exists. Create a lightweight UX/state checklist before UI-heavy implementation. |
| 3.4 Other artifacts | [!] Action-needed | Story files or implementation-ready metadata are missing. |
| 4.1 Direct adjustment | [x] Viable | Best path. Fix stories and gate artifacts without changing MVP. Effort medium, risk low-medium. |
| 4.2 Rollback | [N/A] Not viable | No implementation work needs rollback. |
| 4.3 MVP review | [N/A] Not viable | MVP scope remains achievable after backlog corrections. |
| 4.4 Recommended path | [x] Done | Direct Adjustment with moderate backlog reorganization. |

## 3. Impact Analysis

### Epic Impact

Epic 1: Branded Program Portal Entry

- Story 1.1 should be split into smaller implementation slices.
- Current Story 1.2 and Story 1.3 remain valid.
- No FR is removed.

Epic 2: Program-Scoped Staff Access And Data Trust

- Story 2.1 should be narrowed to minimum staff identity and membership schema.
- Invite log and broader audit expansions should move closer to Story 2.6 and Epic 6 where they become user-visible.
- Story 2.4 remains blocked until DD-3 is resolved.
- Story 2.5 remains blocked until DD-1 is resolved.

Epic 3: Public Registration And Session Attendance

- No story split required.
- Implementation should wait for Program Capability Profiles and UX/state checklist where UI behavior is involved.

Epic 4: Staff Contact Capture And Ownership Routing

- Story 4.2 remains blocked by DD-8 and DD-9.
- UX/state checklist must cover role-safe field visibility and least-privilege status messaging.

Epic 5: Session Operations And Live Attendance

- No story split required.
- UX/state checklist must cover session empty, closed, QR/share, mobile, and live-refresh states.

Epic 6: Staff Administration And Airtable Handoff

- Invite logging and audit visibility should be introduced here or in Story 2.6 as a dependency that directly supports Admin invite outcomes.
- No FR is removed.

### Story Impact

Stories requiring direct edits:

- Story 1.1
- Story 2.1
- Story 2.6
- Story 6.1

Stories requiring explicit preconditions:

- Story 2.4: DD-3
- Story 2.5: DD-1
- Story 4.2: DD-8 and DD-9
- Deployment portions of Epic 1 or final release stories: DD-10
- Auth implementation story: DD-6 is now architecturally resolved as Supabase email OTP/invite, but the epics should record that resolution.

New readiness artifacts proposed:

- `_bmad-output/planning-artifacts/prds/prd-gita-life-operations/ux-state-checklist.md`
- `_bmad-output/implementation-artifacts/stories/` or another approved story-sharding location

### Artifact Conflicts

PRD:

- No product requirement change needed.
- Section 12 already says deferred decisions must be resolved before dependent implementation stories are accepted.

Architecture:

- Active architecture is technically complete, but its "READY FOR IMPLEMENTATION" label can be misread as "ready for story assignment now."
- Add a caveat that architecture is ready, while backlog execution is gated by decision stories, UX/state checklist, and story splitting.

UX:

- No UX document exists.
- Because the product has public, staff, live-event, offline, duplicate, closed-session, and stale-sync states, a lightweight UX/state checklist is needed before UI-heavy implementation.

Other:

- Story documents are not sharded, so implementation agents would need to execute from a long epics file. That increases missed-context risk.

### Technical Impact

- No code rollback is required.
- No schema implementation should start until the narrowed Story 2.1 and decision gates are accepted.
- The current repo context must remain respected: Supabase staff auth exists, Airtable is server-only, `/attendance` is intentionally not `/api/attendance`, and current parity APIs exist.

## 4. Recommended Approach

Recommended path: Direct Adjustment.

Rationale:

- Functional scope is correct and fully traced.
- The issue is backlog executability, not product direction.
- Splitting Story 1.1 and Story 2.1 reduces implementation risk without reducing MVP value.
- Decision stories make blockers visible instead of embedding unresolved work inside acceptance criteria.
- A lightweight UX/state checklist is enough for implementation readiness; a full high-fidelity UX package can remain optional unless the team wants it.

Effort estimate: Medium, about 1-2 focused planning sessions plus story sharding.

Risk level: Low-medium. Main risk is churn in story numbering and dependencies if edits are applied directly without preserving FR traceability.

Timeline impact: Small planning delay before implementation. This should reduce implementation rework later.

Scope classification: Moderate. Requires backlog reorganization and artifact updates, but not a PRD rewrite or architecture replan.

## 5. Detailed Change Proposals

### Proposal A: Split Story 1.1

Story: Story 1.1 - Establish Separate Program App Entry Shells

Section: Epic 1 story breakdown

OLD:

```md
### Story 1.1: Establish Separate Program App Entry Shells

As a staff user,
I want Gita Life and FOLK to have separate portal entry shells,
So that I arrive in the correct Program workspace from the start.

Acceptance criteria include:
- separate Next.js App Router app boundaries for apps/folk and apps/gita-life
- preserved FOLK runtime behavior
- rendered entry shells for both apps
- shared Program IDs and Program configuration
- independent run/build/lint/typecheck scripts
- app-specific environment variables, metadata, public assets, and NEXT_PUBLIC_SITE_URL
- no exposed Airtable or Supabase service-role secrets
```

NEW:

```md
### Story 1.1a: Move Current FOLK Runtime Into The FOLK Program App Boundary

As a staff user,
I want the existing FOLK runtime preserved inside a dedicated FOLK app boundary,
So that current operations keep working while the two-app structure is introduced.

Acceptance Criteria:

Given the brownfield repo is being adapted in place
When the story is implemented
Then the current FOLK App Router runtime is available under or behind apps/folk
And existing public, staff, auth, registration, contact, sessions, dashboard, invite, manage, service-worker, and /attendance behavior remains route-compatible.

Given the FOLK app starts locally
When developers run the app-specific dev command
Then FOLK renders without depending on apps/gita-life
And existing environment requirements are documented for the app boundary.

Given the migration changes project structure
When linting and type checking are run
Then FOLK app code can be checked with pnpm commands
And no Airtable token or Supabase service-role key is exposed to client code.

### Story 1.1b: Add Gita Life App Shell And Shared Program Configuration

As a staff user,
I want Gita Life to have its own portal shell backed by shared Program config,
So that Gita Life can start from the same operational foundation without copying FOLK-specific logic.

Acceptance Criteria:

Given apps/folk exists or is being introduced
When apps/gita-life is added
Then the Gita Life app has an independent App Router shell, metadata, assets slot, and local run/build configuration.

Given Program configuration is needed by both apps
When either app resolves Program context
Then it uses stable Program IDs folk and gita-life
And Program labels, vocabulary, app URLs, enabled modules, and public asset references come from shared Program configuration or app-local assets.

Given Vercel will deploy the apps separately
When app-level configuration is reviewed
Then each app has a clear place for NEXT_PUBLIC_SITE_URL and server-only operational secrets
And no shared component hard-codes one Program's vocabulary into the other Program.
```

Rationale:

This preserves current FOLK behavior first, then introduces Gita Life and shared config. It reduces the risk of one foundation story trying to move the repo, create two apps, define config, set scripts, and validate secrets all at once.

### Proposal B: Narrow Story 2.1

Story: Story 2.1 - Create Program-Scoped Staff Identity Schema

Section: Epic 2 story breakdown

OLD:

```md
**Given** the shared Supabase project is available
**When** the schema migration is applied
**Then** the database includes Program-scoped tables for staff profiles, staff memberships, Airtable identities, sync state, invite logs, and audit events
**And** Program-specific rows include a stable Program ID of `folk` or `gita-life`.
```

NEW:

```md
**Given** the shared Supabase project is available
**When** the minimum staff identity schema migration is applied
**Then** the database includes the minimum Program-scoped tables needed for staff authorization: programs, staff profiles, staff memberships, and Airtable staff identity mappings
**And** Program-specific rows include a stable Program ID of `folk` or `gita-life`.

**Given** sync state, invite logs, and audit events are required by later operational stories
**When** Story 2.1 is accepted
**Then** it documents the planned table boundaries for those later stories
**And** it does not require full invite-log or broad audit-event implementation before the first staff authorization flow needs them.
```

Rationale:

This turns Story 2.1 into the minimum auth/membership schema story. It keeps implementation vertically useful and avoids front-loading invite/audit scope before those features create user-visible value.

### Proposal C: Move Audit And Invite Log Work To User-Visible Stories

Story: Story 2.6 - Surface Critical Sync And Audit Status

Section: Acceptance Criteria

OLD:

```md
**Given** shared audit events are written
**When** action names are inspected
**Then** they use dot notation such as `staff.invited`, `role.revoked`, `sync.failed`, and `attendance.marked`
**And** every event includes Program scope when the data is Program-specific.
```

NEW:

```md
**Given** sync failure, stale authorization, queued public write, or management-link failure events need operational visibility
**When** Story 2.6 is implemented
**Then** it introduces or completes the sync-state and audit-event storage needed for those visible states
**And** event names use dot notation such as `role.revoked`, `sync.failed`, `attendance.marked`, and `management.misconfigured`.

**Given** staff invite attempts become user-visible in Epic 6
**When** invite logging is required
**Then** invite-log persistence is implemented in Story 6.1 or as an explicit prerequisite to Story 6.1
**And** Story 2.6 only owns shared audit conventions that invite logs must follow.
```

Story: Story 6.1 - Invite Program Staff With Role Guardrails

Section: Acceptance Criteria

ADD:

```md
**Given** invite attempts must be auditable
**When** Story 6.1 is implemented
**Then** the invite-log persistence needed by Admin invite outcomes is created or reused
**And** the log records inviter, invitee email, role, Program, Airtable user ID where available, status, safe error message, and timestamps.
```

Rationale:

Audit conventions belong in Epic 2, but invite logs should be delivered where Admin invite behavior is delivered.

### Proposal D: Add Decision Gate Stories

Artifact: `_bmad-output/planning-artifacts/epics.md`

Section: Before Epic 1, or as a new "Implementation Readiness Gates" section

NEW:

```md
## Implementation Readiness Gates

These stories must be completed or explicitly waived before dependent implementation stories are assigned.

### Story 0.1: Resolve Airtable Schema Gate DD-1

As an implementation agent,
I want exact Airtable Base, table, field, linked-record, and interface mappings for Gita Life and FOLK,
So that Program Capability Profiles and Airtable adapters can be implemented without guesswork.

Acceptance Criteria:
- Gita Life and FOLK Base IDs, table IDs, writable fields, read-only lookup fields, linked-record fields, and interface page IDs are documented.
- Program Capability Profile placeholders can be filled without raw Airtable IDs appearing in client code.
- Dependent stories: 2.5, 3.1-3.4, 4.1-4.3, 5.1-5.4, 6.1-6.4.

### Story 0.2: Resolve Access And Auth Gates DD-3, DD-6, DD-10

As an implementation agent,
I want revocation threshold, login method, and launch domain decisions recorded,
So that auth, stale-sync, redirects, and deployment configuration can be accepted cleanly.

Acceptance Criteria:
- DD-3 revocation stale-sync threshold is recorded in product/architecture configuration guidance.
- DD-6 is recorded as Supabase email OTP/invite unless the product owner changes it.
- DD-10 final or interim production domains are recorded for Vercel, Supabase redirect URLs, and NEXT_PUBLIC_SITE_URL planning.
- Dependent stories: 1.1b, 2.3, 2.4, 5.1, deployment setup.

### Story 0.3: Resolve Contact Privacy And Retention Gates DD-8, DD-9

As an implementation agent,
I want staff visibility and retention rules for contact comments, profile details, attendance, invite logs, and staff profile mirrors,
So that sensitive data behavior is not invented during implementation.

Acceptance Criteria:
- Admin, Preacher, and Volunteer visibility rules are documented for contact comments and profile details.
- Retention expectations are documented for contacts, attendance, invite logs, audit events, staff profiles, and sync state.
- Dependent stories: 4.1, 4.2, 4.3, 6.1, 6.2.
```

Rationale:

This keeps unresolved decisions from hiding inside implementation stories. It also lets implementation begin on safe, ungated work while blocked stories remain obvious.

### Proposal E: Create UX/State Checklist

Artifact: `_bmad-output/planning-artifacts/prds/prd-gita-life-operations/ux-state-checklist.md`

Section: New artifact

NEW:

```md
# UX/State Checklist: HKM Program Operations Portals

Required before UI-heavy implementation stories:

- Program landing: public actions, staff portal sign-in, Program identity, 360px mobile, keyboard focus.
- Sign-in and role routing: unauthenticated, active Volunteer, active Preacher, active Admin, inactive staff, stale sync, sign-out.
- Public registration: empty, validation, duplicate, success, offline queued, replay success, replay failure.
- Attendance: valid session, missing session, closed session, duplicate, unknown mobile, offline queued, session-backed registration return.
- Staff contact capture: Volunteer, Preacher, Admin, missing assigned Preacher, duplicate mobile, location required, sensitive comments visibility.
- Sessions: create, invalid location, disabled attendance, QR/link share, copy/open controls, mobile scannability.
- Live dashboard: active session, no active session, incremental refresh, duplicate-safe append, out-of-scope session, loading/error.
- Staff invite/location management: role selection, Volunteer assigned Preacher, Admin/Preacher locations, inline location creation, invite partial failure.
- Manage handoff: authorized redirect, Volunteer denial, unauthenticated denial, missing Airtable Interface URL.
- Cross-cutting: loading, empty, error, success, offline, stale-sync, permission denied, duplicate, and accessibility states.
```

Rationale:

This is lighter than a full UX design package but gives implementation agents a state inventory so they do not invent inconsistent screens under pressure.

### Proposal F: Add Story Sharding Or Implementation Metadata

Artifact: `_bmad-output/implementation-artifacts/stories/` or approved equivalent

Section: New implementation artifact

NEW:

```md
Create one implementation-ready story file per approved story before assigning Phase 4 agents.

Each story file should include:
- Story ID and title
- Source epic
- FR/NFR coverage
- Prerequisites and decision gates
- Acceptance criteria
- Architecture references
- UX/state checklist references
- Data/API contracts touched
- Test and manual smoke-check expectations
- Out-of-scope notes
```

Rationale:

Implementation agents should not have to execute from a 900+ line epics document. Story files reduce missed dependencies and make handoff cleaner.

### Proposal G: Add Architecture Handoff Caveat

Artifact: `_bmad-output/planning-artifacts/prds/prd-gita-life-operations/architecture.md`

Section: Architecture Readiness Assessment

OLD:

```md
Overall Status: READY FOR IMPLEMENTATION
```

NEW:

```md
Overall Status: ARCHITECTURE READY; BACKLOG REQUIRES READINESS CORRECTIONS BEFORE PHASE 4 STORY ASSIGNMENT

The architecture decisions and boundaries are sufficient for implementation planning. Actual story execution should wait for the approved Sprint Change Proposal corrections: Story 1.1 split, Story 2.1 narrowing, explicit decision gate stories, UX/state checklist, and story sharding or implementation metadata.
```

Rationale:

This prevents the architecture artifact from contradicting the readiness report while preserving the fact that architecture itself is coherent.

## 6. Implementation Handoff

Change scope: Moderate.

Recommended route:

- Product Owner / Developer agents update `epics.md` with approved story splits, gate stories, and prerequisites.
- UX Designer or Product Owner creates the lightweight UX/state checklist.
- Architect updates the architecture readiness caveat and confirms DD-3, DD-6, DD-10 wording.
- Product Owner or Developer shreds approved stories into implementation-ready story files.
- Developer agent starts implementation only after assigned story files include prerequisites, acceptance criteria, API/data contracts, and verification notes.

Success criteria:

- Story 1.1 is split into two independently executable stories.
- Story 2.1 contains only minimum identity/membership schema scope.
- Invite logs and audit visibility are tied to Story 2.6 and Epic 6 where user-visible value appears.
- DD-1, DD-3, DD-6, DD-8, DD-9, and DD-10 are represented as explicit gates or resolved decisions.
- A UX/state checklist exists for public, staff, offline, duplicate, closed-session, stale-sync, and permission states.
- Implementation stories are available as sharded files or carry equivalent implementation metadata.
- No PRD functional requirement is removed.
- FR coverage map remains intact.

## 7. Proposed Next Action

Approve this proposal, then apply artifact edits in this order:

1. Update `epics.md` for Story 1.1 split, Story 2.1 narrowing, Story 2.6/6.1 audit ownership, and readiness gate stories.
2. Create `ux-state-checklist.md`.
3. Add architecture readiness caveat.
4. Shard stories into implementation-ready story files or add story metadata.
5. Re-run implementation-readiness review.

## 8. Approval And Routing

Approval status: Approved by Dwaraka on 2026-06-12 at 21:16:39 IST.

Final scope classification: Moderate.

Route for implementation:

- Product Owner / Developer agents own backlog reorganization and story sharding.
- UX Designer or Product Owner owns the lightweight UX/state checklist.
- Architect owns the architecture readiness caveat and decision-gate alignment.
- Developer agent should begin implementation only after approved story files or equivalent implementation metadata are available.

Workflow handoff complete. The approved proposal should be used as the controlling artifact for the next backlog correction pass.
