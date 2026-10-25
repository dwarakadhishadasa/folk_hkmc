---
id: SPEC-autodialer
companions:
  - ARCHITECTURE-SPINE.md
  - architecture.md
  - parity-matrix.md
  - data-model.md
  - calling-mechanism.md
  - ux-flows.md
  - diagrams.md
  - design-coverage.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. `ARCHITECTURE-SPINE.md` is the adopted architecture companion: its `AD-1` … `AD-16` are binding, and this file cites them by id.

> **Design authority.** The current `_bmad-output/E-Assets/page-designs/campaign.figcraft` is the final UI authority. It wins on layout, navigation, labels and visible states. This spec wins on capabilities, data, security and backend behaviour. A required state the design does not show is a **design omission**, not a descope; `design-coverage.md` is the frame-by-frame record.

# FOLK Autodialer — feature parity for folk_hkmc

## Why

**An opportunity to capture, plus a pain to solve.** FOLK has a working autodialer at `/home/dwarakadhisha-dasa/projects/autodialer` — a Flutter app where an admin builds campaigns, assigns members to callers, and each caller works a paced queue while recording outcomes. It works, but it is a separate island: its own Supabase project, its own `contact` table, its own role model, and an Android APK on every caller's phone. `folk_hkmc` is where the same staff already live, with the same program data and the same auth. Every campaign run splits the data in half and puts a native app in the hands of people whose job is to talk to members, not to manage software.

Carrying the feature set into `folk_hkmc` collapses that split: one contacts table, one staff identity, one place staff trust. The hard part is that the source app's best ideas are **mobile-shaped** — a floating survey over the Android dialer and `phone_state` call detection have no browser equivalent. Porting them literally would be worse than what exists. This spec carries the features and the UX quality bar; the calling mechanism is settled in `calling-mechanism.md`.

## Capabilities

- **CAP-1 — Caller access to their own queue**
  - **intent:** A caller signs in and immediately sees exactly the people assigned to them, scoped to their program and nothing else.
  - **success:** A caller who has never used the tool lands on a working call list without an admin creating anything extra; opening another caller's assignment returns `404` with no data.

- **CAP-2 — Campaigns with a call-outcome survey**
  - **intent:** An admin, preacher or assistant creates a campaign with a name, date and per-campaign gap timing, attaches a survey that shapes what every caller records, and explicitly starts it when it is ready to be called. The target audience is chosen at assignment time from the contact facets, not stored on the campaign.
  - **success:** A new campaign is fully configured, assigned and started without engineering help; before it is started no caller sees it, and after it is active its survey fields appear in every caller's disposition form for that campaign only.

- **CAP-3 — Contact universe**
  - **intent:** An admin or preacher maintains the population of people who can be called through the existing `/manage` contacts surface. The dialer reuses `contacts`; it does not create a second contact store or its own contact editor.
  - **success:** A contact created or edited in `/manage` is immediately eligible for campaign assignment; the dialer creates no contacts and offers no contact CSV import or export in v1.

- **CAP-4 — Caller roster**
  - **intent:** An admin, preacher or assistant manages the caller roster for the people in their scope; an admin switches callers active or inactive, and each one's performance is visible per campaign. Any staff role is a caller. The roster has no invite, add or import control; adding a person is the app's single staff invite path, outside the Campaign surface.
  - **success:** A staff member becomes a working caller by one assignment, and an inactive caller immediately disappears from assignment pickers while their history is retained. A Preacher's roster and picker contain only the people assigned to them, plus themselves.

- **CAP-5 — Batch assignment with conflict detection**
  - **intent:** An admin, preacher or assistant selects a batch of contacts in their scope, chooses one or more callers from their assignable set and a campaign, and assigns them together — with anyone already assigned in that campaign surfaced before anything is written. Multi-caller assignment uses weights to distribute the batch.
  - **success:** A batch containing 5 already-assigned contacts produces a readable list of those 5 conflicts and writes none of the batch until the assigner decides to skip or move them; a weighted multi-caller split assigns exactly the confirmed contacts, with whole-number counts that add up to the batch.

- **CAP-6 — The call session**
  - **intent:** A caller works their queue on a phone as a guided session: the whole queue is one tap away with the current and next contact visible, calls are paced, the campaign change is explicit, and one primary action names the next step rather than four controls that mean different things.
  - **success:** One button starts a session that runs the whole queue unattended apart from recording outcomes; the caller never has to remember who is next or who they are currently on the phone with, and skipping a bad number never wedges the session. Finishing shows what the session achieved **and offers to re-queue everyone in the `NOT_REACHABLE` group**, so an unreachable contact comes back as work rather than being lost. A second tab on the same queue is refused.

- **CAP-7 — Call disposition that never loses data**
  - **intent:** After each call the caller records one status from the design's 13-chip list, plus notes, and — only when the call reached a conversation — the campaign survey, then commits with one primary action. No separate save screen is needed.
  - **success:** A caller who closes the tab mid-queue keeps every outcome already entered, and a failed save is visible and pauses the session rather than discarding the answer.

- **CAP-8 — Reporting and export**
  - **intent:** An admin, preacher or assistant sees how the campaigns in their scope are performing — a funnel that separates **assigned**, **attempted**, **reached**, and **never attempted**, plus a **confirmed** count, per-campaign progress, outcome mix, caller leaderboard and recent activity — and can take it away as a CSV.
  - **success:** They can answer "of the 200 people we assigned, how many were actually called, how many we reached, how many confirmed, what the outcomes were, and **who was never called at all**" from the reporting screen alone, and can export those exact numbers. The never-attempted bucket is what makes a stalled volunteer visible before the campaign ends.

- **CAP-9 — Intuitive by default**
  - **intent:** A first-time caller finishes a whole campaign without training, and no admin task needs more than one screen to reach its starting point.
  - **success:** An untrained caller completes a full campaign start-to-finish on a phone with no asker present, and an admin reaches create-campaign, assign, start, and export in one click each from the desktop Campaign surface.

## Constraints

- **Program scope is absolute.** Every row carries `program_id`; no query, export or assertion crosses programs. `folk` only in v1: no Campaign route exists under `apps/gita-life`, and `modules.dialer` hides the shared nav item only — it is never the authorization gate.
- **A human places every call.** No telephony provider, no automated dial-out, no `call_duration`. The caller presses a button, `tel:` opens the native phone app with the number copied as fallback, and "I'm back" is an explicit action because nothing observes the call ending.
- **Campaign is one route tree under `/campaigns/**`.** `/campaigns` overview, `/campaigns/assignments` caller session, `/campaigns/callers`, `/campaigns/reports`, `/campaigns/[campaignId]/assign-contacts`, `/campaigns/[campaignId]` detail and survey. `/dialer` does not exist. Admin, Preacher and Assistant open every Campaign route; a Volunteer opens only `/campaigns/assignments`. The header's Campaign item is the single entry: Admin, Preacher and Assistant see it whether or not they are callers; a Volunteer sees it only when they have an active `dialer_callers` profile, and then it points to `/campaigns/assignments`. The Assignments sub-nav item appears only for an active caller, so an admin who is not a caller never sees a dead link and a Volunteer who is not a caller never reaches a 403.
- **Campaign lifecycle is explicit.** A campaign is created in `DRAFT`; it becomes callable only through an explicit `DRAFT → ACTIVE` action. `ACTIVE → COMPLETED`, `ACTIVE → CANCELLED` and `DRAFT → CANCELLED` are the only other transitions; `COMPLETED` and `CANCELLED` are terminal in v1. The three Campaign admin roles may start, complete or cancel a campaign. Assignments and the survey may be prepared while `DRAFT`; the queue offers only `PENDING` assignments on `ACTIVE` campaigns, and a disposition, Skip or recall against a non-`ACTIVE` campaign returns a terminal `409`.
- **The Callers screen has no invite, add or import control.** Callers are existing staff users; an eligible staff user is promoted on first assignment. Adding a person is the app's single staff invite path, outside the Campaign surface. Admin may invite Admin/Preacher/Volunteer/Assistant; Preacher may invite Volunteer/Assistant assigned to them; Assistant and Volunteer cannot invite.
- **Assignment is scoped to the assigner's people.** Admin: the program. Preacher: their own contacts, assigned to the staff assigned to them **or to themselves**. Assistant: their preacher's contacts, assigned to their preacher's assignees **or themselves**. Assigning an eligible staff user auto-promotes them; an existing inactive caller is refused, never reactivated. A campaign's target audience is a selection-time facet over `dialer_contact_profiles`; no `audience_filter` is stored. Unique `(contact_id, campaign_id)` makes assignment a move. Weights are write-time floor + largest remainder, never stored; conflicts are named, the assigner chooses skip or move, and one transaction writes the confirmed set with no partial success.
- **`contacts` is the only calling universe.** No second contacts table and no new `contacts` column; the four calling-relevant enrichment fields (`centre`, `level`, `gender`, `language`) live in `dialer_contact_profiles`, and a contact without a profile row is fully callable. No `Volunteer` term is added to the `contacts` RLS policy.
- **Disposition is one stored status.** The design's 13 chips are the single `disposition_status`; `status_group` is a stored generated column with `CONFIRMED`, `MAY_COME`, `DEFERRED`, `NOT_REACHABLE`, `WRONG_NUMBER`, `NOT_INTERESTED`. There is no `call_outcome` or `follow_up_status`. Confirmed means the latest reached call log has `disposition_status = 'CONFIRMED'`. Notes always render; the campaign survey renders only when the call reached a conversation. The survey builder does not seed a second status question, and a landed attempt is immutable; a correction is a new attempt.
- **The survey builder ships.** It is free-form per campaign; a choice question with no options is rejected; `is_required` is enforced; a question with responses is retired, never deleted.
- **Disposition save is one transaction.** `record_call_disposition` is `SECURITY INVOKER`, granted to `service_role` only, and writes the call log — including a `dial_phone` snapshot of the contact's number at save time — its survey responses and the assignment status together. It is idempotent on `(assignment_id, attempt)`; the queue supplies `attempt`; a replay of the same payload returns `200`, a different payload for the same attempt returns `409`, and neither returns `500`; a partial survey is impossible.
- **The caller boundary is asserted.** Service-role reads go through `assertCallerAssignmentInScope`, which requires `assignment.caller_id` to resolve to the signed-in caller's `dialer_callers` row, not merely a caller row in the same program. The browser receives only an already-scoped queue payload, never a general contacts read, and never learns an id it was not given. The caller path returns `404` for both a missing assignment and another caller's assignment; the admin surface may keep the 403/404 distinction. The caller id comes from `getStaffContext()`; `dialer_callers.is_active` is checked on the write path.
- **Reporting is computed once and scoped.** One `campaign_progress(campaign_id, scope_preacher_id, program_scope)` function returns the funnel, outcome mix, per-caller rollup, summary counts and recent activity. **Attempted** = at least one call log; **Reached** = at least one log outside `NOT_REACHABLE`/`WRONG_NUMBER`; **Confirmed** = the latest reached log is `CONFIRMED`; **Never attempted** = assigned minus attempted. Funnel counts are assignment-grain; leaderboard and activity are log-grain. A queued disposition is not counted until its replay lands. The leaderboard ranks completed attempts and claims no quality signal.
- **History survives every lifecycle change.** Campaigns are cancelled, never deleted; questions with responses are retired, never deleted. No role holds `DELETE`; `ON DELETE RESTRICT` on contact, caller and staff-identity FKs makes a cascade impossible. Every saved disposition completes the assignment; a deferral records the reason but does not re-queue in v1, and there is no follow-up date. Recall returns only `NOT_REACHABLE` rows to `PENDING`, bounded by `max_attempts` (default 3). Contact history is program-wide: the call card may show prior calls for the same contact from other campaigns, capped to the last N entries, and notes are visible to any caller assigned that contact.
- **The session is client state.** No server session; position lives in `/campaigns/assignments?campaign=<id>` plus a re-fetch. The gap comes from `Date.now()`, gates the call button, and is 5–300 seconds per campaign. Pause, Skip, the awaited campaign-switch notice and resume are always available. `unique (assignment_id, attempt)` is the single-session guarantee; a BroadcastChannel/localStorage lock refuses a second tab. The queue is a virtualised window — a 300–500 contact queue must not jank on advance.
- **Writes are service-role only, and the API is split by population.** Authenticated clients get no INSERT/UPDATE/DELETE; every mutation passes `getStaffContext()` + `requireRole()` and a scope assertion. `/api/dialer/caller/**` serves callers; `/api/dialer/admin/**` serves the admin surface.
- **Inherited platform rules.** Additive timestamped migrations; `program_id` on every table; RLS through the existing `caller_role()` / `caller_program_id()` / `caller_assigned_preacher_id()` helpers; an `rls-policy-matrix.md` row in the same commit; `lib/supabase/types.ts` regenerated. Credentials are read only through server-only modules; the matcher lives in `apps/*/proxy.ts`; there is one root `public/sw.js` (the app `public/` dirs are symlinks to it).
- **Offline is the disposition write, not the app shell.** `/api/dialer/caller/disposition` joins the existing Background Sync queue; the endpoint is idempotent and `sw.js` drains on `ok || 409`. A network gap shows `Queued — will send`; a rejected write shows `Save failed — session paused`; a permanent refusal on replay returns `409` so the queue drains, and the JSON draft survives a killed tab. No app-shell offline promise.
- **No new runtime service.** No cron, worker, job queue or telephony provider; recall and export are request-time actions. Env is read only through server-only modules; `turbo.json` build env is not widened.
- **Every list read pages.** PostgREST caps at 1,000 rows and folk holds about 1,030 contacts; use the shared pager and fail loudly rather than returning a short list.
- **Follow the manual-form pattern.** `useState` plus hand-written handlers plus `fetch`; no `react-hook-form` or `zod`; validation is a hand-rolled allowed-key allowlist.
- **No dynamic SQL, ever.** Any assistant selects named tools with server-validated arguments; the database is never a SQL string target.
- **The design is the UI authority.** `campaign.figcraft` wins on layout, navigation, labels and visible states; a required state it does not show is a design omission, not a descope, tracked in `design-coverage.md`. Frame 645 has no invite, add or import control.
- **Verification is demonstration, not build success.** `next build` ignores type errors; `pnpm typecheck:workspace` and `pnpm guardrails` gate. E2E is `pnpm test:e2e`, one runner at a time; CI does not run e2e. The dialer route set is coverage-checked by a static guardrail inside `pnpm guardrails`.

## Non-goals

- **CAP-10 — Campaign assistant.** Deferred from v1. If it ships it selects typed tools with server-validated arguments, never model-generated SQL.
- **CAP-11 — Member RSVP self-service.** Cut; `disposition_status` already records what an RSVP would, and a public unauthenticated surface is where this feature is weakest.
- Replacing or altering `folk_hkmc`'s existing attendance, session, registration, contact or manage-portal features.
- Building, deploying, modifying or retiring the Flutter autodialer or its Supabase project.
- IVR menus, voice bots, AI-placed calls, or any automated outbound dialing.
- Call recording, call transcription, or importing recordings from the carrier.
- Outbound SMS, WhatsApp Business messaging, or bulk email campaigns.
- Replacing the Supabase Auth email-OTP login.
- Native mobile clients. The application is a browser app and a PWA.
- Payments, billing, or cost-per-minute accounting.
- Auto-creating a campaign when none exists; a blocked admin gets a one-click empty state instead.
- Adding a `Volunteer` term to the `contacts` RLS policy, or widening `/manage` past `Admin`/`Preacher`.
- Import roster or any caller invite/add control.
- Contact CSV import or export in v1. The Campaign surface reuses the existing `contacts` table and `/manage` contact create/edit; a batch contact CSV path belongs to a future Manage-contacts change, not this feature.
- A telephony provider in v1; option B in `calling-mechanism.md` remains possible later without reshaping the session.

## Success signal

An admin creates a campaign on the desktop, uses 30 existing contacts, assigns them across three callers with a weighted split, starts the campaign, and exports a CSV of every outcome — then each caller completes their queue on a phone, with the first-time caller finishing unaided. The demonstration is judged on one thing: nobody had to be taught, and no call outcome was lost.

## Assumptions

- Auto-promotion on first assignment is the only caller-creation path; there is no separate promote UI.
- The roster is scoped by the same set as assignment: a Preacher sees their assigned staff plus themselves; an Assistant their preacher's assignees plus themselves.
- Reached means "at least one call log outside `NOT_REACHABLE`/`WRONG_NUMBER`"; Confirmed means the latest reached log is `CONFIRMED`.
- A tablet uses the phone layout; the design defines only a desktop admin surface and a phone caller surface.

## Open Questions

None for v1. Contact CSV import/export is deferred, not open; it belongs to a future Manage-contacts change.
