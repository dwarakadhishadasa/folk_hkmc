---
title: 'Column drag-and-drop, a clean column menu, and a contextual header affordance'
type: 'feature'
created: '2026-10-12'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'c7241e0dba6dd28496eac3b1aea8dbd763dd56cb'
baseline_revision: '41e310b4cbeb054b4fb338c2cc69501699ab100d'
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/docs/architecture/testing.md'
  - '{project-root}/docs/manage-grid-pattern.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Contacts header reorders columns through `Move left` / `Move right` menu items, shows its menu chrome permanently in every header, and is both a control and a sort button at once — three permanent affordances for jobs a premium grid does by drag, on demand, in one sort surface.

**Approach:** Reorder moves to drag-and-drop via `@dnd-kit/core` (pointer, touch and keyboard sensors) committed once on drop through the transient handle; the column menu shrinks to exactly Sort ascending, Sort descending, Hide column (Filter arrives with story 6); the menu control is revealed on hover and keyboard focus without ever hiding from touch; the header label stops being a sort button in favour of the one global sort surface. Scope decision 2026-10-12 (Split + C): the sort popover opened from the two menu items ships in this story; the toolbar Sort control opening the same popover lands in story 7.

## Boundaries & Constraints

**Always:**
- `@dnd-kit/core` is the only new dependency: version-pinned at the workspace root with the other shared deps, lockfile committed, resolving for both `apps/folk` and `apps/gita-life`.
- A pinned-run column (`select`, `name`) is not draggable — no handle, no activator — and any resulting order that would interleave a scrolling column into the pinned run is rejected before commit, leaving the order unchanged. Validate the resulting order, not the drop target.
- Column moves reuse `grid.tsx` `moveColumn` semantics: read the full order, step while skipping hidden columns, no-op when unchanged, `setColumnOrder`. Commit through the transient handle (`beginTransientChange` / `commitTransientChange` / `cancelTransientChange`): nothing per frame, one write on drop, persisting through the `cols` URL parameter.
- The menu control is revealed by an opacity/visibility treatment that leaves it focusable and tappable — never `display:none` — and is suppressed on the selection column and on any header supplying its own control.
- `components/grid/` stays table-agnostic: zero Manage, `/api/manage` or contacts vocabulary. No new `/api/manage/*` route (it would inherit the known `proxy.ts` session-refresh gap).
- All 19 matrix rows stay Covered, including row 17's `f.location` round-trip. Every `data-grid-*` attribute in `e2e/fixtures/manage-grid.ts` stays present with its documented meaning — add attributes, never repurpose.
- The sort-button assertion updates (fixture `toggleSort` helper, `manage-contacts-filter.spec.ts`, `grid-cell-range.spec.ts`) land in the same commit with the reason recorded on each — a deliberate contract change, not a weakened gate.

**Never:**
- No toolbar Sort control in this story — deferred to story 7 (logged in `deferred-work.md` 2026-10-12); the sort popover here opens from the two column-menu items only.
- No fourth `Filter` menu item — it would point at a filter surface that does not exist until story 6, which is exactly the dead control CAP-6/FR6 forbid. `Move left` / `Move right` and the `canMoveLeft` / `canMoveRight` props go.
- No naive index splice that fails to skip hidden columns; a hidden column still holds a position in `columnOrder`.
- No `components/ui/table` wrapper (its div is a second scroll container); `grid.tsx` keeps emitting `<table>` directly.
- Do not rewrite `grid-row.tsx:165-232` (hairline, doubled `[data-grid-cell-selected]` specificity, per-cell frozen hover/selection, single `border-r` on the last frozen column).
- No per-option colours, no raw hex/`rgb(`/`white`/`black` under `components/grid/`; hierarchy via weight, space and existing semantic tokens.
- Do not mount `ThemeProvider` (story 6 of `spec-grid-keyboard-editors-and-theme` owns it). Never commit a deliberately broken spec under `e2e/specs/`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Drag reorder | Header dragged to a new position | Order moves, written once on drop, persists through `cols` across reload | N/A |
| Pinned drag refused | Drag started on `select` or `name` | Not draggable — no handle, no activator | N/A |
| Interleaving drop rejected | Drop order would place a scrolling column inside the pinned run | Order left unchanged; frozen offsets stay consistent | N/A |
| Hidden columns skipped | Drag passes a hidden column's position | Move steps over it, as `moveColumn` does | N/A |
| Menu contents | Column menu opened | Exactly Sort ascending, Sort descending, Hide column | N/A |
| Contextual reveal | Header hovered or keyboard-focused | Menu control appears, focusable and tappable | N/A |
| Touch reachability | Touch device, header at rest | Menu reachable — never `display:none` | N/A |
| Suppressed headers | Selection column or custom-control header | No menu control rendered | N/A |
| Sort entry | Sort ascending/descending chosen | Global sort popover opens from the menu item with field and direction prefilled | N/A |
| Cleared sort | Sort cleared in popover | Valid empty state, `sort` param removed | N/A |

</frozen-after-approval>

## Code Map

- `components/grid/grid-header-cell.tsx` (250 lines) — THE file this story owns: props `canMoveLeft/canMoveRight` + `onMoveLeft/onMoveRight` (:44-47) go; stale anti-drag comment :114-120 must be rewritten; header-label sort button :165-179 goes (label stops being a sort button); per-column filter popover :181-207 goes (story 6 replaces it); menu :209-235 shrinks to three items + opacity/visibility reveal (trigger icon is `opacity-60`-only today at :218 — add the reveal treatment, keep it focusable); custom-header gate :144/:160-161 already suppresses sort/filter/menu/resize — keep.
- `components/grid/grid.tsx` — reuse, do not redesign: `moveColumn` :781-818 (full-order read, hidden-skip, no-op, `setColumnOrder`); width-drag transient pattern `:543/:571` (`begin()` on change-start, `commit()` once) mirrored for drop; `canReorder` gate :940-941 + `canMoveLeft/Right` :966-969 go; header wiring :927-982 takes the dnd activators; frozen offsets `resolveFrozenRun` :219-241 stay as-is; `GRID_ROW_HEIGHT` import :28 stays.
- `components/grid/use-grid-view-state.ts` — reuse as-is: `beginTransientChange` :180-183, `commitTransientChange` :185-193 (single push), `cancelTransientChange` :195-198; `cols` codec (`grid-view-state.ts` :135-149/:216-222, unknown-dropped, missing re-appended) untouched.
- `components/manage/manage-contacts-table.tsx` — read-only context: `COLUMN_IDS` :76-92 (select first, name second, actions last), pinned/frozen defs :788-837, `useGridViewState` :426-433, transient passthrough :1137-1141. Do not duplicate order/hide logic here.
- `package.json` (workspace root, `dependencies` :57-115) — add pinned `@dnd-kit/core` beside `@tanstack/react-table`; absent from `package.json` and `pnpm-lock.yaml` today; `apps/*` resolve via workspace root. Commit the lockfile.
- `docs/manage-grid-pattern.md` — same-commit rewrite: `meta.grid` table :48-60, pinned-run rule :64-68, custom-header note :76, porting checklist :399-422 (esp. :403-404).
- `e2e/fixtures/manage-grid.ts` — `toggleSort` helper :209-210 clicks `Sort by <label>` button: must change when the label stops being a button; header helper `[data-grid-column]` :215 is the seam for new menu/drag assertions.
- `e2e/specs/manage-contacts-filter.spec.ts:185-190`, `e2e/specs/grid-cell-range.spec.ts:53,241-242` — assert the label-as-sort-button model this story removes; update in the same commit with recorded reasons. Zero existing specs cover menu items, `cols`, or drag — all new.
- `Visual-Design/contacts-overlays-stitch-v1-corrected.html` — authoritative direction artifact for the menu + sort popover at rest/hover; not a pixel spec. Read `visual-design.md` (a companion of SPEC.md, and the binding) for the measured values and the do-not-copy list — particularly the header-at-rest rule (label + sort indicator only, menu revealed on `:hover` **and** `:focus-within` at `opacity-0`, never `display:none`).
- **CAP-13 HAS NO COMPOSITION.** All three approved comps contain zero `drag` / `grip` / drag-handle occurrences — the drag affordance was never composed, so nothing here is copied and nothing here is graded. This story therefore *invents* the affordance rather than implementing a reviewed one; see Design Notes. Do not go looking for a reference that does not exist.

## Tasks & Acceptance

**Execution:**
- [x] `package.json` + `pnpm-lock.yaml` -- add version-pinned `@dnd-kit/core` at workspace root, verify resolution for both apps -- the spec's only new dependency.
- [x] `components/grid/grid-header-cell.tsx` -- remove Move items/`canMove*` props, ship 3-item menu + focusable reveal + suppression, remove label-sort and per-column filter popover, wire dnd activators with pinned-run exclusion, rewrite the :116-120 comment -- the story's surface.
- [x] `components/grid/grid.tsx` -- replace `moveColumn` button-plumbing with drop-commit through the transient handle reusing hidden-skip semantics; remove `canMoveLeft/Right` -- one write on drop.
- [x] `docs/manage-grid-pattern.md` -- rewrite `meta.grid` table, pinned-run rule, Move section, porting checklist -- no reversed comment survives.
- [x] `e2e/fixtures/manage-grid.ts` + `e2e/specs/grid-*.spec.ts` (new) -- helpers + specs: three menu items, pinned not draggable, rejected drop unchanged, drag persists via `cols`, reveal on hover/focus, sort popover prefilled opened from the menu items (toolbar control out of scope, story 7) -- prove the matrix rows above.
- [x] `e2e/specs/manage-contacts-filter.spec.ts` + `e2e/specs/grid-cell-range.spec.ts` + fixture helper -- convert label-sort-button assertions to the new surface with reasons recorded -- deliberate contract change, same commit.

**Acceptance Criteria:**
- Given a dragged header, when the drop lands, then the order commits once through `cols` and survives reload.
- Given a pinned column, when a drag is attempted, then no drag starts.
- Given a drop whose resulting order interleaves the pinned run, when it lands, then the order is unchanged.
- Given the column menu, when opened, then it holds exactly Sort ascending, Sort descending, Hide column.
- Given a header at rest, when hovered or keyboard-focused, then the menu control appears focusable and tappable; given a touch user, when no hover exists, then the menu is still reachable.
- Given the selection column or a custom-control header, when rendered, then no menu control appears.
- Given a hidden column position, when a drag passes it, then the move steps over it.
- Given all 19 matrix rows, when the suite runs, then every row stays Covered and `f.location` still round-trips.

## Implementation Notes

- New files: `components/grid/grid-sort-popover.tsx` (the one global sort surface: field + direction selects applying on change, quiet Clear; opened programmatically from the column menu in this story, from the toolbar in story 7) and `e2e/specs/grid-column-drag-menu.spec.ts` (11 tests).
- `resolveColumnDropOrder` + `isPinnedRunIntact` in `grid.tsx` are exported pure helpers: remove-dragged-id from the full order, insert at the drop target's slot (hidden ids keep their slots), reject when the pinned leading run would break. `commitColumnDrop` (ex-`moveColumn`) returns whether it wrote; drop commits once via the transient handle, rejects cancel.
- The menu item both applies the sort and opens the popover prefilled, so the popover always shows what the grid is doing. Two hard-won integration facts are documented in code: (1) the open is deferred with `requestAnimationFrame` past the menu's close, and (2) the popover ignores focus-outside dismissal — without both, the menu close's late focus-return dismisses the popover the instant it opens (proven with focusin tracing: field focused, then focus yanked back into the closing menu, then to the trigger).
- E2E helper `dragHeaderTo` uses stepped `mouse.move` (25 steps), not `dragTo`: `@dnd-kit/core`'s pointer sensor never activates on Playwright's single-jump drag, so the drop silently no-ops with no `cols` written.
- Deliberate contract changes, each with the reason recorded at the edit site: `toggleSort` helper now goes menu item + popover (header label is not a sort button); row 17's per-column filter is driven through the `f.location` URL param (header funnel removed until story 6's conditions popover) with an added virtualizer-settle wait; row 18 / range 4 sort via directed menu items.
- No new `/api/manage/*` route; `components/grid/` keeps zero Manage/contacts vocabulary; token-clean grep still 0; all `data-grid-*` attributes preserved, two added (`data-grid-drag-handle`, `data-grid-sort-popover`) and documented in the fixture header.

## Spec Change Log

## Review Triage Log

## Design Notes

Drop-commit mirrors the width drag: `beginTransientChange` on drag start so per-frame moves stay local, `commitTransientChange` once on drop so the URL takes exactly one push, `cancelTransientChange` when a drop is rejected. The pinned-run check runs against the *resulting* order array (built with the same hidden-skipping walk as `moveColumn`), never against the drop target alone — the frozen `left` offsets accumulate in `columnOrder`, so a bad commit is invisible statically and breaks only while scrolling.

**The drag affordance was invented, not implemented, and the reasoning is recorded here because nothing was available to copy.** All three approved comps contain zero drag/grip occurrences, so CAP-13 has no reviewed design. What shipped: **the label itself is the activator** — `grid-header-cell.tsx:170-179` wraps label + `SortIndicator` in a span carrying `setNodeRef`, the dnd `attributes`/`listeners`, `role="button"`, `tabIndex={0}`, `aria-label="Drag to reorder <label>"`, `cursor-grab` → `active:cursor-grabbing`, and `data-grid-drag-handle`. Pinned and custom-header columns render the same label in a plain span with no activators (`:183-187`), so the seam `[data-grid-drag-handle]` is absent exactly where dragging must be impossible — which is what makes the fixture contract at `manage-grid.ts:25` checkable.

Three properties worth defending explicitly. (1) **No grip icon was added.** A visible grip would put a third mark in the at-rest header, and CAP-14 plus every comp require at-rest to be label + sort indicator *only*; making the label the handle satisfies both. (2) **The affordance exists only where it works** — `canDrag` gates it, so a pinned column is inert rather than draggable-and-rejected. (3) **`tabIndex={0}` + `role="button"` + a real accessible name** is what lets `@dnd-kit`'s `KeyboardSensor` work and satisfies CAP-8; removing the `e`-era affordances must not leave drag pointer-only.

**One unreviewed deviation to judge at the visual pass:** the focus ring here is `focus-visible:ring-1 ring-inset ring-ring/50` — 1px, inset, at 50% opacity — where `visual-design.md` records the focus ring as a **2px** royal blue. This is not a recorded defect, because no comp covers this state and there is nothing to have departed from; it is an unreviewed value that the recorded pass at 1440×900 and 1024×768 has to accept or correct.

## Verification

**Commands:**
- `pnpm test:static` -- expected: guardrails + typecheck + lint green, no stack.
- `pnpm test:e2e:grid` (`pnpm test:e2e grid-`) -- expected: 57 grid-primitive tests green incl. new drag/menu specs.
- `pnpm test:e2e:manage` (`pnpm test:e2e manage-contacts`) -- expected: 36 manage specs green incl. converted sort assertions.
- `pnpm test:e2e:list grid-` / `pnpm test:e2e:list manage-contacts` -- expected: scope check before running; filters are regexes, never globs.

**Manual checks (if no CLI):**
- Menu reveal and drag behaviour at 1440x900 and 1024x768, light and current theme; frozen run scrolls without offset drift. Full `pnpm test:e2e` + determinism are deferred to the story-10 closing gate / PR per the story-scoped test instruction — `components/grid/**` widening to manage suites is covered above, and the deferral is recorded here, not assumed.

**Results (recorded 2026-10-12, baseline `c7241e0`, branch `feat/grid-keyboard-editors-and-theme`):**
- `pnpm test:static` — guardrails PASS, `typecheck:workspace` PASS (all 6 projects), `pnpm lint` 0 errors + the 12 pre-existing warnings. Token-clean grep under `components/grid/` still 0.
- New `e2e/specs/grid-column-drag-menu.spec.ts` — 11 tests + 3 setup, **14 passed, exit 0** (~1.6 min). The `grid-` filter also matches this file, so it runs inside `test:e2e:grid` too.
- `pnpm test:e2e:grid` — **92 passed, exit 0** (~12 min), including the 11 new tests and the converted `grid-cell-range` range-4 assertions.
- `pnpm test:e2e:manage` — 35 passed + 1 failed: the rewritten row-17 test read virtualized rows before the first paint after a `page.goto` (the old flow typed into a live grid and never hit this). Fixed with an explicit first-row render wait; `pnpm test:e2e manage-contacts-filter` re-run: **8 passed, exit 0** (~1.2 min), covering rows 17/18/19 with final file content.
- Deferred to the story-10 closing gate per this story's own Verification section (not assumed): full `pnpm test:e2e` and `pnpm test:e2e:determinism`.
- Environment note: foreign `test grid-` runners were observed starting mid-session and one went dormant; per the one-runner rule no overlapping run was started while one was active, and no foreign process was touched. `pnpm mailpit:start` was needed once (readiness gate failed on Mailpit before the first run).
