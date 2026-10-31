---
title: 'Desktop reports: funnel, outcome mix, leaderboard, activity'
type: 'feature'
created: '2026-10-28'
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

**Problem:** `campaign_progress` has returned the funnel, outcome mix, caller rollup and recent activity since Story 1.9, but no screen rendered it. The Campaign sub-nav already linked to `/campaigns/reports`; the link landed on a refusal.

**Approach:** A server page at `/campaigns/reports` reads the campaign list and one campaign's `campaign_progress`, then renders frame 790's four cards. The campaign is chosen by `?campaign=` and defaults to the newest ACTIVE campaign, then the newest campaign. Every number is the RPC's payload; the screen arranges it and never recounts.

## Boundaries & Constraints

**Always:**
- One `campaign_progress` call per page render is the only source of the funnel, mix, leaderboard and activity.
- `requireCampaignAdmin` and `getStaffContext()` gate the page; a missing or foreign campaign id never widens to another program.
- Funnel rows are Assigned, Attempted, Reached, Confirmed and Never attempted, in AD-5's order.
- Outcome mix groups by `status_group` (six rows), never by the thirteen chips.
- The leaderboard ranks `calls_made` descending and prints the design's no-quality disclaimer.
- Zero assignments renders the empty state with the next action, not five zeroes.

**Never:**
- No percentage stored, computed or exported; the bar width is a display ratio only.
- No `call_duration` or other column the product cannot fill.
- No client-side tally of call logs, contacts or assignments.
- No per-screen dark override; `--primary`, `--card` and the chart tokens carry both themes.

</frozen-after-approval>

## Code Map

- `apps/folk/app/campaigns/reports/page.tsx` — the admin gate, campaign selection, empty state and desktop/mobile composition.
- `components/campaign/reports/report-card.tsx` — frame 790's title-band card.
- `components/campaign/reports/report-funnel-card.tsx` — five rows, widths over Assigned, amber Never attempted note.
- `components/campaign/reports/report-outcome-mix-card.tsx` — six `status_group` rows.
- `components/campaign/reports/report-leaderboard-card.tsx` — rank, initials, reached, completed attempts, disclaimer.
- `components/campaign/reports/report-activity-card.tsx` — log-grain recent rows.
- `components/campaign/reports/report-format.ts` — campaign date reuse and `HH:MM` activity time.
- `components/campaign/reports/report-toolbar.tsx` — campaign picker and the CSV control.
- `lib/dialer/reports.ts` — the bucket/group vocabulary, leaderboard sort and CSV builder.
- `e2e/specs/campaign-reports.spec.ts` — Admin and Preacher scope, empty state.

## Human Decisions

1. **A campaign picker is added.** Frame 790 names one campaign in the subtitle but draws no selector. `campaign_progress` answers one campaign at a time, so the screen needs a way to choose it; the choice lives in the URL like the Overview status filter, and an unknown or absent id falls back rather than 404s.
2. **Confirmed is a fifth funnel row.** Frame 790 draws four rows, but Story 3.1 requires Confirmed and AD-5 defines it as the latest reached log being `CONFIRMED`. It uses a distinct token so it is not confused with Attempted's green.
3. **The mix keeps the data model's labels.** The frame's source-app labels (Answered, Busy, No response) do not map to the six generated groups. The screen uses `STATUS_GROUP_LABELS`: Confirmed, May come, Deferred, No answer, Wrong number, Not interested.
4. **The leaderboard sorts on completed attempts.** `campaign_progress` returns callers ordered by assignment count; the screen re-sorts the same rows on `calls_made`, then `reached`, then name. It prints `reached` beside the name on desktop and the completed attempts as the ranked number.
5. **The empty state replaces the cards.** With zero assignments there is no funnel to draw. The action is `Assign contacts` for a DRAFT/ACTIVE campaign and `View campaigns` for a terminal one.
6. **Amber uses the exact design hue; the note's text uses the warning ink.** The Never attempted bar reads `--grid-warning-ink` (`#f97f29` in both themes), the same amber the design uses for this bucket. Its sentence switches to `--destructive` because 12px `#f97f29` on white is below AA contrast; the bar stays the frame's amber.
7. **Times are `HH:MM`, dates reuse the campaign formatter.** The campaign date goes through `formatCampaignDate` (UTC), so the subtitle cannot shift a day west of Greenwich. Activity times print the call log's local clock.

## Verification

**Commands run:**
- `pnpm test:static` — PASS, exit 0. Guardrails passed, six workspace typechecks Done, ESLint 17 warnings / 0 errors (all pre-existing).
- `pnpm test:unit` — PASS. Turbo package tests 2/2 tasks successful; root Vitest 4 files, 20 tests passed.
- `pnpm test:e2e campaign-` — PASS, **92 tests**, 7.3 min, one worker. The three new reports rows passed.
- `pnpm test:e2e dialer-route` — PASS, **112 tests**. The export route's sweep row is included.
- Visual pass: captured 1440×900 and 390×844, light and dark, against frames 790 and 1141. Layout, card bands, funnel series, amber bucket and the two-column split match; the picker is the documented addition.

**Not run:**
- `pnpm test:e2e:determinism` — deferred to Story 4.2's release gate.
- The full suite was not re-run for this story; the changed shared files were `lib/dialer/scope.ts` (pager import) and campaign-only components, and the campaign filter is the narrowest affected scope.

**Unproven:**
- Pixel-exact measurement of bar heights and card padding against the frame; the comparison was by eye.
- A campaign with more than 20 recent calls; the RPC caps the list at 20 by contract.
