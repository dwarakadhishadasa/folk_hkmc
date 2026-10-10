---
status: draft
stepsCompleted: [1]
inputDocuments:
  - _bmad-output/specs/spec-contacts-date-types/SPEC.md
  - _bmad-output/specs/spec-contacts-date-types/existing-state.md
  - _bmad-output/specs/spec-contacts-date-types/migration-playbook.md
  - _bmad-output/specs/spec-contacts-premium-grid/SPEC.md
  - _bmad-output/specs/spec-contacts-premium-grid/existing-state.md
  - _bmad-output/specs/spec-contacts-premium-grid/record-review.md
  - _bmad-output/specs/spec-contacts-premium-grid/surface-and-toolbar.md
---

# folk_hkmc - Epic Breakdown (contacts date types + premium grid)

## Overview

This document provides the complete epic and story breakdown for folk_hkmc, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

Run order is load-bearing: `spec-contacts-date-types` runs FIRST (its DATE type is what premium-grid CAP-12's date-filter operators are written against), then `spec-contacts-premium-grid`. Note: this file is `epics-contacts-grid.md`, not `epics.md` — `planning-artifacts/epics.md` already holds the completed Gita Life operations breakdown and was left untouched.

## Requirements Inventory

### Functional Requirements

Source: `spec-contacts-date-types` (CAP-1 – CAP-6):

FR1: The system shall report, per date column (`date_of_birth`, `initial_contact`, `last_contacted_on`) against the local stack, total, null count, exact-`YYYY-MM-DD` count, valid-prefix-with-trailing-content count, and not-a-date count, and list offender rows by id with a SELECT DISTINCT of the offending values, before any ALTER runs.
FR2: The system shall resolve OQ-1 (what counts as a contact interaction: attendance record, `/manage` edit, or both) by decision, then make `last_contacted_on` and its `manage-favorites-view.tsx` display agree — either update the column on each interaction or rename it to record creation.
FR3: The system shall convert the three columns to `DATE` in one reversible migration file following the repo naming convention, nulling unconvertible rows only after reporting them (recording every id), truncating valid-prefix trailing content to ten characters, with no clock/timezone expression in the cast and a documented lossy down path.
FR4: The system shall tighten `optionalIsoDate` (`lib/manage/api-handlers.ts`) to agree exactly with the `DATE` type (reject or truncate trailing content) in the same change as the migration, so no accepted value can later fail at Postgres.
FR5: The system shall keep all reads working after conversion: contacts render in the grid, the dashboard Contact Generation chart still counts them, Favorites still shows the value, and every existing e2e row covering date edit/filter/sort still passes.
FR6: The system shall change nothing outside the three columns: no RLS modification, no new route, no new authorization logic, both apps mirrored, no invented values.

Source: `spec-contacts-premium-grid` (CAP-1 – CAP-16):

FR7: The manage header shall preserve the five tabs in order with the active tab distinguishable at a glance, align the scope indicator to the header block, and lose vertical height without cramping the tab row.
FR8: The grid surface shall render one scroll container on both axes with a sticky header, hairline dividers, consistent 32px row height/padding/alignment, an unclipped final column, opaque frozen cells, and row-selection checkboxes aligned to their rows.
FR9: The grid shall render type-keyed cell renderers (text, select, multiselect, date, number, boolean, linked, longtext) driven by a field-type marker independent of `editor`, with editable vs read-only visually distinguishable, truncated text exposing its full value, and genuinely blank empty cells (no em-dash).
FR10: Every location and staff cell shall render a human label; an id with no matching lookup shall render a visibly unresolved marker (distinct from empty), never a raw UUID or fabricated label, with `location` and `collectedBy` miss handling consistent.
FR11: One compact toolbar band shall carry scoped search, a filter control with visible active indication, a current-view label, column visibility/ordering, record creation, and result/selection counts; the bulk-action bar shall appear only while rows are selected; the `statusMessage` live region shall stay reachable.
FR12: Cell edits shall validate before save with visible progress and error; a rejected write shall show the server's message and revert the cell through the single existing commit path and unchanged PATCH/bulk API.
FR13: A single click shall make a cell the active cell (React state) with a restrained consistent outline, distinct from row hover and row selection; arrows shall move it without changing cell dimensions.
FR14: One filter modal (Field · operator · value + live matching-row count, nothing else) shall offer per-field-type operators — text contains/is/empty sets, number relational comparison, date operators plus relative-date select, checkbox single `is` + checkbox value, select/multiselect is/is-not/any-of/none-of/empty sets — resetting operator/value on field-type change, replacing the per-column popovers, openable pre-filled from the column menu Filter item, round-tripping through the URL, with relative dates serialized as absolute boundaries.
FR15: Column headers shall drag-reorder via `@dnd-kit/core` (pointer, touch, keyboard), persisting through `cols` with a single on-drop write via the transient handle, rejecting pinned-column drags, drops onto pinned positions, and any resulting order interleaving a scrolling column into the pinned run; the header menu shall be exactly Sort ascending / Sort descending / Hide column / Filter, revealed on hover/focus and touch-safe.
FR16: A per-row action-column control shall open a table-agnostic record panel as a right-side sheet showing all fifteen fields (read-only marked, linked labels, attendance history), with prev/next in current filtered order (disabled at ends, no wrap), keyboard support, distinct saving/saved/failed states through the grid's commit handler, and full grid-state preservation on close (filters, sort, order, visibility, widths, selection, scroll, focus); no panel delete control and no dirty-close prompt.
FR17: Cell editors shall open on double-click only (second double-click commits, blur commits a touched draft, Escape discards), with the `e` / printable-character type-to-edit / Space-seeding openers retired and their specs converted with recorded reasons; untouched blur shall issue zero requests; editing shall win over word selection.
FR18: Grid gestures shall not collide: checkbox clicks neither edit nor open the panel, popover interactions never double-edit, read-only fields never enter edit mode, edits never open the panel, single click only moves focus, and keyboard propagation stops only where a key would be swallowed.

### NonFunctional Requirements

NFR1: Verification gates stay green: `pnpm typecheck:workspace`, `pnpm lint`, `pnpm guardrails`, `pnpm test:e2e` (one runner, 5–7 min, shared seeded database). `pnpm test` runs zero tests and is not a gate; CI does not run e2e; `pnpm build` is not a type gate (`ignoreBuildErrors`).
NFR2: Default row height stays 32px (dense 28px remains a user option); cell text 13px, headers 12–13px, ~8px horizontal / 4–6px vertical padding, vertically centred, ellipsis truncation with full value reachable, right-aligned tabular numbers; no cell ever changes its row height.
NFR3: The grid stays token-clean: zero raw hex / `rgb(` / `white` / `black` / `dark:` under `components/grid/`; hierarchy via weight, space and existing semantic tokens.
NFR4: No layout shift: hover is background-only, the active indicator never changes cell dimensions, no gratuitous rerenders, no new virtualization; usable at 1024px.
NFR5: Fully operable without a mouse: accessible names everywhere, keyboard navigation with visible focus, touch-tappable header controls (opacity/visibility, never `display:none`), keyboard-operable drag, `statusMessage` live-region announcements.
NFR6: No per-frame writes during drag/resize (single commit on drop); untouched blur issues zero PATCH requests.
NFR7: Date comparisons are correct by type after conversion; unparseable values are handled explicitly with a visible reason — rows never silently vanish from filtered views or the Contact Generation chart.
NFR8: Relative-date filters are deterministic: computed once to absolute boundaries so shared URLs do not drift and no assertion depends on the wall clock.
NFR9: Visual distinctness of active / hover / editing / selected states is verified by a recorded manual pass at 1440x900 and 1024x768 (Playwright must not hardcode CSS token assertions).

### Additional Requirements

AR1: Both apps stay mirrored: `apps/folk` and `apps/gita-life` grid/route files byte-identical where already identical (verify with `md5sum`); layout `<html>`-tag parity where whole-file md5s intentionally differ.
AR2: No new dependency except `@dnd-kit/core`, pinned at the workspace root with lockfile, resolving for both apps, used for CAP-13 drag only.
AR3: `components/grid/` remains table-agnostic: zero `Manage*`, `/api/manage`, or contacts vocabulary.
AR4: One commit path: `use-grid-keyboard.ts` owns draft, optimistic display and visible revert; editors supply parsing/validation only.
AR5: Writes go through `lib/manage/api-handlers.ts` with `getStaffContext` + `requireRole` against `MANAGE_CONTACT_PATCH_KEYS`; no direct Supabase from components, no new authorization logic, no RLS changes, no new routes (note the known `proxy.ts` gap inherits to any new `/api/manage/*` route).
AR6: Migration discipline: `supabase/migrations/YYYYMMDDHHMMSS_name.sql` with down path; applied via `scripts/apply-migrations.mjs` on a fresh local stack; local-only audit, production never touched without Dwaraka; do not edit `scripts/verify-monorepo-guardrails.mjs`; `git diff lib/supabase/types.ts` must be empty after conversion.
AR7: Assertion edits only for the two deliberate exceptions (CAP-3 blank-not-dash, CAP-10 opener retirement), each in the same commit with a recorded reason; update `matrix-coverage-map.md` in the same commit when a row retires; never commit a deliberately broken spec (generate into a temp dir, remove in a `finally`).
AR8: No new dataset fetch: the record panel receives data and never fetches; no second row store; no server-side pagination.
AR9: Sequencing is load-bearing: date-types before premium-grid (date operators need the DATE type); premium-grid story 1 (edit model) before stories 3/5/6/7; story 2 (header/drag) before 3/4; verify upstream story 5's actual landed shape before story 1 starts.
AR10: New `data-*` assertion seams must not repurpose existing `data-grid-*` attributes (`e2e/fixtures/manage-grid.ts` contract); docs touched in the same commit as the code they describe (`manage-grid-pattern.md` filter section, move-column section).

### UX Design Requirements

No standalone UX design doc exists; the SPECs and `surface-and-toolbar.md` are the design authority. Actionable design requirements extracted with the same rigor:

UX-DR1: Mount a compact manage header: title + scope line as one unit, five preserved tabs with weight-plus-brand-token active state, reduced vertical slack without cramping.
UX-DR2: Deliver the grid as one compact evenly-spaced surface per NFR2 metrics, distinguishable sticky header, hairline-only dividers, opaque frozen cells with per-cell hover/selection.
UX-DR3: Implement the seven field-type renderers with editable/read-only distinction and genuinely empty empties; replace the `?? id` fallback with an unresolved marker.
UX-DR4: Consolidate all grid controls into one toolbar band with visible active-filter indication and conditional bulk bar; keep the `statusMessage` channel reachable through the redesign.
UX-DR5: Build the record panel as a right-side sheet (grid stays visible) with all fifteen fields, navigable linked labels to existing routes, attendance history, and grid-state preservation including scroll.
UX-DR6: Make the active cell discoverable and restrained (React state, consistent ring, distinct from hover/selection); keep arrows/Tab/Home/End/Escape working.
UX-DR7: Ship the Field · operator · value filter modal with per-type operators and value controls (relative-date select, multi-option list, single checkbox), live count, URL round-trip, and toolbar+header active indication.
UX-DR8: Implement drag-reorder with pinned-run protection and hover/focus-revealed four-item header menus that stay touch-operable.
UX-DR9: Enforce the double-click-only edit model with blur-commit and visible save/error/revert feedback; retire the keyboard openers deliberately with reasons recorded at each retired assertion.
UX-DR10: Guarantee gesture isolation per FR18 so no interaction does two things at once.
UX-DR11: Meet the accessibility bar in NFR5, verified partly by the recorded manual visual pass (NFR9).

### FR Coverage Map

{{requirements_coverage_map}}

## Epic List

{{epics_list}}

<!-- Repeat for each epic in epics_list (N = 1, 2, 3...) -->

## Epic {{N}}: {{epic_title_N}}

{{epic_goal_N}}

<!-- Repeat for each story (M = 1, 2, 3...) within epic N -->

### Story {{N}}.{{M}}: {{story_title_N_M}}

As a {{user_type}},
I want {{capability}},
So that {{value_benefit}}.

**Acceptance Criteria:**

<!-- for each AC on this story -->

**Given** {{precondition}}
**When** {{action}}
**Then** {{expected_outcome}}
**And** {{additional_criteria}}
