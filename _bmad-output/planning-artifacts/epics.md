---
stepsCompleted: [1, 2]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-gita-life-operations/prd.md
  - _bmad-output/planning-artifacts/prds/prd-gita-life-operations/architecture.md
  - _bmad-output/planning-artifacts/prds/prd-gita-life-operations/addendum.md
---

# folk_hkmc - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for folk_hkmc, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: The Public Program Page shall provide a secondary Portal button that routes existing staff users to the correct Program Portal or Program subdomain while keeping public discovery and registration primary.

FR2: The system shall support separate subdomain entry points for Gita Life and FOLK, each served by its own Program App.

FR3: The system shall show a Program Landing Page that matches the visual identity and terminology of the selected Program.

FR4: The system shall create or reuse one Supabase Auth User per staff person, even if that staff person exists in both Airtable Bases.

FR5: The system shall maintain Supabase staff Profile, Membership, Role, and Airtable identity mapping records derived from Airtable.

FR6: The Portal shall route authenticated staff users to Role-appropriate surfaces after authentication, while public registration and attendance remain available without staff sign-in.

FR7: The system shall remove or block staff Portal access when Airtable marks a staff Membership or Role inactive, suspended, or revoked.

FR8: The system shall map each Program to its configured Airtable Base and relevant table IDs.

FR9: The system shall support separate Airtable personal access tokens or equivalent scoped credentials per Airtable Base.

FR10: The system shall expose actionable status for critical operations used by current-app parity flows, including staff profile sync failures, invite failures, queued public writes, Airtable management URL misconfiguration, and audit visibility.

FR11: The Program App shall provide a public registration flow for the active Program that creates or reuses Airtable contacts, blocks duplicate mobile records, remains public, and may queue offline submissions where supported.

FR12: The attendance flow shall preserve mobile number and Session context when an unknown attendee is sent to registration, then complete or confirm attendance after successful session-backed registration.

FR13: The Program App shall allow attendees to mark attendance from a Session-specific link or QR code using a registered mobile number, with active-session validation, duplicate detection, offline queueing where supported, and no public access to other attendee records.

FR14: Authorized staff shall be able to create Program contacts from the staff Contact surface with profile, source, location, collector, comments, and assigned Preacher context.

FR15: The Program App shall queue public registration and public attendance actions locally when browser support and network conditions allow, while keeping authenticated staff contact creation online-only for MVP.

FR16: The Program App shall enforce current-app contact ownership rules for staff-created contacts, including Volunteer assigned-Preacher fail-closed behavior, collector recording, location requirement, and contact comments/profile writes to the Program Airtable Base.

FR17: Authorized Preachers and Admins shall be able to create an active attendance Session for the active Program with location scope, attendance window, public attendance enablement, and generated Session-specific attendance URL.

FR18: Authorized Preachers and Admins shall be able to monitor live attendance for the active Session, including active Session context, QR/link, count, attendee list, scoped visibility, and duplicate-safe incremental refresh.

FR19: Admins shall see the same Program live attendance dashboard available to authorized Preachers, scoped to the active Program unless explicit cross-program permission is granted.

FR20: Admins shall be able to create and inspect Sessions for the active Program, including attendance window state and correct Airtable Base synchronization.

FR21: Admins shall be able to invite staff users and manage Role-specific access details according to Airtable-backed Roles, including Volunteer assigned Preacher ownership, Admin/Preacher location access, inline location creation, invite auditability, and users with roles in both Programs.

FR22: Authorized Admins and Preachers shall be able to open the configured Airtable management interface for deeper operational review or edits, while Volunteers and unauthenticated users cannot.

### NonFunctional Requirements

NFR1: Security - Airtable credentials, Supabase service keys, and privileged sync tokens must remain server-side only.

NFR2: Authorization - Every Program App request must resolve active Program and verify Membership/Role through the shared Supabase mirror before returning Program-scoped data.

NFR3: Program data isolation - Every shared Supabase table, API contract, cache key, and audit event must include Program scope where data is Program-specific; cross-program reads require explicit permission checks.

NFR4: Performance - Normal portal navigation and authorization checks shall use Supabase/runtime cache paths; no normal page load or auth guard may depend on a live Airtable call.

NFR5: Reliability - Public registration and attendance actions may queue during connectivity loss where browser support permits; role-changing actions, admin privilege checks, and sync-sensitive staff writes must fail closed when sync is stale.

NFR6: Accessibility - Portal UI must meet WCAG 2.2 AA expectations for contrast, focus visibility, keyboard navigation, form labels, and status messaging.

NFR7: Mobile-first operations - Public registration, attendance, staff contact capture, Sessions, live attendance, and invite surfaces must support 360px-wide mobile screens without horizontal scrolling or hidden primary actions.

NFR8: Observability - Sync jobs, auth decisions, Airtable failures, queued writes, and role changes must be logged with Program, actor, Role, action, source record where relevant, sync state, and timestamp.

NFR9: Cross-app consistency - Shared schemas, role semantics, audit events, and API contracts must remain consistent across both Program Apps.

NFR10: Configurability - Program-specific modules, labels, fields, and dashboard widgets must be configurable without requiring duplicated business logic or unsafe one-off schema forks.

NFR11: Vercel compatibility - New API routes in either app should remain Edge-compatible unless a Node-only dependency is intentionally introduced, documented, and verified.

### Additional Requirements

- Use a Turborepo/pnpm workspace shape adapted in place, not a blind replacement of the current brownfield repo.
- Split the product into two deployable Next.js App Router Program Apps: `apps/folk` and `apps/gita-life`.
- Extract shared implementation into packages for `ui`, `program-config`, `data-contracts`, `authz`, `airtable`, and supporting utilities.
- Deploy Gita Life and FOLK as separate Vercel Projects from the same monorepo, each with app-specific domains, environment variables, Supabase redirect URLs, and `NEXT_PUBLIC_SITE_URL`.
- Resolve Program context per deployed app/domain, not by a single multiplexed runtime app.
- Use one shared Supabase project/database for staff identity, profiles, memberships, role cache, Airtable identity mapping, audit, invite logs, sync state, and runtime authorization.
- Model staff access as Program-scoped memberships derived from each Program Airtable Base; do not introduce a third central Airtable staff registry for MVP.
- Use two separate Airtable Bases as operational sources of truth and keep all Airtable credentials server-side.
- Add Program Capability Profiles for Airtable base/table/field mappings, labels, enabled modules, dashboard widgets, management URLs, and Program-specific vocabulary.
- Keep V1 staff roles exactly `Admin`, `Preacher`, and `Volunteer` across both Programs.
- Preserve the current FOLK parity contracts for registration, attendance, session-backed registration, duplicate handling, mobile normalization, session creation, dashboard polling, invite flows, and service-worker queueing.
- Keep public attendee/contact records Airtable-backed for MVP; authenticated member/participant portal access is out of MVP scope.
- Keep staff contact creation online-only for MVP; only public registration and attendance require offline queueing.
- Implement Program-aware server-side role guards in shared authz helpers; never treat Supabase identity alone as authorization.
- Fail closed for admin and role-changing actions when sync state is stale or unknown.
- Use REST-style Next.js Route Handlers with shared Zod schemas/types in `packages/data-contracts`.
- Keep API error responses in the shape `{ error: string, code?: string }`; preserve current duplicate and offline response flags where applicable.
- Normalize mobile numbers to the last 10 digits at client and server boundaries.
- Use Supabase tables with lowercase plural `snake_case` names, including `programs`, `staff_memberships`, `airtable_identities`, and `audit_events`.
- Use stable Program IDs `folk` and `gita-life`.
- Use audit action names such as `staff.invited`, `role.revoked`, `sync.failed`, and `attendance.marked`.
- Include `programId`, actor, Role, action, target/source identifiers, and timestamp in audit events where available.
- Ensure no client component imports server-only Airtable, Supabase admin, or authz helpers.
- Update shared contracts before changing app-local API consumers.
- Run explicit TypeScript type checks because the current Next build configuration ignores type errors.
- Use `fetch` for Airtable calls from server routes and avoid Node-only packages in Edge routes unless the runtime is intentionally changed and verified.
- Confirm Gita Life public-page ownership before implementation because no active Gita Life route or `/api/gita-life` endpoint was found in this workspace during PRD finalization.
- Do not reuse existing `/admin`/`/manage` brownfield FOLK surfaces as the foundation for the two new Program Apps without explicit architecture review.
- Keep public program pages at `/activities/gita-life` and `/activities/folk` content-focused, with portal links to the corresponding Program App.
- Future mobile/PWA support should reuse the same identity and Program model, and attendance actions should support offline queueing.
- Deferred implementation gates remain: DD-1 exact Airtable Base/table/field schemas, DD-3 revocation stale-sync threshold, DD-8 sensitive contact/profile visibility, DD-9 retention durations, and DD-10 final DNS values.

### UX Design Requirements

No separate UX Design document was found for this run. UI and interaction requirements are captured in FR3, FR6, FR10-FR15, FR18-FR22, NFR6, NFR7, and the Additional Requirements around Program branding, shared UI primitives, offline states, role-specific navigation, and status messaging.

### FR Coverage Map

FR1: Epic 1 - Public page Portal button.
FR2: Epic 1 - Program-specific subdomain support.
FR3: Epic 1 - Program-branded landing page.
FR4: Epic 2 - Single staff identity across Programs.
FR5: Epic 2 - Airtable-backed staff profile/membership mirror.
FR6: Epic 2 - Role-aware staff routing.
FR7: Epic 2 - Access revocation and stale-sync fail-closed behavior.
FR8: Epic 2 - Separate Airtable Base mapping.
FR9: Epic 2 - Scoped Airtable credentials.
FR10: Epic 2 - Critical operation status and audit visibility.
FR11: Epic 3 - Public registration.
FR12: Epic 3 - Session-backed registration handoff.
FR13: Epic 3 - Session attendance capture.
FR14: Epic 4 - Staff contact capture.
FR15: Epic 3 - Offline public registration and attendance queue.
FR16: Epic 4 - Staff contact ownership routing.
FR17: Epic 5 - Scoped Session creation.
FR18: Epic 5 - Live attendance monitoring.
FR19: Epic 5 - Admin live attendance dashboard.
FR20: Epic 5 - Admin Session management.
FR21: Epic 6 - Staff invite, role, and location management.
FR22: Epic 6 - Airtable management handoff.

## Epic List

### Epic 1: Branded Program Portal Entry
Public visitors and staff can reach the correct Gita Life or FOLK portal entry without disrupting public discovery and registration.
**FRs covered:** FR1, FR2, FR3

### Epic 2: Program-Scoped Staff Access And Data Trust
Staff can sign in with one shared identity, land in the correct Program/Role surface, and trust that access, Airtable mapping, sync status, and audit behavior are Program-scoped.
**FRs covered:** FR4, FR5, FR6, FR7, FR8, FR9, FR10

### Epic 3: Public Registration And Session Attendance
Public visitors and attendees can register, mark Session attendance by mobile number, recover from unknown-mobile handoff, and rely on offline queueing where supported.
**FRs covered:** FR11, FR12, FR13, FR15

### Epic 4: Staff Contact Capture And Ownership Routing
Volunteers, Preachers, and Admins can capture contacts with duplicate prevention, location, collector, comments, and correct assigned-Preacher ownership.
**FRs covered:** FR14, FR16

### Epic 5: Session Operations And Live Attendance
Preachers and Admins can create scoped Sessions, generate attendance links/QR codes, and monitor live attendance with duplicate-safe dashboard refresh.
**FRs covered:** FR17, FR18, FR19, FR20

### Epic 6: Staff Administration And Airtable Handoff
Admins can invite staff, manage role/location access details, create locations inline, audit invite attempts, and authorized staff can open the Airtable management surface safely.
**FRs covered:** FR21, FR22

## Implementation Readiness Gates

These stories must be completed or explicitly waived before dependent implementation stories are assigned.

### Story 0.1: Resolve Airtable Schema Gate DD-1

As an implementation agent,
I want exact Airtable Base, table, field, linked-record, and interface mappings for Gita Life and FOLK,
So that Program Capability Profiles and Airtable adapters can be implemented without guesswork.

**Acceptance Criteria:**

**Given** Gita Life and FOLK Airtable workspaces are ready for implementation mapping
**When** DD-1 is resolved
**Then** Base IDs, table IDs, writable fields, read-only lookup fields, linked-record fields, and interface page IDs are documented for both Programs
**And** Program Capability Profile placeholders can be filled without raw Airtable IDs appearing in client code.

**Given** dependent implementation stories need Airtable mappings
**When** stories 2.5, 3.1-3.4, 4.1-4.3, 5.1-5.4, or 6.1-6.4 are assigned
**Then** DD-1 is complete or an explicit waiver records the temporary mapping source and acceptance risk.

### Story 0.2: Resolve Access And Auth Gates DD-3, DD-6, DD-10

As an implementation agent,
I want revocation threshold, login method, and launch domain decisions recorded,
So that auth, stale-sync, redirects, and deployment configuration can be accepted cleanly.

**Acceptance Criteria:**

**Given** revocation and stale-sync behavior gates staff authorization
**When** DD-3 is resolved
**Then** the approved revocation stale-sync threshold is recorded in product or architecture configuration guidance
**And** dependent access-control stories can fail closed against a concrete threshold.

**Given** the architecture has selected the staff login method
**When** DD-6 is recorded in the backlog
**Then** Supabase email OTP/invite is the accepted implementation default unless the product owner changes it
**And** Story 2.3 does not reopen login-method selection during implementation.

**Given** Vercel, Supabase redirects, and generated attendance links require launch URLs
**When** DD-10 is resolved or temporarily waived
**Then** final or interim production domains are recorded for Vercel, Supabase redirect URLs, and `NEXT_PUBLIC_SITE_URL` planning
**And** dependent deployment setup and Story 5.1 can be accepted against documented values.

**Given** dependent implementation stories need access and deployment decisions
**When** stories 1.1b, 2.3, 2.4, 5.1, or deployment setup are assigned
**Then** DD-3, DD-6, and DD-10 are complete where applicable or explicitly waived with acceptance risk.

### Story 0.3: Resolve Contact Privacy And Retention Gates DD-8, DD-9

As an implementation agent,
I want staff visibility and retention rules for contact comments, profile details, attendance, invite logs, and staff profile mirrors,
So that sensitive data behavior is not invented during implementation.

**Acceptance Criteria:**

**Given** staff contact and profile fields can contain sensitive details
**When** DD-8 is resolved
**Then** Admin, Preacher, and Volunteer visibility rules are documented for contact comments and profile details
**And** dependent UI and API stories can enforce least-privilege behavior consistently.

**Given** operational data is stored across Airtable, Supabase, invite logs, audit events, and sync state
**When** DD-9 is resolved
**Then** retention expectations are documented for contacts, attendance, invite logs, audit events, staff profiles, and sync state
**And** implementation stories do not invent retention behavior independently.

**Given** dependent implementation stories touch sensitive contact or retention behavior
**When** stories 4.1, 4.2, 4.3, 6.1, or 6.2 are assigned
**Then** DD-8 and DD-9 are complete where applicable or explicitly waived with acceptance risk.

## Epic 1: Branded Program Portal Entry

Public visitors and staff can reach the correct Gita Life or FOLK portal entry without disrupting public discovery and registration.

### Story 1.1a: Move Current FOLK Runtime Into The FOLK Program App Boundary

As a staff user,
I want the existing FOLK runtime preserved inside a dedicated FOLK app boundary,
So that current operations keep working while the two-app structure is introduced.

**Acceptance Criteria:**

**Given** the brownfield repo is being adapted in place
**When** the story is implemented
**Then** the current FOLK App Router runtime is available under or behind `apps/folk`
**And** existing public, staff, auth, registration, contact, sessions, dashboard, invite, manage, service-worker, and `/attendance` behavior remains route-compatible.

**Given** the FOLK app starts locally
**When** developers run the app-specific dev command
**Then** FOLK renders without depending on `apps/gita-life`
**And** existing environment requirements are documented for the app boundary.

**Given** the migration changes project structure
**When** linting and type checking are run
**Then** FOLK app code can be checked with `pnpm` commands
**And** no Airtable token or Supabase service-role key is exposed to client code.

### Story 1.1b: Add Gita Life App Shell And Shared Program Configuration

As a staff user,
I want Gita Life to have its own portal shell backed by shared Program config,
So that Gita Life can start from the same operational foundation without copying FOLK-specific logic.

**Acceptance Criteria:**

**Given** `apps/folk` exists or is being introduced
**When** `apps/gita-life` is added
**Then** the Gita Life app has an independent App Router shell, metadata, assets slot, and local run/build configuration.

**Given** Program configuration is needed by both apps
**When** either app resolves Program context
**Then** it uses stable Program IDs `folk` and `gita-life`
**And** Program labels, vocabulary, app URLs, enabled modules, and public asset references come from shared Program configuration or app-local assets.

**Given** Vercel will deploy the apps separately
**When** app-level configuration is reviewed
**Then** each app has a clear place for `NEXT_PUBLIC_SITE_URL` and server-only operational secrets
**And** no shared component hard-codes one Program's vocabulary into the other Program.

**Given** Story 1.1b depends on launch and redirect configuration
**When** it is assigned for implementation
**Then** Story 0.2 has resolved or explicitly waived DD-10 for interim development and production-domain planning.

### Story 1.2: Add Portal Buttons To Public Program Pages

As an existing staff user,
I want a clear Portal button on each public Program page,
So that I can reach the correct staff portal without distracting new visitors.

**Acceptance Criteria:**

**Given** the public Gita Life page exists in this repo or its ownership has been confirmed
**When** the page renders
**Then** it includes a `Gita Life Portal` entry that links to the configured Gita Life Program App URL
**And** the Portal entry is visually secondary to public discovery, inquiry, and registration actions.

**Given** the public FOLK page exists in this repo or its ownership has been confirmed
**When** the page renders
**Then** it includes a `FOLK Portal` entry that links to the configured FOLK Program App URL
**And** the Portal entry is visually secondary to public discovery, inquiry, and registration actions.

**Given** a Portal button is displayed on either public Program page
**When** the user views it on desktop or mobile
**Then** the label uses public-friendly Portal language
**And** it does not use internal terms such as backend, admin, or operations.

**Given** Program App URLs differ by environment
**When** the Portal button href is resolved
**Then** it comes from Program configuration or environment-backed app configuration
**And** it does not hard-code production-only domains in reusable UI.

**Given** the page is used by keyboard and screen-reader users
**When** the Portal entry receives focus or is announced
**Then** it has an accessible name matching the Program-specific Portal label
**And** focus visibility meets the shared portal accessibility expectations.

### Story 1.3: Build Program-Branded Landing Pages

As a Program user,
I want each portal landing page to match that Program's identity and vocabulary,
So that the experience feels native to Gita Life or FOLK.

**Acceptance Criteria:**

**Given** a user opens the Gita Life Program App root route
**When** the landing page renders
**Then** the page uses Gita Life branding, logo/assets where available, and participant/family/session vocabulary
**And** it clearly identifies the active Program as Gita Life.

**Given** a user opens the FOLK Program App root route
**When** the landing page renders
**Then** the page uses FOLK branding, logo/assets where available, and member/contact/session vocabulary
**And** it clearly identifies the active Program as FOLK.

**Given** the landing page is viewed before staff authentication
**When** public registration and attendance flows are available
**Then** those public actions remain reachable without staff sign-in
**And** staff portal sign-in is available without becoming the only visible path.

**Given** shared UI primitives or layout patterns are reused
**When** Program-specific content is rendered
**Then** labels, colors, assets, and enabled modules come from Program configuration or app-local Program assets
**And** reusable components do not hard-code one Program's vocabulary into the other Program's page.

**Given** the landing pages are used on a 360px-wide mobile viewport
**When** core actions and Program identity are displayed
**Then** there is no horizontal scrolling
**And** primary public or staff actions are not hidden behind inaccessible layout behavior.

**Given** the landing page is tested for accessibility
**When** headings, links, buttons, forms, focus states, and status text are inspected
**Then** the page meets WCAG 2.2 AA expectations for contrast, focus visibility, keyboard navigation, labels, and status messaging.

## Epic 2: Program-Scoped Staff Access And Data Trust

Staff can sign in with one shared identity, land in the correct Program/Role surface, and trust that access, Airtable mapping, sync status, and audit behavior are Program-scoped.

### Story 2.1: Create Program-Scoped Staff Identity Schema

As a staff operator,
I want staff identity and Program membership stored in a shared Supabase mirror,
So that both Program Apps can authorize staff without duplicating Airtable operational data.

**Acceptance Criteria:**

**Given** the shared Supabase project is available
**When** the minimum staff identity schema migration is applied
**Then** the database includes the minimum Program-scoped tables needed for staff authorization: programs, staff profiles, staff memberships, and Airtable staff identity mappings
**And** Program-specific rows include a stable Program ID of `folk` or `gita-life`.

**Given** sync state, invite logs, and audit events are required by later operational stories
**When** Story 2.1 is accepted
**Then** it documents the planned table boundaries for those later stories
**And** it does not require full invite-log or broad audit-event implementation before the first staff authorization flow needs them.

**Given** the V1 role taxonomy is fixed
**When** staff membership records are created or updated
**Then** role values are constrained to `Admin`, `Preacher`, or `Volunteer`
**And** status values support active and revoked/inactive access decisions.

**Given** Airtable remains the operational source of truth
**When** Supabase mirror tables are reviewed
**Then** they do not duplicate Contacts, Sessions, Attendance, Locations, or Analytics as primary operational tables
**And** this story stores only the runtime identity, membership, and mapping data needed for initial access enforcement.

**Given** app code needs typed database rows
**When** schema work is complete
**Then** generated or maintained TypeScript types are available for the new Supabase rows
**And** `pnpm` type checking can validate code using those types.

**Given** privileged database operations are required
**When** service-role or admin clients are used
**Then** they are imported only from server-only code
**And** no browser bundle exposes Supabase service-role credentials.

### Story 2.2: Resolve Program-Aware Staff Context

As an authenticated staff user,
I want each Program App to verify my active membership and role,
So that I only reach the surfaces allowed for that Program.

**Acceptance Criteria:**

**Given** a request reaches protected staff code
**When** the shared authz helper resolves staff context
**Then** it reads the verified Supabase user from the request-scoped server client
**And** it does not treat browser localStorage, client role state, or Supabase identity alone as authorization.

**Given** a Supabase user exists
**When** staff context is resolved for `folk` or `gita-life`
**Then** the helper requires an active staff membership for that Program
**And** it returns the staff role, status, Airtable user mapping, location scope, assigned Preacher where relevant, and sync timestamp.

**Given** a staff user belongs to both Programs
**When** they access one Program App
**Then** the request uses only that Program's membership and Airtable identity for authorization
**And** different roles across Programs are supported without role leakage.

**Given** the staff membership is missing, inactive, suspended, revoked, or stale beyond the configured threshold
**When** a protected request is evaluated
**Then** authorization fails closed with a typed error or safe redirect
**And** no Program-scoped data is returned.

**Given** auth decisions are evaluated
**When** failures or stale-sync decisions occur
**Then** logs or audit events include Program, actor where known, role where known, action, sync state, and timestamp
**And** logs do not include secret tokens or OTP values.

### Story 2.3: Implement Staff Sign-In And Role Routing

As an invited staff user,
I want to sign in once and land in the correct Program/Role surface,
So that I can start the work I am authorized to do.

**Acceptance Criteria:**

**Given** a staff user opens the Program App sign-in flow
**When** they submit their invited staff email or approved login method
**Then** the app starts a Supabase-backed authentication flow for that email
**And** the UI does not expose demo credentials or local role-switching controls.

**Given** the login method was deferred as DD-6
**When** this story is assigned for implementation
**Then** Story 0.2 has recorded Supabase email OTP/invite as the implementation default or documents an explicit product-owner change
**And** the story does not proceed with multiple competing login methods.

**Given** Supabase completes authentication
**When** the auth callback or confirmation route runs
**Then** it establishes a secure cookie-backed session
**And** it resolves Program-aware staff context before redirecting to any protected staff surface.

**Given** an active Volunteer signs in
**When** routing completes
**Then** they land on the staff Contact surface
**And** dashboard, sessions, invite, admin, and manage surfaces are not exposed as available destinations.

**Given** an active Preacher signs in
**When** routing completes
**Then** they can reach Contact, Sessions, Live Attendance, Volunteer Invite where enabled, and Manage where permitted
**And** Admin-only invite or location-management actions remain inaccessible.

**Given** an active Admin signs in
**When** routing completes
**Then** they can reach Contact, Sessions, Live Attendance, staff invite, location management, and Manage surfaces for the active Program
**And** final data access still depends on server-side authz checks.

**Given** sign-out is requested
**When** the sign-out route completes
**Then** Supabase session cookies are cleared
**And** the user is redirected away from protected staff pages.

### Story 2.4: Enforce Revocation And Stale-Sync Policy

As a Program admin,
I want revoked or stale staff access to fail closed,
So that Airtable role changes are respected by both portals.

**Acceptance Criteria:**

**Given** Airtable marks a staff membership or role inactive, suspended, or revoked
**When** sync updates the Supabase mirror
**Then** subsequent protected requests for that Program are denied
**And** the user cannot keep access through cached client state.

**Given** the exact revocation sync window is still a deferred implementation decision
**When** this story is accepted for implementation
**Then** Story 0.2 has resolved DD-3 or an explicit threshold is recorded in configuration
**And** admin or role-changing actions fail closed until the threshold is defined.

**Given** a membership sync timestamp is older than the allowed threshold
**When** a user attempts an admin or role-changing action
**Then** the action is blocked with an actionable stale-sync error
**And** no Airtable mutation or privileged Supabase mutation occurs.

**Given** a non-privileged staff page is accessed with stale sync
**When** the product policy permits a login-time refresh
**Then** the app attempts the approved refresh path
**And** fails closed if refresh cannot prove active status and role.

**Given** revocation or stale-sync denial occurs
**When** the denial is recorded
**Then** audit data includes Program, actor, attempted action, sync state, source, and timestamp
**And** the user-facing message does not expose sensitive membership internals.

### Story 2.5: Configure Program Airtable Bases And Credentials

As a portal maintainer,
I want each Program App to read and write only its configured Airtable Base,
So that Gita Life and FOLK operational data remain isolated.

**Acceptance Criteria:**

**Given** Program Capability Profiles are defined
**When** `folk` and `gita-life` configurations are loaded
**Then** each profile includes Airtable base, table, field mapping, label, module, and management URL configuration slots
**And** Story 0.1 has resolved DD-1 or explicitly waived the missing exact Airtable IDs before this story is assigned for implementation.

**Given** an API route needs Airtable access
**When** it resolves the active Program context
**Then** it selects only that Program's Airtable credential and base/table mapping
**And** it cannot write to the other Program's Base through a client-supplied Program ID.

**Given** scoped Airtable PATs are available
**When** environment variables are configured
**Then** the app supports separate credentials per Program
**And** credentials are read only from server-side environment variables.

**Given** required Airtable configuration is missing
**When** a server route initializes an Airtable adapter
**Then** the route fails fast with an actionable configuration error
**And** it does not fall back to legacy base IDs or production-only defaults.

**Given** Airtable helpers are used by app code
**When** imports are inspected
**Then** helper modules are server-only
**And** no client component imports Airtable tokens, adapters, or REST helpers.

### Story 2.6: Surface Critical Sync And Audit Status

As an Admin,
I want critical sync, invite, queue, and management-link failures to be visible,
So that operational drift does not hide behind a successful-looking UI.

**Acceptance Criteria:**

**Given** a staff profile sync fails
**When** the affected user or Admin-facing surface handles the failure
**Then** the UI shows an actionable status or denial state
**And** the audit log records Program, actor where known, source, error category, and timestamp.

**Given** an invite send fails after an Airtable user change
**When** the invite flow completes with error
**Then** the failure follows the shared audit conventions defined by this story
**And** invite-log persistence is implemented in Story 6.1 or as an explicit prerequisite to Story 6.1.

**Given** a public registration or attendance write is queued
**When** queue status changes
**Then** the user sees pending, synced, duplicate, or failed states as applicable
**And** the status preserves Program and request context for auditability.

**Given** the Airtable management URL is misconfigured
**When** an authorized staff user opens Manage
**Then** the app shows a clear unavailable state
**And** the issue is logged without exposing secret environment values.

**Given** sync failure, stale authorization, queued public write, or management-link failure events need operational visibility
**When** Story 2.6 is implemented
**Then** it introduces or completes the sync-state and audit-event storage needed for those visible states
**And** event names use dot notation such as `role.revoked`, `sync.failed`, `attendance.marked`, and `management.misconfigured`.

**Given** staff invite attempts become user-visible in Epic 6
**When** invite logging is required
**Then** invite-log persistence is implemented in Story 6.1 or as an explicit prerequisite to Story 6.1
**And** Story 2.6 only owns shared audit conventions that invite logs must follow.

## Epic 3: Public Registration And Session Attendance

Public visitors and attendees can register, mark Session attendance by mobile number, recover from unknown-mobile handoff, and rely on offline queueing where supported.

### Story 3.1: Register Public Program Contacts

As a public visitor,
I want to register for the active Program with basic profile details,
So that I can join without staff intervention.

**Acceptance Criteria:**

**Given** a public visitor opens a Program registration page
**When** the form renders
**Then** it displays fields enabled for the active Program, including name, mobile number, age or date details where configured, occupation, year where relevant, and location
**And** the visitor does not need staff authentication.

**Given** the visitor submits a mobile number
**When** the client and server validate it
**Then** the value is normalized to the last 10 digits
**And** invalid values are rejected before Airtable mutation.

**Given** a normalized mobile number already exists in the active Program Airtable Contacts table
**When** registration is submitted
**Then** the route returns a clear already-registered state
**And** no duplicate Contact is created.

**Given** a valid new registration is submitted
**When** the API route writes Airtable
**Then** it creates a Contact only in the active Program Base
**And** it writes only fields allowed by that Program's Capability Profile.

**Given** the registration succeeds, duplicates, queues, or fails
**When** the response reaches the UI
**Then** the user sees a clear status message
**And** the message does not expose Airtable internals.

### Story 3.2: Capture Attendance From Session Links

As an attendee,
I want to mark attendance from a Session-specific link or QR code,
So that my presence is recorded for the correct Session.

**Acceptance Criteria:**

**Given** an attendee opens `/attend?session=<sessionId>`
**When** the attendance page renders
**Then** the page preserves the session ID for submission
**And** it does not expose other attendees' records.

**Given** `POST /attendance` receives a mobile number and session ID
**When** the route validates the request
**Then** it requires a valid normalized 10-digit mobile number
**And** it requires an existing Session in the active Program Airtable Base.

**Given** the Session exists
**When** public attendance is disabled or the open/close window rejects the current time
**Then** the route returns a clear unavailable or closed status
**And** no Attendance record is created.

**Given** a matching Contact exists for the normalized mobile number
**When** attendance is created
**Then** the Airtable Attendance record links the Contact and Session
**And** it records safe display snapshots such as phone, name, processed status, and timestamp where supported.

**Given** the Contact already has Attendance for the same Session
**When** attendance is submitted again
**Then** the route returns a duplicate or already-marked state
**And** no second Attendance record is created.

### Story 3.3: Hand Unknown Attendees Into Session-Backed Registration

As an unregistered attendee,
I want the attendance flow to carry my mobile and Session into registration,
So that I do not repeat work before attendance is completed.

**Acceptance Criteria:**

**Given** an attendance submission has a valid Session but no matching Contact
**When** `POST /attendance` responds
**Then** it returns a not-registered state with normalized mobile and preserved session ID
**And** it does not create Attendance.

**Given** the attendance UI receives a not-registered state
**When** it redirects the attendee
**Then** the destination includes `mobile=<normalized mobile>` and `session=<sessionId>`
**And** the session parameter is not dropped during navigation.

**Given** the registration page opens with mobile and session parameters
**When** the form renders
**Then** the mobile field is prefilled where appropriate
**And** the session ID is retained for registration submission and follow-through.

**Given** session-backed registration creates or reuses a Contact
**When** registration completes
**Then** the client attempts attendance completion for the same mobile and Session
**And** duplicate attendance after registration is treated as a completed outcome.

**Given** the Session becomes invalid or closed during registration
**When** attendance follow-through runs
**Then** the user sees a clear follow-up state
**And** the system does not create another Contact or invalid Attendance record.

### Story 3.4: Queue And Replay Public Registration And Attendance

As a public visitor or attendee,
I want registration and attendance submissions to queue during connectivity loss,
So that event-day participation can continue when the network is unreliable.

**Acceptance Criteria:**

**Given** the browser supports the app's offline queue mechanism
**When** public registration is submitted while offline
**Then** the request is queued with Program context, normalized mobile where available, and allowed registration fields
**And** the UI shows a pending queued state.

**Given** attendance is submitted from a Session link while offline
**When** the request is queued
**Then** the queued payload preserves mobile and session ID
**And** replay posts the same shape expected by the attendance route.

**Given** queued requests replay after connectivity returns
**When** the server responds with success, duplicate, not-registered, closed, or failed states
**Then** the UI reflects the final state clearly
**And** duplicate replay is treated as completed where appropriate.

**Given** a queued registration came from a session-backed attendance flow
**When** replay creates or reuses a Contact
**Then** the session context is preserved for attendance follow-through
**And** replay remains idempotent.

**Given** staff contact creation is attempted offline
**When** no explicit staff-offline strategy exists
**Then** the app does not silently queue the authenticated write
**And** the staff user sees an online-required message.

## Epic 4: Staff Contact Capture And Ownership Routing

Volunteers, Preachers, and Admins can capture contacts with duplicate prevention, location, collector, comments, and correct assigned-Preacher ownership.

### Story 4.1: Create Program Contacts From Authenticated Staff

As a staff member,
I want to create contacts from the Program portal,
So that outreach records are captured with the correct Program context.

**Acceptance Criteria:**

**Given** an active Admin, Preacher, or Volunteer submits the Contact form
**When** `POST /api/contact` handles the request
**Then** it resolves Program-aware staff context server-side
**And** it rejects unauthenticated, inactive, stale, or wrong-Program staff.

**Given** the request includes contact profile fields
**When** the route validates the payload
**Then** it accepts only fields supported by the active Program Capability Profile
**And** it requires location before save.

**Given** a mobile number is submitted
**When** contact lookup runs
**Then** it normalizes to the last 10 digits and checks the active Program Contacts table
**And** duplicate mobile numbers return a safe duplicate state without creating another Contact.

**Given** the contact is new and valid
**When** Airtable is written
**Then** the Contact is created in the active Program Base with profile fields, location, source where provided, comments where permitted, collector, and assigned Preacher
**And** read-only Airtable lookup fields are not written.

**Given** the route returns success, duplicate, validation, or server error
**When** the client displays the result
**Then** the status is understandable on mobile
**And** private Airtable details are not exposed to Volunteers.

### Story 4.2: Enforce Role-Based Contact Ownership

As a Program lead,
I want staff-created contacts assigned according to role rules,
So that follow-up ownership is trustworthy.

**Acceptance Criteria:**

**Given** a Volunteer creates a contact
**When** assigned Preacher is resolved
**Then** the server uses the Volunteer's active Airtable assigned Preacher relationship
**And** any browser-provided assigned Preacher value is ignored.

**Given** a Volunteer has no assigned active Preacher
**When** they attempt contact creation
**Then** the request fails closed with an actionable message
**And** no Contact is created.

**Given** a Preacher creates a contact
**When** assigned Preacher is resolved
**Then** the server assigns the Contact to the signed-in Preacher
**And** the collector is recorded as the signed-in staff user.

**Given** an Admin creates a contact
**When** no explicit assigned Preacher is provided
**Then** the request is rejected before Airtable mutation
**And** the UI can prompt for the missing assignment.

**Given** sensitive comments and profile details are captured
**When** DD-8 or DD-9 policy is unresolved
**Then** Story 0.3 records the policy dependency before this story is assigned for production implementation
**And** visibility defaults to least privilege.

### Story 4.3: Build Role-Safe Staff Contact UI

As a staff member,
I want the Contact page to show only fields and actions my role can use,
So that I can capture contacts quickly without creating ownership mistakes.

**Acceptance Criteria:**

**Given** an active Volunteer opens Contact
**When** the page renders
**Then** they can enter allowed contact identity, profile, location, source, and comment fields
**And** they do not see assigned Preacher selection, dashboard links, session links, invite links, or manage links.

**Given** an active Preacher opens Contact
**When** the page renders
**Then** the UI indicates contacts will be assigned to the signed-in Preacher
**And** it does not imply the Preacher can assign contacts to another Preacher.

**Given** an active Admin opens Contact
**When** the page renders
**Then** assigned Preacher selection is available and required
**And** selectable Preachers are validated from active Program data.

**Given** the Contact page is used on a 360px-wide mobile viewport
**When** staff enter and submit contact details
**Then** the form has no horizontal scrolling
**And** required actions and status messages remain visible.

**Given** the Contact page is used with keyboard or assistive technology
**When** fields, buttons, errors, and success messages are inspected
**Then** labels, focus states, and status messaging meet the shared accessibility expectations.

## Epic 5: Session Operations And Live Attendance

Preachers and Admins can create scoped Sessions, generate attendance links/QR codes, and monitor live attendance with duplicate-safe dashboard refresh.

### Story 5.1: Create Scoped Sessions With Attendance URLs

As a Preacher or Admin,
I want to create an active Session with a public attendance URL,
So that attendees can check in for the correct Program event.

**Acceptance Criteria:**

**Given** an active Preacher or Admin submits a Session creation request
**When** `POST /api/sessions` handles the payload
**Then** it resolves Program-aware staff context server-side
**And** it rejects Volunteers and inactive or stale staff.

**Given** a Preacher selects a location
**When** the route validates scope
**Then** the location must be within the Preacher's allowed Program location scope
**And** out-of-scope locations are rejected before Airtable mutation.

**Given** an Admin selects a location
**When** the route validates scope
**Then** any active location for the Program may be used
**And** unknown or inactive locations are rejected.

**Given** the Session payload is valid
**When** Airtable is written
**Then** the Session record includes name, date/time where configured, location, owner or Preacher, public attendance enabled state, open time, and close time
**And** the owner/preacher comes from server context or validated Admin input, not untrusted browser ownership data.

**Given** the Session is created
**When** the attendance URL is generated
**Then** it uses the active Program App's configured `NEXT_PUBLIC_SITE_URL` and `/attend?session=<sessionId>`
**And** the URL is stored back to the Program Airtable Session record.

**Given** attendance URLs depend on deployed app domains
**When** this story is assigned for implementation
**Then** Story 0.2 has resolved or explicitly waived DD-10 for interim development and production-domain planning
**And** generated URLs are accepted only against documented `NEXT_PUBLIC_SITE_URL` values.

### Story 5.2: Inspect Sessions By Staff Scope

As a Preacher or Admin,
I want to inspect only the Sessions I am allowed to operate,
So that Session management stays aligned with Program ownership and location rules.

**Acceptance Criteria:**

**Given** an active Admin requests the Sessions page or `GET /api/sessions`
**When** Sessions are loaded
**Then** the response includes all operational Sessions needed for Admin management in the active Program
**And** no Sessions from the other Program are returned.

**Given** an active Preacher requests Sessions
**When** Sessions are loaded
**Then** the response includes owned Sessions or allowed-location Sessions according to the approved scope rule
**And** unrelated Sessions are not returned.

**Given** an active Volunteer requests Sessions
**When** server authorization runs
**Then** access is denied
**And** no Session records are returned to the browser.

**Given** Airtable records contain missing optional fields
**When** Sessions are mapped to API payloads
**Then** the route returns stable typed JSON with safe null or empty values
**And** the client does not crash.

**Given** a Session has an attendance URL and open/close state
**When** the Sessions UI renders it
**Then** staff can see whether attendance is currently open
**And** the shown link matches server enforcement.

### Story 5.3: Display Session QR And Sharing Tools

As a Preacher or Admin,
I want to share the Session attendance link and QR code,
So that attendees can check in quickly during the event.

**Acceptance Criteria:**

**Given** a created Session has an attendance URL
**When** the Session appears in the UI
**Then** the page displays a QR code that encodes that exact URL
**And** it does not fall back to a generic attendance URL.

**Given** staff need to share the link
**When** they use the Session sharing controls
**Then** the URL can be copied or opened according to the app's supported controls
**And** the displayed URL uses the active Program App domain.

**Given** attendance is disabled or outside the window
**When** the QR/link area renders
**Then** the UI clearly communicates the unavailable state
**And** staff are not misled into sharing an active-looking link.

**Given** the Sessions page is used during an event on mobile
**When** QR, link, and Session status are displayed
**Then** the QR remains scannable and core actions remain reachable
**And** the layout avoids horizontal scrolling at 360px width.

### Story 5.4: Monitor Live Attendance With Incremental Refresh

As a Preacher or Admin,
I want to monitor live attendance for the active Session,
So that I can trust the count and attendee list during the event.

**Acceptance Criteria:**

**Given** an active Preacher or Admin opens the live dashboard
**When** the dashboard loads
**Then** it resolves the active Program and authorized Session scope
**And** it shows Session name, location, attendance URL or QR access, count, and attendee list.

**Given** a Preacher views the dashboard
**When** attendance data is loaded
**Then** only owned or allowed-location Sessions are visible according to the approved scope rule
**And** other Program or out-of-scope records are not returned.

**Given** an Admin views the dashboard
**When** attendance data is loaded
**Then** active Program data is visible for Admin management
**And** cross-program data is hidden unless explicit permission is granted.

**Given** polling or refresh loads new Attendance Records
**When** known attendance IDs are sent by the client
**Then** the response appends only new records with stable IDs and display fields
**And** duplicate rows are not added to the UI.

**Given** no active Session exists
**When** the dashboard renders
**Then** it shows a clear empty state that points authorized staff to Sessions
**And** Volunteers and unauthenticated users cannot use the dashboard.

## Epic 6: Staff Administration And Airtable Handoff

Admins can invite staff, manage role/location access details, create locations inline, audit invite attempts, and authorized staff can open the Airtable management surface safely.

### Story 6.1: Invite Program Staff With Role Guardrails

As an Admin,
I want to invite staff with Program-scoped roles and access details,
So that each person receives the correct operational access.

**Acceptance Criteria:**

**Given** an active Admin submits a staff invite
**When** the invite API validates the request
**Then** it accepts only `Admin`, `Preacher`, or `Volunteer` roles for the active Program
**And** it denies Preacher, Volunteer, unauthenticated, inactive, or stale callers for Admin-only invite actions.

**Given** the Admin invites a Volunteer
**When** assigned Preacher is missing or invalid
**Then** the request is rejected before Airtable or Supabase mutation
**And** the UI can show an actionable validation message.

**Given** the Admin invites an Admin or Preacher
**When** location access is provided
**Then** selected locations are validated against active Program locations
**And** raw or unknown Airtable IDs are rejected.

**Given** the target email already belongs to a Supabase Auth user or another Program membership
**When** the invite is processed
**Then** the system reuses the shared Supabase identity where possible
**And** creates or updates only the active Program membership and Airtable identity mapping.

**Given** Airtable user upsert and Supabase invite are attempted
**When** the flow succeeds or fails
**Then** the invite-log persistence needed by Admin invite outcomes is created or reused
**And** the log records inviter, invitee email, role, Program, Airtable user ID where available, status, safe error message, and timestamps
**And** no secret keys or raw provider tokens are exposed.

**Given** invite logs and staff profile mirrors may contain operationally sensitive data
**When** this story is assigned for implementation
**Then** Story 0.3 has resolved or explicitly waived DD-8 and DD-9 where they affect invite visibility and retention.

### Story 6.2: Build Admin Invite And Location Management UI

As an Admin,
I want invite controls with role, assigned Preacher, and location guardrails,
So that staff setup can be completed without raw Airtable IDs.

**Acceptance Criteria:**

**Given** an active Admin opens the staff invite surface
**When** the page renders
**Then** it supports inviting Admin, Preacher, and Volunteer users
**And** it hides the surface from non-Admin staff.

**Given** the selected role is Volunteer
**When** the form validates
**Then** assigned Preacher selection is required
**And** only active Program Preachers are selectable.

**Given** the selected role is Admin or Preacher
**When** location access is configured
**Then** the Admin can select active Program locations without typing raw Airtable IDs
**And** selected values are validated before submit.

**Given** the needed location is missing
**When** the Admin adds a location inline
**Then** the new active location is created in the active Program data source
**And** it becomes selectable for the current invite after successful creation.

**Given** the invite succeeds, partially fails, or fails
**When** the UI receives the response
**Then** it displays a clear status message and next step
**And** it does not expose Airtable API details or Supabase service-role errors.

### Story 6.3: Support Preacher Volunteer Invites

As a Preacher,
I want to invite Volunteers assigned to me,
So that I can onboard contact-capture help without Admin-only access.

**Acceptance Criteria:**

**Given** an active Preacher opens the Volunteer invite surface
**When** the page renders
**Then** it shows only Volunteer invite controls
**And** it does not show Admin or Preacher role invite controls.

**Given** an active Preacher submits a Volunteer invite
**When** the invite API validates the request
**Then** the invitee role is forced or validated as `Volunteer`
**And** the assigned Preacher is the current Preacher from server context.

**Given** the Preacher attempts to invite an Admin or Preacher
**When** the request reaches the server
**Then** it is rejected with a 403 or validation error
**And** no Airtable user or Supabase invite is created.

**Given** the Volunteer invite succeeds
**When** the invitee accepts and signs in
**Then** they are routed to Contact capture for the active Program
**And** they cannot access dashboard, sessions, admin invite, or manage surfaces.

**Given** the invite attempt succeeds or fails
**When** logging completes
**Then** invite audit data records Program, inviter, invitee, role, status, and safe error message where applicable.

### Story 6.4: Open Airtable Management Handoff Safely

As an authorized Admin or Preacher,
I want to open the configured Airtable management interface,
So that deeper operational review remains available when needed.

**Acceptance Criteria:**

**Given** an active Admin or permitted Preacher opens Manage
**When** the route authorizes the request
**Then** it verifies active Program membership and role server-side
**And** it redirects only to the active Program's configured Airtable Interface URL.

**Given** an active Volunteer opens Manage
**When** server authorization runs
**Then** access is denied
**And** no Airtable Interface URL is returned to the browser.

**Given** an unauthenticated or inactive user opens Manage
**When** the route handles the request
**Then** the user is redirected or shown a safe denial state
**And** no Program operational data is exposed.

**Given** the active Program's Airtable Interface URL is missing or invalid
**When** an authorized staff user opens Manage
**Then** the app shows a clear unavailable state
**And** the issue is logged for operators without exposing secret environment values.

**Given** management links are configured for both Programs
**When** Gita Life and FOLK users open Manage from their respective apps
**Then** each user lands only in the matching Program's Airtable management surface
**And** cross-program access requires explicit permission checks.
