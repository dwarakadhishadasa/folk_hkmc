---
title: 'Mobile reports: Confirmed and the reduced-view statement'
type: 'feature'
created: '2026-10-28'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-autodialer/epics.md'
  - '{project-root}/_bmad-output/specs/spec-autodialer/design-coverage.md'
  - '{project-root}/docs/architecture/testing.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Frame 1968's phone reports screen omits Confirmed entirely and silently drops the outcome mix and recent activity. A reader on a phone could believe a partial view was the whole result.

**Approach:** The reports page renders a phone branch below `md`: the same five-bucket funnel (Confirmed included), the same scoped leaderboard, a visible `Outcome mix and recent activity are available on desktop.` statement, and a full-width outline `Export CSV` bar above the Campaign bottom nav. The desktop branch is unchanged.

## Boundaries & Constraints

**Always:**
- The phone funnel has all five buckets, including Confirmed.
- The reduced-view statement is visible text, never colour or an icon alone.
- The leaderboard is the same `campaign_progress` caller rollup, in the same order.
- The campaign picker stays reachable at 390×844; the export bar is not clipped and the bottom nav stays usable.
- Dark parity comes from tokens; no phone-specific dark override.

**Never:**
- No desktop layout on a phone and no phone layout on a desktop.
- No horizontal scroll at 390px.
- No second data read for the phone branch; both branches render the same payload.

</frozen-after-approval>

## Code Map

- `apps/folk/app/campaigns/reports/page.tsx` — `md:grid` desktop branch, `md:hidden` phone branch, sticky mobile export bar, reduced-view statement.
- `components/campaign/reports/report-card.tsx` — card subtitles are desktop-only, matching the phone frame's title-only bands.
- `components/campaign/reports/report-funnel-card.tsx` — label column widened so `Never attempted` stays on one line at 390px; the amber note is desktop-only.
- `components/campaign/reports/report-leaderboard-card.tsx` — the disclaimer and the `reached` detail are desktop-only; rank, initials, name and completed attempts stay, as frame 1968 draws them.
- `components/campaign/reports/report-toolbar.tsx` — the phone export is the frame's outline button.
- `e2e/specs/campaign-reports-mobile.spec.ts` — 390×844 phone rows and one desktop row.

## Human Decisions

1. **Phone cards drop their subtitle bands and notes.** Frame 1968's funnel and leaderboard bands carry the title alone. Hiding the funnel note and leaderboard disclaimer below `md` also keeps the cards above the sticky export bar at 390×844; the information remains on desktop.
2. **One page, two CSS branches.** The design keeps a single route and the data is identical, so the phone is a responsive branch rather than a second page or a duplicated fetch. Hidden branches are `display: none`, so assistive technology sees one layout.
3. **The mobile export is outline.** Frame 1968 draws a bordered control on the footer; frame 790 draws a filled one in the header. `ReportExportButton` takes a variant, not a second component.
4. **Bar labels use a 104px column at phone width.** `Never attempted` is one line at 390px, which is what keeps the funnel card short enough for the export bar to sit below it.

## Verification

**Commands run:**
- `pnpm test:static` — PASS, exit 0; 0 lint errors.
- `pnpm test:e2e campaign-reports` — PASS, **9 tests**, including both mobile rows.
- `pnpm test:e2e campaign-` — PASS, **92 tests**, 7.3 min, one worker.
- Visual pass: 390×844 light and dark (frames 1968 and the mobile token behaviour) and 1440×900 light and dark (frames 790 and 1141). The phone funnel shows five buckets; the reduced-view statement and outline export are visible; no horizontal scroll.

**Not run:**
- `pnpm test:e2e:determinism` — deferred to Story 4.2.
- No Waydroid run for this story; the phone is the suite's 390×844 viewport with touch, which is the repo's established mobile gate.

**Unproven:**
- Real-device safe-area insets; the export bar uses the same `--mobile-app-nav-inset` token as the caller session, but the inset was not measured on hardware.
