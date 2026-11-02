---
id: SPEC-program-dashboard
companions:
  - metrics.md
  - sections.md
  - brownfield.md
  - ../../D-Design-System/00-design-system.md
  - ../../C-UX-Scenarios/01-staff-program-overview/pages/01.1-dashboard/01.1-dashboard.md
  - ../../../docs/architecture/testing.md
sources:
  - ../../C-UX-Scenarios/01-staff-program-overview/scenario-overview.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. `metrics.md` is the only definition of every number. `sections.md` is the page contract. `brownfield.md` is the implementation map. Source documents in frontmatter were fully absorbed and are for traceability only.

# Programme dashboard

## Why

**A pain to solve, plus an opportunity to capture.** The programme's facts already exist in Supabase, but they are split across four surfaces with four different scopes: contacts in `/contacts`, calls and campaigns in `/campaigns/reports`, sessions and attendance in `/sessions`, and a partial chart set in `/manage`. A preacher cannot answer, from one screen, which newly collected contacts are stuck, which confirmed invitees never turned up, or which regulars have gone quiet. An Admin cannot hand a superior a defensible picture of the preaching without stitching screens together and hoping the numbers agree.

The dashboard turns the same rows into one scope-consistent answer: how many people we met, how many we called, how many we reached and invited, how many confirmed, how many came, who carried the work, and which named people need attention next. It is the page that closes the loop the field work opens.

## Capabilities

- **CAP-1 — One dashboard, one scope**
  - **intent:** An Admin, Preacher or Assistant opens `/dashboard` and reads the programme, or their own patch, for a chosen period, with the scope and period in the URL.
  - **success:** An Admin switches between All preachers and Own scope and every section narrows together; a Preacher and an Assistant see their scope with no switch; a reloaded or shared URL reproduces the same figures; a Volunteer is refused.

- **CAP-2 — The preaching pipeline**
  - **intent:** See how the contacts collected in the period move from assigned to called, reached (invited), confirmed, and attended in the session their campaign invited them to.
  - **success:** Each stage equals a direct SQL count for the same cohort; a contact never assigned appears as never assigned; attendance that happened without an invite is reported separately; a campaign with no linked session is flagged, not counted as zero conversion.

- **CAP-3 — Calling activity and outcomes**
  - **intent:** See calls made, contacts called, contacts reached and contacts confirmed in the period, with the disposition mix behind them.
  - **success:** The campaign card's assigned, attempted, reached, confirmed and never-attempted counts equal `campaign_progress` for the same campaign and scope; the period outcome counts sum to calls made; a queued disposition is not counted before its replay lands.

- **CAP-4 — Attendance health**
  - **intent:** See sessions held, unique attendees, check-ins, new versus returning attendees, repeat attendance and a twelve-month trend.
  - **success:** Unique attendees and check-ins equal a direct count over the same scoped sessions and period; new plus returning equals unique; a session with zero attendance is drawn as zero, not omitted.

- **CAP-5 — Focus candidates**
  - **intent:** Read a ranked, rule-based list of people to act on now — confirmed but absent, ready to invite, committed but uninvited, newly collected and untouched, or fading — each with its reason and contact details.
  - **success:** Each segment's count equals its SQL definition; every row carries the reason it was selected; a contact may legitimately appear in more than one segment; no row is outside the reader's scope; opening a segment lists every matching candidate, paginated.

- **CAP-6 — Team comparison**
  - **intent:** Compare preachers in All scope, or locations in Own scope, on contacts collected, calls made, reached, confirmed, sessions, attendees and last activity.
  - **success:** In All scope the rows cover every contact with an assigned preacher and every session with a preacher or creator; a contact with no assigned preacher is reported in Coverage, not given a synthetic row; the same rule holds for locations in Own scope; a preacher with no activity is listed with zeros; the sort is attendees descending, then name.

- **CAP-7 — Session to campaign link**
  - **intent:** An Admin, Preacher or Assistant links a new session to the campaign that invited people to it, from the `+ New session` form, and the dashboard computes invite-to-attendance exactly from that link.
  - **success:** The link persists from the new-session popover; a campaign from another program or outside the reader's scope is rejected; leaving it as `No campaign` is allowed; the dashboard's attended count for that campaign counts attendance in any linked session among contacts reached in that campaign after their first reached call.

- **CAP-8 — The Admin programme summary**
  - **intent:** An Admin reads one page — live sessions, KPIs, pipeline, outcomes, attendance trend, coverage, focus, team, active campaigns and recent sessions — and forwards it as it stands.
  - **success:** A seeded programme populates every section; a fresh programme shows deliberate empty states with a next action, never a blank page; the page remains legible at 360 px and 1440 px; there is no export control.

- **CAP-9 — Degraded mode without campaigns**
  - **intent:** A programme with `modules.dialer` false gets the same dashboard with campaign and call sections absent, not empty.
  - **success:** No campaign tile, chart, table or request renders in Gita Life; contacts, sessions, attendance and the attendance-based focus segments still work.

## Constraints

- Scope is resolved once, server-side, from `getStaffContext()`. `?mode=` only narrows an Admin; a Preacher and an Assistant have a fixed scope. An Assistant resolves through `assignedPreacherUserId`; a missing, inactive or non-Preacher assignment is an empty scope with an explanation, never a refusal and never a widening.
- Every query and function filters `program_id`. No aggregate, link, export or assertion crosses programs.
- One definition per number. `dashboard_overview` and `dashboard_candidates` compute the figures; the server loader parses them; no component recounts, re-derives or patches a figure. Percentage and formatting are display-only.
- Scope predicates match the existing contracts: contacts by `assigned_preacher_id`; sessions by `preacher_id` or `created_by`; attendance through its session; call logs through the assignment's contact's `assigned_preacher_id`, not through the caller. This is what makes an Assistant's calls count inside their preacher's patch.
- Attendance belongs to the session's scope. Attendees are not intersected with the scoped contact set: someone from another preacher's patch who attended this preacher's session still counts, and the card says so.
- The period uses the Asia/Kolkata programme day with inclusive boundaries. `?period=` carries a preset, or `period=custom` with `year` and optional `month` carries a custom window; both are reload-safe.
- `reached` means at least one call log outside `NOT_REACHABLE` and `WRONG_NUMBER`. `invited` means reached in a campaign linked to a session. `confirmed` means the latest reached log is `CONFIRMED`; for period activity it is the latest reached log inside the window, for the cohort it is as of now. `MAY_COME` is not confirmed.
- The link is a nullable `sessions.campaign_id`, set from a Campaign dropdown in the `+ New session` popover. One session has one campaign; a campaign may be linked to more than one session. Same program, validated server-side, `ON DELETE SET NULL`. The dropdown is optional and defaults to `No campaign`. No historical backfill.
- Both RPCs are `SECURITY INVOKER`, `STABLE`, pinned `search_path`, executable by `service_role` only, and refuse a null scope flag or a missing scope id when not program-scoped. The app calls them with the service-role client after resolving the staff scope; the browser receives only typed, already-scoped DTOs.
- The page is server-rendered; only the live band polls, every 20 seconds, and only while the tab is visible.
- The design system's components and tokens are reused. No new visual language, no literal colour values in the page, and a phone layout at 360 px is a first-class target.
- Performance budget: `dashboard_overview` p95 under 500 ms at 5,000 contacts and 50,000 call logs; server render under 1.5 s; one overview RPC per dashboard load and one candidates RPC per candidate page, never one per campaign.
- A failed core read is a 500. The optional campaign module fails in isolation and renders a section error, so contacts, attendance, coverage, focus and team still render.
- `modules.dialer` false removes every campaign and call surface and passes `p_has_dialer = false` so no dialer CTE runs. There is no Campaign route under `apps/gita-life`.
- No figure may disagree with the surface that owns it for the same scope and period. `/manage` keeps its charts in v1; the new page does not restate the status-quo chart or define a second version of any existing metric.
- Scope, period and the selected focus segment live in the URL. Switching scope or period is a navigation, not client state.
- On-screen only. There is no export, PDF, print or email path in v1.

## Non-goals

- No predictive scoring, machine-learned ranking or opaque recommendation. Focus rules are deterministic SQL a reader can inspect.
- No survey-response analysis. Campaign surveys are free-form per campaign and not comparable across campaigns in v1.
- No Volunteer dashboard; a Volunteer keeps landing on `/contact`.
- No bulk action, inline edit, assignment or call from the dashboard. The page reads and links; it does not become a second campaign manager.
- No new attendance capture flow. Attendance is still recorded in `/sessions`.
- No historical backfill of campaign-to-session links and no inference of a link from a campaign name or a date.
- No cross-program rollup and no multi-program selection.
- No export, scheduled report, PDF, print stylesheet or email digest.
- No retirement of the legacy `/manage` Dashboard tab in this work.

## Success signal

In a seeded programme, an Admin answers on one screen and in under a minute: how many people we collected this quarter, how many we called, how many we reached and invited, how many confirmed, how many turned up, which preachers carried the work, and which named people need action next — and every figure matches a direct SQL count for that scope and period. A Preacher sees the same page narrowed to their patch, an Assistant sees their preacher's, and a Volunteer sees none of it.

## Assumptions

- The Campaign dropdown lives in the `+ New session` popover. It is optional and defaults to `No campaign`.
- `CONFIRMED` is the only confirmed signal; `MAY_COME` is a positive outcome shown in the mix but not counted as confirmed.
- An Assistant may read the dashboard for the preacher they assist. A Volunteer may not.
- This quarter and this year are calendar periods in the programme timezone.
- The focus thresholds (7 days untouched, 60 days fading, 3 lifetime attendances) are v1 constants held in the SQL, tunable without a UI change.
- The branch is rebased onto `dev` at `a15eb57`; the sessions live routes and the contacts section are present.

## Open Questions

- Should the legacy `/manage` Dashboard tab be retired or redirected once `/dashboard` ships, or stay as it is?
- Should a campaign ever invite to more than one session? The link permits it and the dashboard aggregates across linked sessions; a one-session limit would be a constraint change.
- Are the v1 focus thresholds right for FOLK, or should a programme configure them?
- Should an upcoming confirmed invitee appear in Confirmed, not attended before the session, or only after it? This contract counts only sessions dated today or earlier.
