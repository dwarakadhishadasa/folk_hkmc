---
title: 'Epic 1 amendments — campaign edit, the assign-first flow, and the unit layer'
type: 'feature'
created: '2026-10-27'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-autodialer/epics.md'
  - '{project-root}/docs/architecture/testing.md'
  - '{project-root}/_bmad-output/test-artifacts/framework-setup-progress.md'
---

## Intent

Four changes landed after the story-by-story build and belong to Epic 1 rather than to a new one. This file records them where the epic's story documents can be read together.

## 1. The campaign edit surface (Story 1.4)

`/campaigns/[campaignId]/edit` is AD-1's edit route, which had no screen until now.

- The page reuses the campaign frame: back control, campaign header, sub-nav, the status strip, and the survey builder below.
- `CampaignDetailsForm` owns the same three fields frame 212 asks for at creation — name, description, campaign end date — and saves them with `PATCH /api/dialer/admin/campaigns/[campaignId]`, backed by `updateCampaign`.
- **Status is not editable here.** `updateCampaign` writes only the three detail columns; starting, completing and cancelling stay with `transitionCampaign` and its own matrix and race guard, so a metadata save cannot move a campaign's state as a side effect.
- The header carries `Reassign contacts` (on `DRAFT`/`ACTIVE`) and `Save`; an `ACTIVE` campaign keeps its Complete/Cancel actions. `DRAFT` gets no Start control — see the flow below.
- The survey keeps its per-question writes; folding them into the page's Save would turn a half-finished question into a silent discard.

## 2. Create → assign, and start on assignment (Stories 1.4 and 1.8)

- Frame 212's `Next` now lands on the new campaign's `assign-contacts` screen rather than its detail page. A `DRAFT` campaign with nobody to call is not yet a campaign a caller can work, so the screen that gives it its audience is the next step.
- The assignment write starts the campaign in the same action: after a successful batch the client requests `{ action: "start" }`, and an already-`ACTIVE` campaign is not transitioned again. If the assignment lands and the start fails, the message says exactly that — the contacts are assigned, only the start did not happen.
- This is why the edit page has no Start control: start is the outcome of assigning, not a second path to `ACTIVE`.

## 3. The assign-contacts surface on the grid primitives (Stories 1.7 and 1.8)

- `components/campaign/assign-contacts-select.tsx` is rebuilt on `components/grid` (`Grid`, `useGridViewState`, `createColumnHelper`) instead of a bespoke table: frame 324's toolbar search, a select column, the caller's own columns, the four calling facets as hidden grid columns, a selection that survives a search, and the fixed 408px Assign-to panel.
- The behaviour the earlier layers proved is unchanged: the scoped page from the server, the whole-set facets, the cross-page selection count with its hidden count, the weighted preview from the preview route, the pre-check, skip/move, and the receipt.
- The grid's own primitives are composed, not modified — `components/grid/**` is untouched.

## 4. The Vitest unit layer (test plan)

- `pnpm test` is now `pnpm test:unit` (`turbo run test && vitest run`), covering `lib/`, `components/`, `hooks/`, `tests/` and the two packages with real logic. `pnpm test:static` is unchanged.
- The unit layer is node-environment only and never loads a browser or a database: it is a narrower gate than `pnpm test:e2e`, not a replacement.
- Epic 1's test plan now reads: `pnpm test:static` → `pnpm test:unit` → the narrowest e2e filter. TP1 and TP2 carry that wording; `docs/architecture/testing.md` and `_bmad-output/test-artifacts/framework-setup-progress.md` record the deviation that added Vitest beside Playwright.

## Status

Done and committed with the changes.

## Verification

- `pnpm test:static` — **PASS**, exit 0 (16 pre-existing lint warnings, 4 guardrail warnings).
- `pnpm test:unit` — **PASS**, exit 0: two package turbo tasks plus one root Vitest file, **8 tests passed**.
- **Not run:** the campaign e2e suite. The changed specs (`campaign-assign-select`, `campaign-assign-write`, `campaign-campaigns`, `dialer-route-sweep`) and the grid-based surface remain unverified in a browser until `pnpm test:e2e:campaign` is run; the story documents above should not be read as proof of that behaviour.
