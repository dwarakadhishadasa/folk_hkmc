---
title: 'Campaign overview and the roster performance columns'
type: 'feature'
created: '2026-10-27'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-autodialer/epics.md'
  - '{project-root}/_bmad-output/specs/spec-autodialer/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/specs/spec-autodialer/stories/1-6-caller-roster-ui.md'
  - '{project-root}/_bmad-output/specs/spec-autodialer/stories/1-9-campaign-overview-server.md'
  - '{project-root}/_bmad-output/specs/spec-autodialer/stories/1-9-campaign-overview-api.md'
  - '{project-root}/docs/architecture/testing.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `/campaigns` still renders the 1.4 list — Campaign, End Date, Status
and a row count — because no screen could compute a funnel count when it was
written. `campaign_progress` and `listCampaignsWithProgress` now exist, so the
Overview is the last place where AD-5's five definitions are missing: an admin
cannot see a stalled campaign, the five tiles frame 32 draws are absent, and
`/campaigns/callers` still withholds the four performance columns frame 645
draws. Both screens were left saying a zero would be a lie; now it is a
measurement.

**Approach:** `apps/folk/app/campaigns/page.tsx` calls
`listCampaignsWithProgress(staff)` instead of `listCampaigns(staff)` and renders
three sibling surfaces from the one result: five stat tiles summed across the
visible campaigns' summaries, the campaign table with the four count columns, and
— below `md` — frame 1752's arrangement (five tiles in two rows of two plus one,
an `Active` section of campaign cards, then a compact list for the other
statuses). The footer reads `N campaigns · X draft · Y cancelled` from the rows in
hand, a line under the tiles states that queued dispositions are not counted
until their replay lands, and zero campaigns keeps UX-DR24's `Create campaign`
empty state instead of five zeroes. `apps/folk/app/campaigns/callers/page.tsx`
calls `getRosterProgress(staff)` and hands the map to `caller-roster.tsx`, which
gains Contact, Campaigns, Calls made and Reached.

## Boundaries & Constraints

**Always:**
- Every number on both screens comes from `campaign_progress` through
  `listCampaignsWithProgress` / `getRosterProgress`. The tiles are sums of the
  rows' own `summary`; the table cells are each row's `summary`; the roster cells
  are `RosterProgress` keyed by `CallerRosterEntry.callerId`. No count is derived
  from a call-log read, a contact count or a client-side tally.
- The five buckets are Assigned, Attempted, Reached, Confirmed and Never
  attempted, and Never attempted keeps a tile of its own (assigned − attempted).
- A Preacher's campaign rows stay visible; only their counts narrow, because the
  server already scoped the summary. No row is filtered on the client.
- Desktop (`md` and up) is frame 32: one row of five tiles and the seven-column
  table. Below `md` it is frame 1752: tiles two per row, no table, campaign cards.
- The empty state is the whole body when there are no campaigns: no tiles, no
  table, no footer of zeroes — `CampaignEmptyState` with `Create campaign`.
- The queued-disposition line is a statement about the numbers. There is no
  queue yet, so it carries no count.
- A roster row with no caller profile has no key in the map and reads `0` in the
  three count columns — a measured zero, because such a staff user cannot hold an
  assignment.
- Existing tokens only (`--card`, `--border`, `--muted`, `--muted-foreground`,
  `--program-text`, `--program-accent`); server components for the pages, with
  `"use client"` only where a control already needed it.
- `pnpm test:static` and `pnpm test:e2e campaign-` both pass, and
  `campaign-campaigns`, `campaign-callers`, `campaign-assign-*` and
  `campaign-survey` keep passing.

**Never:**
- No second funnel computation, no per-screen definition, no percentage derived
  from two rounded counts.
- Never render a count the surface cannot compute: a missing progress entry on a
  roster row is `0` only because the row provably cannot own an assignment.
- No `use client` page, no new dependency, no `Date.now()` in a component.
- Do not touch `lib/**`, `apps/folk/app/api/**`, `components/header.tsx`, the
  proxies, `public/sw.js`, `e2e/fixtures/**`, `e2e/auth/**`,
  `playwright.config.ts` or `package.json`.
- Do not weaken a passing assertion. Two pinned absences become pinned presences
  in the same change, because they were pinned to fail when this layer landed.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| No campaigns | Admin, program empty | `No campaigns yet`, `Create campaign` → `/campaigns/new`; no totals region, no table | — |
| One DRAFT campaign, 3 assignments, 1 `CONFIRMED` log | Admin | Tiles 3 / 1 / 1 / 1 / 2; row `3 · 1 · 1 · 2`; footer `1 campaign · 1 draft · 0 cancelled` | — |
| Never attempted | Same fixture | Its own tile reads `2`, not folded into Attempted | — |
| Queued disposition | Any | Footnote only — no queued number anywhere | — |
| Phone, 390 px | DRAFT campaign | Tiles in rows of 2/2/1 (Assigned, Attempted / Reached, Never attempted / Confirmed), no table, `Other campaigns` compact list | — |
| Phone, ACTIVE campaign | After `start` | `Active` heading + card with all five counts; no compact list; footer `0 draft` | — |
| Phone, CANCELLED campaign | After `cancel` | `Active` absent; compact list row reads `CANCELLED`; footer `0 draft · 1 cancelled` | — |
| Dark | Toggle theme | All five tiles still render; table and cards unchanged (tokens only) | — |
| Preacher, one in-scope and one out-of-scope assignment | Preacher session | Campaign row visible; Assigned `1`, Never attempted `1`; two rows exist in the table | — |
| Roster, promoted caller with 3 assigned and 1 call | Admin | Contact = email, Campaigns `3`, Calls made `1`, Reached `1` | — |
| Roster, profile-less staff row | Admin | Contact = email; Campaigns / Calls made / Reached all `0` | — |
| Zero campaigns on the roster | Admin | 1.6's `No callers in your scope yet` state, unchanged | — |
| Roster read while campaigns fail | Any | The page throws to the error boundary | `500` |
| Signed out | Any | Redirect to `/login?redirect=…` | `401` |
| Not an admin role | Volunteer | Redirect to `/auth/error?code=staff-authorization-failed` | `403` |

## Human Decisions

1. **Never attempted's tile is neutral, not amber.** Frame 32 tints the value
   `#F97F29`, but the packet assigns that amber bucket to the Reports screen
   (node 790). This screen uses `--program-text` like the other four tiles, so
   the tile says "this is a bucket" and not "this is a warning" until Reports
   defines the warning.

2. **No percentage captions.** The frame shows `74% of assigned`, `61% of
   attempted`, `65% of reached` and `26% of assigned`. Each would be a fifth
   number derived from two displayed ones, with its own rounding and its own
   division-by-zero state. The captions instead state the AD-5 definition in
   words — `With at least one call`, `Outside not-reachable`, `Latest reached is
   confirmed`, `Assigned − attempted` — so the tile explains its bucket without
   inventing a metric nobody asked for.

3. **Phone order is 2/2/1, with Confirmed last.** Frame 1752's second row is
   Reached and Never attempted; five tiles cannot fill two columns evenly, so the
   odd one out is Confirmed — the bucket the phone frame omits entirely. The DOM
   order stays frame 32's (`Assigned, Attempted, Reached, Confirmed, Never
   attempted`) and two `order` utilities move Never attempted to 4 and Confirmed
   to 5 below `md`, reset at `md` so the desktop row is untouched. The compact
   list below the Active cards carries the design's three cells plus Attempted
   and Confirmed in one line, because the phone is the only Overview some roles
   see and it may not show fewer numbers than the table.

4. **The empty state replaces the tiles.** Five zeroes above "No campaigns yet"
   would be a screen of zeroes with an apology under it. The action is the
   answer; the tiles appear with the first campaign.

5. **`Contact` is the staff email; the three counts are the packet's zeros.** The
   packet says a profile-less row "renders 0 in all four", but Contact is not a
   count — a staff user without a caller profile still has an email, and printing
   `0` there would be false. The row shows the email and `0` in Campaigns, Calls
   made and Reached, which is the true zero: without a `dialer_callers` row it
   cannot hold an assignment.

6. **`Campaigns` is the assignment-grain `assigned` count.** Frame 645's cell is a
   pill naming one campaign, i.e. a per-campaign row the roster does not have.
   `getRosterProgress` returns one aggregate per caller across every visible
   campaign, so the column header keeps the design's word and the number is
   `assigned` — the count of contacts assigned to that caller. A per-campaign
   breakdown would need a second shape from the service, which this layer cannot
   add.

7. **The queued line is a statement, not a badge.** AD-5 says a queued
   disposition is not counted until its replay lands. No queue exists before
   Story 2.3, so the sentence sits under the tiles and shows no number; a `0
   queued` would be a claim about a system that does not run yet.

8. **Both fixture-bearing specs start from zero campaigns.** The overview's tiles
   are a sum across every visible campaign, so the expected numbers can only be
   the fixture's if the program holds nothing else. The seed has no campaigns;
   the spec deletes them first, exactly as the 1.4 empty-state row does, and every
   row it creates is removed in its own `finally`.

9. **Two pinned absences become pinned presences.** `campaign-campaigns.spec.ts`
   pinned the four count columns' absence and `campaign-callers.spec.ts` pinned
   the four performance columns' absence — both were written to go red when this
   layer landed (the roster record says so). They now assert the columns exist,
   read the row's measured values, and the old footer regex became the exact
   three-part footer. Nothing else in either spec was loosened or deleted.

</frozen-after-approval>

## Code Map

- `apps/folk/app/campaigns/page.tsx` — `listCampaignsWithProgress`, the draft and
  cancelled counts, the tiles / footnote / table / cards / footer composition,
  the empty state.
- `components/campaign/campaign-overview-stats.tsx` — new: the five tiles as a
  `<dl>` inside `section[aria-label="Campaign totals"]`, each marked
  `data-campaign-stat` for the spec, summed from the entries' summaries, with the
  phone order utilities.
- `components/campaign/campaign-overview-cards.tsx` — new: frame 1752's phone
  arrangement — `Active` section of cards carrying all five counts, then an
  `Other campaigns` compact list for DRAFT / COMPLETED / CANCELLED.
- `components/campaign/campaign-list.tsx` — rewritten: frame 32's seven columns
  over `CampaignOverviewEntry[]`, desktop-only, the table-only file (the footer
  moved to the page).
- `components/campaign/caller-roster.tsx` — Contact / Campaigns / Calls made /
  Reached, read from `RosterProgress` by `callerId`; the status pill and the
  Admin-only switch are unchanged.
- `apps/folk/app/campaigns/callers/page.tsx` — `getRosterProgress(staff)` and the
  one new prop.
- `e2e/specs/campaign-overview.spec.ts` — new: five tests over a disposable
  campaign, three assignments and one inserted `CONFIRMED` log.
- `e2e/specs/campaign-campaigns.spec.ts` — the four-column presence assertion,
  the row's four zero cells and the exact footer.
- `e2e/specs/campaign-callers.spec.ts` — the four-column presence assertion, the
  fixture row's email and its three zero cells; the file header no longer says
  the columns are withheld.
- `lib/dialer/progress.ts` — `listCampaignsWithProgress`, `getRosterProgress`,
  the DTOs and the summary keys (read-only here).
- `apps/folk/app/api/dialer/admin/campaigns/[campaignId]/progress/route.ts` — the
  route the numbers arrive through (read-only here).
- `e2e/fixtures/dialer-campaign.ts` — `createDisposableCampaign` /
  `deleteDisposableCampaign` (read-only here).

## Tasks & Acceptance

**Execution:**
- [x] `components/campaign/campaign-overview-stats.tsx` — the five tiles.
- [x] `components/campaign/campaign-overview-cards.tsx` — the phone sections.
- [x] `components/campaign/campaign-list.tsx` — the seven columns.
- [x] `apps/folk/app/campaigns/page.tsx` — the page over
      `listCampaignsWithProgress`, the footnote and the footer.
- [x] `components/campaign/caller-roster.tsx` and
      `apps/folk/app/campaigns/callers/page.tsx` — the four performance columns
      from `getRosterProgress`.
- [x] `e2e/specs/campaign-overview.spec.ts` — five tests, fixture and ordered
      cleanup.
- [x] `e2e/specs/campaign-campaigns.spec.ts` — absence → presence, exact footer.
- [x] `e2e/specs/campaign-callers.spec.ts` — absence → presence, fixture zeros.
- [x] `_bmad-output/specs/spec-autodialer/stories/1-9-campaign-overview-ui.md` —
      this record.

**Acceptance Criteria:**
- Given no campaigns, then the page shows `No campaigns yet` with a `Create
  campaign` link to `/campaigns/new`, and no totals region and no table.
- Given one campaign with 3 assignments and one `CONFIRMED` log, then the tiles
  read Assigned 3, Attempted 1, Reached 1, Confirmed 1, Never attempted 2, the
  row's four count cells read `3 · 1 · 1 · 2`, and the footer reads `1 campaign ·
  1 draft · 0 cancelled`.
- Given the same state, then Never attempted is its own tile reading `2`.
- Given the same state, then the queued-disposition sentence is visible and no
  queued count exists on the page.
- Given a 390 px viewport with a DRAFT campaign, then the five tiles occupy rows
  of two, two and one in the order Assigned/Attempted, Reached/Never attempted,
  Confirmed; there is no table; and the compact list names the campaign's counts.
- Given that campaign started, then the `Active` heading and a card with the same
  five counts replace the compact list.
- Given that campaign cancelled, then the compact list returns, reads `CANCELLED`
  and the footer reads `0 draft · 1 cancelled`.
- Given a dark theme, then the five tiles still render.
- Given a Preacher with two assignments of which one is outside their scope, then
  the campaign row is visible and reads Assigned 1 / Never attempted 1.
- Given the roster as Admin after 3 assignments and one call to one caller, then
  Contact shows the email, Campaigns `3`, Calls made `1`, Reached `1`; a
  profile-less row shows its email and `0 · 0 · 0`.
- Given `pnpm test:e2e campaign-`, then 58 tests run (4 role setups + 54 spec
  tests) and all pass.

## Implementation Notes

### The five definitions come from the function

Nothing on either screen decides what "attempted" means. `listCampaignsWithProgress`
returns one `CampaignProgressSummary` per campaign and `getRosterProgress`
aggregates the per-caller rollup of the same RPC results; the page sums the keys
it displays and the roster reads the keys by `callerId`. The five buckets are
therefore the SQL function's own `assigned`, `attempted`, `reached`, `confirmed`
and `never_attempted`, and the roster's `callsMade` is the function's log-grain
count, so the roster cannot disagree with the campaign table beside it.

`CampaignOverviewStats` sums the entries it is given — that is composition, not a
second definition, and it happens on the server. Nothing is summed in a client
component, and no component reads a call log.

### The phone arrangement

Frame 1752 shows four tiles in two rows — Assigned / Attempted, then Reached /
Never attempted — and no Confirmed tile. The story requires all five, so the
fifth is Confirmed alone on the row beneath, and the two `order` utilities move it
and Never attempted into that order below `md` only. Above `md` the reset returns
the DOM order, which is frame 32's own.

The table is a `hidden md:block` sibling rather than a client-side viewport
branch, so the page stays a server component and a phone has no table in the
accessibility tree at all. The cards are its `md:hidden` counterpart: a card per
ACTIVE campaign with a 3-column count grid, then one compact list for every other
status. The e2e pins the arrangement geometrically (two tiles share a `y`, two
share an `x`, the fifth sits below) rather than by class name.

### The roster column change and its spec update

`caller-roster.tsx` is still a server component — it renders `CallerStatusControl`,
which is the client boundary — so the `RosterProgress` `Map` crosses no
serialisation boundary. A row's progress is `progress.get(entry.callerId)`; an
entry without a `callerId` has no key and falls back to `0` for the three counts,
which is the service's own stated invariant (no profile, no assignment).

`campaign-callers.spec.ts` pinned all four headers absent because Story 1.6 could
not compute them (its record says Story 1.9 must replace the assertion). The four
now assert `toBeVisible()`, the promoted fixture row shows its email and three
`0` cells, and the file header says so. `campaign-campaigns.spec.ts` had the same
pin on Assigned / Reached / Confirmed / Never attempted; it now asserts the four
headers, the row's four `0` cells and the exact new footer. Both replacements are
the change the previous layers asked for, not a loosening.

### The queued footnote

`Queued dispositions are not counted until their replay lands.` sits directly
under the tiles. It has no number beside it: the queue is Story 2.3's, its replay
is Story 2.3's, and a count of a queue that does not exist would be a zero that
reads like a measurement.

### The e2e fixture and cleanup order

The API layer could only read a campaign with nothing assigned into it, so this
spec owns the first non-zero funnel: a campaign through the admin route, three
assignments through the real assignment route (which also auto-promotes the
caller), and one `CONFIRMED` call log inserted as the service role — there is no
disposition route until Story 2.3, and `status_group` is generated, so the
insert writes `disposition_status`.

`dialer_assignments.campaign_id` and `dialer_callers.user_id` are `ON DELETE
RESTRICT`, so the cleanup order is fixed and runs in a `finally` (and in the
fixture's own failure path): call logs → assignments for the campaign → the caller
profiles whose `user_id` was absent before the test → the campaign. All four go
through the loopback-guarded `POST /pg/query` because `service_role` holds no
`DELETE` on the dialer tables.

The Preacher's test adds the one assignment the route cannot create — a contact
another preacher owns, inserted as the service role — so the call counts two rows
exist while the Preacher's row reads one. The roster test reads the profile-less
staff row from `users` minus `dialer_callers`, so it names a real row rather than
assuming which seeded role has no profile.

### Layout

`CampaignOverviewStats` uses `grid-cols-2 md:grid-cols-5` with a 4px-scaled gap
and the shared card surface; `CampaignList` keeps the 1.4 table's cell padding
and muted header row and adds four `tabular-nums` cells; the phone cards reuse
the same border, card and radius tokens. The roster's email cell is
`max-w-[180px] truncate`, which is what frame 645's `divya.parthasarathy@…`
illustrates, and the `Table` primitive's `overflow-x-auto` keeps the wider table
scrollable rather than breaking the page at 390 px.

## Spec Change Log

- Story 1.6's Human Decision 1 ("two columns now, six later") and its
  "performance-column deferral" are fulfilled here: the table now renders the
  four `campaign_progress` columns and the spec asserts their presence.
- Story 1.4's list assertion (`/^\d+ campaigns?$/` plus four absent count
  headers) is replaced by the same four headers present, their measured zeroes on
  an empty campaign, and the story's three-part footer.
- No frozen intent changed.

## Review Triage Log

## Verification

**Commands run:**
- `pnpm test:static && pnpm test:e2e campaign-` (the packet's VERIFICATION
  command, chained) — **PASS**, exit 0.
- `pnpm test:static` — **PASS**, exit 0, on the final tree.
  - `pnpm guardrails` — `Monorepo guardrails passed.` and
    `[verify-dialer-route-coverage] All 15 route(s) covered by denial sweep.`,
    with the four pre-existing `@/lib/authz` type-import warnings.
  - `pnpm typecheck:workspace` — all six workspace projects `Done`.
  - `pnpm lint` — `✖ 16 problems (0 errors, 16 warnings)`; all sixteen
    pre-existing and in files this layer did not touch.
- `pnpm test:e2e:list campaign-overview` — `Total: 9 tests in 5 files` (4 role
  setups + 5 spec tests), so the story's filter selects real tests.
- `pnpm test:e2e campaign-overview` — **PASS**, 9 passed (33.0s), run three times
  as the fixture and the phone assertions were tightened.
- `pnpm test:e2e campaign-` — **PASS**, exit 0, `58 passed (2.2m)`: the four role
  setups, the five new tests, and the forty-nine campaign tests this layer
  touched or had to keep green (`campaign-campaigns` and `campaign-callers` with
  their updated assertions, `campaign-assign-select`, `campaign-assign-write`,
  `campaign-surfaces`, `campaign-survey`). No `✘` mark anywhere.
- `git rev-parse --short HEAD` at verification time: `51caf33`;
  `@playwright/test` `^1.62.0`; `baseURL` `http://127.0.0.1:3000`; workers `1`.

**Spec tests added (`campaign-overview.spec.ts`):**
- `the campaign overview — an Admin with no campaigns › offers Create campaign instead of a screen of zeroes`
- `the campaign overview — an Admin with one campaign › sums the five buckets into the tiles and the row, Never attempted included`
- `the callers roster — an Admin with one campaign of progress › fills the four performance columns from campaign_progress, zeros included`
- `the campaign overview — a phone › renders the tiles two by two, the Active card and no table`
- `the campaign overview — a Preacher › keeps the campaign row and counts only their own contacts`

**Post-run state:** `public.dialer_campaigns`, `public.dialer_assignments`,
`public.dialer_call_logs`, `public.dialer_callers` and
`public.dialer_survey_questions` each hold zero rows after the gated run.

**Not run:**
- `pnpm test` — it finds no test script in any package and exits 0 without
  running anything.
- The full `pnpm test:e2e` — the packet's filter is `campaign-`; the full suite
  belongs to the join layer.
- `pnpm test:e2e:determinism` — the repository defers it to Epic 4, Story 4.2.
  The full `campaign-` filter ran twice back to back with no reset and no
  leftover rows.

## What this layer does not prove

- **The roster's columns are only proved for an Admin.** The Preacher's campaign
  counts are proved; the roster's `getRosterProgress` narrowing for a Preacher or
  Assistant is not, because no row loads `/campaigns/callers` as a Preacher with
  a non-zero assignment. `campaign-callers` owns roster scope membership, and its
  fixture holds no assignments, so a Preacher's numbers there are all zero.
- **A deactivated caller's performance columns are unasserted.** Reading them
  would need a caller profile with history and then a deactivation; the callers
  spec covers deactivation without history, and this one covers history without a
  deactivation.
- **The `cancelled` footer counter is proved only at 1 and 0.** The cancelled case
  is exercised on the phone path; the desktop footer never renders a non-zero
  cancelled count in a test.
- **The dark assertion is the tiles' presence.** The table, the cards and the
  roster under `.dark` are not compared; they use the same tokens the theme
  switch already covers.
- **The 500 `campaign_progress_read_failed` arm is still unproven.** It needs a
  database fault or an unreadable payload, neither of which this fixture can
  inject (inherited from `1-9-campaign-overview-api`).
- **`403 campaign_scope_missing` remains unproven.** It needs an Assistant with a
  null `assigned_preacher_id` — a seeded-user mutation this layer may not make
  (inherited from `1-9-campaign-overview-api`).
- **The Assistant's read of the Overview is unasserted.** `campaign-surfaces`
  proves the page renders for the Assistant; no row reads its counts.
- **The roster's zero-row state is still unasserted** (an Admin always has staff),
  and the roster's `Campaigns` column is not proved to be the assignment-grain
  count rather than a campaign count, beyond the three assignments this spec
  creates in one campaign.
- **The phone cards for a COMPLETED campaign are unasserted.** The compact list is
  proved for DRAFT and CANCELLED; COMPLETED shares the branch by status filter.
- **The `Reports` tab and the amber Never-attempted bucket are untouched.** Story
  3.1 consumes `campaign_progress` and owns that screen.
