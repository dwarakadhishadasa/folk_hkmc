---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/project-context.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/nextjs-supabase-staff-auth-plan.md
  - _bmad-output/implementation-artifacts/deferred-work.md
  - _bmad-output/implementation-artifacts/spec-all-epics-staff-auth-attendance.md
  - _bmad-output/implementation-artifacts/spec-contact-fast-entry-feedback.md
  - _bmad-output/implementation-artifacts/spec-default-contact-creation-metadata.md
  - _bmad-output/implementation-artifacts/spec-fix-live-dashboard-session-attendance-fetch.md
  - _bmad-output/implementation-artifacts/spec-link-sessions-to-analytics.md
  - _bmad-output/implementation-artifacts/spec-preacher-admin-airtable-interface.md
  - _bmad-output/implementation-artifacts/spec-preacher-scoped-contact-location.md
  - _bmad-output/implementation-artifacts/spec-remove-dashboard-tab.md
  - _bmad-output/implementation-artifacts/spec-show-session-name-live-attendance.md
  - _bmad-output/implementation-artifacts/spec-staff-only-pwa-install-prompt.md
  - app/
  - components/
  - lib/
  - public/sw.js
status: "complete"
completedAt: "2026-05-07"
project_name: "folk_hkmc"
user_name: "Dwaraka"
date: "2026-05-07"
---

# folk_hkmc - Performance Responsiveness Epic Breakdown

## Overview

This document provides a focused epic and story breakdown for improving perceived responsiveness in the current implemented `folk_hkmc` Next.js application. It uses the older planning documents as baseline context, but treats the current code and newer implementation artifacts as the fresher source of truth.

## Requirements Inventory

### Functional Requirements

FR1: Normal staff page authorization must stop calling Airtable on every page load and must read the existing Supabase `staff_profiles` bridge for the hot path.

FR2: Staff profile synchronization from Airtable must remain available for login, invite confirmation, explicit refresh, and administrative changes, but must be removed from routine `getStaffContext()` reads.

FR3: If Airtable staff lookup caching is added around `findStaffUserByEmail()` or `findStaffUserById()`, it must be a short backup cache of 30-60 seconds and must not become the normal page authorization mechanism.

FR4: Protected pages that already resolve staff context server-side must avoid immediately duplicating the same staff fetch through the global client `/api/auth/me` hydration path.

FR5: The authenticated header and staff-only PWA prompt must still render correct role-aware state after the duplicate `/api/auth/me` hot-path work is removed or seeded.

FR6: Airtable `Locations` reads must be cached for 20 minutes for server-side reference-data usage.

FR7: Airtable active Preacher reads must be cached for 20 minutes for server-side reference-data usage.

FR8: Cache behavior must preserve Airtable as the source of truth and must never cache writes, duplicate contact checks, attendance duplicate checks, attendance writes, contact writes, registration writes, or invite writes.

FR9: Cache invalidation or bypass paths must be available for code paths that mutate related data or require freshest data during administrative operations.

FR10: Session-backed registration must complete contact creation and attendance marking through a single browser-facing API request instead of requiring the browser to call `/api/registration` and then `/attendance`.

FR11: The combined registration-attendance path must remain idempotent: retries must find an existing contact and complete or report attendance without creating duplicates.

FR12: Session-backed registration must still use the linked session preacher and location for new contact assignment.

FR13: Attendance submission must reduce redundant Airtable session and attendance reads while preserving session gates, scope checks, duplicate detection by Contact plus Session, and stable dashboard response shapes.

FR14: Live dashboard session attendance polling must avoid fetching or processing more Airtable records than needed to show newly created attendance rows.

FR15: One-second UI timers in live dashboard and sessions manager must be replaced with deadline-based or lower-frequency state changes where second-level precision is not user-visible.

FR16: Service-worker pending-count checks must stop polling every 5 seconds globally and instead update on meaningful events such as app load, online, visibility change, queued request, and manual sync.

FR17: Public attendance and registration offline behavior must continue to queue supported requests and show clear queued states after timer and API-flow changes.

FR18: The application must keep current role boundaries intact: Volunteers can create contacts only, Preachers and Admins can manage sessions and dashboard reads, and Admins retain full scoped access.

FR19: The performance changes must be delivered without moving Airtable secrets into client code or allowing browser code to call Airtable directly.

FR20: Developer verification must include `pnpm exec tsc --noEmit`, `pnpm build`, and manual smoke tests for login, `/contact`, `/sessions`, `/attend`, session-backed `/register`, live dashboard refresh, and offline queue behavior.

### NonFunctional Requirements

NFR1: Responsiveness improvements must reduce user-visible waiting on protected page loads and session-backed registration without weakening authorization.

NFR2: Staff authorization freshness must favor security over long caching; normal page loads should use Supabase `staff_profiles`, while Airtable staff status changes may require explicit sync or short-cache expiry.

NFR3: Reference-data caches for `Locations` and active Preachers must use a 20-minute TTL and must be implemented server-side through Next.js caching or an equivalent server-only cache.

NFR4: Cached data must not include secrets and must not be exposed to unauthenticated browser code.

NFR5: Attendance and registration writes must remain safe to retry and must continue to prevent duplicates.

NFR6: Timer reductions must not make the live dashboard stale beyond the existing 20-second attendance polling behavior.

NFR7: Offline/PWA behavior must remain deliberate and visible; staff contact writes must remain online-only.

NFR8: TypeScript strictness must be maintained for new server helpers, cache wrappers, and route payloads.

NFR9: The implementation must preserve current route contracts where possible, especially `/attendance` for public attendance and dashboard reads.

NFR10: The implementation must not overwrite or regress completed features captured in the implementation artifacts, including scoped contact locations, analytics links, staff-only PWA prompt, Manage tab behavior, and fast contact entry feedback.

### Additional Requirements

- The current implemented app uses Supabase staff authentication and Airtable-backed authorization through `lib/authz.ts`, not the older local-only auth baseline.
- The current `getStaffContext()` still calls Supabase `auth.getUser()`, Airtable staff lookup by email, and Supabase `staff_profiles.upsert()` during normal reads.
- The global `AuthProvider` calls `/api/auth/me` from a client effect on every app load, which duplicates server-side staff authorization work on protected pages.
- The proxy refreshes Supabase auth cookies on staff/auth/API matcher paths; this should remain cookie-maintenance only, not the final business authorization layer.
- `lib/airtable.ts` centralizes Airtable access and currently forces `cache: "no-store"` in `airtableFetch()`.
- Reference data used by contact pages and session pages includes `listLocations()` and `listActivePreachers()`.
- Staff contact creation must continue to enforce scoped `locationId` server-side, as captured in `spec-preacher-scoped-contact-location.md`.
- Current session attendance reads use the session inverse `Attendance Records` links and exact Airtable record-id lookups, as captured in `spec-fix-live-dashboard-session-attendance-fetch.md`.
- Registration from an attendance session currently posts to `/api/registration`, then the browser calls `/attendance` to complete attendance.
- `LiveAttendanceDashboard` and `SessionsManager` currently update local time once per second.
- `OfflineIndicator` currently polls the service worker pending count every 5 seconds globally.
- `pnpm lint` remains blocked until ESLint is added or the lint script is corrected.

### UX Design Requirements

UX-DR1: Staff-facing pages must show the same or faster visible readiness after auth changes; any loading state that remains must be brief and purposeful.

UX-DR2: Session-backed registration must still end in one clear success state: registration complete and attendance marked, with duplicate attendance treated as a completed outcome.

UX-DR3: Offline queued states for public attendance and registration must remain understandable after the single-call registration-attendance change.

UX-DR4: Live attendance must continue to feel live through the existing attendance polling behavior, even if countdown/timer state stops updating every second.

UX-DR5: Staff contact and session management screens must retain their current role-specific navigation and scoped form controls after auth/caching changes.

## Architecture Decisions

### ADR-PR-001: Staff Auth Hot Path Uses Supabase Profiles

**Decision:** Normal page authorization must read Supabase `staff_profiles` after verifying the Supabase user, while Airtable staff synchronization remains reserved for login, invite confirmation, explicit refresh, and administrative sync paths.

**Rationale:** This removes Airtable latency from protected page loads without replacing business authorization with a risky long-lived Airtable staff cache. Airtable remains the source of truth at sync boundaries.

**Story impact:** Epic 1 stories must separate hot-path `getStaffContext()` behavior from Airtable-backed synchronization helpers.

### ADR-PR-002: Cache Stable Airtable Reference Data Only

**Decision:** Cache server-side `Locations` and active Preacher reference reads for 20 minutes. Do not cache writes, duplicate checks, contact lookups, attendance checks, invite operations, or live attendance reads.

**Rationale:** Locations and active Preachers change infrequently enough to improve perceived speed safely. Transactional and duplicate-sensitive operations must remain fresh.

**Story impact:** Epic 2 stories must introduce explicit cached helpers and uncached/bypass variants.

### ADR-PR-003: Extend Registration For Session Attendance Completion

**Decision:** Extend `/api/registration` so session-backed registration also completes attendance server-side instead of adding a second browser-facing attendance request.

**Rationale:** This preserves the existing route surface while removing one mobile browser round trip. Airtable operations remain separate internally, so the implementation must be retry-safe and idempotent.

**Story impact:** Epic 3 stories must require find-existing-contact, find-existing-attendance, and create-only-missing behavior.

### ADR-PR-004: Preserve Live Attendance Polling, Reduce Surrounding Work

**Decision:** Keep existing 20-second live attendance polling, but reduce redundant Airtable reads and unrelated one-second UI timers.

**Rationale:** The current freshness model is acceptable. The responsiveness issue is extra repeated work around the poll, not the poll cadence itself.

**Story impact:** Epic 4 must preserve stable dashboard response shapes and Epic 5 must not remove the live attendance poll.

### ADR-PR-005: Event-Driven Service Worker Pending Count

**Decision:** Replace global 5-second pending-count polling with event-driven refreshes on app load, online, visibility change, queued request, completed sync, and manual sync.

**Rationale:** Pending-count state changes at known workflow moments. Global polling adds background work without improving user value.

**Story impact:** Epic 5 stories must define the pending-count refresh event contract.

## Pre-Mortem Guardrails

- Normal protected page renders must not call Airtable staff lookup helpers such as `findStaffUserByEmail()` or synchronization helpers such as `syncStaffProfileByEmail()` unless an explicit sync or refresh path is invoked.
- Do not introduce a 20-minute staff authorization cache. Optional Airtable staff lookup caching is limited to 30-60 seconds and only for login, invite, or sync support paths.
- Cached `Locations` and active Preacher helpers must have uncached or bypass variants for flows that require freshest data.
- Session-backed registration plus attendance must be idempotent after partial success: retry must find existing Contact records and create only missing Attendance records.
- Live attendance must preserve the existing 20-second polling freshness model; timer reductions must not make the dashboard feel less live.
- Offline queue and replay must preserve `sessionId` for session-backed registration and attendance.
- Developer verification must include a short before/after evidence note for reduced calls or repeated work on `/contact`, `/sessions`, and session-backed `/register`.

### FR Coverage Map

FR1: Epic 1 - Move normal staff authorization off Airtable and onto the Supabase `staff_profiles` hot path.

FR2: Epic 1 - Preserve Airtable-based staff synchronization for login, invite confirmation, explicit refresh, and administrative sync paths.

FR3: Epic 1 - Restrict optional Airtable staff lookup caching to a 30-60 second sync-path backup, never a 20-minute auth cache.

FR4: Epic 1 - Avoid duplicate client `/api/auth/me` hydration work after protected pages already resolve staff server-side.

FR5: Epic 1 - Keep role-aware header and staff-only PWA prompt state correct after auth seeding or hydration changes.

FR6: Epic 2 - Cache Airtable `Locations` reference data for 20 minutes.

FR7: Epic 2 - Cache Airtable active Preacher reference data for 20 minutes.

FR8: Epic 2 - Keep all writes and duplicate checks uncached.

FR9: Epic 2 - Provide cache bypass or uncached variants for flows that require freshest reference data.

FR10: Epic 3 - Collapse session-backed registration and attendance into one browser-facing request.

FR11: Epic 3 - Make the combined registration-attendance path idempotent across retries.

FR12: Epic 3 - Preserve session-derived preacher and location assignment for session registrations.

FR13: Epic 4 - Reduce redundant Airtable session and attendance reads while preserving session validation, scope, duplicates, and response shape.

FR14: Epic 4 - Keep live dashboard polling lean and session-scoped.

FR15: Epic 5 - Replace one-second UI timers where second-level precision is not user-visible.

FR16: Epic 5 - Replace global 5-second service-worker pending-count polling with event-driven refreshes.

FR17: Epic 5 - Preserve public attendance and registration offline queued states.

FR18: Epic 1, Epic 2, Epic 4, Epic 6 - Preserve role boundaries across auth, cache, attendance, and verification changes.

FR19: Epic 1, Epic 2, Epic 3, Epic 4 - Keep Airtable access server-only and secrets out of browser code.

FR20: Epic 6 - Verify type safety, build health, call-count reductions, caching behavior, smoke flows, and known lint limitation.

## Epic List

### Epic 1: Fast Staff Entry Into Protected Pages
Staff can open protected pages without repeated Airtable profile synchronization or duplicate auth hydration work, while role boundaries remain intact.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR18, FR19

### Epic 2: Cached Reference Data For Staff Workflows
Staff contact and session screens load stable Airtable reference data faster through safe server-side caching for Locations and active Preachers, while sensitive writes and duplicate checks remain fresh.
**FRs covered:** FR6, FR7, FR8, FR9, FR18, FR19

### Epic 3: Single-Step Session Registration And Attendance
Participants registering from a session attendance link complete registration and attendance through one browser-facing call with safe retry behavior.
**FRs covered:** FR10, FR11, FR12, FR17, FR19

### Epic 4: Leaner Attendance Reads And Duplicate Detection
Attendance submission and live dashboard reads avoid redundant Airtable work while preserving session gates, scope checks, duplicate protection, and stable response shapes.
**FRs covered:** FR13, FR14, FR18, FR19

### Epic 5: Quieter Client Background Work
The app reduces unnecessary timers and global polling while keeping live attendance, offline queueing, and staff UI state clear.
**FRs covered:** FR15, FR16, FR17

### Epic 6: Performance Measurement And Regression Safety
Developer agents prove the responsiveness changes with before/after call-count evidence and smoke tests, without regressing completed auth, contact, sessions, PWA, and Airtable behavior.
**FRs covered:** FR18, FR20

## Epic 1: Fast Staff Entry Into Protected Pages

Staff can open protected pages without repeated Airtable profile synchronization or duplicate auth hydration work, while role boundaries remain intact.

### Story 1.1: Complete The Supabase Staff Profile Bridge

As a staff user,
I want the server to have enough synced staff profile data locally,
So that protected pages can authorize me without asking Airtable on every page load.

**Requirements Covered:** FR1, FR2, FR18, FR19

**Acceptance Criteria:**

**Given** the existing `staff_profiles` table lacks staff scope fields
**When** the developer adds a Supabase migration
**Then** `staff_profiles` can store the staff Airtable user id, email, name, role, status, location ids, assigned preacher Airtable user id, and last synced timestamp
**And** generated TypeScript types include the new fields.

**Given** the Supabase migration defines the new staff scope fields
**When** the developer chooses column shapes
**Then** location scope uses a Postgres-friendly `location_ids text[]` or equivalent typed array representation
**And** volunteer assignment uses nullable `assigned_preacher_airtable_user_id text` or equivalent.

**Given** `syncStaffProfileByEmail()` loads a staff user from Airtable
**When** the staff profile is upserted into Supabase
**Then** the synced row includes `locationIds` and `assignedPreacherAirtableUserId` data needed to reconstruct `StaffContext`
**And** missing optional volunteer assignment is stored as `null` or equivalent rather than causing sync failure.

**Given** a synced profile has role `Admin`, `Preacher`, or `Volunteer`
**When** the profile is read from Supabase
**Then** the row can be mapped into the existing `StaffContext` shape without an Airtable lookup.

**Given** the migration is applied
**When** Supabase advisors and type generation are run
**Then** no new high-severity security issue is introduced
**And** any advisory that remains is documented as accepted or remediated.

### Story 1.2: Split Staff Authorization Hot Path From Airtable Synchronization

As a staff user,
I want protected pages to authorize me from the local staff profile,
So that page loads are not slowed down by Airtable sync work.

**Requirements Covered:** FR1, FR2, FR3, FR18, FR19

**Acceptance Criteria:**

**Given** an authenticated Supabase user has an active `staff_profiles` row
**When** `getStaffContext()` is called by a protected page or staff API route
**Then** it verifies the Supabase user and reads `staff_profiles`
**And** it does not call `findStaffUserByEmail()`, `findStaffUserById()`, `syncStaffProfileByEmail()`, or `syncStaffSupabaseUserId()`.

**Given** the matching `staff_profiles` row has `status = Inactive`
**When** `getStaffContext()` is called
**Then** access is denied with the existing inactive or forbidden authorization behavior
**And** no Airtable fallback silently reactivates the staff user.

**Given** no `staff_profiles` row exists for the authenticated Supabase user
**When** a normal protected page load calls `getStaffContext()`
**Then** access fails with an explicit authorization error or redirects to the existing auth error flow
**And** Airtable sync is attempted only through invite confirmation, login sync, or an explicit refresh helper.

**Given** login confirmation or invite acceptance completes
**When** the sync path runs
**Then** it still reads Airtable `Users` as the source of truth and refreshes `staff_profiles`
**And** any optional Airtable staff lookup cache used by sync helpers has a TTL of 30-60 seconds only.

**Given** a staff profile needs to be refreshed after Airtable changes
**When** an explicit sync or refresh helper is invoked by a login, invite confirmation, admin flow, or intentional `/api/auth/me` refresh mode
**Then** Airtable synchronization may run deliberately
**And** normal protected page rendering still does not fall back to Airtable automatically.

### Story 1.3: Seed Client Auth State On Server-Authorized Staff Pages

As a staff user,
I want the header and staff-only prompts to know my role without repeating the same auth fetch,
So that protected pages settle faster after navigation.

**Requirements Covered:** FR4, FR5, FR18

**Acceptance Criteria:**

**Given** a protected page already resolved `StaffContext` server-side
**When** the page renders the header and staff-only PWA prompt
**Then** the nearest client auth provider or route-scoped auth seed receives the server-resolved staff context
**And** the initial protected page render does not immediately call `/api/auth/me`.

**Given** a public page does not resolve staff server-side
**When** the app loads
**Then** the existing client auth refresh behavior may still call `/api/auth/me` if needed for public navigation state
**And** this does not reintroduce duplicate protected-page auth fetches.

**Given** a staff user signs out
**When** the signout route completes
**Then** seeded or cached client auth state is cleared
**And** the header no longer shows authenticated navigation.

**Given** an Admin, Preacher, or Volunteer opens a protected page
**When** the page is hydrated
**Then** role-specific navigation and staff-only PWA install prompt visibility match the resolved staff context.

## Epic 2: Cached Reference Data For Staff Workflows

Staff contact and session screens load stable Airtable reference data faster through safe server-side caching for Locations and active Preachers, while sensitive writes and duplicate checks remain fresh.

### Story 2.1: Add Server-Side Cached Helpers For Stable Airtable Reference Data

As a staff user,
I want stable location and preacher choices to load quickly,
So that staff forms are not blocked by repeated Airtable reference reads.

**Requirements Covered:** FR6, FR7, FR8, FR9, FR19

**Acceptance Criteria:**

**Given** `listLocations()` reads Airtable `Locations`
**When** the developer adds a cached helper
**Then** server-side callers can read cached Locations with a 20-minute TTL
**And** the original uncached `listLocations()` or an equivalent bypass remains available.

**Given** `listActivePreachers()` reads Airtable `Users`
**When** the developer adds a cached helper
**Then** server-side callers can read cached active Preachers with a 20-minute TTL
**And** the original uncached `listActivePreachers()` or an equivalent bypass remains available.

**Given** the app runs on Next.js App Router with dynamic protected pages
**When** caching is implemented
**Then** the cache uses Next.js server caching such as `unstable_cache` or an equivalent server-only approach that works despite dynamic route rendering
**And** Airtable API tokens remain server-only.

**Given** cached helper results are returned
**When** multiple requests need the same reference data within 20 minutes
**Then** repeated Airtable network requests are avoided for those helper calls
**And** cache keys or tags clearly distinguish Locations from active Preachers.

### Story 2.2: Wire Cached Reference Data Into Staff Contact And Session Screens

As a staff user,
I want contact and session forms to use fast reference-data reads,
So that opening staff workflows feels immediate while validation remains correct.

**Requirements Covered:** FR6, FR7, FR8, FR9, FR18, FR19

**Acceptance Criteria:**

**Given** a staff user opens `/contact`
**When** the page loads preacher and location options
**Then** it uses the cached Locations helper
**And** Admin preacher options use the cached active Preachers helper.

**Given** a staff user opens `/sessions`
**When** the page loads available locations
**Then** it uses the cached Locations helper
**And** role-based location filtering still uses the current staff context.

**Given** a staff contact submit posts `/api/contact`
**When** the server validates assigned preacher and location scope
**Then** duplicate contact checks, contact creation, and write paths remain uncached
**And** correctness-critical preacher/location enforcement uses current staff context, direct Airtable record lookup, or an uncached/bypass helper rather than 20-minute cached active Preacher data.

**Given** an Admin or Preacher changes related Airtable data and needs fresh values
**When** a future mutation or explicit admin refresh path is added
**Then** the story leaves a documented cache bypass or tag invalidation approach for that path.

## Epic 3: Single-Step Session Registration And Attendance

Participants registering from a session attendance link complete registration and attendance through one browser-facing call with safe retry behavior.

### Story 3.1: Complete Session Registration And Attendance In `/api/registration`

As a participant,
I want registration from a session link to also mark my attendance,
So that I get one clear result without a second mobile network round trip.

**Requirements Covered:** FR10, FR11, FR12, FR17, FR19

**Acceptance Criteria:**

**Given** a participant submits `/api/registration` with a valid `sessionId`
**When** the contact does not already exist
**Then** the server creates the Contact with session-derived assigned preacher and location
**And** creates the linked Attendance record for the same session before returning success.

**Given** a participant submits `/api/registration` with a valid `sessionId`
**When** the Contact already exists and Attendance does not exist for that Contact plus Session
**Then** the server creates only the missing Attendance record
**And** returns a completed response without creating a duplicate Contact.

**Given** Attendance already exists for the Contact plus Session
**When** `/api/registration` handles the request
**Then** the response treats duplicate attendance as a completed outcome
**And** includes enough response data for the UI to show "registration complete and attendance marked" or equivalent.

**Given** Contact creation succeeds but Attendance creation fails transiently
**When** the same request is retried
**Then** the server finds the existing Contact and attempts only the missing Attendance work
**And** avoids duplicate Contact creation.

**Given** a submitted `sessionId` is invalid, closed, not public, or outside the attendance window
**When** `/api/registration` handles the request
**Then** the server returns an explicit JSON error
**And** no Attendance record is created.

**Given** `/attendance` and session-backed `/api/registration` both enforce session eligibility
**When** the developer implements the combined flow
**Then** the two routes share a common session-window or attendance-eligibility helper
**And** validation behavior does not drift between attendance-only and registration-backed attendance.

### Story 3.2: Remove The Browser Follow-Up Attendance Call From Session Registration

As a participant,
I want the registration screen to wait for one backend result,
So that the mobile flow feels faster and less fragile.

**Requirements Covered:** FR10, FR11, FR17

**Acceptance Criteria:**

**Given** `/register` is opened with a `session` query parameter
**When** the user submits the registration form
**Then** the browser sends one request to `/api/registration`
**And** it does not call `/attendance` afterward.

**Given** `/api/registration` returns success for a session-backed request
**When** the registration page receives the response
**Then** it shows the existing session-aware success message
**And** does not perform a second loading phase.

**Given** `/api/registration` returns a duplicate/already-registered completed outcome
**When** the registration page receives the response
**Then** it treats the outcome as complete if attendance is already marked or newly marked
**And** it does not show a false failure.

**Given** the browser is offline and the service worker queues `/api/registration`
**When** the queued request includes `sessionId`
**Then** replay preserves the `sessionId`
**And** the server can complete both registration and attendance when connectivity returns.

## Epic 4: Leaner Attendance Reads And Duplicate Detection

Attendance submission and live dashboard reads avoid redundant Airtable work while preserving session gates, scope checks, duplicate protection, and stable response shapes.

### Story 4.1: Reuse Loaded Session Context During Attendance Requests

As a participant or staff dashboard viewer,
I want attendance requests to avoid repeated session reads,
So that attendance actions and dashboard refreshes return faster.

**Requirements Covered:** FR13, FR14, FR18, FR19

**Acceptance Criteria:**

**Given** `POST /attendance` loads a Session to validate attendance gates
**When** duplicate attendance detection runs
**Then** it reuses the loaded Session or its `attendanceRecordIds`
**And** it does not fetch the same Session a second time through `getAttendanceBySession()`.

**Given** `GET /attendance?session=<id>` loads a Session for staff scope checks
**When** it reads linked attendance records
**Then** it reuses the loaded Session or its `attendanceRecordIds`
**And** preserves Admin and Preacher scope validation.

**Given** no linked attendance records exist for a valid Session
**When** attendance is read
**Then** the route returns an empty array quickly
**And** does not perform unnecessary Airtable attendance-record batch reads.

**Given** the attendance response is consumed by `LiveAttendanceDashboard`
**When** this refactor is complete
**Then** returned records still include stable `id`, `mobile`, `userName`, and `createdAt` fields.

### Story 4.2: Evaluate Bounded Session Attendance Polling Optimization

As a staff dashboard viewer,
I want live attendance refreshes to avoid unnecessary repeated processing when there is a measurable win,
So that the dashboard stays live without adding fragile Airtable complexity.

**Requirements Covered:** FR14, FR18, FR19

**Acceptance Criteria:**

**Given** Story 4.1 has removed duplicate session reads
**When** the developer evaluates further live polling optimization
**Then** they document whether Airtable can support a safe new-only or bounded response improvement without increasing complexity
**And** implementation may be deferred if no measurable or reliable win is found.

**Given** `LiveAttendanceDashboard` has already rendered attendance records for an active session
**When** a safe optimization is implemented
**Then** the client may send a bounded known-record hint such as known attendance ids or a safe cursor-like value
**And** the route returns only new records when the hint can be applied safely.

**Given** the known-record hint is missing, too large, malformed, or unsafe
**When** `/attendance` handles the request
**Then** it falls back to the existing full session attendance response
**And** still returns the stable dashboard response shape.

**Given** new attendance is created during an active session
**When** the next 20-second poll runs
**Then** the new record appears in the dashboard
**And** existing records are not duplicated in client state.

**Given** the dashboard tab is hidden
**When** polling would otherwise run
**Then** the existing hidden-document guard remains in place
**And** refresh resumes when the tab becomes visible.

## Epic 5: Quieter Client Background Work

The app reduces unnecessary timers and global polling while keeping live attendance, offline queueing, and staff UI state clear.

### Story 5.1: Replace One-Second Session Timers With Deadline-Based Updates

As a staff dashboard viewer,
I want session state to update only when meaningful,
So that the page remains responsive without needless re-renders.

**Requirements Covered:** FR15, FR17

**Acceptance Criteria:**

**Given** `LiveAttendanceDashboard` receives an active session close time
**When** it determines whether the session is active
**Then** it schedules a deadline-based update at the close time or uses a lower-frequency update
**And** it no longer re-renders the whole dashboard every second solely to update `now`.

**Given** `SessionsManager` evaluates active sessions
**When** no user-visible second-by-second countdown is displayed
**Then** it avoids a global one-second interval
**And** session active/inactive transitions still occur at the correct open or close boundary.

**Given** attendance polling runs every 20 seconds
**When** timer work is reduced
**Then** the 20-second live attendance polling cadence is preserved
**And** the dashboard still feels live.

**Given** the active session expires while the page is open
**When** the deadline update fires
**Then** the UI transitions to the no-active-session state without requiring a page refresh.

### Story 5.2: Replace Global Pending-Count Polling With Event-Driven Refresh

As a user with offline queued requests,
I want pending sync state to update when it can actually change,
So that the app avoids unnecessary background work.

**Requirements Covered:** FR16, FR17

**Acceptance Criteria:**

**Given** `OfflineIndicator` is mounted
**When** the app first loads
**Then** it checks the service-worker pending count once if service workers are available.

**Given** the browser fires `online` or the document becomes visible
**When** pending count may have changed
**Then** the app refreshes pending count from the service worker
**And** it does not run a global 5-second polling interval.

**Given** a public attendance or registration request is queued
**When** the UI receives the queued response
**Then** pending count refreshes or the service worker notifies clients
**And** the user can see that work is pending.

**Given** manual sync or background sync completes
**When** queued requests are removed
**Then** pending count refreshes to the current value
**And** the pending banner disappears when the count reaches zero and the browser is online.

**Given** staff contact creation is offline
**When** the staff contact form submits
**Then** it remains online-only and shows the existing reconnect message
**And** no staff contact write is silently queued.

## Epic 6: Performance Measurement And Regression Safety

Developer agents prove the responsiveness changes with before/after call-count evidence and smoke tests, without regressing completed auth, contact, sessions, PWA, and Airtable behavior.

### Story 6.1: Capture Before-And-After Responsiveness Evidence

As a product owner,
I want lightweight evidence that the responsiveness changes reduced repeated work,
So that the improvement is verifiable instead of subjective.

**Requirements Covered:** FR20

**Acceptance Criteria:**

**Given** the developer begins implementation
**When** they inspect the current protected page load behavior
**Then** they record the baseline repeated calls or code paths for `/contact`, `/sessions`, and session-backed `/register`
**And** the notes identify duplicate auth/profile calls and relevant Airtable reads.

**Given** the developer needs to prove Airtable staff lookup is no longer hidden in the protected-page hot path
**When** verification is performed
**Then** acceptable evidence includes code-path review, local debug counters, server logs, temporary instrumentation, or tests/stubs/spies around Airtable staff lookup helpers
**And** the chosen evidence is summarized in the completion notes.

**Given** Epic 1 and Epic 2 changes are implemented
**When** `/contact` and `/sessions` load as an authenticated staff user
**Then** the verification notes show that normal protected page auth no longer calls Airtable staff lookup
**And** Locations and active Preachers use the intended cached helpers.

**Given** Epic 3 changes are implemented
**When** session-backed `/register` submits successfully
**Then** the verification notes show one browser-facing registration request rather than a registration request followed by an attendance request.

**Given** Epic 5 changes are implemented
**When** the dashboard and offline indicator are open
**Then** the verification notes show that one-second timer and 5-second pending-count polling work has been removed or reduced as specified.

### Story 6.2: Run Regression Smoke Tests For Completed Staff And Attendance Flows

As a developer agent,
I want a concrete verification checklist,
So that performance changes do not break completed product behavior.

**Requirements Covered:** FR18, FR20

**Acceptance Criteria:**

**Given** the implementation is complete
**When** verification runs
**Then** `pnpm exec tsc --noEmit` passes
**And** `pnpm build` passes.

**Given** `pnpm lint` is still blocked by the missing ESLint dependency
**When** verification is documented
**Then** the known lint blocker from `_bmad-output/implementation-artifacts/deferred-work.md` is referenced
**And** the developer does not claim lint passed unless the dependency/script is fixed.

**Given** an Admin, Preacher, and Volunteer account are available
**When** smoke testing is performed
**Then** login, protected page redirect behavior, role navigation, `/contact`, `/sessions`, `/attend`, session-backed `/register`, live dashboard refresh, Manage-tab access, and staff-only PWA prompt behavior are checked according to role.

**Given** public attendance and registration offline behavior is supported
**When** offline smoke testing is performed
**Then** supported queued requests retain `sessionId`
**And** staff contact writes remain online-only.

**Given** all smoke checks are complete
**When** the developer reports completion
**Then** the report lists changed files, verification commands, manual smoke coverage, known residual risks, and any blocked checks.
