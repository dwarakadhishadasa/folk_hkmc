---
title: 'Desktop Campaign design parity (frames 32, 212, 324, 645)'
type: 'feature'
created: '2026-10-27'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-autodialer/epics.md'
  - '{project-root}/_bmad-output/specs/spec-autodialer/design-coverage.md'
  - '{project-root}/docs/architecture/testing.md'
---

## Intent

**Problem:** the desktop Campaign screens were built for behaviour, not for the frames. The create page was a single-column form where frame 212 draws one two-panel screen; the overview lacked the frame's filter select and used the wrong card, table and pill measurements; the roster's header and row rhythm were a generic table; the sub-nav sat above the title row where every frame puts it below.

**Approach:** take the measurements from `document.json` (not from a screenshot) and apply them to the existing components. The one structural change is `/campaigns/new`, rebuilt as frame 212: a back control, the title, one `Next`, the Campaign details panel on the left and the Call-outcome survey on the right. Everything else is measurement and order.

## What changed

### Frame 212 — `/campaigns/new`
- One client screen owns the head and the body: back circle (40×40, radius 999), title Poppins 22, the frame's subtitle, `Next` (40 tall, navy, radius 8).
- Left panel 520 wide, radius 12, padding 20, with the navy `Campaign details` header (radius 12, padding 16/20, Poppins 20) and the six fields — the frame's three plus the gap-duration and attempt-cap controls UX-DR17/18 require.
- Right panel fills the remainder (the frame's 852 at 1440), same header treatment, the question cards (`#f8fafc`, radius 8, padding 16) with the number, title, type pill, Required/Optional pill and option chips, and the full-width `Add question` control.
- Questions are staged in the browser because the campaign does not exist yet. `Next` creates the campaign, then writes each question in order. A question that fails leaves the campaign on its detail page and is named in the message with a link to it; a partial write is never reported as success.

### Frame 32 / 961 — the overview
- The title row gains the `All campaigns` filter (36 tall, radius 8). It carries the status in the URL so the tiles, the table, the phone cards and the footer all narrow to the same set; a filtered-empty set gets its own empty state with a way back.
- Stat cards: label 11 semibold `#64748b`, value Poppins Bold 32, caption 12, padding 20, gap 6; the Never attempted card keeps its amber edge.
- Table: header 44 tall on `#f8fafc`, rows 48, 14px cell text; the status pill is the frame's 12px `#e8f5ec`/`#15803d` for ACTIVE.
- The sub-nav now sits below the title row, where the frame draws it, and only on the pages whose frames carry it (overview, callers, the campaign detail, assignments). The two-panel create screen and the assign grid do not carry it, matching 212 and 324.

### Frame 645 — the roster
- Header 44 tall on `#f8fafc`, rows 56, 14px names and contacts, 11px header labels in the frame's ink.

### Frame 324 — assign contacts
- The page is the frame's two-pane body: the grid column and a fixed 408px `Assign to` panel with the frame's 40px gutter. The table stays a dense scoped table rather than the manage grid, whose data model is a different surface.

## Deviations, recorded

- The four contact facets are exposed as selects in the toolbar rather than behind frame 324's `Filter` popover; the frame's `Sort` and hidden-fields controls have no server parameter behind them and were not faked.
- The create screen's survey panel stages questions and writes them after the campaign exists; the frame's single `Next` is preserved, but there is no second wizard step because everything the frame shows is on the one screen.
- Reports (frames 790/1141) is Epic 3 and untouched.
- The campaign detail page has no design frame; its lifecycle strip keeps the existing layout.

## Verification

- `pnpm test:static` — **PASS**, exit 0 (16 pre-existing lint warnings, 4 guardrail warnings).
- `pnpm test:e2e:campaign` — **PASS**, `63 passed (4.6m)`; the create flow now drives `Next` instead of `Create campaign`, and the overview filter is exercised through its URL.
- Screenshot check at 1440×900 against the frame measurements: overview table 1390 wide at x=25, main padding 24, two-panel create with a 520/852 split, roster rows 56 tall.

**Unproven:** no automated check measures rendered pixels against the frame; dark parity is asserted by the suite's theme rows and the token use, not by a dark screenshot of these screens; frames 324's toolbar controls and the phone views are unchanged by this pass.
