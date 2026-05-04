---
stepsCompleted: [1]
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

{{requirements_coverage_map}}

## Epic List

{{epics_list}}

<!-- Repeat for each epic in epics_list (N = 1, 2, 3...) -->

## Epic {{N}}: {{epic_title_N}}

{{epic_goal_N}}

<!-- Repeat for each story (M = 1, 2, 3...) within epic N -->

### Story {{N}}.{{M}}: {{story_title_N_M}}

As a {{user_type}},
I want {{capability}},
So that {{value_benefit}}.

**Acceptance Criteria:**

<!-- for each AC on this story -->

**Given** {{precondition}}
**When** {{action}}
**Then** {{expected_outcome}}
**And** {{additional_criteria}}

<!-- End story repeat -->
