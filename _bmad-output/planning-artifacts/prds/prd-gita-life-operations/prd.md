---
title: HKM Program Operations Portals
status: final
created: 2026-06-10
updated: 2026-06-11
---

# PRD: HKM Program Operations Portals

## 0. Document Purpose

This PRD defines the product requirements for adding branded operations portals for Gita Life and FOLK as two program-specific Next.js applications. It is intended for product, UX, architecture, and implementation planning. The PRD captures user-facing behavior and operational requirements; deeper technical notes are kept in `addendum.md`. Requirements use stable FR IDs for downstream architecture, UX, and story creation. Assumptions are tagged inline and indexed in section 13. Final status means the product scope and core product decisions are ready for UX, architecture, and epic generation; implementation-specific decisions deferred by design are listed in section 12.

## 1. Vision

HKM Chennai needs a unified operations platform for Gita Life and FOLK that feels native to each program while remaining maintainable as one product. Public visitors should continue to experience the Gita Life and FOLK public pages as devotional, welcoming program pages. Existing attendees, volunteers, preachers, and admins should have clear flows for registration, session attendance, staff sign-in, contact capture, session creation, live attendance monitoring, staff invites, location access, and Airtable management.

The system should use two Next.js apps: one Gita Life operations app and one FOLK operations app. Both apps should share the same product foundation through common data contracts, auth patterns, design primitives, and implementation conventions where practical, while preserving program-specific branding, subdomains, Airtable bases, roles, language, and workflows. Gita Life users should land in an operations experience styled like Gita Life. FOLK users should land in an operations experience styled like FOLK.

Airtable Team is the intended operational source of truth, with one Airtable Base for Gita Life and one Airtable Base for FOLK. A single shared Supabase project/database remains the secure runtime identity and access layer for staff users across both apps: authentication, staff sessions, staff profile mirror, role cache, membership mapping, and permission enforcement. Public attendee/contact data remains Airtable-backed in MVP parity. [ASSUMPTION: Airtable Team will be available and maintained as the primary operational workspace for both programs.]

## 2. Target Users

### 2.1 Jobs To Be Done

- As a public visitor, I want to learn about the Program and register with basic profile details so I can join without staff intervention.
- As an attendee, I want to open a session-specific link or QR code and mark attendance with my mobile number so check-in is quick.
- As an unregistered attendee, I want the attendance flow to send me into registration with my mobile and Session context preserved so I do not repeat work.
- As an invited staff user, I want to sign in with my staff email and code so I can reach the correct operational surface for my Role.
- As a Volunteer, Preacher, or Admin, I want to capture new contacts with location, occupation, comments, collector, and assigned Preacher context so outreach records are usable later.
- As a Preacher or Admin, I want to start a Session with an attendance window and share a QR/link so attendees can check in.
- As a Preacher or Admin, I want to monitor live attendance for the active Session so I can trust the count and attendee list during the event.
- As an Admin, I want to invite staff, assign Roles, assign Volunteer ownership, and manage location access without raw Airtable IDs.
- As a Preacher or Admin, I want a safe handoff into the Airtable management interface so deeper operational review remains available.

### 2.2 Non-Users for MVP

- Donors, temple visitors, and other HKM program users outside Gita Life and FOLK.
- ICVK admins using the existing ICVK-specific admin surface.
- External third-party event partners.
- Authenticated member/participant portal users who expect announcements, profile self-service, or attendance history outside the current registration and attendance-link flows.

### 2.3 Key User Journeys

These journeys intentionally mirror the currently existing FOLK app. In the proposed two-app product, Gita Life should reuse the same journey patterns where the corresponding module is enabled, with Gita Life terminology, branding, and Airtable records.

- **UJ-1. A public visitor discovers the Program and registers.**
  - **Persona + context:** Arjun is a first-time FOLK visitor opening the public Program page from a shared link.
  - **Entry state:** He lands on the public Program home page and reads the course/program content.
  - **Path:** He opens the registration flow, enters name, mobile number, age, occupation, year where relevant, and location.
  - **Climax:** The system creates the Airtable contact or blocks a duplicate registration with a clear message.
  - **Resolution:** Arjun sees confirmation that he has joined the Program.
  - **Edge case:** If the browser is offline, the registration request is queued and the UI tells him it will sync later.

- **UJ-2. An attendee marks attendance from a session link.**
  - **Persona + context:** Bhaskar is an existing attendee at a live session.
  - **Entry state:** He opens a session-specific attendance URL or QR link.
  - **Path:** He enters his registered mobile number and submits attendance.
  - **Climax:** The system confirms attendance, detects a duplicate, or identifies that the mobile number is not registered.
  - **Resolution:** If registered, attendance is recorded for the active Session. If unknown, he is redirected to registration with mobile and Session context preserved.
  - **Edge case:** If the browser is offline, the attendance request is queued and syncs when connectivity returns.

- **UJ-3. An invited staff user signs in.**
  - **Persona + context:** Kavya is an invited Volunteer, Preacher, or Admin opening the app to do operational work.
  - **Entry state:** She opens Login and enters her invited staff email.
  - **Path:** The system verifies that the email belongs to an active Airtable staff user, sends a Supabase email code, verifies the code, syncs the staff profile, and routes her by Role.
  - **Climax:** She lands in the correct staff surface for her Role.
  - **Resolution:** Volunteer users can reach contact entry; Preacher and Admin users can reach broader staff tools.
  - **Edge case:** Inactive, missing, or malformed staff records fail closed with an auth error.

- **UJ-4. A staff user records a new contact.**
  - **Persona + context:** Kavya is a Volunteer capturing outreach contacts on mobile after a Program interaction.
  - **Entry state:** She is authenticated and opens Contact.
  - **Path:** She enters name, mobile number, date of birth if known, occupation, college/company where relevant, location, and comments.
  - **Climax:** The system checks for duplicate mobile numbers and resolves the correct assigned Preacher.
  - **Resolution:** The contact is saved to Airtable with collector, assigned Preacher, source, location, and profile details.
  - **Edge case:** Volunteer contact routing fails closed if the Volunteer does not have an assigned active Preacher.

- **UJ-5. A Preacher or Admin starts a live attendance Session.**
  - **Persona + context:** Raghav is a Preacher preparing to take attendance for a Program Session.
  - **Entry state:** He is authenticated and opens Sessions.
  - **Path:** He selects an allowed location, enters a Session name, chooses the attendance window duration, and starts the Session.
  - **Climax:** The system creates the Airtable Session and generates a session-specific attendance URL.
  - **Resolution:** The app shows the active Session dashboard with QR code and link for attendees.
  - **Edge case:** Preachers can only start Sessions for locations in their allowed scope.

- **UJ-6. A Preacher or Admin monitors live attendance.**
  - **Persona + context:** Raghav is watching attendance as attendees check in during an active Session.
  - **Entry state:** He opens Dashboard or the active Sessions view while the Session attendance window is open.
  - **Path:** The dashboard loads the active Session, shows the QR code/link, and refreshes new Attendance Records.
  - **Climax:** Newly checked-in attendees appear without duplicating already loaded records.
  - **Resolution:** Staff can trust the live count and attendee list for the active Session.
  - **Edge case:** If no active Session exists, the dashboard points staff back to Sessions to start one.

- **UJ-7. An Admin invites staff and manages access details.**
  - **Persona + context:** An HKM coordinator is setting up operational staff access.
  - **Entry state:** The Admin opens the staff invite surface.
  - **Path:** They enter name and email, choose Admin, Preacher, or Volunteer, assign Volunteer Preacher ownership where needed, select location access for Admin/Preacher users, and add a new location inline if needed.
  - **Climax:** The system upserts the Airtable staff user and sends the Supabase invite.
  - **Resolution:** The invite is logged with status, inviter, invitee Role, and any error message.
  - **Edge case:** Invalid roles, missing assigned Preacher, or unknown selected locations are rejected before invite completion.

- **UJ-8. A Preacher or Admin opens the Airtable management interface.**
  - **Persona + context:** An authorized staff user needs the deeper Airtable operational dashboard that the current app links out to.
  - **Entry state:** They are authenticated as Admin or Preacher and open Manage.
  - **Path:** The app verifies Role access and redirects to the configured Airtable Interface page.
  - **Climax:** The staff user reaches the Airtable management surface for operational review or edits.
  - **Resolution:** If the Airtable Interface URL is not configured, the app shows a clear unavailable state.
  - **Edge case:** Volunteer users and unauthenticated visitors cannot open the management redirect.

## 3. Glossary

- **Program** - A managed HKM program surfaced in the portal. MVP Programs are Gita Life and FOLK.
- **Portal** - The authenticated, role-aware operations experience for a Program, delivered through that Program's Next.js app.
- **Program App** - A program-specific Next.js App Router application. MVP Program Apps are the Gita Life operations app and the FOLK operations app.
- **Program Capability Profile** - A Program-specific configuration that declares which shared modules, labels, fields, dashboard widgets, and workflow variations are enabled, renamed, hidden, or configured for that Program.
- **Program Landing Page** - A branded operations entry page for a Program before or after authentication, styled consistently with the public Program page.
- **Public Program Page** - Unauthenticated marketing/content page under `/activities/gita-life` or `/activities/folk`.
- **Airtable Base** - The operational source-of-truth database for a Program. Gita Life and FOLK use separate Airtable Bases.
- **Supabase Auth User** - The secure runtime identity for one person across both Program Apps.
- **Profile** - Shared Supabase mirror of a person's identity fields needed for runtime behavior.
- **Membership** - A person's scoped association with a Program. In MVP parity, authenticated Membership applies to staff users; public attendees remain Airtable contact records.
- **Role** - Program-scoped operational staff access category. V1 Roles are exactly `Admin`, `Preacher`, and `Volunteer` for both Gita Life and FOLK.
- **Member/Participant/Contact** - A non-staff Program person category captured through registration, attendance, or staff contact entry. FOLK uses member/contact language; Gita Life uses participant/contact language. Authenticated member/participant portal access is not required for MVP parity.
- **Staff User** - An authenticated operational user with a Program-scoped `Admin`, `Preacher`, or `Volunteer` Role.
- **Session** - A scheduled class, event, meetup, or program occurrence.
- **Attendance URL** - A Session-specific public link or QR target used for mobile-number attendance capture.
- **Attendance Record** - A record that a member or participant attended a Session.
- **Sync State** - Runtime status describing whether Airtable and the Supabase mirror are current, pending, failed, or stale.

## 4. Features

### 4.1 Program Portal Entry Points

**Description:** Each Public Program Page exposes a clear but non-intrusive Portal entry. Gita Life uses `Gita Life Portal`; FOLK uses `FOLK Portal`. The entry should be visible to existing users without distracting first-time visitors from the public registration or program content. Realizes UJ-1 and UJ-3.

**Functional Requirements:**

#### FR-1: Public page portal button

The Public Program Page shall provide a Portal button that routes existing staff users to the correct Program Portal or Program subdomain while keeping public discovery and registration primary.

**Consequences:**
- Gita Life users can access the Gita Life Portal from the Gita Life page.
- FOLK users can access the FOLK Portal from the FOLK page.
- The button label avoids internal terms such as "backend" or "operations" on public pages.
- Public Program Pages keep inquiry, registration, and program discovery visually primary for new visitors; Portal entry remains available but secondary for staff and invited operational users.

#### FR-2: Program-specific subdomain support

The system shall support separate subdomain entry points for Gita Life and FOLK, each served by its own Program App.

**Consequences:**
- `gitalife.hkmchennai.org` resolves to the Gita Life operations app.
- `folk.hkmchennai.org` resolves to the FOLK operations app.
- Each app can still resolve active Program context from hostname and configuration, but MVP does not depend on one runtime app multiplexing both Programs.

#### FR-3: Program landing page

The system shall show a Program Landing Page that matches the visual identity and terminology of the selected Program.

**Consequences:**
- Gita Life landing uses Gita Life colors, logo, and participant/family/session language.
- FOLK landing uses FOLK colors, logo, and member/contact/session language.
- Program Landing Pages share reusable layout ideas, data contracts, and components where practical, without requiring a single deployed app.

### 4.2 Staff Authentication and Program-Scoped Access

**Description:** A single shared Supabase project/database provides secure staff login and one staff identity per person across both Program Apps. Airtable remains the source of truth for operational staff records and role assignments. Public attendees use Airtable contact records and mobile-number attendance flows in MVP; they are not required to have authenticated portal accounts. Supabase stores only the staff profile, membership, role, and Airtable mapping needed to enforce access quickly and safely. Realizes UJ-3 through UJ-8.

**Functional Requirements:**

#### FR-4: Single staff identity across Programs

The system shall create or reuse one Supabase Auth User per staff person, even if that staff person exists in both Airtable Bases.

**Consequences:**
- A staff person can have FOLK and Gita Life staff Memberships under the same Supabase identity.
- Program-scoped Role assignments can differ between Programs, while the V1 Role taxonomy remains the same for both Programs.
- Email is used for initial matching but the Supabase Auth User ID becomes the runtime identity.
- Public attendee/contact records remain Airtable records keyed primarily by mobile number for MVP and do not require Supabase Auth accounts.

#### FR-5: Airtable-backed staff profile mirror

The system shall maintain Supabase staff Profile, Membership, Role, and Airtable identity mapping records derived from Airtable.

**Consequences:**
- Each Program App can authorize users against the shared Supabase mirror without calling Airtable on every request.
- Each staff Membership stores Program, Airtable Base ID, Airtable User Record ID, staff Role, staff status, location scope, assigned Preacher where relevant, and sync timestamp.
- Airtable wins conflicts for operational profile and role data.

#### FR-6: Staff role-aware routing

The Portal shall route authenticated staff users to Role-appropriate surfaces after authentication, while public registration and attendance remain available without staff sign-in.

**Consequences:**
- Public visitors can access public content and registration without staff sign-in.
- Attendees can mark attendance from a session-specific link without staff sign-in.
- Volunteers can reach contact capture.
- Preachers can reach contact capture, Sessions, live attendance, Volunteer invite, and Manage where permitted.
- Admins can reach contact capture, Sessions, live attendance, staff invites, location access management, and Manage.
- Staff users with multiple Program Memberships can switch or cross-link to the other Program App if authorized.

#### FR-7: Access revocation

The system shall remove or block staff Portal access when Airtable marks a staff Membership or Role inactive, suspended, or revoked.

**Consequences:**
- Revoked users lose access within a defined sync window.
- Admin access fails closed if role sync is stale beyond the allowed threshold. [ASSUMPTION: the threshold will be agreed before launch.]
- Access decisions check Supabase Membership and Role tables, not only JWT metadata.

### 4.3 Airtable Source of Truth Integration

**Description:** Two Airtable Bases act as operational source of truth for Gita Life and FOLK. Each Program App synchronizes selected records to the shared Supabase database for auth enforcement, fast runtime reads, and future mobile/PWA behavior. Frontend clients never call Airtable directly.

**Functional Requirements:**

#### FR-8: Separate Airtable Base mapping

The system shall map each Program to its configured Airtable Base and relevant table IDs.

**Consequences:**
- Gita Life reads and writes only Gita Life Airtable records.
- FOLK reads and writes only FOLK Airtable records.
- Airtable credentials remain server-side only.

#### FR-9: Scoped Airtable credentials

The system shall support separate Airtable personal access tokens or equivalent scoped credentials per Airtable Base.

**Consequences:**
- A leaked FOLK token does not grant Gita Life Base access where Airtable scoping allows separation.
- Credentials are never exposed to client components.
- API routes select credentials by Program App and Program context.

#### FR-10: Critical operation status and audit visibility

The system shall expose actionable status for critical operations used by current-app parity flows.

**Consequences:**
- Staff profile sync failures, invite send failures, queued public writes, and Airtable management URL misconfiguration produce visible error states.
- Admins can review invite attempts with status, inviter, invitee Role, and error message where applicable.
- Auth and Role sync errors are actionable and do not silently hide permission drift.
- Audit logs can trace staff access changes and invite activity into Supabase mirror changes where applicable.

### 4.4 Public Registration and Attendance Experience

**Description:** Public visitors and attendees use the Program App for the current FOLK-style public flows: learning about the Program, registering as a contact, and marking attendance from a Session-specific link or QR code. FOLK language emphasizes members and youth program participation. Gita Life language should adapt to participants and family/session terminology where that Program enables the same flow. Realizes UJ-1 and UJ-2.

**Functional Requirements:**

#### FR-11: Public registration

The Program App shall provide a public registration flow for the active Program.

**Consequences:**
- Visitors can submit name, mobile number, age, occupation, year where relevant, and location.
- Registration creates an Airtable contact in the active Program Base.
- Duplicate mobile numbers return a clear already-registered state instead of creating duplicate contacts.
- Registration remains public and does not require Supabase Auth.
- Public registration actions can be queued while offline where browser support permits.

#### FR-12: Session-backed registration handoff

The attendance flow shall preserve mobile number and Session context when an unknown attendee is sent to registration.

**Consequences:**
- Unknown mobile numbers from an attendance link route to registration with mobile and Session context preserved.
- Successful session-backed registration creates the contact and completes attendance for the active Session when the Session is still eligible.
- Duplicate session-backed registration resolves to the existing contact and completes or confirms the existing Attendance Record.

#### FR-13: Session attendance capture

The Program App shall allow attendees to mark attendance from a Session-specific link or QR code using a registered mobile number.

**Consequences:**
- Attendance is accepted only for valid, active Sessions with open attendance windows.
- Duplicate attendance for the same contact and Session returns a clear already-marked state.
- Unknown mobile numbers are handled by the session-backed registration handoff.
- Offline attendance submissions can be queued and retried where browser support permits.
- Public attendees cannot view other attendees' records through this flow.

### 4.5 Staff Contact Capture and Event-Day Support

**Description:** Volunteers, Preachers, and Admins need fast mobile-first staff tools for contact capture and event-day support. The current parity scope centers on contact capture, assigned Preacher routing, session attendance links, and offline public registration/attendance queueing rather than a separate volunteer QR-scanning module. Realizes UJ-2 and UJ-4.

**Functional Requirements:**

#### FR-14: Staff contact capture

Authorized staff shall be able to create Program contacts from the staff Contact surface.

**Consequences:**
- Staff can capture name, mobile number, date of birth where known, occupation, college/company where relevant, location, comments, source, collector, and assigned Preacher context.
- Duplicate mobile numbers do not create duplicate contacts.
- Admin-created contacts require explicit assigned Preacher selection.
- Preacher-created contacts assign to the signed-in Preacher.
- Volunteer-created contacts route to the Volunteer's assigned active Preacher.

#### FR-15: Offline public registration and attendance queue

The Program App shall queue public registration and public attendance actions locally when browser support and network conditions allow.

**Consequences:**
- Visitors and attendees can continue registration or attendance submission during connectivity loss.
- Queued actions show pending status.
- Sync retry preserves idempotency and audit data.
- Authenticated staff contact creation is not required to queue offline in MVP because it depends on a live staff session.

#### FR-16: Staff contact ownership routing

The Program App shall enforce current-app contact ownership rules for staff-created contacts.

**Consequences:**
- Volunteer contact creation fails closed if no assigned active Preacher is configured.
- Contacts record the collector and assigned Preacher in Airtable where applicable.
- Location is required before staff contact save completes.
- Contact comments and profile details are saved to the Program's Airtable Base.

### 4.6 Preacher Tools

**Description:** Preachers need the current-app operational tools for contact capture, scoped Session creation, live attendance monitoring, Volunteer invites, and Airtable management handoff. Advanced cohort-care, attendance trend analysis, and follow-up-note modules are not required for current-app parity. Realizes UJ-4, UJ-5, UJ-6, and UJ-8.

**Functional Requirements:**

#### FR-17: Scoped Session creation

Authorized Preachers and Admins shall be able to create an active attendance Session for the active Program.

**Consequences:**
- Staff enter Session name, allowed location, and attendance window duration.
- Preachers can create Sessions only for locations within their allowed scope.
- Session creation writes the Program Airtable Session record, enables public attendance, and stores attendance open/close times.
- The system generates and stores a Session-specific attendance URL.

#### FR-18: Live attendance monitoring

Authorized Preachers and Admins shall be able to monitor live attendance for the active Session.

**Consequences:**
- The dashboard shows the active Session name, location, QR code, attendance URL, count, and attendee list.
- The dashboard appends newly loaded Attendance Records without duplicating known records.
- Preachers see only Sessions they own or Sessions in their allowed locations.
- If no active Session exists, the interface points staff back to Sessions to start one.

### 4.7 Admin Operations

**Description:** Admins manage the current-app operational surfaces for Sessions, live attendance, staff invites, Role assignment, location access, invite auditability, and Airtable management handoff. Custom reports, export suites, and full sync-health dashboards are outside current-app parity unless implemented through Airtable Interface handoff. Realizes UJ-5, UJ-6, UJ-7, and UJ-8.

**Functional Requirements:**

#### FR-19: Program live attendance dashboard

Admins shall see the same Program live attendance dashboard available to authorized Preachers.

**Consequences:**
- Gita Life admins see Gita Life data only unless granted cross-program access.
- FOLK admins see FOLK data only unless granted cross-program access.
- Dashboards show active Session context, QR/link, attendee count, and attendee list.
- Dashboards avoid duplicate rows while polling or refreshing attendance.

#### FR-20: Session management

Admins shall be able to create and inspect Sessions for the active Program.

**Consequences:**
- Admins can create Sessions for any active Program location.
- Admins can inspect the active Session and attendance window state.
- Session records sync to the correct Airtable Base.

#### FR-21: Staff invite, role, and location management

Admins shall be able to invite staff users and manage Role-specific access details according to Airtable-backed Roles.

**Consequences:**
- Role assignment remains Program-scoped.
- Admins can invite Admin, Preacher, and Volunteer users.
- Volunteer invites require assigned Preacher ownership.
- Admin and Preacher invites support location access selection.
- Admins can add a new location inline and select it before sending the invite.
- Invite attempts are auditable through invite logs.
- The system supports users with roles in both Programs.

#### FR-22: Airtable management handoff

Authorized Admins and Preachers shall be able to open the configured Airtable management interface for deeper operational review or edits.

**Consequences:**
- The app verifies staff access before redirecting to Airtable.
- The Airtable Interface URL is derived from the active Program's Airtable Base and configured page ID.
- If the management URL is unavailable, the app shows a clear unavailable state.
- Volunteer users cannot open the management redirect.

## 5. Information Architecture and Surfaces

- **Public pages:** `/activities/gita-life`, `/activities/folk`.
- **Program subdomains:** `gitalife.hkmchennai.org`, `folk.hkmchennai.org`.
- **Program Apps:** Gita Life operations Next.js app, FOLK operations Next.js app.
- **Program Capability Profiles:** Each Program App defines which shared modules are enabled, renamed, hidden, or configured for that Program.
- **Portal routes:** Each Program App may use `/`, `/portal`, `/ops`, or equivalent host-based routes; shared route naming should be documented before implementation.
- **Public visitor/attendee surfaces:** Public Program home, Registration, Session Attendance.
- **Volunteer surfaces:** Login, Contact Capture.
- **Preacher surfaces:** Login, Contact Capture, Sessions, Live Attendance Dashboard, Volunteer Invite, Airtable Manage handoff.
- **Admin surfaces:** Login, Contact Capture, Sessions, Live Attendance Dashboard, Staff Invites, Location Access, Airtable Manage handoff.

## 6. Cross-Cutting Non-Functional Requirements

- **Security:** Airtable credentials, Supabase service keys, and privileged sync tokens must remain server-side only.
- **Authorization:** Every Program App request must resolve active Program and verify Membership/Role through the shared Supabase mirror before returning Program-scoped data.
- **Program data isolation:** Every shared Supabase table, API contract, cache key, and audit event must include Program scope where data is Program-specific; cross-program reads require explicit permission checks.
- **Performance:** Normal portal navigation and authorization checks shall use Supabase/runtime cache paths; no normal page load or auth guard may depend on a live Airtable call.
- **Reliability:** Public registration and attendance actions may queue during connectivity loss where browser support permits; role-changing actions, admin privilege checks, and sync-sensitive staff writes must fail closed when sync is stale.
- **Accessibility:** Portal UI must meet WCAG 2.2 AA expectations for contrast, focus visibility, keyboard navigation, form labels, and status messaging.
- **Mobile-first operations:** Public registration, attendance, staff contact capture, Sessions, live attendance, and invite surfaces must support 360px-wide mobile screens without horizontal scrolling or hidden primary actions.
- **Observability:** Sync jobs, auth decisions, Airtable failures, queued writes, and role changes must be logged with Program, actor, Role, action, source record where relevant, sync state, and timestamp.
- **Cross-app consistency:** Shared schemas, role semantics, audit events, and API contracts must remain consistent across both Program Apps.
- **Configurability:** Program-specific modules, labels, fields, and dashboard widgets must be configurable without requiring duplicated business logic or unsafe one-off schema forks.
- **Vercel compatibility:** New API routes in either app should remain Edge-compatible unless a Node-only dependency is intentionally introduced, documented, and verified.

## 7. Constraints and Guardrails

- The solution must use two program-specific Next.js App Router applications: one for Gita Life operations and one for FOLK operations.
- Public Program pages must remain public and content-focused.
- Existing ICVK admin surfaces must not be repurposed for Gita Life or FOLK operations.
- Airtable is the operational source of truth, but not the live authentication engine.
- One shared Supabase project/database is the identity and runtime authorization enforcement layer for both Program Apps.
- Separate Airtable Bases are required for Gita Life and FOLK.
- Users may belong to one or both Programs with different Roles.
- Both Program Apps must use the same V1 operational staff Role taxonomy: `Admin`, `Preacher`, and `Volunteer`. Gita Life must not introduce separate `Facilitator` or `Super Admin` Roles in MVP.
- Shared behavior should be maintained through shared contracts, schema conventions, and reusable components where practical; MVP should not introduce a third combined operations portal app.
- Feature-family parity means Gita Life and FOLK share common capability patterns where useful, not that every field, workflow, label, or dashboard must be identical; Program Capability Profiles must preserve Program-specific language, field sets, and workflow emphasis.
- Program Capability Profiles should be versioned and reviewed with shared schema/API changes so one Program's workflow variation does not silently break the other.
- Public page copy should say Portal, not backend/admin/operations.
- Future mobile app support must reuse the same identity and Program model.

## 8. MVP Scope

### 8.1 In Scope

- Gita Life Portal entry for staff from public page and/or Gita Life subdomain.
- FOLK Portal entry for staff from public page and/or FOLK subdomain.
- Two program-specific Next.js operations apps.
- Program-branded public home and operations landing surfaces.
- Public registration flow.
- Session-specific public attendance flow by mobile number.
- Session-backed registration handoff for unknown attendees.
- Offline queueing for public registration and attendance where browser support permits.
- Shared Supabase Auth integration for staff portal login across both apps.
- Supabase staff profile, staff membership, role, location scope, and Airtable mapping mirror.
- Airtable integration for two separate Program Bases.
- Role- and membership-aware routing for Volunteer, Preacher, and Admin staff experiences.
- Staff contact capture with duplicate prevention, collector, assigned Preacher, location, and comments.
- Session creation with location scope, attendance window, and generated attendance URL.
- Live attendance dashboard with QR/link, active Session context, count, and attendee list.
- Admin staff invite flow for Admin, Preacher, and Volunteer Roles.
- Admin location picker and inline location creation for staff invites.
- Airtable management interface handoff for authorized Admins and Preachers.
- Invite audit trail and access-change audit foundation.

### 8.2 Out of Scope for MVP

- Native mobile app release. The MVP should be web/PWA-ready.
- A single combined multi-program Next.js operations app.
- Full cross-program analytics suite.
- Advanced engagement gamification or public leaderboards.
- Replacing all Airtable interfaces immediately.
- Payment processing.
- ICVK admin migration.
- Authenticated member/participant portal home, announcements, profile self-service, or attendance history outside the public attendance flow.
- Volunteer-operated QR scanning or manual attendee search separate from the public attendance link flow.
- Seva assignment views.
- Advanced preacher care workflows, cohort analytics, attendance trend analysis, and follow-up-note modules.
- Custom report/export suite and full sync-health dashboard outside the Airtable management handoff.
- Fully automated conflict resolution for duplicate Airtable identities.

## 9. Success Metrics

**Primary**

- **SM-1:** Staff access success - at least 95 percent of invited staff users can authenticate and land in the correct Program/Role surface without admin intervention. Validates FR-4, FR-6, FR-7.
- **SM-2:** Attendance throughput - attendees can complete the normal mobile-number attendance flow in under 5 seconds after the Session attendance page loads. Validates FR-13.
- **SM-3:** Event-day readiness - authorized Preachers or Admins can start a Session, generate the attendance link/QR, and reach the live attendance dashboard in under 2 minutes. Validates FR-17, FR-18, FR-19.

**Secondary**

- **SM-4:** Registration completion - at least 90 percent of public registration submissions with valid required fields create a contact or return an already-registered state without staff intervention. Validates FR-11 and FR-12.
- **SM-5:** Admin invite usability - Admins can invite staff with Role, assigned Preacher where needed, and location access without entering raw Airtable record IDs. Validates FR-21.

**Counter-metrics**

- **SM-C1:** Do not optimize event-day speed at the cost of duplicate records, incorrect ownership, or privacy. Counterbalances SM-2 and SM-3.
- **SM-C2:** Do not increase public page friction for first-time visitors by over-promoting internal Portal features. Counterbalances FR-1.

## 10. Risks and Mitigations

- **Risk:** Airtable and Supabase staff profile mirrors drift.
  - **Mitigation:** Login-time fallback sync, staff status checks, visible failure states, and audit logs.
- **Risk:** A revoked admin retains access.
  - **Mitigation:** Program-scoped Role checks in Supabase, stale-sync fail-closed policy for admin actions, revocation tests.
- **Risk:** Same person appears separately in both Airtable Bases.
  - **Mitigation:** Supabase identity bridge with stable user ID and Airtable record mappings.
- **Risk:** Airtable API limits or outage impact event-day operations.
  - **Mitigation:** Runtime cache where safe, offline queue for public registration and attendance, clear pending states.
- **Risk:** Public attendance or registration creates duplicate or incorrectly routed records.
  - **Mitigation:** Mobile normalization, duplicate checks, session-backed registration handoff, assigned Preacher validation, and location validation.
- **Risk:** Portal visuals and behavior diverge into two unmaintainable apps.
  - **Mitigation:** Shared components, schema contracts, role semantics, and implementation conventions for branding and vocabulary.
- **Risk:** Shared Supabase schema changes break one Program App while passing in the other.
  - **Mitigation:** Version shared contracts, test auth/role flows in both apps, and treat Supabase migrations as cross-app changes.

## 11. Rollout Plan

1. **Foundation:** Establish two Program App boundaries, shared schema contracts, subdomain routing, and Portal entry patterns.
2. **Staff Identity:** Implement Supabase staff Auth, staff profiles, memberships, roles, location scope, assigned Preacher mapping, and Airtable identity mappings.
3. **Program Airtable Configuration:** Connect Gita Life and FOLK Airtable Bases with scoped credentials, table mappings, and server-only API access.
4. **Branded Public Landings:** Build Gita Life and FOLK public/entry surfaces with registration and staff Portal entry affordances.
5. **Public Registration and Attendance:** Add public registration, Session attendance by mobile number, session-backed registration handoff, and offline queueing for public writes.
6. **Staff Contact Capture:** Add staff contact capture with duplicate prevention, contact ownership, location requirement, and assigned Preacher routing.
7. **Sessions and Live Attendance:** Add Session creation, location-scoped access, attendance URL/QR generation, and live attendance dashboard.
8. **Admin Invite and Airtable Handoff:** Add Admin staff invites, Role/Preacher/location controls, inline location creation, invite audit logging, and Airtable management redirect.
9. **Stabilize:** Run access, revocation, duplicate, offline, session-window, invite, and event-day tests before broader rollout.

## 12. Deferred Implementation Decisions

These items are not blockers to PRD finalization, UX exploration, architecture, or epic generation. They must be resolved before implementation stories that depend on them are accepted.

- **DD-1: Airtable Base IDs and table structures.** Owner: Program admins and architecture. Revisit before Airtable sync architecture is approved. Blocks Airtable sync implementation.
- **DD-2: Staff registry model.** Owner: Product and architecture. Revisit while designing identity mapping. Blocks final Supabase membership schema and role sync jobs.
- **DD-3: Revocation sync window.** Owner: Product, security, and operations. Revisit before access-control stories are accepted. Blocks admin access-control acceptance criteria.
- **DD-6: Login method.** Owner: Product and architecture. Revisit before auth implementation starts. Blocks authentication UX and Supabase Auth configuration.
- **DD-7: Cross-subdomain session policy.** Owner: Architecture. Revisit with DD-6. Blocks cookie/session configuration, not the one-identity product model.
- **DD-8: Staff visibility into contact comments and profile details.** Owner: Product, program leads, and privacy/security reviewer. Revisit before contact capture and management surfaces are approved. Blocks sensitive-data permissions for contact comments and profile details.
- **DD-9: Data retention policy.** Owner: Operations, product, and legal/privacy reviewer if required. Revisit before contact, attendance, invite log, and staff profile storage go live. Blocks production launch for those data classes.
- **DD-10: Final production domains.** Owner: Operations and architecture. Revisit before deployment setup. Blocks DNS and launch communications.

## 13. Assumptions and Accepted Deferrals Index

- **Section 1:** Airtable Team will be available and maintained as the primary operational workspace for both Programs. Status: accepted for final PRD; revisit if the Airtable plan or operational ownership changes before implementation.
- **Role taxonomy:** Gita Life and FOLK use the same V1 operational staff Roles: `Admin`, `Preacher`, and `Volunteer`. Status: accepted for this PRD; member/participant remains a non-staff Program person category rather than an operational Role.
- **Section 2.3:** Current-app parity journeys are the MVP journey baseline. Status: accepted for this PRD; authenticated member portals, announcements, attendance history, seva assignment views, reports, and advanced preacher care require separate scope decisions or future PRD updates.
- **FR-7:** The allowed sync staleness threshold will be agreed before launch. Status: deferred to DD-3; admin and role-changing actions must fail closed until the threshold is defined.
- **FR-14/FR-16:** Contact comments and profile detail visibility will be defined before implementation. Status: deferred to DD-8 and DD-9; sensitive contact details must not ship without visibility and retention rules.
