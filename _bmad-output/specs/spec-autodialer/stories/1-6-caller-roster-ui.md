---
title: 'The scoped caller roster'
type: 'feature'
created: '2026-10-27'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-autodialer/epics.md'
  - '{project-root}/_bmad-output/specs/spec-autodialer/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/specs/spec-autodialer/design-coverage.md'
  - '{project-root}/docs/architecture/testing.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `lib/dialer/callers.ts` and the two `/api/dialer/admin/callers` route
files can read the AD-3-scoped roster and switch one caller's `is_active`, but no
screen reaches them. The design's Callers frame (645) shows the roster with
per-campaign performance and an Admin status switch, and it also carries
`Import roster` and `Invite caller` buttons that were removed on purpose
(UX-DR32). The four performance columns need `campaign_progress` (Story 1.9), so
a screen that rendered them today would have to invent zeroes.

**Approach:** `/campaigns/callers` applies `requireCampaignAdmin`, reads
`listRoster(staff)`, and renders a server-side table of the two columns this
story can fill: **Caller** and **Status**. The header carries the design's
subtitle shape from the returned rows (`N active · N inactive · folk programme`).
A profile-less staff user reads `Not a caller` and has no control; an Admin gets
one `Deactivate`/`Reactivate` button per row that has a caller profile, mounted
as the layer's only client component. Deactivation confirms first; both switches
`PATCH` the caller route and refresh the page, and a refusal shows the server's
own message. A Preacher or Assistant sees the roster without any control, and a
Volunteer is refused before the read. An empty roster renders an actionable empty
state, never an empty table.

## Boundaries & Constraints

**Always:**
- `/campaigns/callers` stays a server component; only the row toggle is
  `"use client"`. The page applies `requireCampaignAdmin` before `listRoster`, so
  a Volunteer is refused before the roster is read.
- The subtitle counts come from the returned rows: `isActive` and `deactivated`
  are roster facts, not performance. A `Not a caller` row is counted in neither.
- The table renders exactly **Caller** and **Status**, plus the design's unlabelled
  action column. Contact / Campaigns / Calls made / Reached are **absent**, not
  zeroed.
- Status reads `Active` when a profile exists and is active, `Inactive` when the
  profile is deactivated, and `Not a caller` when the staff user has no profile.
  A deactivated row is dimmed but stays in the table.
- Only an Admin gets the status switch: the page passes `canManage` from
  `staff.role === "Admin"`, and the service behind the route refuses every other
  role anyway. A row with no `callerId` never renders a control.
- Deactivation confirms through the design system's `AlertDialog`; reactivation
  writes on the click. Both post `PATCH /api/dialer/admin/callers/<callerId>`
  with `{ isActive }` and call `router.refresh()` only on success. A refusal is
  shown in the server's words.
- The empty roster is a `CampaignEmptyState` that says what to do next — assign
  contacts from a campaign — and links to `/campaigns`.
- Shared primitives and programme tokens only; double quotes, the `@/*` alias.

**Never:**
- No `Import roster`, no `Invite caller`, and no add / invite / import /
  manage-user control anywhere on the screen (UX-DR32). The app header's own
  `Invite` nav item is the core staff path and stays untouched.
- No "make caller" control. Promotion happens by assignment (AD-13, Story 1.8),
  never from the roster.
- Do not render a performance column, a client-side count, or a second query
  shape for one. Those are Story 1.9's `campaign_progress` facts.
- Do not hide a deactivated caller or a profile-less staff user to make the table
  look tidy. History stays.
- Do not restate the role rule in the client: hiding the control is presentation;
  the route's `403` is the enforcement.
- Do not edit `lib/**`, `apps/folk/app/api/**`, `components/header.tsx`, the
  proxies, `public/sw.js`, `e2e/fixtures/**`, `e2e/auth/**`,
  `playwright.config.ts` or `package.json`.
- Do not weaken, delete or renumber an existing campaign assertion.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Admin opens the roster | Active staff, one active profile | `Callers` + `1 active · 0 inactive · folk programme`; one row per staff member | — |
| Admin row, active profile | `is_active = true` | `Active` pill, `Deactivate` button | — |
| Admin row, deactivated profile | `is_active = false` | `Inactive` pill on a dimmed row, `Reactivate` button; row retained | — |
| Admin row, no profile | Staff user with no `dialer_callers` row | `Not a caller` pill; no button | — |
| Admin deactivates | Click `Deactivate` | Confirmation dialog; `200 { caller }`, row reads `Inactive` and offers `Reactivate`; reload persists | Server message verbatim on refusal |
| Admin reactivates | Click `Reactivate` | No dialog; `200 { caller }`, row reads `Active`; reload persists | Server message verbatim on refusal |
| Preacher opens the roster | Preacher scope | Their own row and their assignees; another preacher's staff absent; no `Deactivate`/`Reactivate` anywhere | — |
| Assistant opens the roster | `assigned_preacher_id` set | The preacher's assignees plus the Assistant; no control | — |
| Volunteer opens the roster | No caller profile needed | Refused before the read; no table | `403` → `/auth/error?code=staff-authorization-failed` |
| No session | No cookie | Redirected to sign in, naming the path | `401` → `/login?redirect=/campaigns/callers` |
| Roster empty | Zero rows | Actionable empty state (`No callers in your scope yet`, `View campaigns`), not a table | — |
| Header | Any role | No `Import roster`, no `Invite caller`, no add/invite link inside the page | — |
| Columns | Any role | `Caller` and `Status` visible; no Contact / Campaigns / Calls made / Reached | — |

## Human Decisions

1. **Two columns now, six later.** The design's Contact / Campaigns / Calls made /
   Reached are `campaign_progress` facts that Story 1.9 creates. Rendering `0`
   would be a claim this screen cannot compute, so the columns are absent and the
   spec pins their absence. The table's grid is the shared `Table` primitive, so
   adding three or four columns later is markup, not a redesign.

2. **The status words are `Active`, `Inactive`, `Not a caller`, not the frame's
   upper-case `ACTIVE`/`INACTIVE`.** The story names those three values, and the
   design's capitals are its type treatment rather than a fourth state. The pills
   keep the design's sizes and tints; the words read as states in the subtitle's
   sentence and are assertable by role and text.

3. **`Not a caller` is neutral, not a lesser `Inactive`.** A staff user with no
   profile was never promoted, so no history is at stake and nothing can be
   switched off. Reusing the deactivation tint would suggest a deactivation that
   never happened.

4. **Only the toggle is client state.** The page and the table are server
   components; `CallerStatusControl` owns the dialog, the request and the error
   message. The roster is a server read, so a switch refreshes from the server
   rather than mutating a local copy and drifting from `listRoster`.

5. **Deactivation confirms; reactivation does not.** Deactivation removes the
   caller from every assignment picker and refuses their next disposition;
   reactivation restores a state the Admin explicitly chose to leave. The story
   asks for a confirmation on the first and only on the first.

6. **`canManage` is computed on the server from the role, and the route is still
   the enforcement.** A Preacher or Assistant's page renders no control at all —
   not disabled, not hidden-but-present — while `setCallerActive`'s `Admin` gate
   is what makes the absence safe if the client were bypassed.

7. **The Caller column shows the staff name, not `displayName`.** A caller profile
   names a person (`Divya Parthasarathy`), while the roster's identity is the
   staff account that can sign in and be assigned. `listRoster` sorts by
   `displayName` and includes both; the row shows the person, and the stored label
   stays available for Story 1.7's pickers.

8. **The e2e spec owns a disposable `dialer_callers` profile instead of toggling a
   seeded one.** Every seeded caller row belongs to another spec's inputs, and a
   deactivation left behind would flip the 1.3 spec's caller surfaces. The
   volunteer's profile is created through the service role and removed (or
   restored) in a `finally`, exactly as the 1.3 spec does it.

9. **The subtitle's expected counts are derived from the database, not typed into
   the spec.** The spec reads the programme's active staff and their profile
   flags, so the assertion proves the page's arithmetic against the roster's own
   facts and does not break if a future seed adds a staff row.

</frozen-after-approval>

## Code Map

- `apps/folk/app/campaigns/callers/page.tsx` — `requireCampaignAdmin`, `listRoster`, the subtitle counts, the empty state and the table mount; the 401/403 redirects.
- `components/campaign/caller-roster.tsx` — the server-rendered table: Caller, Status, the unlabelled action column, the dimmed deactivated row and the `canManage` gate.
- `components/campaign/caller-status-pill.tsx` — the three status pills and their tokens.
- `components/campaign/caller-status-control.tsx` — the only client component: the confirm dialog, the `PATCH`, `router.refresh()` and the server's message.
- `e2e/specs/campaign-callers.spec.ts` — five tests: Admin roster, deactivate, reactivate, Preacher scope, Volunteer refusal; one disposable profile per Admin/Preacher test with a loopback-guarded `finally`.
- `e2e/specs/campaign-surfaces.spec.ts`, `campaign-campaigns.spec.ts`, `campaign-survey.spec.ts` — unchanged, re-run and green (read-only here).
- `lib/dialer/callers.ts` — `listRoster`, `setCallerActive` and `CallerRosterEntry` (read-only here).
- `lib/dialer/scope.ts` — `requireCampaignAdmin` and `campaignScope` (read-only here).
- `apps/folk/app/api/dialer/admin/callers/{route.ts,[callerId]/route.ts}` — the `GET` and `PATCH` this page posts to (read-only here).
- `components/ui/{table,button,alert-dialog,empty}.tsx` — the primitives reused (read-only here).

## Tasks & Acceptance

**Execution:**
- [x] `apps/folk/app/campaigns/callers/page.tsx` — the gate, the roster read, the subtitle and the empty state.
- [x] `components/campaign/caller-roster.tsx` — Caller / Status / action columns, the dimmed deactivated row, the Admin-only control mount.
- [x] `components/campaign/caller-status-pill.tsx` — `Active`, `Inactive`, `Not a caller`.
- [x] `components/campaign/caller-status-control.tsx` — the deactivation confirmation, the `PATCH`, the refresh and the refusal message.
- [x] `e2e/specs/campaign-callers.spec.ts` — five tests with a disposable caller profile and an ordered cleanup.
- [x] `_bmad-output/specs/spec-autodialer/stories/1-6-caller-roster-ui.md` — this record.

**Acceptance Criteria:**
- Given an Admin and the seeded programme, then `/campaigns/callers` lists every active staff user, one row each, with the subtitle's counts matching their profile states.
- Given a staff user with no caller profile, then the row reads `Not a caller` and offers no control.
- Given an Admin clicking `Deactivate`, then a confirmation appears; confirming turns the row `Inactive` on a dimmed row, offers `Reactivate`, and survives a reload.
- Given an Admin clicking `Reactivate`, then the row returns to `Active` and survives a reload.
- Given a Preacher, then the roster is their own row plus their assignees, the Admin is absent, and no `Deactivate`/`Reactivate` control renders anywhere.
- Given a Volunteer, then `/campaigns/callers` lands on `/auth/error?code=staff-authorization-failed` with no table.
- Given any viewer, then the page has no `Import roster`, `Invite caller`, invite or add control, and no Contact / Campaigns / Calls made / Reached column.
- Given `pnpm test:e2e campaign-`, then 33 tests run (4 role setups + 29 spec tests) and all pass.

## Implementation Notes

### The roster matrix

| Viewer | Rows | Status control |
|---|---|---|
| Admin | Every active staff user in the programme, plus any profile in the programme whose user is not in that set (including a non-Active staff user's profile) | `Deactivate` / `Reactivate` on every row with a `callerId` |
| Preacher | Active staff whose `assigned_preacher_id` is the Preacher, plus the Preacher | None |
| Assistant | Active staff whose `assigned_preacher_id` is the Assistant's preacher, plus the Assistant | None |
| Volunteer | Refused before the read | None |

On the seeded folk programme that is four rows for the Admin (`Kavitha Raman`,
`Anand Narayanan`, `Divya Parthasarathy`, `Suresh Kannan`), three for the Preacher
(himself and his two assignees) and two for the Assistant. The matrix is
`listRoster`'s; this layer renders whatever it returns and filters nothing.

### The subtitle

`<active> active · <inactive> inactive · folk programme`, where `active` counts
rows with `isActive` and `inactive` counts rows with `deactivated`. The label is
the existing campaign pages' literal scope line — `Campaigns · folk programme`,
`Campaign · folk programme` — rather than a lookup, because the folk app's
programme is fixed and the other campaign surfaces already spell it this way.

The counts are not performance numbers and are not called totals: with a
volunteer profile active and nothing else, the seeded programme reads
`1 active · 0 inactive · folk programme`, and the remaining three rows read
`Not a caller` without appearing in either count.

### The performance-column deferral

Story 1.9 creates `campaign_progress` and owns the four counts. The table
therefore declares two headers only, and the spec asserts the absence of
`Contact`, `Campaigns`, `Calls made` and `Reached` by column header. That
assertion is the guard against a later edit filling a column with a `0` or a
client-side tally — the honest form of "not yet" on this surface is not drawn.

### The UX-DR32 no-invite rule

Frame 645's header has `Import roster` and `Invite caller`; both were removed from
the design's intent (AD-2, UX-DR32), and AD-13's callers are existing staff users
promoted on first assignment. The page therefore has no action button at all —
not on the header, not on a row, not in the empty state — and the empty state's
only action is `View campaigns`, which names the next step without offering to
create a person.

The absence assertions are scoped to `main` on purpose: the app's own header
legitimately carries the core staff `Invite` nav item for an Admin, and a
page-wide `/invite/` query would either fail for the wrong reason or force the
test to depend on a header decision the chrome layer still owns.

### Tokens

| Element | Design | Shipped |
|---|---|---|
| `Active` pill | `#e8f5ec` fill, `#15803d` ink | `--success` mixed 12% into `--card`, `--success` ink |
| `Inactive` pill | `#fdeee7` fill, `#c2410c` ink | `--destructive` mixed 10% into `--card`, `--destructive` ink |
| `Not a caller` pill | not drawn | `--muted` fill, `--muted-foreground` ink |
| Deactivated row name | not distinguished in the frame | `--muted-foreground` ink, row still present |
| Table shell | white fill, `#e2e8f0` border | `--card` fill, `--border` outline |

The two tinted pills reuse the campaign status pill's `color-mix` technique, so a
theme switch flips one token. No new palette entry was added.

### The confirmation copy

Deactivate: "Deactivate {name}? A deactivated caller keeps their history on this
roster, but leaves every assignment picker and cannot record a new call. You can
reactivate them later." The confirm button reads `Deactivate caller` and the
dismiss reads `Keep caller active`, so both options are named in the caller's own
terms rather than `OK`/`Cancel`.

### The e2e fixture and cleanup

The roster is a read of staff the seed already owns, so the only fixture is a
`dialer_callers` profile for the seeded Volunteer (Divya Parthasarathy). It is
created through the service role — `display_name` from `users.name` — and the
cleanup is the 1.3 spec's own pattern: an existing row is reactivated and then
restored to its original `is_active`/`display_name`, a row this run created is
deleted through the local stack's `/pg/query` endpoint, because `service_role`
holds no `DELETE` on `dialer_callers`. The credential comes from the app's env
file at runtime and the target is asserted loopback before any write or delete.

The pattern is copied into this spec rather than moved to `e2e/fixtures/`, because
that directory is outside this layer's scope and the API layer owns it. The
snapshot/restore shape is duplicated from `campaign-surfaces.spec.ts` deliberately:
two independent specs each leaving the volunteer as they found it is what keeps the
1.3 "Volunteer with no caller profile" row and the nav rows deterministic.

The Admin tests read the programme's active staff and profile flags through the
service role for the subtitle's expected counts. The helper mirrors the program
scope's active-staff half; a non-Active staff user holding a profile is the one
case it would undercount, and the seeded programme has none — the row-count
assertion would catch one arriving, because that row would be rendered without
appearing in the helper's staff list.

### The switch's failure path

A refused `PATCH` closes the dialog, keeps the rendered status and prints the
server's `{ error }` in a `role="alert"` paragraph, the same shape the campaign
lifecycle actions use. The page refreshes only after a successful response, so a
`403` or `404` cannot leave the table claiming a state the server refused.

## Spec Change Log

- No frozen intent changed. This layer is the UI half of Story 1.6; the service
  and route halves are `1-6-caller-roster-server.md` and
  `1-6-caller-roster-api.md`.

## Review Triage Log

## Verification

**Commands run:**
- `pnpm test:static && pnpm test:e2e campaign-` (the packet's VERIFICATION
  command, chained) — **PASS**, exit 0.
- `pnpm test:static` — **PASS**, exit 0.
  - `pnpm guardrails` — `Monorepo guardrails passed.`,
    `[verify-dialer-route-coverage] All 9 route(s) covered by denial sweep.`, with
    the four pre-existing type-import warnings.
  - `pnpm typecheck:workspace` — all six workspace projects `Done`.
  - `pnpm lint` — `✖ 16 problems (0 errors, 16 warnings)`; all sixteen
    pre-existing and in files this layer did not touch.
- `pnpm test:e2e --list campaign-callers` — `Total: 9 tests in 5 files`
  (4 role setups + 5 spec tests), so the story's filter selects real tests.
- `pnpm test:e2e:list campaign-` — `Total: 33 tests in 8 files`.
- `pnpm test:e2e campaign-` — **PASS**, exit 0. `33 passed (1.3m)` — the four
  role setup projects plus twenty-nine spec tests, with no `✘` mark anywhere.
- The chained command was run a second time, immediately after the first, as a
  repeatability check on the disposable profile: **PASS**, exit 0,
  `33 passed (1.3m)` again. The fixture never needed a database reset between
  runs.

**Spec tests added (`campaign-callers.spec.ts`):**
- `the Callers roster — an Admin › lists the programme's staff with the rows' own counts and no invite control`
- `the Callers roster — an Admin deactivating a caller › asks first, then keeps the row as Inactive and offers Reactivate`
- `the Callers roster — an Admin reactivating a caller › returns a deactivated row to Active`
- `the Callers roster — a Preacher › lists their own row and assignees only, with no status control`
- `the Callers roster — a Volunteer › is refused before the roster is read`

**Spec tests kept, unchanged:** the nine in `campaign-campaigns.spec.ts`, the six
in `campaign-surfaces.spec.ts` and the nine in `campaign-survey.spec.ts` all pass
inside the same run. No existing selector was renamed, scoped differently or
loosened.

**Visual pass:** a throwaway Playwright script (in `/tmp`, not committed) loaded
`/campaigns/callers` against the local app at 1440×900 as Admin and Preacher and
at 390×844 as Admin, with one active and one inactive fixture profile. The header,
subtitle, two-column table, tri-state pills and per-row controls render as
described; the mobile table fits at 390px and the Admin's controls stay on the
row. Light mode only.

**Not run:**
- `pnpm test` was not run: it finds no test script in any package and exits 0
  without running anything.
- The full `pnpm test:e2e` was not run. The packet's filter is `campaign-`, and
  the full suite belongs to the join layer.
- `pnpm test:e2e:determinism` was not run. The repository defers it to Epic 4,
  Story 4.2; every row this spec writes is deleted or restored, and the four
  dialer tables were confirmed back at zero rows after the gated run.
- `pnpm test:airtable-removal` was not run. It is a known pre-existing failure on
  this branch and is unrelated to these files.

**Post-run state:** `dialer_callers`, `dialer_campaigns`, `dialer_survey_questions`
and `dialer_survey_options` hold zero rows after the gated run.

## What this layer does not prove

- **The Assistant's rendered scope and absent control are code-only.** The packet's
  scenarios name Admin, Preacher and Volunteer, and those are what the spec
  asserts. The Assistant takes the same `canManage` branch as the Preacher and the
  same `campaignScope` path the API sweep exercises, but no browser test proves
  the Assistant sees exactly their preacher's assignees plus themselves.
- **The empty roster state is unasserted.** An Admin always has staff, and a
  Preacher or Assistant always has themselves, so the seeded programme cannot
  reach zero rows without deleting staff — which this layer may not do. The
  `CampaignEmptyState` branch is implemented and unreachable in a normal seed.
- **The switch's refusal message is not exercised in a browser.** As the only
  role that can reach the route, an Admin would need a caller row deleted between
  the read and the `PATCH`; the route layer's sweep owns the `403`/`404` codes and
  this layer renders whatever `{ error }` they return.
- **The design's four performance columns are absent by design, not computed.**
  Nothing here proves they will come from `campaign_progress`; Story 1.9 owns
  that read and must replace the column-absence assertions in
  `campaign-callers.spec.ts` with the real counts.
- **An inactive caller's exclusion from assignment pickers is not visible here.**
  The pickers do not exist until Story 1.7, and the exclusion is
  `campaignScope`'s service rule. This screen proves the row and the switch, not
  the picker.
- **Promotion on first assignment is not reachable from this layer.** Assigning an
  eligible staff user is Story 1.8's write; the roster deliberately offers no
  promote control, so the intent's promotion half has no UI surface here.
- **The `Preacher`/`Assistant` page gate's `campaign_scope_missing` refusal is
  unasserted.** An Assistant with no `assigned_preacher_id` is `403` in the
  service; the seed has no such fixture.
- **Dark mode was not checked.** No screenshot pass was made in the dark theme and
  no theme spec covers the campaign surfaces; the pills reuse the campaign status
  pill's tokens, which the theme-switch spec covers elsewhere.
- **The unauthenticated `401` redirect on this page is not asserted.** It follows
  the other campaign pages' pattern but no spec in this filter covers it.
