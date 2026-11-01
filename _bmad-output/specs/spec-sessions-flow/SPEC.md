---
id: SPEC-sessions-flow
companions:
  - design-reference.md
  - data-model.md
sources: []
---

> **Canonical contract.** `SPEC.md` is the contract; `design-reference.md` is the visual authority; `data-model.md` is the query contract. Read the constraints first.

# Sessions flow

## Why

The Sessions module is where the programme records who actually came, but today `/sessions` is only a live check-in screen: staff start a session, watch the attendance dashboard, and then the record leaves their view. `/manage` has a sessions tab with its own scope, but the standalone module has no overview of past sessions, no attendance total, no attendee detail, and no reporting. Sessions now has one Overview surface — the table plus the charts that used to sit behind a Reports tab — so staff can answer "how many came, who were they, and how are we trending" without leaving the module.

## Capabilities

- **CAP-1** — Session overview
  - **intent:** Staff can see every session in their scope with its name, date, location, attendance total and current status, and narrow the list by location on desktop.
  - **success:** `/sessions` lists sessions newest first; each row carries name, date, location, attendance total and status; the desktop location filter narrows the list; an empty scope renders the Campaign empty state; the mobile list carries no location filter.

- **CAP-2** — Automatic status
  - **intent:** Each session's status follows its creation time and duration without any manual action or scheduled job.
  - **success:** `Upcoming` before the window opens; `Live now` between `attendance_opens_at` and `attendance_closes_at`; `Completed` at the close. A page left open across the boundary re-renders without a reload, and no row is written.

- **CAP-3** — Session detail and attendee contact
  - **intent:** Staff can open a session, see who attended, and open an attendee's contact record with attendance history, on desktop and mobile.
  - **success:** A session that is `Live now` opens its live attendance dashboard instead of the detail surface; a completed or not-yet-open session shows the designed detail. Detail lists every attendance row for the session with contact name, phone, location, sessions attended and first session; selecting one opens that contact's full record in a modal on both breakpoints — phone, location, assigned preacher, first and last contact, sessions attended, past 60-day attendance, last attended, collected-by, favourite, notes and attended-session history.

- **CAP-4** — Overview insights
  - **intent:** Staff can read the attendance shape from the Overview: attendance by session and weekly check-ins, beside the recent-session pulse.
  - **success:** The two reporting charts use the default 90-day window; their series equal a direct `count(attendance)` for the in-window sessions; the weekly series sums to that total; attendance by session is ordered by count; no under-filled or capacity card exists. The separate Reports route is retired.

- **CAP-5** — New session
  - **intent:** Staff can start a live session from the Overview without leaving the module.
  - **success:** `New session` appears on desktop and mobile Overview and opens a popover with name, location and duration; submitting creates a session with attendance open at that moment and closing at `now + duration_minutes`, then opens that session's live attendance dashboard at `/sessions/<id>/live`, where its public attendance link and QR are shown.

- **CAP-6** — Design conformance and navigation
  - **intent:** Sessions matches the saved design on both breakpoints, with one Overview destination and no tab strip.
  - **success:** Desktop and mobile show the single Overview title without a tab strip or chevron menu; the table and cards keep the design's layout, type, spacing and tokens; the insight cards share one header and grid alignment. The saved frames describe completed sessions; a live session's dashboard is outside that comparison.

- **CAP-7** — Programme attendance stats
  - **intent:** The overview's repeat-attendee and average-attendance figures are defined consistently and computed in the database.
  - **success:** Repeat attendees equals the distinct contacts with at least two attendances; average attendance is attendees per session in the current calendar month and the card shows the signed difference from the previous month; both come from the `sessions_overview_stats` function.

- **CAP-8** — Live attendance dashboards
  - **intent:** Staff can watch a live session's attendance dashboard, one per live session, and reach it from the session they just started.
  - **success:** `/sessions/<id>/live` renders the live dashboard for a visible session that is `Live now`; creating a session lands there; opening a `Live now` row or its detail URL lands there; two live sessions in one scope have two independent URLs; a session that is not live at `/live` redirects to its detail; a malformed or foreign id is 404.

## Constraints

- **No table or column change.** `sessions`, `attendance`, `contacts`, `locations` stay as they are; read-only PostgreSQL functions may be added and are called through `.rpc()`.
- **`session_date` is `DATE`.** Never parse it as text; cast it at `Asia/Kolkata` midnight when a timestamp is needed.
- **Attendance total** is `count(attendance)` for the session. There is no capacity, invite or expected-headcount field; show totals only, never `x of y`.
- **No contact email** exists in the schema and the design has none; do not render an email row.
- **No absence data.** Attendance history lists attended sessions only.
- **Public attendance is always enabled.** `public_attendance_enabled` is true for every session and is not read when deriving status; only the creation time and duration decide `Upcoming`, `Live now` or `Completed`.
- **Null dates resolve to `Completed`**, never an endless live session.
- **Scope** (see `data-model.md`): Admin the programme; a Preacher sees their own sessions, sessions where they are the owning preacher, and sessions created by the assistants assigned to them; an Assistant sees their own, their assigned preacher's, and sessions they own. This widens today's creator-only `/api/sessions` read — a deliberate behaviour change.
- **The `sessions` SELECT policy gains the same assistant-created term** so the database backstop matches the app scope; no table or column changes.
- **Reads use the service-role client** after `getStaffContext()` and `requireRole`; the SQL functions are `security invoker` and executable only by `service_role`.
- **Creation keeps today's behaviour:** the `New session` popover starts a live session now, opens attendance, closes it after the duration, and enables public attendance. No scheduling.
- **Design authority** is `sessions.figcraft`, 11 frames, plus the dashboard enhancements recorded in `design-reference.md`. Mobile carries no pills or chevron menu. The frames describe completed sessions; a live session's dashboard is outside that comparison. `/manage`'s sessions tab is unchanged.
- **Insights are computed on read** through `.rpc()`; no aggregate table, materialized view or cron. The Reports route is retired and its two charts live on the Overview.

## Non-goals

- Scheduling a future session; editing, cancelling or deleting a session.
- Capacity, invitations, registration or expected headcount; a capacity-based "Needs attention" card.
- Contact email, absence tracking or attendance correction.
- Per-session CSV export; call logging, disposition or Campaign integration.
- Changes to `/manage`'s sessions tab.

## Success signal

A staff member opens `/sessions` and sees every session in their scope with the correct attendance total and status. A session left open across its `attendance_closes_at` flips to `Completed` without a manual write. Opening a session shows its attendees and each attendee's contact record and attended history on both breakpoints. The Overview's insight series match a direct count of `attendance`, and the average-attendance delta matches the current and previous month.

## Verification

- `e2e/specs/sessions-overview.spec.ts` — table fields, location filter, empty state, status flip across `attendance_closes_at`, a preacher seeing a session created by their assigned assistant, live rows, a newly created session landing on `/sessions/<id>/live`, and the insight charts matching a direct 90-day count.
- `e2e/specs/sessions-detail.spec.ts` — attendee rows, the contact modal with every contact field and attended history, no email or action buttons, foreign session id is 404.
- `pnpm test:static` and `pnpm test:unit` before done; full `pnpm test:e2e` before a PR because `lib/supabase/data.ts` is shared.
- Claim the new matrix rows in `matrix-coverage-map.md`; do not add a second runner.

## Assumptions

- Attendance is walk-in check-ins; the overview shows a total, never a fraction.
- `New session` opens a popover from the Overview header; the route has one destination, so there is no tab strip or chevron menu.
- Repeat attendees and average attendance are programme-wide figures defined in `data-model.md`.
- The default report range is the last 90 days.
