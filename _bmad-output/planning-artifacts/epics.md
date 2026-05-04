---
stepsCompleted: [1, 2]
inputDocuments:
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/nextjs-supabase-staff-auth-plan.md
  - docs/data-models.md
---

# folk_hkmc - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for folk_hkmc, decomposing the requirements from the selected Next.js/Supabase staff-auth plan, architecture decisions, and data-model context into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: The system must replace the current hardcoded `lib/auth-context.tsx` and `folk_auth` localStorage staff authentication with Supabase-backed staff authentication.

FR2: The system must protect all staff pages and staff API routes server-side using a verified Supabase user plus Airtable `Users` role/status authorization.

FR3: The system must use Supabase only as an identity bridge and audit store, with `staff_profiles` as the required bridge table and `invite_log` as the recommended invite audit table.

FR4: The system must keep Airtable as the operational source of truth for Contacts, Attendance, Sessions, Locations, Analytics, and Users business authorization.

FR5: The system must add Supabase browser, request-scoped server, service-role admin, and proxy helper modules under `lib/supabase/`.

FR6: The system must add a root `proxy.ts` that refreshes Supabase auth cookies for staff surfaces and auth callbacks while avoiding static assets.

FR7: The system must add `lib/authz.ts` to load the verified Supabase user, synchronize or load `staff_profiles`, load Airtable `Users`, require `Status = Active`, and return a typed `StaffContext`.

FR8: The `StaffContext` must include Supabase user id, email, Airtable user id, name, role, location ids, and, for volunteers, the Airtable `Assigned Preacher` relationship.

FR9: The system must add `/auth/confirm` to verify Supabase invite tokens, create cookie sessions, synchronize staff profile data, and redirect by role.

FR10: The system must add `/auth/signout` to terminate staff sessions and redirect users out of protected staff surfaces.

FR11: The invite email template must point directly to `/auth/confirm?token_hash={{ .TokenHash }}&type=invite` so the server can verify the token and establish cookies.

FR12: The system must enforce role permissions where Admin has full access, Preacher can create contacts/sessions and invite volunteers, and Volunteer can create contacts only.

FR13: Volunteers must not access the dashboard, session list, session creation, attendance dashboard reads, admin invite surfaces, or Airtable Portal links.

FR14: `POST /api/contact` must require active staff and allow Admin, Preacher, and Volunteer roles.

FR15: Contact creation must normalize mobile numbers to the last 10 digits before lookup or mutation.

FR16: Contact creation must check Airtable for an existing contact by normalized phone before creating a new record.

FR17: Contact creation must resolve `Assigned Preacher` by role: Volunteer uses Airtable `Users.Assigned Preacher`, Preacher uses the current staff Airtable user id, and Admin must provide an explicit preacher assignment.

FR18: Contact creation must write Airtable `Contacts` fields for identity/profile data, `Collected By`, resolved `Assigned Preacher`, Source where provided, and location where provided.

FR19: Volunteers must be unable to choose or override `Assigned Preacher` from browser payloads.

FR20: `POST /api/sessions` must require active Admin or Preacher staff, deny Volunteers, validate allowed location scope unless Admin, create Airtable `Sessions`, generate a public attendance URL, persist `Attendance URL`, and return the session id and URL.

FR21: `GET /api/sessions` must return all operational sessions for Admin, scoped owned or allowed-location sessions for Preacher, and 403 for Volunteer.

FR22: `POST /api/volunteers/invite` must allow Preacher and Admin to invite Volunteers, create or update the Airtable `Users` record first, call Supabase Admin invite, and write invite audit data.

FR23: Preachers must only invite Volunteer users; they must not invite Preachers or Admins.

FR24: `POST /api/admin/invite-user` must allow only Admin users to invite Admin, Preacher, or Volunteer users.

FR25: Admin-created Volunteer invites must require an assigned preacher.

FR26: `POST /attendance` must change from mobile/date-only attendance to session-linked public attendance with payload `{ mobile, sessionId }`.

FR27: Attendance submission must load the Airtable session by `sessionId`, require the session to exist, require `Public Attendance Enabled`, and enforce optional open/close time gates.

FR28: Attendance submission must find the Airtable contact by normalized phone and return a `notRegistered` result with normalized mobile and preserved `sessionId` when no contact exists.

FR29: Attendance duplicate detection must use linked `Contact + Session` rather than phone/date checks.

FR30: Attendance creation must write relational Airtable `Attendance` records linked to `Contact` and `Session`, with phone/name snapshots and `Processed? = true`.

FR31: The registration follow-up flow must preserve `sessionId` from `/attend` through `/register` and auto-submit attendance after successful contact creation when a valid session id is present.

FR32: Duplicate attendance returned after registration auto-submit must be treated as a completed outcome, not a failed registration.

FR33: The public attendance UI must redirect unknown mobiles to `/register?mobile=<mobile>&session=<sessionId>`.

FR34: `POST /api/registration` must create Airtable `Contacts` and support session-preserving registration follow-through.

FR35: When registration happens from a session attendance link, contact assignment must come from the session owner/preacher unless a stronger assignment rule is added.

FR36: The frontend must update or add `app/login/page.tsx`, `app/contact/page.tsx`, `app/dashboard/page.tsx`, `app/sessions/page.tsx`, `app/volunteers/page.tsx`, `app/attend/page.tsx`, and `app/register/page.tsx`.

FR37: Volunteer UX must be limited to Login -> Contact form -> Success.

FR38: The service worker and offline queue must preserve `sessionId` in attendance and registration payloads when those requests are queued or replayed.

FR39: Staff contact creation must not be silently queued offline unless a valid offline staff-auth strategy is explicitly implemented.

FR40: The application must remove Airtable base fallbacks and fail fast when required Airtable environment variables are missing.

FR41: Production configuration must point to Airtable base `appqea9DRLOXqErXb` and table ids for Contacts, Attendance, Sessions, Users, and Locations.

FR42: The implementation artifacts must guide a developer agent to use Supabase MCP for database migrations, advisors, type generation, and auth-related verification where applicable.

FR43: The implementation artifacts must guide a developer agent to use Vercel MCP for deployment inspection, environment/deployment verification, build/runtime log review, and production smoke support where applicable.

### NonFunctional Requirements

NFR1: Supabase must remain lean and must not duplicate Airtable operational tables for Contacts, Sessions, Attendance, Locations, or Analytics.

NFR2: `staff_profiles` and `invite_log` must be treated as server-maintained tables, not browser-queryable application data.

NFR3: Server authorization must use verified Supabase user data; `getSession()` must not be trusted as the server-side authorization check.

NFR4: Airtable `Users.Role` and `Users.Status` must remain the final business authorization source on every staff server action.

NFR5: Supabase service-role credentials must only be imported or used from server-only code.

NFR6: Authenticated pages and routes that can write cookies must be dynamic/no-store to avoid caching session-bearing responses.

NFR7: UI code must not call Airtable directly from the browser.

NFR8: Route handlers must return explicit JSON error payloads for failures.

NFR9: User-facing forms must show clear success, duplicate, offline, and error states.

NFR10: Sensitive tokens, service-role keys, Airtable API tokens, and private auth details must not be logged to the client.

NFR11: Mobile number normalization to 10 digits must remain consistent across contact, registration, attendance lookup, duplicate detection, and write paths.

NFR12: Offline/PWA behavior must remain deliberate and visible; staff-authenticated writes must not become anonymous offline writes by accident.

NFR13: Service worker functionality must run only in secure contexts in deployed environments.

NFR14: The implementation must preserve the public `/attendance` route contract where possible while extending it for session-linked attendance.

NFR15: The implementation must preserve dashboard incremental merge stability by returning stable attendance ids and display fields where dashboard reads remain.

NFR16: TypeScript strictness must be respected for new code, with typed route payloads, typed staff context, and typed Airtable record adapters.

NFR17: The app must build and deploy cleanly on the target Next.js/Vercel runtime after Supabase and Airtable environment variables are configured.

NFR18: Operational errors from Supabase, Airtable, and Vercel deployment/runtime logs must be inspectable during rollout.

### Additional Requirements

- The current application is a Next.js 16 App Router monolith using React 19, TypeScript strict mode, Tailwind CSS v4, Radix UI primitives, Airtable REST, service worker caching, and IndexedDB/localStorage offline queues.
- The currently implemented backend route is `app/attendance/route.ts`; `POST /api/registration` and `POST /api/contact` are expected by UI flows but missing or incomplete in the current repo.
- The current `lib/airtable.ts` integration writes only older Contact and Attendance subsets and must be expanded for Users, Sessions, relational Attendance, staff contact ownership, and session-linked duplicate checks.
- Required dependencies are `@supabase/supabase-js` and `@supabase/ssr`.
- Required Supabase env vars are `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
- Required site/env vars include `NEXT_PUBLIC_SITE_URL`, `AIRTABLE_API_TOKEN`, `AIRTABLE_BASE_ID`, `AIRTABLE_CONTACTS_TABLE_ID`, `AIRTABLE_ATTENDANCE_TABLE_ID`, `AIRTABLE_SESSIONS_TABLE_ID`, `AIRTABLE_USERS_TABLE_ID`, and `AIRTABLE_LOCATIONS_TABLE_ID`.
- Supabase schema creation should be performed via Supabase MCP migration tooling, followed by security/performance advisors and TypeScript type generation.
- Vercel MCP should be used to inspect project/deployment configuration and review build/runtime logs during verification when the implementation is deployed.
- Initial proxy matcher should cover `/dashboard/:path*`, `/contact/:path*`, `/sessions/:path*`, `/volunteers/:path*`, `/auth/:path*`, `/api/contact`, `/api/sessions/:path*`, `/api/volunteers/:path*`, and `/api/admin/:path*`.
- Airtable `Contacts` uses `Phone` as the main lookup key and includes `Location`, `Assigned Preacher`, `Collected By`, and read-only lookup `Visible To`.
- Airtable `Attendance` should move to relational `Contact` and `Session` links while retaining `Phone`, `Name`, and `Processed?` write fields.
- Airtable `Sessions` controls public attendance through `Public Attendance Enabled`, `Attendance Opens At`, `Attendance Closes At`, and `Attendance URL`.
- Airtable `Users` maps staff identity and authorization through `Email`, `Role`, `Status`, `Locations`, `Portal Account`, `Supabase User ID`, `Invited By`, `Assigned Preacher`, and invite audit fields.
- Airtable `Locations` provides active location scope for staff and sessions.
- `Contacts.Visible To` is currently read-only lookup data; `Sessions.Visible To` and `Attendance.Visible To` are writable collaborator fields.
- The active volunteer record observed in MCP did not include `Assigned Preacher`; volunteer contact routing is not production-safe until that relationship is populated or guarded.
- The existing browser `AuthProvider` role model is lowercase `volunteer`/`preacher`; the target Airtable/Supabase role model is `Admin`/`Preacher`/`Volunteer`.
- Existing public attendance, registration, contact, dashboard, service worker, and offline behavior should be smoke-tested after route and payload changes.

### UX Design Requirements

No separate UX Design document was included for this run. Frontend behavioral requirements are captured in FR36-FR39 and should be expanded into UI-specific story acceptance criteria during epic/story design.

### FR Coverage Map

FR1: Epic 1 - Replace local hardcoded staff auth with Supabase-backed authentication.
FR2: Epic 1 - Protect staff pages and APIs with Supabase identity plus Airtable authorization.
FR3: Epic 1 - Add Supabase bridge/audit data model for staff identity.
FR4: Epic 1 - Keep Airtable as the business authorization source during auth decisions.
FR5: Epic 1 - Add Supabase helper modules used by auth flows.
FR6: Epic 1 - Add cookie-refresh proxy coverage for staff/auth surfaces.
FR7: Epic 1 - Add centralized staff authorization helper.
FR8: Epic 1 - Return typed staff context with role, status, scope, and volunteer assignment.
FR9: Epic 1 - Add invite token confirmation route.
FR10: Epic 1 - Add staff signout route.
FR11: Epic 1 - Configure one-click Supabase invite callback behavior.
FR12: Epic 1 - Enforce Admin, Preacher, and Volunteer permissions.
FR13: Epic 1 - Deny Volunteer access to restricted staff surfaces.
FR14: Epic 2 - Require active staff for contact creation.
FR15: Epic 2 - Normalize mobile numbers consistently for contact creation.
FR16: Epic 2 - Deduplicate contacts by normalized phone.
FR17: Epic 2 - Resolve contact assigned preacher by staff role.
FR18: Epic 2 - Write required Airtable contact ownership/profile fields.
FR19: Epic 2 - Prevent volunteer assignment override.
FR20: Epic 3 - Create scoped sessions and attendance URLs for Admin/Preacher.
FR21: Epic 3 - List scoped sessions by role.
FR22: Epic 4 - Invite Volunteers through Airtable user creation plus Supabase invite.
FR23: Epic 4 - Prevent Preachers from inviting non-Volunteer staff roles.
FR24: Epic 4 - Allow Admin-only invitation of all staff roles.
FR25: Epic 4 - Require assigned preacher for admin-created Volunteer invites.
FR26: Epic 5 - Change public attendance POST payload to include session id.
FR27: Epic 5 - Validate session existence, public attendance enablement, and time gates.
FR28: Epic 5 - Preserve session context when mobile is not registered.
FR29: Epic 5 - Detect duplicates by Contact + Session.
FR30: Epic 5 - Create relational Attendance records linked to Contact and Session.
FR31: Epic 5 - Preserve session through registration and auto-submit attendance.
FR32: Epic 5 - Treat duplicate after registration auto-submit as completed.
FR33: Epic 5 - Redirect unknown mobile to session-preserving registration URL.
FR34: Epic 5 - Implement registration endpoint for Airtable Contacts.
FR35: Epic 5 - Assign session-linked registration contacts from session owner/preacher.
FR36: Epic 6 - Update required frontend pages for the new portal flows.
FR37: Epic 6 - Keep Volunteer UX constrained to contact capture.
FR38: Epic 6 - Preserve session id in offline/PWA attendance and registration payloads.
FR39: Epic 6 - Avoid silent offline queuing of staff contact writes.
FR40: Epic 6 - Fail fast when required Airtable env vars are missing.
FR41: Epic 6 - Use production Airtable base/table env configuration.
FR42: Epic 6 - Guide developer agent to use Supabase MCP for schema and verification.
FR43: Epic 6 - Guide developer agent to use Vercel MCP for deployment and runtime verification.

## Epic List

### Epic 1: Staff Authentication And Role-Gated Access
Staff can accept invites, sign in/out with Supabase, and only reach surfaces allowed by their active Airtable role.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9, FR10, FR11, FR12, FR13

### Epic 2: Staff Contact Capture And Ownership Routing
Admin, Preacher, and Volunteer users can create contacts with correct Airtable ownership, assignment, and phone normalization.
**FRs covered:** FR14, FR15, FR16, FR17, FR18, FR19

### Epic 3: Session Management For Preachers And Admins
Preachers and Admins can create/list scoped sessions and generate public attendance links.
**FRs covered:** FR20, FR21

### Epic 4: Staff Invitation And Volunteer Onboarding
Admins and Preachers can invite the right staff roles, with Airtable user records and Supabase invites kept in sync.
**FRs covered:** FR22, FR23, FR24, FR25

### Epic 5: Session-Linked Public Attendance And Registration Follow-Through
Students can mark attendance for a session, register if unknown, and complete attendance after registration.
**FRs covered:** FR26, FR27, FR28, FR29, FR30, FR31, FR32, FR33, FR34, FR35

### Epic 6: Reliable Portal Operations And Release Readiness
The portal UX, offline boundaries, env validation, Supabase MCP work, and Vercel MCP rollout checks are integrated for production use.
**FRs covered:** FR36, FR37, FR38, FR39, FR40, FR41, FR42, FR43

## Epic 1: Staff Authentication And Role-Gated Access

Staff can accept invites, sign in/out with Supabase, and only reach surfaces allowed by their active Airtable role.

### Story 1.1: Create The Supabase Staff Identity Bridge

As a staff operator,
I want Supabase to store only the staff identity bridge and invite audit data,
So that staff login can be backed by Supabase without duplicating Airtable operational data.

**Acceptance Criteria:**

**Given** the developer agent has access to the project workspace and Supabase MCP
**When** the story is implemented
**Then** the app has `@supabase/supabase-js` and `@supabase/ssr` installed
**And** `.env.example` or equivalent project docs include `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `NEXT_PUBLIC_SITE_URL`.

**Given** the Supabase project is available through MCP
**When** the developer applies a migration
**Then** `public.staff_profiles` exists with `id`, `email`, `airtable_user_id`, `name`, `role`, `status`, `last_synced_at`, `created_at`, and `updated_at`
**And** `role` is constrained to `Admin`, `Preacher`, or `Volunteer`, while `status` is constrained to `Active` or `Inactive`.

**Given** invite auditing is part of the rollout
**When** the migration is applied
**Then** `public.invite_log` exists with invitee email, Airtable user id, inviter id, invitee role, status, error message, and invite lifecycle timestamps
**And** it does not store Contacts, Sessions, Attendance, Locations, or Analytics data.

**Given** the migration has completed
**When** Supabase MCP verification runs
**Then** Supabase advisors are checked for security and performance findings
**And** generated TypeScript types are available for application code or recorded as an implementation artifact.

### Story 1.2: Add Supabase SSR Clients And Cookie Proxy

As a staff user,
I want my Supabase session to be maintained by secure cookies,
So that staff pages can verify my identity server-side.

**Acceptance Criteria:**

**Given** the Supabase dependencies and env vars exist
**When** the story is implemented
**Then** the repository includes `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/admin.ts`, and `lib/supabase/proxy.ts`
**And** each helper has a typed, focused responsibility matching browser, request-scoped server, service-role admin, and cookie refresh use cases.

**Given** service-role access is required for invites
**When** code imports `lib/supabase/admin.ts`
**Then** that import is server-only
**And** no client component or browser bundle can import the service-role helper.

**Given** a staff route or auth callback is requested
**When** root `proxy.ts` runs
**Then** Supabase auth cookies are refreshed for `/dashboard/:path*`, `/contact/:path*`, `/sessions/:path*`, `/volunteers/:path*`, `/auth/:path*`, `/api/contact`, `/api/sessions/:path*`, `/api/volunteers/:path*`, and `/api/admin/:path*`
**And** static assets and unrelated public routes are not matched.

**Given** authenticated responses can contain session-bearing cookies
**When** staff pages or route handlers use Supabase server auth
**Then** they opt into dynamic/no-store behavior where needed
**And** session-bearing responses are not cached as static output.

### Story 1.3: Resolve Staff Authorization From Supabase And Airtable

As a staff user,
I want the app to check both my Supabase identity and current Airtable role/status,
So that access changes in Airtable take effect immediately in the portal.

**Acceptance Criteria:**

**Given** a request reaches protected staff code
**When** `lib/authz.ts` resolves the staff context
**Then** it reads the verified Supabase user from the request-scoped Supabase server client
**And** it does not use `getSession()` as the server-side authorization check.

**Given** the Supabase user has an email
**When** no matching `staff_profiles` row exists or the row is stale
**Then** the helper matches the email to Airtable `Users.Email`
**And** it upserts `staff_profiles` with Supabase user id, email, Airtable user id, name, role, status, and sync timestamp.

**Given** Airtable returns a staff user
**When** the user's Airtable `Status` is not `Active`
**Then** authorization fails with a clear typed result or thrown auth error
**And** no staff route proceeds with stale Supabase-only access.

**Given** authorization succeeds
**When** `StaffContext` is returned
**Then** it includes `supabaseUserId`, `email`, `airtableUserId`, `name`, `role`, `locationIds`, and optional `assignedPreacherAirtableUserId`
**And** volunteer `assignedPreacherAirtableUserId` comes only from Airtable `Users.Assigned Preacher`.

**Given** code needs role checks
**When** protected routes call shared helpers
**Then** Admin, Preacher, and Volunteer permissions are enforced consistently
**And** UI payloads cannot elevate role, status, location scope, or assigned preacher.

### Story 1.4: Accept Invites And Sign Out Staff

As an invited staff member,
I want one invite link to establish my staff session,
So that I can land directly in the portal area allowed by my role.

**Acceptance Criteria:**

**Given** Supabase sends an invite email
**When** the template is configured
**Then** the invite link points to `/auth/confirm?token_hash={{ .TokenHash }}&type=invite`
**And** no separate human confirmation screen is required in the default path.

**Given** a staff member opens `/auth/confirm` with `token_hash` and `type=invite`
**When** the route verifies the token through Supabase
**Then** a cookie-backed Supabase session is created
**And** `staff_profiles` is synchronized by matching email to Airtable `Users.Email`.

**Given** the invite token is missing, invalid, expired, or has an unsupported type
**When** `/auth/confirm` handles the request
**Then** the route returns or redirects to a clear auth error state
**And** no staff session is created.

**Given** staff profile sync succeeds
**When** the staff role is Admin or Preacher
**Then** the user is redirected to `/dashboard` or a validated safe `next` path
**And** a Volunteer is redirected to `/contact`.

**Given** a signed-in staff user requests `/auth/signout`
**When** the route executes
**Then** the Supabase session cookies are cleared
**And** the user is redirected away from protected staff pages.

### Story 1.5: Replace Local Staff Auth And Protect Staff Surfaces

As a portal maintainer,
I want staff access to stop depending on hardcoded browser credentials,
So that protected staff workflows are enforced by server-side authorization.

**Acceptance Criteria:**

**Given** the existing app uses `lib/auth-context.tsx` and localStorage key `folk_auth`
**When** the story is complete
**Then** protected staff access no longer depends on hardcoded `volunteer` or `preacher` users
**And** no protected staff flow treats `folk_auth` as proof of authorization.

**Given** staff pages render
**When** Admin or Preacher staff with active Airtable status visits `/dashboard`
**Then** the page is accessible
**And** an active Volunteer is redirected or denied with an appropriate message.

**Given** a Volunteer is signed in
**When** they request dashboard, sessions, volunteers, admin, or attendance dashboard routes
**Then** the server denies access
**And** no restricted data is returned to the browser.

**Given** the login page is updated
**When** staff need to enter the portal after invitation
**Then** the UI supports the Supabase-backed flow chosen for the rollout
**And** the page does not expose hardcoded credentials or role-switching controls.

**Given** TypeScript and build checks run
**When** the auth migration is complete
**Then** auth-related code is typed under strict TypeScript
**And** no secret values are logged to client output.

## Epic 2: Staff Contact Capture And Ownership Routing

Admin, Preacher, and Volunteer users can create contacts with correct Airtable ownership, assignment, and phone normalization.

### Story 2.1: Add Airtable Staff And Contact Adapters

As a staff user,
I want contact lookup and write behavior to use the live Airtable schema,
So that contact capture works with the operational data model.

**Acceptance Criteria:**

**Given** the live Airtable base uses env-provided table ids
**When** Airtable helpers are updated
**Then** required base and table ids are read from environment variables
**And** Contacts and Users helpers do not rely on stale fallback base ids.

**Given** a phone value is received
**When** contact helpers normalize it
**Then** non-digits are removed and the last 10 digits are used
**And** invalid phone values return a typed validation failure before Airtable mutation.

**Given** a normalized phone exists in Airtable Contacts
**When** the lookup helper runs
**Then** it can return the matching contact record id and key fields
**And** duplicate lookup behavior is reusable by registration, contact creation, and attendance.

**Given** staff authorization needs Airtable user data
**When** user helpers load by email or record id
**Then** they return role, status, location ids, portal account, invited-by, and assigned-preacher relationships as typed values
**And** missing required relationships are surfaced as explicit errors.

### Story 2.2: Implement Authenticated Contact Creation

As a staff member,
I want to create contacts from the portal,
So that new people are captured in Airtable with correct ownership.

**Acceptance Criteria:**

**Given** an active Admin, Preacher, or Volunteer is signed in
**When** `POST /api/contact` receives a valid contact payload
**Then** the route authorizes the staff context server-side
**And** it accepts only fields the server is prepared to write to Airtable.

**Given** the submitted phone already matches an Airtable Contact
**When** `POST /api/contact` runs
**Then** the route returns a duplicate or existing-contact response without creating another contact
**And** the response is safe for Volunteer users to see.

**Given** a Volunteer creates a contact
**When** assignment is resolved
**Then** `Assigned Preacher` comes from the Volunteer user's Airtable `Assigned Preacher`
**And** any browser-provided assigned preacher value is ignored.

**Given** a Preacher creates a contact
**When** assignment is resolved
**Then** `Assigned Preacher` is the current Preacher's Airtable user id
**And** `Collected By` is also the current staff Airtable user id.

**Given** an Admin creates a contact
**When** no explicit assigned preacher is provided
**Then** the request is rejected with a clear validation error
**And** no Airtable contact is created.

**Given** a contact is valid
**When** the route writes Airtable Contacts
**Then** it writes `Name`, `Phone`, `Age`, `Year` or current status as applicable, `Location`, `Source`, `Collected By`, and resolved `Assigned Preacher`
**And** it does not try to write read-only `Contacts.Visible To`.

### Story 2.3: Update Contact Form For Role-Safe Capture

As a staff member,
I want the contact form to reflect what my role is allowed to submit,
So that I can capture contacts without accidentally assigning them incorrectly.

**Acceptance Criteria:**

**Given** an active Volunteer opens `/contact`
**When** the form renders
**Then** the Volunteer can enter contact identity/profile fields
**And** no assigned preacher selector, dashboard link, session link, or portal link is shown.

**Given** an active Preacher opens `/contact`
**When** the form renders
**Then** the Preacher can create contacts assigned to themselves
**And** the UI does not imply they can assign the contact to another preacher.

**Given** an active Admin opens `/contact`
**When** the form renders
**Then** the Admin can provide the required assigned preacher value
**And** the form validates that value before submit.

**Given** `POST /api/contact` succeeds, duplicates, or fails
**When** the client receives the response
**Then** it shows a clear success, duplicate, or error state
**And** it does not expose Airtable internals or private staff details to Volunteers.

## Epic 3: Session Management For Preachers And Admins

Preachers and Admins can create/list scoped sessions and generate public attendance links.

### Story 3.1: Create Sessions With Public Attendance Links

As a Preacher or Admin,
I want to create an operational session with a public attendance URL,
So that students can mark attendance for the correct session.

**Acceptance Criteria:**

**Given** an active Admin or Preacher submits a session creation request
**When** `POST /api/sessions` handles the payload
**Then** the route authorizes the staff context
**And** it rejects Volunteers with 403.

**Given** the staff user is a Preacher
**When** a location is selected
**Then** the route verifies the location is in the Preacher's allowed Airtable location scope
**And** the request is rejected if the location is outside scope.

**Given** the staff user is an Admin
**When** a location is selected
**Then** the route allows any active Airtable Location
**And** still validates that the location record exists.

**Given** the session payload is valid
**When** the route writes Airtable Sessions
**Then** it writes `Name`, `Session Date`, `Preacher`, `Location`, `Public Attendance Enabled`, `Attendance Opens At`, and `Attendance Closes At`
**And** the owner/preacher comes from server staff context, not browser payload.

**Given** Airtable returns the created session record id
**When** the route generates the attendance URL
**Then** it creates `/attend?session=<session record id>` using the configured public site URL
**And** persists that value to Airtable `Sessions.Attendance URL`.

### Story 3.2: List Sessions By Role Scope

As a Preacher or Admin,
I want to view only the sessions I am allowed to operate,
So that session management stays aligned with Airtable ownership and location rules.

**Acceptance Criteria:**

**Given** an active Admin requests `GET /api/sessions`
**When** the route loads sessions
**Then** it returns all operational sessions needed for admin management
**And** results include session id, name, date, location, owner/preacher, status, public attendance enabled state, and attendance URL.

**Given** an active Preacher requests `GET /api/sessions`
**When** the route loads sessions
**Then** it returns owned sessions or sessions within allowed locations according to the approved scope rule
**And** it does not return unrelated sessions.

**Given** an active Volunteer requests `GET /api/sessions`
**When** the route authorizes the request
**Then** it returns 403
**And** no session records are returned.

**Given** Airtable returns sessions with missing optional fields
**When** the route maps the response
**Then** the API returns stable typed JSON with safe null or empty values
**And** client rendering does not crash.

### Story 3.3: Build Session Management UI And QR Display

As a Preacher or Admin,
I want a sessions page with the current session URL and QR code,
So that I can share the right attendance link during a class or program.

**Acceptance Criteria:**

**Given** an active Preacher or Admin opens `/sessions`
**When** the page loads
**Then** it lists sessions returned by `GET /api/sessions`
**And** Volunteers cannot access the page.

**Given** a Preacher or Admin creates a session
**When** the create form submits successfully
**Then** the new session appears in the list
**And** the UI shows the generated `/attend?session=<session id>` URL.

**Given** a session has an attendance URL
**When** the session detail or list item renders
**Then** the QR code encodes that session-specific URL
**And** it does not fall back to the old generic `/attend` URL.

**Given** public attendance is disabled or outside the open/close window
**When** the session appears in the UI
**Then** the page clearly indicates that attendance is not currently open
**And** the QR/link state matches the server's enforcement behavior.

## Epic 4: Staff Invitation And Volunteer Onboarding

Admins and Preachers can invite the right staff roles, with Airtable user records and Supabase invites kept in sync.

### Story 4.1: Let Preachers Invite Volunteers

As a Preacher,
I want to invite Volunteers assigned to me,
So that they can help capture contacts without accessing restricted portal areas.

**Acceptance Criteria:**

**Given** an active Preacher submits `POST /api/volunteers/invite`
**When** the request payload contains volunteer name and email
**Then** the route authorizes the Preacher
**And** it rejects any requested invitee role other than `Volunteer`.

**Given** the invite is valid
**When** Airtable `Users` is created or updated
**Then** the record has `Role = Volunteer`, `Status = Active`, `Invited By` set to the current Preacher, and `Assigned Preacher` set to the current Preacher
**And** `Portal Account` is left empty unless explicitly managed outside this app.

**Given** the Airtable user record exists
**When** Supabase Admin invite is called
**Then** one invite email is sent to the volunteer email
**And** invite acceptance redirects the Volunteer to `/contact`.

**Given** the invite succeeds or fails
**When** the route completes
**Then** `invite_log` records the email, Airtable user id, inviter, role, status, and any error message
**And** the response contains a safe operator-facing result.

### Story 4.2: Let Admins Invite Any Staff Role

As an Admin,
I want to invite Admins, Preachers, and Volunteers,
So that I can manage staff access centrally.

**Acceptance Criteria:**

**Given** an active Admin submits `POST /api/admin/invite-user`
**When** the request includes a valid role of Admin, Preacher, or Volunteer
**Then** the route authorizes the Admin
**And** it denies Preacher and Volunteer callers.

**Given** the Admin invites a Volunteer
**When** no assigned preacher is provided
**Then** the route rejects the request with a validation error
**And** no Airtable user or Supabase invite is created.

**Given** the Admin invite payload is valid
**When** Airtable `Users` is created or updated
**Then** Role, Status, Invited By, Locations where provided, and Assigned Preacher for Volunteers are written correctly
**And** browser-provided values are validated against Airtable records before write.

**Given** Airtable user creation succeeds
**When** Supabase Admin invite is called
**Then** the invite is sent to the target email
**And** invite audit is written to `invite_log`.

### Story 4.3: Build Invitation UI With Role Guardrails

As an Admin or Preacher,
I want invite screens that only show actions my role can perform,
So that staff onboarding stays simple and safe.

**Acceptance Criteria:**

**Given** an active Preacher opens `/volunteers`
**When** the page renders
**Then** it shows only the Volunteer invite form
**And** it does not show controls for inviting Preachers or Admins.

**Given** an active Admin opens the admin invite surface
**When** the page renders
**Then** it supports inviting Admin, Preacher, and Volunteer users
**And** it requires assigned preacher selection when the selected role is Volunteer.

**Given** a Volunteer opens any invitation URL
**When** the server authorizes the page
**Then** access is denied
**And** no invitation form is rendered.

**Given** an invite request succeeds, partially fails, or fails
**When** the UI receives the response
**Then** it displays a clear status message
**And** it does not expose Supabase service-role or Airtable API details.

## Epic 5: Session-Linked Public Attendance And Registration Follow-Through

Students can mark attendance for a session, register if unknown, and complete attendance after registration.

### Story 5.1: Validate Session Context On Public Attendance

As a student,
I want an attendance link to apply only to the intended session,
So that my attendance is recorded in the correct class or program.

**Acceptance Criteria:**

**Given** a student opens `/attend?session=<session id>`
**When** the page loads
**Then** the client preserves the session id for form submission
**And** the form can still look like the current attendance form with optional session context displayed.

**Given** `POST /attendance` receives `{ mobile, sessionId }`
**When** the route validates the request
**Then** it requires a valid normalized 10-digit mobile number
**And** it requires a valid Airtable session id.

**Given** the session id does not exist
**When** attendance is submitted
**Then** the route returns a clear invalid-session error
**And** no contact lookup or attendance write occurs.

**Given** the session exists
**When** `Public Attendance Enabled` is false
**Then** the route rejects attendance
**And** no Attendance record is created.

**Given** the session has open or close timestamps
**When** attendance is submitted outside the allowed time window
**Then** the route rejects attendance with a clear closed/not-open response
**And** the client can display that state.

### Story 5.2: Write Relational Attendance And Detect Duplicates By Contact And Session

As a student,
I want one successful attendance record per session,
So that duplicate submissions do not distort session attendance.

**Acceptance Criteria:**

**Given** a valid session and normalized mobile
**When** the route looks up Airtable Contacts
**Then** it finds the contact by normalized phone
**And** it returns `notRegistered = true`, normalized mobile, and preserved `sessionId` when no contact exists.

**Given** a matching Contact exists
**When** duplicate detection runs
**Then** it checks for existing Attendance linked to the same Contact and Session
**And** it does not rely on phone/date-only duplicate logic.

**Given** no duplicate exists
**When** attendance is created
**Then** the Airtable Attendance record links `Contact` and `Session`
**And** it writes `Phone`, `Name`, and `Processed? = true`.

**Given** a duplicate exists
**When** attendance is submitted again
**Then** the route returns a duplicate/completed response with safe display data
**And** no new Attendance record is created.

**Given** dashboard reads continue to use attendance data
**When** the route maps attendance results
**Then** stable `id`, `mobile`, `userName`, and `createdAt` or equivalent display fields are preserved for incremental UI merging.

### Story 5.3: Preserve Session When Redirecting Unknown Mobiles To Registration

As an unregistered student,
I want the registration page to remember the session I came from,
So that attendance can be completed after I register.

**Acceptance Criteria:**

**Given** `/attendance` returns `notRegistered = true`
**When** the attendance form handles the response
**Then** it redirects to `/register?mobile=<normalized mobile>&session=<sessionId>`
**And** the session query parameter is not dropped.

**Given** `/register` opens with `mobile` and `session`
**When** the registration form renders
**Then** the mobile field is pre-filled from the query string
**And** the session id is retained in component state or form submission context.

**Given** the attendance page is opened without `session`
**When** the user submits attendance
**Then** the app follows a deliberate fallback policy documented in the story implementation
**And** the server does not create session-linked attendance without a session id.

**Given** the session id is malformed or no longer valid
**When** registration follow-through is attempted
**Then** the UI shows a clear error or non-session registration state
**And** it does not auto-submit attendance against an invalid session.

### Story 5.4: Implement Session-Aware Public Registration

As an unregistered student,
I want to register from an attendance link,
So that my contact record is created and associated with the session owner rule.

**Acceptance Criteria:**

**Given** `POST /api/registration` receives a valid public registration payload
**When** the route handles the request
**Then** it normalizes mobile to the last 10 digits
**And** it checks for an existing Airtable Contact before creating a new one.

**Given** the registration payload contains a valid session id
**When** contact assignment is resolved
**Then** the assigned preacher comes from the linked Airtable Session owner/preacher
**And** the browser cannot override that assignment.

**Given** the registration payload does not contain a session id
**When** contact assignment is resolved
**Then** the route follows the existing or explicitly documented non-session registration policy
**And** it does not invent a staff owner without a rule.

**Given** a new contact is valid
**When** Airtable Contacts is written
**Then** the route writes profile fields supported by the current form and live schema
**And** it links `Assigned Preacher`, `Location`, and other allowed fields where the rule provides them.

**Given** the contact already exists
**When** registration is submitted
**Then** the route returns an existing-contact response
**And** the client can still continue to attendance auto-submit when a valid session id exists.

### Story 5.5: Auto-Submit Attendance After Registration

As a newly registered student,
I want attendance to complete automatically after registration,
So that I do not have to re-enter my mobile number.

**Acceptance Criteria:**

**Given** registration succeeds with a preserved valid session id
**When** the client receives the success response
**Then** it automatically posts `/attendance` with `{ mobile, sessionId }`
**And** it shows a final attendance success state when the post succeeds.

**Given** registration succeeds but attendance auto-submit returns duplicate
**When** the client handles the duplicate response
**Then** it treats the flow as completed
**And** it does not show the registration as failed.

**Given** registration succeeds but attendance auto-submit fails for session closed, invalid session, or server error
**When** the client handles the response
**Then** it shows a clear follow-up message
**And** it does not create another contact.

**Given** the service worker queues public registration or attendance
**When** queued requests are replayed
**Then** the replay payload preserves `sessionId`
**And** replayed duplicate attendance is handled as a completed outcome.

## Epic 6: Reliable Portal Operations And Release Readiness

The portal UX, offline boundaries, env validation, Supabase MCP work, and Vercel MCP rollout checks are integrated for production use.

### Story 6.1: Integrate Portal Pages Around Role-Specific Journeys

As a staff user,
I want the portal pages to guide me only through actions my role can perform,
So that the app feels clear and operationally safe.

**Acceptance Criteria:**

**Given** the auth and API stories are complete
**When** `app/login/page.tsx`, `app/contact/page.tsx`, `app/dashboard/page.tsx`, `app/sessions/page.tsx`, `app/volunteers/page.tsx`, `app/attend/page.tsx`, and `app/register/page.tsx` are reviewed
**Then** each page points to the new Supabase/Airtable-backed flow
**And** stale local-auth assumptions are removed.

**Given** an active Volunteer signs in
**When** they navigate through the app
**Then** their visible journey is Login -> Contact form -> Success
**And** dashboard, session, volunteer invite, admin invite, and portal links are absent or server-denied.

**Given** an active Preacher signs in
**When** they use the portal
**Then** they can reach contact capture, session management, dashboard, and volunteer invite surfaces
**And** they cannot reach Admin-only invite controls.

**Given** an active Admin signs in
**When** they use the portal
**Then** they can reach all required staff surfaces
**And** pages still defer final data access to server authorization.

### Story 6.2: Update Offline And PWA Behavior For New Payloads

As a field operator or student,
I want offline behavior to preserve the right request context,
So that queued submissions replay safely when connectivity returns.

**Acceptance Criteria:**

**Given** the service worker intercepts public attendance requests
**When** `POST /attendance` is queued
**Then** the stored body preserves `mobile` and `sessionId`
**And** replay posts the same shape expected by the new attendance route.

**Given** public registration is queued
**When** the request includes session context
**Then** the queued body preserves the session id
**And** replay can continue registration follow-through safely.

**Given** a staff contact creation request is attempted offline
**When** no explicit offline staff-auth strategy exists
**Then** the app does not silently queue the write as an anonymous request
**And** the user sees a clear online-required message.

**Given** offline handling is updated
**When** manual smoke tests run
**Then** online, offline queued, replay success, duplicate replay, and server-error states are visible and understandable.

### Story 6.3: Fail Fast On Required Airtable And Site Configuration

As a deployer,
I want missing production configuration to fail loudly,
So that the portal never writes to the wrong Airtable base or generates broken attendance links.

**Acceptance Criteria:**

**Given** the app starts in a server runtime
**When** required Airtable env vars are missing
**Then** server code fails fast with an actionable error
**And** it does not silently fall back to any legacy Airtable base.

**Given** production env is configured
**When** Airtable helpers initialize
**Then** they use `AIRTABLE_BASE_ID=appqea9DRLOXqErXb`
**And** Contacts, Attendance, Sessions, Users, and Locations table ids come from env.

**Given** session attendance URLs are generated
**When** `NEXT_PUBLIC_SITE_URL` is missing or malformed
**Then** session creation fails with a clear configuration error
**And** it does not persist a bad `Attendance URL`.

**Given** configuration errors occur
**When** they are logged
**Then** logs omit Airtable tokens, Supabase service-role keys, and private session values
**And** operators still get enough context to fix the env.

### Story 6.4: Verify Supabase Schema And Auth Health With MCP

As a developer agent,
I want a repeatable Supabase MCP verification path,
So that database/auth changes are checked before release.

**Acceptance Criteria:**

**Given** Supabase migrations have been applied
**When** the developer uses Supabase MCP
**Then** the migration list confirms the staff bridge migration was applied
**And** table inspection confirms `staff_profiles` and `invite_log` exist with expected constraints.

**Given** schema changes are complete
**When** Supabase MCP security advisors run
**Then** findings are recorded in the implementation artifact or story notes
**And** critical findings are resolved or explicitly accepted before release.

**Given** schema changes are complete
**When** Supabase MCP performance advisors run
**Then** relevant findings are recorded
**And** missing indexes or constraints that affect staff lookup/invite flows are addressed or documented.

**Given** application code needs typed Supabase rows
**When** Supabase MCP type generation runs
**Then** generated TypeScript types are captured or integrated according to the repo pattern
**And** application code uses typed rows where practical.

### Story 6.5: Verify Deployment And Runtime Behavior With Vercel MCP

As a developer agent,
I want Vercel deployment and runtime checks tied to the rollout,
So that production issues can be caught quickly.

**Acceptance Criteria:**

**Given** the implementation is ready for deployment
**When** the developer uses Vercel MCP
**Then** the relevant project and deployment are identified
**And** build logs are reviewed for Next.js, TypeScript, environment, and Supabase/Airtable integration failures.

**Given** a preview or production deployment is available
**When** runtime logs are inspected through Vercel MCP
**Then** auth callback, contact creation, session creation, invite, attendance, and registration errors are checked
**And** sensitive values are not present in logs.

**Given** deployment verification is performed
**When** smoke tests run
**Then** one Admin, one Preacher, and one Volunteer path are tested
**And** inactive/unknown staff denial is tested where data is available.

**Given** public attendance is deployed
**When** a session-specific attendance URL is opened
**Then** the QR URL resolves to `/attend?session=<session id>`
**And** attendance, unknown-mobile registration, auto-submit, and duplicate handling are verified.

**Given** rollout findings are collected
**When** the story is completed
**Then** unresolved Vercel/Supabase/Airtable issues are recorded with owner and severity
**And** release readiness is explicitly stated.
