# Sections — the page contract

The page is one scroll. It answers, in order: what is live, how the programme is doing,
where the preaching pipeline leaks, who needs action, who carried the work, and what is
coming. A reader who stops after the KPI band must already know whether the period was
good; a reader who reads to the bottom must know what to do next.

Every figure comes from `dashboard_overview` (`metrics.md` §10). Nothing here redefines a
number.

## 1. Shell and header

- Routes: `apps/folk/app/dashboard/page.tsx` and `apps/gita-life/app/dashboard/page.tsx`,
  both `export const dynamic = "force-dynamic"`.
- Gate: `getStaffContext({ refresh: true })` then `requireRole(staff, ["Admin", "Preacher", "Assistant"])`.
  A 401 redirects to `/login?redirect=/dashboard`; a 403 redirects to
  `/auth/error?code=staff-authorization-failed`, matching `/manage`.
- Render under `StaffAuthShell` + `Header`. The page scrolls normally; reserve the fixed
  mobile bottom nav with the same bottom padding the other staff pages use
  (`--mobile-app-nav-inset`). Do not build a fixed-height dashboard grid.
- Title: `Dashboard`, `h1`.
- Scope line, directly under the title:
  `{contacts} contacts · {locations} locations · {sessions} sessions`, from the payload's
  `scope` object. These are **whole-scope, all-time** counts, not the selected period. They are the page's
  orientation, not KPIs.
- `Updated {time}` in micro text, from `generatedAt`, in the programme timezone.
- No page-level action button. There is no export.

### Scope switch

- Admin only. Two links in `nav aria-label="Data scope"`: `All preachers` and `Own scope`.
- Hrefs preserve the current period parameters (`period`, `year`, `month`):
  `/dashboard?mode=admin&period=…` and `/dashboard?mode=preacher&period=…`.
  `scroll={false}`. Active link carries `aria-current="page"`.
- Desktop: the pill pattern from `components/manage/manage-portal.tsx` (`DS-ScopeSwitch`).
- Phone: the switch stays visible as a segmented twin under the title. `/manage` hides its
  switch on a phone because the Admin Panel carries it; this page has no panel and the
  switch changes every number, so it must remain reachable.
- Preacher and Assistant have no switch. The own-scope notice explains whose rows they are
  reading.
- Use the existing `resolveManageMode` coercion: anything that is not literally
  `preacher` is `admin`. RLS is the enforcement point; the app narrowing only shrinks.

### Period control

- One labelled `select` with: `This month`, `Last 30 days` (default), `Last 90 days`,
  `This quarter`, `This year`, `Last 12 months`, `All time`, `Custom…`.
- Choosing `Custom…` reveals a Year select (required; current year default) and a Month
  select (`All months` default). Both apply immediately.
- URL: `?period=last90`, or `?period=custom&year=2026&month=10`, or
  `?period=custom&year=2026` for a whole year. Invalid values fall back to `last90`
  without an error; the parser is `parseDashboardPeriod`.
- The control is desktop-width `w-44`; on a phone it is full width under the scope line.
- Changing scope or period is `router.push(..., { scroll: false })`, never local state. The
  page re-renders on the server.

### Own-scope notice

`DS-Notice` under the header, only in own scope or for an Assistant. Copy is verbatim from
`manage-portal.tsx` for Admin/Preacher:

> Showing only rows scoped to your own staff account. Switch to the program-wide scope to
> see every preacher.

For an Assistant:

> Showing only rows scoped to {preacherName}, the preacher you assist.

For an Assistant with no active assigned preacher:

> No active preacher is assigned to your account, so this dashboard is empty. Ask an Admin
> to assign you to a preacher.

The last state renders the header and this notice, then stops. It does not call the RPC.

## 2. Live now

- Rendered only when at least one session in scope is live: `public_attendance_enabled`
  true, `now >= attendance_opens_at` when present, and `now < attendance_closes_at`.
  Reuse the existing predicate; do not add a fourth copy.
- One row per live session (`DS-LiveBand`): pulsing `Live` pill, session name, meta line
  `{preacher} · {location} · closes {time}`, check-in count `{n} checked in`, and an
  `Open Sessions` button linking to `/sessions/{id}/live`.
- The count refreshes every 20 s only while `document.visibilityState === "visible"`,
  using the session's existing attendance URL. On failure the last count stays and the
  line reads `Could not refresh live counts.` with a `Retry` text button. `Updated {time}`
  appears only after the first successful refresh.
- More than three live sessions collapse to `+{n} more live` linking to `/sessions`.
- This band is **not** period-scoped. It is now.
- `aria-live="polite"` on the count so a screen reader hears the update without a
  full-page announcement.

## 3. KPI band

Five tiles in a `dl`, each `DS-StatTile`:

| # | Label | Value | Caption |
|---|---|---|---|
| 1 | Contacts collected | `contactsCollected` | delta vs previous period |
| 2 | Calls made | `callsMade` | `{contactsCalled} contacts called` |
| 3 | Reached | `contactsReached` | `{reachRate}% of contacts called` |
| 4 | Confirmed | `contactsConfirmed` | `{confirmationRate}% of contacts reached` |
| 5 | Attended | `uniqueAttendees` | `{attendanceRecords} check-ins` |

- Tiles are not links. A tile that looks tappable and goes nowhere is worse than a plain
  figure.
- The delta is text (`+12` / `−8` / `No previous period`), not colour alone.
- Grid: two columns on phones with the fifth spanning both; three columns from `md`
  (3 + 2); five from `xl`.
- Without `modules.dialer`: four tiles — Contacts collected, Sessions held, Attended,
  Check-ins. Calls, Reached and Confirmed are absent, not zero.
- An empty scope renders zeros with the notice above; it does not render `—`.

## 4. Pipeline and outcomes

One row, two cards. At `xl` the pipeline is `minmax(0,2fr)` and outcomes `minmax(0,1fr)`;
below `xl` they stack, pipeline first.

### Preaching pipeline

- Title `Preaching pipeline`; subtitle `Contacts collected in {period}, followed to today`.
- Five bars: Collected, Assigned, Called, Reached (invited), Confirmed. Each shows the
  exact count and `{stage}%` of collected. Bar width is `stage / collected`; the bar for
  Confirmed is the last nested stage.
- Between bars, the leak is named, not just implied: `Never assigned {n}`,
  `Never called {n}`, `Not reached {n}`, `Not confirmed {n}`. On a phone these become a
  vertical list of stages with the leak as a caption under each.
- The pipeline's Confirmed is **as of today** for the cohort; the KPI tile's Confirmed is
  the calls made in the period. The subtitles say so and the two are never presented as
  the same count.
- Footer readout:
  `Attended after invite: {attended} of {invited} invited ({pct}%)`, then
  `{confirmed} confirmed · {unconfirmed} arrived without confirming`.
- When `unlinkedCampaigns > 0`, a warning line:
  `{n} campaign(s) reached contacts but have no linked session.` with a link to
  `/campaigns`. This is the honest reason attendance conversion can be `—` or understated.
- Empty states:
  - No cohort: `No contacts were collected in this period.` + link to `/contact`.
  - Cohort but no campaigns: `No campaigns yet. A campaign is how collected contacts get
    called and invited.` + link to `/campaigns/new`.
  - No linked campaign: `No campaign is linked to a session yet. Link a session on a
    campaign to measure invite-to-attendance.` + link to `/campaigns`.
- Without `modules.dialer`: the card becomes `Collection and attendance` with two figures,
  `Collected` (`contactsCollected`) and `Attended` (`uniqueAttendees`), and no invite
  footer. They are period totals, not a cohort: do not draw a conversion percentage
  between them.

### Call outcomes

- Title `Call outcomes`; subtitle `Calls made in {period}`.
- One horizontal bar or donut per `status_group` present, with count and share of calls.
  Use the six groups in fixed order: `CONFIRMED`, `MAY_COME`, `DEFERRED`,
  `NOT_REACHABLE`, `WRONG_NUMBER`, `NOT_INTERESTED`. A group with zero is omitted from
  the chart but remains in the accessible summary.
- Below the chart, `{callsMade} calls · {contactsCalled} contacts`. A single line:
  `Queued dispositions are counted when their replay lands.`
- Empty: `No calls recorded in this period.` + link to `/campaigns`.
- The card is absent without `modules.dialer`.

## 5. Attendance health and coverage

One row, two cards. At `xl` attendance is `minmax(0,2fr)`, coverage `minmax(0,1fr)`;
below `xl` they stack.

### Attendance

- Title `Attendance`; subtitle `Last 12 months, independent of the selected period`.
- Grouped bars or a line with two series: unique attendees and check-ins per month.
  Twelve months ending at the current month; zero months are drawn as zero.
- Above the chart, three figures in a compact row: `{sessionsHeld} sessions`,
  `{averageAttendance} avg per session`, `{repeatRate}% attended more than once`.
- A caption under the chart: `{newAttendees} new · {returningAttendees} returning ·
  {invitedAttendees} invited · {organicAttendees} came without an invite`.
- Empty: `No attendance recorded in this period.` The trend still draws the twelve months
  as zero bars; do not replace the card with a blank.
- The chart carries an `sr-only` summary listing each month's attendees and check-ins.

### Contact coverage

- Title `Contact coverage`; subtitle `All {contacts} contacts in scope`.
- Four rows, each `label · count of total · percentage` and a thin progress bar:
  Has a location, Has an assigned preacher, Has a first-contact date, Has a collector.
- Whole-scope, not period-scoped. The subtitle says `All`.
- A row at 100% reads `Complete` instead of a percentage. A row with zero reads `None yet`.
- Rows are figures, not links. The contacts grid owns editing.
- Empty scope: `No contacts in scope yet.`

## 6. Focus now

Full width. Title `Focus now`; subtitle `People to act on today, independent of the
selected period`.

Five segment cards in a two-column grid from `lg`, one column below. Each card:

- Label and count, e.g. `Confirmed, not attended` · `12`.
- A one-line rule, in plain language (from `metrics.md` §9).
- The first three rows: name, the reason, and a `tel:` link labelled `Call {name}`.
- `View all` linking to `/dashboard/candidates?segment={key}`.
- A zero count still renders the card with `Nothing here right now` — the reader sees that
  the rule ran and found nobody. Do not hide the segment.
- A page-level note: `A person can appear in more than one list; counts are not a total.`
- Without `modules.dialer`: only `New and untouched` (collected 7–90 days ago, never
  attended) and `Fading` render.
- No bulk action. The card is a reading and calling surface.

### Candidate list

`/dashboard/candidates?segment={key}`, same shell and gate. Header shows the segment label,
its rule, and the total. A server-rendered list of up to 50 per page, `Previous` / `Next`
links preserving the segment in the URL. Each row: name, phone (`tel:`), preacher, location,
last activity, reason. Empty: the segment's empty sentence. An unknown segment is a 404.

## 7. Team table

Full width. Title `By preacher` in All scope, `By location` in Own scope. Subtitle names
the scope.

- Desktop `DS-Table` with an `sr-only` caption: `Assigned contacts and sessions only;
  unassigned contacts are reported in Contact coverage.` Columns:
  - Preacher: Preacher · Collected · Calls · Reached · Confirmed · Sessions · Attendees · Last activity.
  - Location: Location · Collected · Calls · Reached · Confirmed · Sessions · Attendees · Last activity.
- `Last activity` is `12 Oct 2026` or `—`. Numbers are `tabular-nums`.
- Server-side sort: attendees desc, sessions desc, name asc. No sort controls in v1.
- A row with no activity stays with zeros; that is the point of the table.
- Phone: the list twin, one row per person, label/value pairs, no horizontal scroll.
- Empty: no preachers/locations in scope → `No preachers in this programme yet.` with a
  link to `/admin/invite` for an Admin or `/volunteers` for a Preacher.

## 8. Active campaigns and recent sessions

One row at `xl`: campaigns `minmax(0,2fr)`, recent sessions `minmax(0,1fr)`. Below `xl`
they stack.

### Active campaigns

- Title `Active campaigns`; subtitle `Calling in this programme now`.
- Campaign-lifetime figures: changing the period does not change this card.
- Table columns: Campaign · Session · Assigned · Reached · Confirmed · Attended.
  - The session cell reads `No session linked` in muted text when none, the newest linked
    session name when one, and `{newest} +N more` when several.
  - `Attended` counts distinct reached contacts who attended **any** linked session after
    their first reached call. It is `—` when the campaign has no linked session; `0` only
    when a linked session genuinely has no invited attendee.
  - A small `{neverAttempted} never called` warning sits under `Assigned` when greater
    than zero.
- Campaign name links to `/campaigns/{id}`; the session name links to the newest linked
  session's `/sessions/{id}`.
- Empty: `No active campaigns.` + link to `/campaigns`.
- Absent without `modules.dialer`.

### Recent sessions

- Title `Recent sessions`; subtitle `The last five in scope`.
- Rows: session name (link to `/sessions/{id}`), date, preacher, location, attendee count.
- A session with no date shows `—`; it is not silently dropped from the list if it is one
  of the five most recent by `created_at`. (The period counts still exclude it.)
- Empty: `No sessions yet.` + link to `/sessions`.

## 9. States

| State | What renders |
|---|---|
| Assistant with no active preacher | Header, scope notice, no sections, link to `/contact`. No RPC call. |
| Fresh programme, no contacts | Header, zero KPI band, pipeline empty with `/contact`, focus cards all zero, coverage empty, team zeros, campaigns/recent empty. Never a blank page. |
| No campaigns, dialer on | KPI calls/reached/confirmed are zero; pipeline says no campaigns with a create link; outcomes empty; campaign card empty. |
| No linked sessions | Pipeline warning line; campaign `Attended` is `—`; the rest renders. |
| Core read fails | Page-level 500 via the app's error boundary; no partial page with silent zeros. |
| Campaign module fails | Campaign card and pipeline warning render a section error: `Could not load campaign figures.` with a `Reload` link. Every other section still renders. |
| Unauthorized | 401 → login; 403 → `/auth/error?code=staff-authorization-failed`. |
| Volunteer | 403, never the dashboard. |

## 10. Responsive and accessibility

- 360 px is a first-class width: single column, KPI 2-col with the fifth spanning, pipeline
  as a vertical stage list, focus one column, tables as list twins.
- At `md`: KPI 3 + 2; pipeline and outcomes stack; focus two columns.
- At `xl`: the three two-card rows above; page max width follows the `/campaigns` and
  `/manage` container, not a new bespoke width.
- The scope switch is a `nav` with `aria-current="page"`. The period control has visible
  labels and accepts keyboard input. Charts have `sr-only` summaries. Tables have
  `sr-only` captions. `tel:` links are labelled `Call {name}`, not just the number.
- Focus rings come from the design system; do not remove them. Colour is never the only
  carrier of a value or a delta.
- No motion beyond the live pulse; no auto-advancing carousel.

## 11. Design authority

- **Tokens and component recipes:** `_bmad-output/D-Design-System/00-design-system.md`.
  Use `DS-Shell`, `DS-PageHeader`, `DS-ScopeSwitch`, `DS-Notice`, `DS-Card`, `DS-StatTile`,
  `DS-LiveBand`, `DS-Table`, `DS-EmptyState`, `DS-CardAction`, `DS-Chart`, `DS-FocusRing`.
- **Page anatomy:** the validated WDS page in
  `_bmad-output/C-UX-Scenarios/01-staff-program-overview/pages/01.1-dashboard/01.1-dashboard.md`.
  This spec differs deliberately: the route is `/dashboard`, not `/overview`; the switch
  stays on a phone; the KPI band is pipeline-led (contacts, calls, reached, confirmed,
  attended) rather than the WDS's contacts/sessions/attendees/attendance/active-campaigns
  set; the pipeline, call outcomes, coverage and focus sections are added; the
  campaign-to-session link is added; the contact-generation trend and the old `status quo`
  pie stay in `/contacts` and `/manage` and are not duplicated; and the WDS's "invites
  excluded" note is superseded — invitation is a reached campaign call, not `invite_log`.
- **Section patterns:** `Kiranism/next-shadcn-dashboard-starter` — the KPI card row,
  a large trend chart beside a compact breakdown, a donut/bar for a categorical mix, a
  data table, and a recent-activity list. Borrow the section-level error isolation idea,
  not its parallel-route machinery. Do **not** copy its sidebar, Clerk auth, React
  Query/nuqs data layer, theme system or demo content. This app is server-rendered with
  URL search params and its own design tokens.
- No new dependency. Charts use the existing Recharts and `components/ui/chart`.
