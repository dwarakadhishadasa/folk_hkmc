# UX/State Checklist: HKM Program Operations Portals

Status: draft  
Date: 2026-06-12  
Proposal: Sprint Change Proposal E - Create UX/State Checklist

## Purpose

This checklist is the lightweight UX source required before UI-heavy implementation stories. It does not replace a full visual design package. It defines the minimum screen, state, role, mobile, and accessibility coverage implementation agents must preserve so public, staff, offline, duplicate, closed-session, stale-sync, and permission-denied behavior does not drift between stories.

## Sources

- `_bmad-output/planning-artifacts/sprint-change-proposal-2026-06-12.md`
- `_bmad-output/planning-artifacts/implementation-readiness-report-2026-06-12.md`
- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/prds/prd-gita-life-operations/prd.md`
- `_bmad-output/project-context.md`

## Use Before These Stories

- Epic 1 stories that create Program landing and Portal entry surfaces.
- Story 2.3 and Story 2.4 for staff sign-in, role routing, inactive staff, revocation, and stale-sync behavior.
- Epic 3 stories for registration, attendance, session-backed registration, and offline queue/replay.
- Epic 4 stories for staff contact capture, role-safe field visibility, duplicate handling, and sensitive comments/profile details.
- Epic 5 stories for Sessions, QR/link sharing, and live attendance.
- Epic 6 stories for invites, location management, Preacher Volunteer invites, and Airtable Manage handoff.

## Global UX Floor

Every UI-heavy story must confirm:

- [ ] A loading state exists for every server-backed page, form submit, redirect handoff, and polling refresh.
- [ ] Empty states explain what is missing and what the authorized next action is.
- [ ] Error states use safe, actionable language and do not expose Airtable internals, Supabase service-role details, raw tokens, OTP values, stack traces, or raw provider errors.
- [ ] Success states name the completed action and the next available action.
- [ ] Duplicate states are treated as meaningful outcomes, not generic failures.
- [ ] Offline queued states clearly distinguish "saved for sync later" from "completed now."
- [ ] Replay outcomes show final success, duplicate, not-registered, closed-session, or failed status where applicable.
- [ ] Permission-denied states fail closed and do not reveal protected data or hidden destination URLs.
- [ ] Stale-sync states block role-changing, admin, and sync-sensitive staff writes with actionable copy.
- [ ] All public and staff mobile flows work at 360px width with no horizontal scrolling and no hidden primary action.
- [ ] Keyboard focus order follows the visible workflow and focus indicators remain visible.
- [ ] Form fields have persistent labels, inline validation, and status messaging announced to assistive technology.
- [ ] Program identity is visible on Program-specific surfaces, and labels come from Program configuration or app-local assets rather than hard-coded cross-Program vocabulary.

## Shared State Vocabulary

Use these labels consistently in implementation notes, QA evidence, and bug reports.

| State | Meaning | UX requirement |
| --- | --- | --- |
| `loading` | Initial data, submit, callback, redirect, or refresh in progress | Show progress without implying success. Keep current trusted data visible during live refresh when safe. |
| `empty` | No records or no active operational object exists | Explain the absence and point authorized staff to the next surface. |
| `validation` | User input is missing, malformed, out of scope, or rejected before mutation | Keep the user on the same surface, mark the field or section, and preserve entered data. |
| `success` | Requested action completed | Confirm the action and expose the next logical action. |
| `duplicate` | Existing Contact or Attendance already satisfies the intent | Present as already completed or already registered; do not frame as system failure. |
| `offline-queued` | Public registration or attendance was accepted into the browser queue | Tell the user it will sync later and preserve Program/session context. |
| `replay-success` | Queued action synced successfully | Confirm final completion once known. |
| `replay-failure` | Queued action could not sync | Show retry/next-step guidance without losing context. |
| `closed-session` | Attendance session is missing, disabled, closed, or outside the attendance window | Say attendance is unavailable for this session; do not create Attendance. |
| `not-registered` | Attendance mobile number has no matching Contact | Route to registration with normalized mobile and session preserved. |
| `permission-denied` | Role, Program, auth, or status prevents access | Deny safely and avoid exposing protected data or hidden links. |
| `stale-sync` | Staff role/membership data is older than the allowed threshold | Block sensitive staff writes and explain that access must be refreshed or reviewed. |
| `misconfigured` | Required Program, Airtable, URL, or environment config is missing | Show an operator-facing unavailable state without exposing secret values. |

## Role Destination Matrix

| Role/state | Default landing | Allowed surfaces | Hidden or denied surfaces |
| --- | --- | --- | --- |
| Public visitor | Program landing, Registration, Attendance link | Public Program actions, registration, session attendance | Staff portal surfaces and Program operational data |
| Unauthenticated staff | Sign-in | Public actions and sign-in | Contact, Sessions, Live Dashboard, Invites, Manage |
| Active Volunteer | Contact | Contact capture | Dashboard, Sessions, staff invite, location management, Manage |
| Active Preacher | Contact or Sessions according to entry intent | Contact, Sessions, Live Attendance, Volunteer Invite where enabled, Manage where permitted | Admin-only invite and location-management actions |
| Active Admin | Admin or staff operations home | Contact, Sessions, Live Attendance, staff invite, location management, Manage | Cross-Program data unless explicitly permitted |
| Inactive/revoked staff | Safe denial or sign-in error | Public actions only | All protected staff surfaces |
| Stale-sync staff | Safe denial or refresh-required state for sensitive actions | Non-sensitive surfaces only if policy permits refresh | Admin, role-changing, privileged Supabase, and Airtable mutation actions |

## Surface Checklist

### Program Landing And Portal Entry

Stories: 1.2, 1.3  
Journey: Arjun discovers a Program; Kavya needs the staff Portal.

- [ ] Public Program actions remain primary; staff Portal sign-in is available but visually secondary.
- [ ] Program identity is explicit for Gita Life or FOLK.
- [ ] Program vocabulary comes from Program configuration or app-local assets.
- [ ] Public registration and attendance remain reachable without staff sign-in where enabled.
- [ ] Staff Portal link has an accessible name matching the Program-specific Portal label.
- [ ] 360px mobile layout preserves Program identity and core actions without horizontal scrolling.
- [ ] Keyboard focus visibly reaches public actions and Portal entry in a logical order.

Required states:

- [ ] Public actions available.
- [ ] Staff Portal sign-in available.
- [ ] Program module unavailable or disabled.
- [ ] Missing Program URL or configuration.
- [ ] Keyboard focus and screen-reader announcement.

### Sign-In And Role Routing

Stories: 2.3, 2.4, 2.6  
Journey: Kavya signs in and lands in the right staff surface.

- [ ] Sign-in UI does not expose demo credentials or local role switching.
- [ ] Auth callback resolves Program-aware staff context before protected redirect.
- [ ] Volunteer lands on Contact and does not see unavailable staff destinations.
- [ ] Preacher can reach Contact, Sessions, Live Attendance, Volunteer Invite where enabled, and permitted Manage.
- [ ] Admin can reach Contact, Sessions, Live Attendance, staff invite, location management, and Manage.
- [ ] Sign-out clears session and moves the user away from protected staff pages.
- [ ] Staff profile sync failure is visible and actionable.

Required states:

- [ ] Unauthenticated.
- [ ] Auth loading or callback pending.
- [ ] Active Volunteer.
- [ ] Active Preacher.
- [ ] Active Admin.
- [ ] Inactive, suspended, missing, or revoked staff.
- [ ] Stale sync.
- [ ] Sign-out complete.
- [ ] Auth or sync failure with safe message.

### Public Registration

Stories: 3.1, 3.4  
Journey: Arjun registers from the public Program page.

- [ ] Form displays only fields enabled for the active Program.
- [ ] Mobile number is normalized to the last 10 digits on client and server boundaries.
- [ ] Validation errors preserve entered values and point to the relevant field.
- [ ] Duplicate mobile returns an already-registered state with no duplicate Contact.
- [ ] Successful registration confirms the Program and next step.
- [ ] Offline submission queues only supported public registration requests.
- [ ] Queued request status preserves Program context and allowed fields.
- [ ] Airtable internals are never exposed in user-facing copy.

Required states:

- [ ] Empty/new form.
- [ ] Field validation.
- [ ] Duplicate mobile.
- [ ] Submit loading.
- [ ] Success.
- [ ] Offline queued.
- [ ] Replay success.
- [ ] Replay duplicate.
- [ ] Replay failure.
- [ ] Server error with safe copy.

### Attendance From Session Link

Stories: 3.2, 3.4  
Journey: Bhaskar opens a session QR/link and marks attendance.

- [ ] Attendance page preserves `session=<sessionId>` for submission.
- [ ] Public attendee cannot see other attendee records.
- [ ] Mobile number validation uses normalized 10-digit value.
- [ ] Valid attendance confirms the correct Session.
- [ ] Duplicate attendance is treated as already marked.
- [ ] Missing, disabled, closed, or out-of-window Session returns a clear unavailable state.
- [ ] Offline attendance queues only supported public attendance requests and preserves mobile plus session ID.

Required states:

- [ ] Valid session ready.
- [ ] Missing session.
- [ ] Invalid session.
- [ ] Attendance disabled.
- [ ] Closed or not-yet-open session.
- [ ] Unknown mobile / not registered.
- [ ] Duplicate attendance.
- [ ] Submit loading.
- [ ] Success.
- [ ] Offline queued.
- [ ] Replay success.
- [ ] Replay duplicate.
- [ ] Replay closed-session.
- [ ] Replay failure.

### Session-Backed Registration Return

Stories: 3.3, 3.4  
Journey: Bhaskar is unknown, registers, and returns to attendance without repeating work.

- [ ] Not-registered attendance response includes normalized mobile and preserved session ID.
- [ ] Redirect to registration includes both `mobile` and `session`.
- [ ] Registration pre-fills mobile where appropriate.
- [ ] Session ID is retained through submit, queued state, replay, and follow-through.
- [ ] After registration creates or reuses a Contact, the client attempts attendance completion for the same mobile and Session.
- [ ] Duplicate attendance after registration is shown as completed.
- [ ] If the Session becomes invalid or closed during registration, the user sees a follow-up state and no invalid Attendance is created.

Required states:

- [ ] Attendance not registered.
- [ ] Registration with prefilled mobile.
- [ ] Registration submit loading.
- [ ] Registration success plus attendance follow-through.
- [ ] Duplicate registration plus attendance follow-through.
- [ ] Attendance follow-through success.
- [ ] Attendance follow-through duplicate.
- [ ] Session closed during handoff.
- [ ] Offline queued with session preserved.
- [ ] Replay with follow-through.
- [ ] Replay failure requiring next step.

### Staff Contact Capture

Stories: 4.1, 4.2, 4.3  
Journey: Kavya records a contact on mobile after a Program interaction.

- [ ] Server resolves Program-aware staff context before mutation.
- [ ] Staff contact creation is online-only for MVP; offline attempts are not silently queued.
- [ ] Form shows only fields supported by the active Program Capability Profile.
- [ ] Location is required before save.
- [ ] Duplicate mobile returns a safe duplicate state.
- [ ] Volunteer does not see assigned Preacher selection and cannot provide one through the browser.
- [ ] Volunteer with no assigned active Preacher fails closed with actionable copy.
- [ ] Preacher sees that contacts assign to the signed-in Preacher.
- [ ] Admin must select an assigned Preacher from active Program data.
- [ ] Sensitive comments and profile details default to least privilege until DD-8 and DD-9 are resolved.
- [ ] Private Airtable details are not exposed to Volunteers.

Required states:

- [ ] Volunteer form.
- [ ] Preacher form.
- [ ] Admin form with assigned Preacher required.
- [ ] Missing required location.
- [ ] Missing assigned Preacher for Admin.
- [ ] Volunteer missing assigned active Preacher.
- [ ] Duplicate mobile.
- [ ] Submit loading.
- [ ] Success.
- [ ] Online-required when offline.
- [ ] Permission denied.
- [ ] Stale sync.
- [ ] Server error with safe copy.

### Sessions

Stories: 5.1, 5.2, 5.3  
Journey: Raghav creates an active Session and shares the attendance link.

- [ ] Volunteers cannot access Sessions.
- [ ] Preacher location choices are limited to allowed Program scope.
- [ ] Admin location choices include active Program locations.
- [ ] Unknown, inactive, or out-of-scope locations are rejected before Airtable mutation.
- [ ] Session creation captures name, date/time where configured, location, owner/Preacher, public attendance enabled state, open time, and close time.
- [ ] Attendance URL uses the active Program app domain and `/attend?session=<sessionId>`.
- [ ] QR code encodes the exact Session-specific URL.
- [ ] Copy/open controls communicate success or failure.
- [ ] Disabled or closed attendance never appears shareable as active.
- [ ] QR/link area remains scannable and reachable on 360px mobile.

Required states:

- [ ] Sessions loading.
- [ ] Empty Sessions list.
- [ ] Create form ready.
- [ ] Invalid or inactive location.
- [ ] Out-of-scope location.
- [ ] Session create loading.
- [ ] Session created.
- [ ] Attendance enabled and open.
- [ ] Attendance disabled.
- [ ] Attendance not yet open or closed.
- [ ] QR visible and scannable.
- [ ] Copy success.
- [ ] Copy failure.
- [ ] Permission denied.
- [ ] Stale sync.
- [ ] Server error with safe copy.

### Live Attendance Dashboard

Stories: 5.4, 6.1 where Admin visibility overlaps  
Journey: Raghav monitors check-ins during a live Session.

- [ ] Dashboard resolves active Program and authorized Session scope.
- [ ] Dashboard shows Session name, location, attendance URL or QR access, count, and attendee list.
- [ ] Preacher sees only owned or allowed-location Sessions.
- [ ] Admin sees active Program data only unless cross-Program access is explicitly permitted.
- [ ] Refresh requests send known attendance IDs.
- [ ] Newly loaded attendance rows append once with stable IDs and display fields.
- [ ] Existing trusted rows remain stable during incremental refresh.
- [ ] No active Session empty state points authorized staff to Sessions.
- [ ] Volunteers and unauthenticated users cannot use the dashboard.

Required states:

- [ ] Dashboard loading.
- [ ] Active Session.
- [ ] No active Session.
- [ ] Empty attendee list.
- [ ] Incremental refresh in progress.
- [ ] New attendees appended.
- [ ] Duplicate-safe append.
- [ ] Out-of-scope Session hidden or denied.
- [ ] Refresh error.
- [ ] Permission denied.
- [ ] Stale sync.

### Staff Invite And Location Management

Stories: 6.1, 6.2, 6.3  
Journey: An Admin invites staff; a Preacher invites Volunteers.

- [ ] Admin invite surface is hidden from non-Admin staff.
- [ ] Admin can invite Admin, Preacher, and Volunteer roles only.
- [ ] Volunteer invite requires assigned Preacher from active Program Preachers.
- [ ] Admin/Preacher invite supports validated active Program location access.
- [ ] Raw or unknown Airtable IDs are rejected.
- [ ] Inline location creation creates an active Program location and returns it selectable for the current invite.
- [ ] Preacher Volunteer invite shows only Volunteer controls.
- [ ] Preacher Volunteer invite forces or validates role as Volunteer and assigns the current Preacher server-side.
- [ ] Invite result shows success, partial failure, or failure with next step.
- [ ] Invite logs record status and safe error messages without secret values.

Required states:

- [ ] Admin invite form.
- [ ] Preacher Volunteer invite form.
- [ ] Role selection.
- [ ] Volunteer assigned Preacher required.
- [ ] Admin/Preacher location access required or optional according to policy.
- [ ] Inline location creation open.
- [ ] Inline location validation.
- [ ] Inline location success and selected.
- [ ] Invite submit loading.
- [ ] Invite success.
- [ ] Invite partial failure.
- [ ] Invite failure.
- [ ] Duplicate or existing Supabase identity reuse.
- [ ] Permission denied.
- [ ] Stale sync.

### Manage Handoff

Story: 6.4  
Journey: An authorized staff user opens Airtable Manage.

- [ ] Manage route authorizes server-side before redirect.
- [ ] Admin and permitted Preacher redirect only to the active Program Airtable Interface URL.
- [ ] Volunteer access is denied without returning the Airtable Interface URL.
- [ ] Unauthenticated or inactive users are redirected or shown safe denial.
- [ ] Missing or invalid Airtable Interface URL shows unavailable state and logs the issue.
- [ ] Cross-Program management access requires explicit permission checks.

Required states:

- [ ] Authorized redirect pending.
- [ ] Authorized redirect success.
- [ ] Volunteer denied.
- [ ] Unauthenticated denied or redirected.
- [ ] Inactive/revoked denied.
- [ ] Stale sync.
- [ ] Missing Interface URL.
- [ ] Invalid Interface URL.
- [ ] Misconfiguration logged without secret values.

## Sensitive Data And Least-Privilege Notes

- DD-8 blocks final contact comment and profile detail visibility rules. Until resolved, UI must use least-privilege visibility and avoid showing sensitive comments/profile details to Volunteers unless explicitly approved.
- DD-9 blocks final retention durations. UI copy should avoid promising retention windows until the retention policy is approved.
- Staff-denial, stale-sync, and misconfiguration messages should be actionable but should not reveal internal membership fields, Airtable IDs, secret environment names, or provider internals.

## Acceptance Evidence Required

For each UI-heavy story, implementation notes should include:

- [ ] Surface(s) touched.
- [ ] Roles tested.
- [ ] States verified from this checklist.
- [ ] 360px mobile evidence or manual smoke result.
- [ ] Keyboard/focus and status-message evidence.
- [ ] Offline queue evidence for public registration/attendance stories.
- [ ] Permission-denied and stale-sync evidence for staff/admin stories.
- [ ] Any checklist item intentionally deferred with the approving decision or story reference.

