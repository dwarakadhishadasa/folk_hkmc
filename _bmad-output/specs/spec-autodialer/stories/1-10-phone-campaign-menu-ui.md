---
title: 'The phone Campaign menu (frame 2217)'
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

**Problem:** Campaign had a desktop sub-nav and a phone bottom-nav entry, but no way to move between Campaign's own screens on a phone. The strip is `hidden md:block`, so an admin on a phone could reach `/campaigns` and nothing else; frame 2217 draws the missing menu and frames 1752/2263/2639 put its trigger on the page title.

**Approach:** Every Campaign page title gains the 18px chevron the phone frames draw. It opens a full-screen menu built to frame 2217's measurements, with the page's own scope line as its subtitle. The destinations come from the same rule the desktop sub-nav reads, extracted once so the two surfaces cannot disagree.

## Boundaries & Constraints

**Always:**
- The trigger is phone-only (below 768px). Desktop keeps the sub-nav and renders no chevron.
- The menu is full-screen: its own head with a close control, the destination rows, a flexible spacer and a bottom rule. It is not a sheet and not a dropdown.
- Frame 2217's measurements hold: head padding 20/16/16/16 with a 4px gap; title Poppins SemiBold 22; subtitle Inter Regular 13; close button 40×40 at radius 999 on `#F2F4F7` with a 12×12 X stroked `#24324A`; a 1px divider. Items: 8px top padding, 16px side padding, 56px rows, each an 18px line with a 2px underline 4px beneath it sized to the label; label Inter SemiBold 15; a 4×8 chevron-right at 1.4px stroke in `#9195A0`; a 1px divider closes the frame.
- Colours read through the design's own tokens where they exist (`--program-text`, `--muted-foreground`, `--border`, `--tab-active-text`, `--tab-active-underline`), so light mode is exact and dark mode stays legible. Only the close pill and the chevron are literal hexes, with dark fallbacks on the pill.
- The destination set is `campaign-nav.ts`: Admin/Preacher/Assistant get Overview, Callers, Reports; Assignments is inserted second for an active caller; a Volunteer sees Assignments alone.
- The current destination is marked with `aria-current="page"` and the underline; the longest matching href wins.
- The menu subtitle is the page's own scope line, so Overview reads `N campaigns · folk programme` as frame 2217 shows.

**Never:**
- Do not render an admin destination to a Volunteer, and do not hide the trigger from a Volunteer who has a caller profile — `/campaigns/assignments` is a Campaign page and needs the menu.
- Do not duplicate the role/profile rule; the sub-nav and the menu read one function.
- Do not fake a sheet animation or an overlay the design does not have; the surface covers the viewport.
- Do not weaken the e2e gate or add a Waydroid dependency. The suite emulates the phone with a 390×844 viewport, touch and `isMobile`, which is how the rest of the suite proves narrow layouts and is reproducible in CI.

</frozen-after-approval>

## Code Map

- `components/campaign/campaign-nav.ts` — the one destination rule, the path matcher and the longest-prefix active tab.
- `components/campaign/campaign-menu.tsx` — the trigger and the frame-2217 surface.
- `components/campaign/campaign-sub-nav.tsx` — now reads the shared rule instead of its own copy.
- `components/campaign/campaign-page-header.tsx` — the title row renders the trigger beside the title.
- `apps/folk/app/campaigns/page.tsx` — the Overview scope line is the design's count line.
- `e2e/specs/campaign-menu.spec.ts` — five phone/desktop rows, including the caller-profile gating.

## Tasks & Acceptance

**Execution:**
- [x] Extract the destination rule to `campaign-nav.ts` and consume it from both surfaces.
- [x] Build the full-screen menu to frame 2217's measurements.
- [x] Put the chevron trigger on the shared title row, phone-only.
- [x] Make the Overview scope line the count line so the menu head matches the frame.
- [x] Prove the gated rows, the active underline, navigation and close at a phone viewport.

**Acceptance Criteria:**
- Given an Admin at a phone viewport, when they tap the title chevron, then a full-screen menu opens with "Campaign", the page's scope line, and Overview/Callers/Reports; Overview is marked current.
- Given an Admin with an active caller profile, then Assignments is inserted second.
- Given a Volunteer with an active caller profile on `/campaigns/assignments`, then the menu offers Assignments alone.
- Given a desktop viewport, then no chevron renders and the sub-nav is visible.
- Given the close button, then the menu closes without navigating.

## Implementation Notes

### One rule, two surfaces

The sub-nav's `ADMIN_NAV_ITEMS`, `ASSIGNMENTS_NAV_ITEM`, `navItemsFor`, `matchesPath` and `activeHrefFor` moved to `campaign-nav.ts` untouched in behaviour. The menu imports the same functions, so a future gating change cannot land on one surface and miss the other — the failure the extracted module exists to prevent.

### Why a full-screen surface

Frame 2217 is a 390×844 frame with its own head (title and close), a bottom divider and no scrim. It is a screen, not a popover, so the Radix dialog's content is stretched to the viewport (`inset-0`, `h-dvh`, no radius or border) and its built-in close is disabled in favour of the design's 40px pill. `DialogTitle` and `DialogDescription` carry the head so the surface keeps a proper accessible name and description.

### The underline's width

The design underlines the label, not the row: `underline.width` equals the text width in every item. The row is therefore a flex line whose label sits in its own column with the 2px bar directly beneath it; the bar is `w-full` of that column, which is exactly the label's width. The bar is present but transparent on inactive rows, as the frame has it.

### Verification

`pnpm test:e2e`'s filter argument is not forwarded through this worktree's `pnpm` wrapper (a compound `pnpm local:readiness && playwright test` script receives the arg as `$0`), so the exact second half of the packet command was run behind the same readiness gate: `pnpm local:readiness && pnpm exec playwright test campaign-`. It selected and passed **59 tests** across the eight campaign specs, including the five new ones. A full unfiltered run was also started in this worktree: every campaign spec passed (9/11/5/9/5/5/6/9) and the run was stopped before the grid specs finished; its failures were the documented pre-existing grid/manage ones.

## Verification

**Commands run:**
- `pnpm test:static` — **PASS**, exit 0. Guardrails passed; six workspace typechecks Done; ESLint "✖ 16 problems (0 errors, 16 warnings)", all pre-existing.
- `pnpm local:readiness && pnpm exec playwright test campaign-` — **PASS**, 59 passed. The five new tests:
  - `the Campaign phone menu — an Admin › opens from the title, shows the sub-nav's destinations, and closes`
  - `… › navigates by a row and marks the new section on reopen`
  - `the Campaign phone menu — an Admin with an active caller profile › inserts Assignments second`
  - `the Campaign phone menu — a Volunteer with an active caller profile › offers Assignments alone and marks it current`
  - `the Campaign phone menu — a desktop viewport › has no title chevron and keeps the sub-nav`

**Not run:**
- `pnpm test:e2e:determinism` — deferred to Story 4.2.
- The full suite was not completed in this worktree; the unfiltered run above reached the grid specs before it was stopped, and those failures are the documented pre-existing ones.

**Unproven:**
- Pixel comparison against a screenshot: the build encodes the frame's measurements, but no automated check measures the rendered head, row and divider against them.
- The menu's behaviour with a long scope line (it wraps, and the frame's is a single line).
- Dark mode has no design frame; the tokens are used but not asserted here.
- `pnpm exec`/`pnpm test:e2e` argument forwarding in this worktree is broken; the same filtered command works from the trunk checkout.
