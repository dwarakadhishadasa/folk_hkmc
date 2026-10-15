---
title: 'Toolbar compaction, Hide fields, contextual bulk actions, and the Sort control'
type: 'feature'
created: '2026-10-14'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '854d7cf'
context:
  - '{project-root}/docs/architecture/testing.md'
  - '{project-root}/docs/manage-grid-pattern.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The contacts toolbar offers fifteen columns at identical weight, calls its one visibility menu "Columns" when CAP-18 names it *Hide fields*, has no global Sort entry point, and permanently renders a selection readout and a bulk button that do nothing at zero. Nothing here is missing infrastructure — `GridSortPopover` is already built and has exactly one caller (`grid-header-cell.tsx:237`), which is the one this story adds. The gap is hierarchy, a default field set, and chrome that shows itself when it does not apply.

**Approach:** Compact the band to the composition's rhythm and control order; add the toolbar Sort trigger as a third entry point onto the existing popover; replace the Columns dropdown with a **Hide fields** popover carrying the fourteen data fields with Name and Actions locked; add a per-consumer `defaultHiddenColumnIds` so an absent `hide` means CAP-18's nine; and move selection chrome into a contextual bar that exists only while rows are selected.

## Boundaries & Constraints

**Always:**

- **THE COMPOSITION IS THE SOURCE OF TRUTH.** Decided by Dwaraka, 2026-10-14, mirroring story 6: **the reference image is the source of truth for this story's surface — do not redesign, reinterpret, simplify, or add styling of your own.** This overrides `visual-design.md:5,10` ("direction, not pixel spec", "where a comp and a value disagree, the value wins") for this story only. Binding comps: `Visual-Design/contacts-toolbar-stitch-v1-corrected.html` / `.png` for the band (CAP-6), and `Visual-Design/contacts-overlays-stitch-v1-corrected.html` / `.png` for *Hide fields* and the Sort trigger (CAP-18, CAP-17).
- **One band, this order:** search · Filter · Sort · Hide fields · density · record creation · the `N of M in scope` count right-aligned. `New contact` and the view dropdown are **not** controls (OQ-1, resolved twice).
- **Band metrics, transcribed from `contacts-toolbar-stitch-v1-corrected.html:136-207`:** band `px-3.5 py-2.5 border-b border-[#E2E8F0] flex items-center justify-between gap-3 bg-white`; left group `flex items-center space-x-2 flex-wrap`; controls `h-8 rounded-[6px] text-[13px] font-medium`, `px-2.5` for the ghost/outline controls and `px-3` for the primary; the count `text-[12px] font-normal whitespace-nowrap pl-2`; the search box `w-64` with `pl-8 pr-3`.
- **Hide fields, transcribed from `contacts-overlays-stitch-v1-corrected.html:180-273`:** trigger `h-8 px-3 gap-1.5 rounded-md`, `SlidersHorizontal` at `w-3.5 h-3.5`, label `Hide fields` in `font-semibold`; popover `w-[260px] rounded-lg p-3`, header `Fields` at `text-[12px] font-medium pb-1`, list `space-y-0.5 max-h-[380px] overflow-y-auto pr-1`, rows `h-8 flex items-center gap-2.5 px-1.5 rounded hover:bg-slate-50`, checkbox `w-4 h-4 rounded`, label `text-[13px]`; locked rows `opacity-60 cursor-not-allowed bg-slate-50/60` plus a `Lock` at `w-3.5 h-3.5`.
- **Colours go through tokens, never the comp's hex.** `#F98B1C`→`saffron`, `#24324A`→`foreground`, `#4A5568`→`muted-foreground`, `#E2E8F0`→`border`, `#0F1E54`→`royal`, `#1A2D6D`→`royal` hover, `#CBD5E1`/`#E2E8F0`→`border`, `#F8FAFC`/`slate-50`→`bg-muted` (required by `visual-design.md:80` — `--muted` is warm, slate is cool), white→`card`/`popover`.
- **Fourteen rows, in column-definition order, excluding `select`.** Name and Actions render ticked, `disabled`, `opacity-60`, `cursor-not-allowed`, with the lock. The `disable` must be real: an attempted toggle leaves visibility unchanged.
- **`hideable` comes from `meta.grid.hideable !== false && column.getCanHide()`, never from `frozenColumnIds` alone.** Today's menu disables only the frozen run, and `actions` is not frozen — so it would let you hide the only delete affordance.
- **`GRID_DEFAULT_HIDDEN_COLUMNS` lives in `manage-contacts-table.tsx`, never in `components/grid/`.** Value: `source`, `booksRead`, `dateOfBirth`, `lastContactedOn`, `favorite`. Nine visible, five hidden, five reachable. `Location` and `Collected By` stay visible so CAP-4's unresolved marker is on screen; `Last Contacted On` is hidden per OQ-16.
- **`hide` encoding — absent means the default, present means the complete list.** `params.has("hide")` decides, not emptiness. `serializeGridViewState` writes the key whenever the effective set differs from the default, **including as `hide=`**, the only way to express "nothing hidden". Consequence: `hide=notes` keeps meaning "only Notes hidden", so **no existing shared URL changes meaning**. `grid-preview.tsx` passes no defaults and keeps all fifteen of its columns visible.
- **The Sort control is a third entry point onto `GridSortPopover`, not a new surface.** Its open state is local to `GridToolbar` — nothing else opens that instance, and the per-header instances already prefill because they write `sorting` before opening. `sortFields` / `sorting` / `onSortingChange` thread down from `grid.tsx` exactly as the header instance already reads `table.getState().sorting` (`grid.tsx:1281`). One component, one state, three anchors.
- **The filter control keeps both of story 6's jobs.** Same `data-grid-filter-control`, same `aria-label`, same `text-saffron` indicator, same popover. Its placement moves; its behaviour does not.
- **Selection chrome appears only when rows are selected.** At zero selected the band shows **no selection count and no bulk action** — decided by Dwaraka, 2026-10-14. A readout of `0` is a statement about absence, and absence costs nothing to notice. Above zero, a band **between the toolbar and the scroll container** carries `N selected` and the bulk action, styled to the same rhythm as the band above it (`px-3.5 py-2.5 border-b border-border bg-card`, `h-8` controls, `text-[13px]`) so it reads as one surface rather than a footer.
- **Keep the density control.** The comp omits it; CAP-15/OQ-4 keeps dense as a user option and `grid-cell-metrics.spec.ts:132-148` asserts its label is not clipped. The comp's omission is not a licence to delete a documented affordance.
- **Keep `GridRowAddControl` as record creation**, restyled to the comp's primary royal-blue treatment (`h-8 px-3 rounded-[6px] text-white`). Its `data-grid-add-record`, its `+ Add record` label and `addRecordButton` (`e2e/fixtures/manage-grid.ts:465`) are asserted. **Do not add a second "New contact" button** — two controls doing one job is the CAP-6 violation, and the comp's primary already fills that slot.
- **Keep the count's wording `N of M in scope`.** The comp says "41 of 226 shown"; `inScopeCount`, `inScopeCounts` and about ten assertion sites key on `in scope`. A visible-count readout with a changed vocabulary is churn without a gain.
- **No status message is built.** Decided by Dwaraka, 2026-10-14, after the brief's `grid.tsx:865` reference was found to be stale. `statusMessage` does not exist; the page renders `onNotice` at `manage-contacts-table.tsx:1216-1227` and delete outcomes report through their own region at `grid-row-lifecycle.tsx:200,214`. Both live **outside** `gridFrame`, so a toolbar redesign cannot drop them. **Do not build a strip, and do not add a `role="status"` inside `gridRoot`** — `grid-edit-model.spec.ts:603-631` and `e2e/fixtures/manage-grid.ts:175-180` both state that contract.
- **Token-clean.** No hex, `rgb(`, `white`, `black`, `dark:` or `vh`/`vw` unit under `components/grid/`. `harness-guards.spec.ts:89` enforces it.

**Never:**
- **Never ship a view label or a view dropdown.** A control that looks like a view selector and cannot save a view is the nonfunctional button CAP-6 forbids.
- **Never ship both `Columns` and `Hide fields`.** One control.
- **Never ship a second filter indicator or a per-column header indicator.** CAP-14 forbids a permanently visible per-column control; `grid-filter-conditions.spec.ts:154` asserts headers carry none.
- **Never add a second result count**, and never restyle the interiors of `grid-sort-popover.tsx` / `grid-filter-popover.tsx`. This story owns the band and its two triggers.
- **Never hide a column outside *Hide fields*.** The header menu keeps its Hide column item; both routes write the same state.
- **Never take a grid-body column set from a comp.** `Current status` and `Last contacted` in the comps' bodies are not fields (OQ-22); CAP-18's nine is the only set that ships.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Default field set | no `hide` param | 9 columns rendered; `source`, `booksRead`, `dateOfBirth`, `lastContactedOn`, `favorite` hidden | n/a |
| Existing shared link | `hide=notes` | only `notes` hidden — meaning unchanged from today | n/a |
| Un-hide one default column | `hide=booksRead,dateOfBirth,lastContactedOn,favorite` | `source` visible, four still hidden | n/a |
| Everything un-hidden | `hide=` (present, empty) | all 14 visible; the key is **not** deleted | n/a |
| Default restored | user re-hides the one column | `hide` key removed entirely; defaults apply again | n/a |
| Stale hidden id | `hide=ghost,notes` | `ghost` dropped, `notes` hidden | n/a |
| Hide fields list | control opened | 14 rows in column order; `select` absent; Name and Actions disabled with a lock | n/a |
| Toggling a locked row | Name or Actions clicked | `preventDefault`; visibility unchanged | n/a |
| Header Hide column | a header menu's Hide column | same state write as the popover; the column is gone from both surfaces | n/a |
| Sort trigger | clicked | `GridSortPopover` opens; a field choice writes `?sort=<id>:asc|desc` | n/a |
| Sort cleared | `Clear sort` | `sort` key absent; header `aria-sort="none"` | n/a |
| Selection chrome, resting | 0 rows selected | band carries no `N selected` text and no bulk action | n/a |
| Selection chrome, active | 1 row selected | the contextual band appears with `1 selected` and the action enabled | n/a |
| Selection empties | the last row is deselected | the contextual band is gone again | n/a |
| Selection across a filter | selected set narrowed by `q` | the count is of **selected** rows, not visible ones | n/a |
| Stale column id | `hide=ghost` / `sort=ghost:asc` | dropped, no throw | n/a |

</frozen-after-approval>

## Code Map

**New files**
- `e2e/specs/grid-toolbar.spec.ts` — CAP-18, the Hide fields contract and the toolbar Sort entry point. Named `grid-toolbar*` so `pnpm test:e2e grid-toolbar` and `test:e2e:grid` both pick it up.

**Changed files**
- `components/grid/grid-view-state.ts` — `parseGridViewState` gains a `defaultHiddenColumnIds` argument and branches on `params.has("hide")` (`:279-284`); `serializeGridViewState` writes the complete hidden set whenever it differs from the defaults, emitting `hide=` for the empty set (`:361-366`). Document both halves in the wire table at `:8-16`. **The bare-value guards are not touched** — OQ-20/OQ-21 live in `f.`/`fa.` and are story 6's.
- `components/grid/use-grid-view-state.ts` — `UseGridViewStateOptions` gains `defaultHiddenColumnIds?: readonly string[]` (`:42-44`), joined into a memo and passed into the `parseGridViewState` call at `:98`. Key it on the **joined string**, not the array, for the reason the comment at `:92` gives.
- `components/grid/grid-toolbar.tsx` — compact the band to the comp's rhythm and order; add the `Sort` trigger (`GridSortPopover`) after `Filter`; **delete** the `Columns` dropdown (`:196-223`) and the `Columns3` import; add `GridToolbarColumn.hideable: boolean`; rewrite the visibility trigger as `Hide fields`; add `sortFields` / `sorting` / `onSortingChange` props. Keep the density trigger's width rationale (`:226-234`) and extend it: the comp's narrower buttons do not license re-narrowing a control `grid-cell-metrics.spec.ts:138-148` measures. **The contextual selection band does not go in here** — `grid-scroll-surface.spec.ts:413-421` proves the scroll container's `previousElementSibling` is the toolbar and that the two heights sum to `gridRoot.clientHeight`; that sum identity is preserved by generalising it to every sibling above the container, not by relocating the band.
- `components/grid/grid.tsx` — populate `hideable` on `toolbarColumns` (`:1102-1106`); pass the three sort props at `:1159-1187`; render the contextual band between `GridToolbar` (`:1158`) and the scroll container, fed by a new optional `GridProps.selectionActions?: ReactNode`; leave `data-grid-root` / `data-grid-scroll` / `data-grid-table` exactly where they are.
- `components/grid/grid-header-cell.tsx` — delete the story-7 reservation at `:94-95`. Nothing else; the four menu items are story 6's.
- `components/grid/grid-sort-popover.tsx` — delete the reservation at `:44-46`.
- `components/grid/grid-row-lifecycle.tsx` — restyle `GridRowAddControl`'s trigger (`:104-133`) to the comp's primary royal-blue `h-8 px-3 rounded-[6px]`. Keep `data-grid-add-record` and the label.
- `components/manage/manage-contacts-table.tsx` — add `GRID_DEFAULT_HIDDEN_COLUMNS` beside `COLUMN_IDS` (`:96-112`); pass it to `useGridViewState` (`:1115`); move `[data-bulk-selection-count]` and the bulk button out of `toolbarExtra` (`:1126-1144`) into `selectionActions`, returning `null` at zero selected. Column ids, labels and `COLUMN_IDS` are untouched — nothing else reads them.
- `e2e/fixtures/manage-grid.ts` — add `hideFieldsControl`, `hideFieldsPopover`, `hideFieldToggle(page, label)`, `sortToolbarControl`; refresh the stale "three-item surface (two sorts + hide)" note on `openColumnMenu` (`:386`); update `selectionCount` (`:425`), whose doc now says the readout is **absent at zero**. **Add locators; do not repurpose any existing `data-grid-*` attribute.**
- `e2e/specs/grid-scroll-surface.spec.ts:413-421` — generalise `previousElementSibling` to *all* siblings above the scroll container. The claim being protected is "a leftover gap is a cap, not a layout"; only the sibling's identity changes.
- `e2e/specs/manage-contacts-selection.spec.ts` — rows 6, 7, 8, 12: `selectionCount` and `bulkActionButton` now have **count 0** in the resting state. Row 12's claim ("issues no request") is preserved by asserting absence; row 8's claim (count is of selected rows) is preserved by selecting before filtering.
- `e2e/specs/manage-contacts-bulk.spec.ts:169`, `e2e/specs/manage-contacts-filter.spec.ts:249-250` — `"0 selected"` and the disabled-button assertions become count-0.
- `docs/manage-grid-pattern.md` — the `hideable` row at `:62` names "the visibility menu", now *Hide fields*; add the `defaultHiddenColumnIds` rule beside the density entry at `:505`, including the `hide=`-means-everything-visible encoding.
- `docs/architecture/testing.md`, `CONTRIBUTING.md`, `docs/development-guide.md` — the new spec file moves every count (`:103-107`, `:144-157`, `:166-167`, the §4 mapping table at `:169-225` which already omits six `grid-*` files, and `CONTRIBUTING.md:112-130`'s inventory table plus its "update this section in the same commit that changes the suite's shape" rule).
- `matrix-coverage-map.md` — row 12's verdict line gains the recorded reason: the row's claim is unchanged, its mechanism moved from "rendered and inert" to "not offered".

**Do not touch**
- `grid-filter-popover.tsx`, `grid-sort-popover.tsx` interiors — story 6's and story 2's.
- `e2e/fixtures/manage-grid.ts` selector table at `:15-40` — every `data-grid-*` there keeps its meaning, and `grid-edit-model.spec.ts:603-631` still holds.
- `components/grid/grid-preview.tsx` — passes no defaults, so all fifteen columns stay visible.
- `proxy.ts` — no new `/api/manage/*` route, so it inherits no new gap.

## Tasks & Acceptance

**Execution:**
- [ ] `components/grid/grid-view-state.ts`, `components/grid/use-grid-view-state.ts` -- `defaultHiddenColumnIds` through parse and serialize; `hide` branches on presence, empty means empty -- so CAP-18's default cannot be undone by un-hiding, which is the whole point of "a default, not a lock".
- [ ] `components/grid/grid-toolbar.tsx` -- compact to the comp's band and order; add the Sort trigger; delete the Columns dropdown; add `hideable`; relabel the trigger *Hide fields* -- the band's content and hierarchy are this story's actual work.
- [ ] `components/grid/grid.tsx` -- populate `hideable`, pass the sort props, render `selectionActions` between toolbar and scroll container -- one owner for toolbar chrome, so the consumer cannot disagree about layout.
- [ ] `components/grid/grid-header-cell.tsx`, `components/grid/grid-sort-popover.tsx` -- delete the two story-7 reservation comments -- a comment describing an entry point that now exists reads as current right up until it becomes a lie.
- [ ] `components/grid/grid-row-lifecycle.tsx` -- restyle the add-record trigger to the comp's primary -- CAP-6 requires record creation in the band and the comp fixes its weight; a second button would duplicate it.
- [ ] `components/manage/manage-contacts-table.tsx` -- `GRID_DEFAULT_HIDDEN_COLUMNS`, the `useGridViewState` argument, and the selection chrome moved to `selectionActions` and nulled at zero -- the defaults are a contacts decision, so they cannot live in the primitive.
- [ ] `e2e/fixtures/manage-grid.ts`, `e2e/specs/grid-toolbar.spec.ts` -- the four locators and one test per matrix row -- the frozen set is a product decision no existing row covers.
- [ ] `e2e/specs/grid-scroll-surface.spec.ts`, `manage-contacts-selection.spec.ts`, `manage-contacts-bulk.spec.ts`, `manage-contacts-filter.spec.ts` -- the recorded assertion edits -- each claim is preserved and each mechanism changed by Dwaraka's decisions, so the reason goes in the spec header and `matrix-coverage-map.md` in the same commit, or the next agent reads a green run as evidence the old contract held.
- [ ] `docs/manage-grid-pattern.md`, `docs/architecture/testing.md`, `CONTRIBUTING.md`, `docs/development-guide.md`, `matrix-coverage-map.md` -- the same commit -- AR2; a doc naming a control this story deleted is a lie by the next commit.

**Acceptance Criteria:**
- Given no `hide` parameter, when the grid loads, then exactly nine columns render and `source`, `booksRead`, `dateOfBirth`, `lastContactedOn` and `favorite` are hidden — and all five remain reachable through *Hide fields*.
- Given `hide=notes`, when the grid loads, then only `notes` is hidden — the link means what it meant before this story.
- Given every column has been un-hidden, when the URL is written, then `hide=` is present and empty rather than deleted, so the defaults do not return on reload.
- Given a column is un-hidden from the default state, when the URL is written, then the key lists the still-hidden columns explicitly.
- Given the Hide fields control is opened, then it lists fourteen fields in column-definition order, `select` is absent, and Name and Actions are ticked, disabled, muted and carry a lock.
- Given an attempt to toggle Name or Actions, then visibility is unchanged — the lock is a real guard, not a style.
- Given a column is hidden from its header menu, then it disappears from *Hide fields* too — one state, two routes.
- Given the toolbar Sort control is opened, then the same `data-grid-sort-popover` appears with a field dropdown and a direction select, and choosing either writes `sort` — and the column menu's two sort items still reach the same popover prefilled.
- Given a cleared sort, then the `sort` key is absent and the header reads `aria-sort="none"`.
- Given no rows are selected, then the grid shows no `N selected` readout and no bulk action anywhere.
- Given one row is selected, then the contextual band appears between the toolbar and the grid carrying `1 selected` and the enabled action, and it is gone again when the selection empties.
- Given a selection and then a global filter, then the count reports selected rows rather than visible ones.
- Given the band renders, then its order is search, Filter, Sort, Hide fields, density, record creation, count — with no view label and no view dropdown anywhere in it.
- Given the band renders with an active filter, then the filter control still names the columns in saffron and no column header carries an indicator.
- Given `pnpm test:e2e:guards` runs, then `harness-guards.spec.ts` reports no new violation, and the full 19-row matrix is still Covered or its retirement is recorded.

## Implementation Notes

## Spec Change Log

- **2026-10-14, three spec premises overturned against the tree, decided by Dwaraka.** (1) The bulk-action claim: FR13's "appears ONLY while rows are selected" versus matrix row 12's "exists and is disabled at zero" — **chosen: at zero, neither the `N selected` readout nor the button renders.** (2) Placement: **a separate band between the toolbar and the scroll container**, styled to the band above it, because `surface-and-toolbar.md:105` and FR13 both name a separate contextual bar and Dwaraka's standing instruction is visual fidelity — which the band satisfies by wearing the same rhythm rather than by not existing. `grid-scroll-surface.spec.ts:413-421` is generalised from "the toolbar is the previous sibling" to "every sibling above the container sums to the frame"; the claim it protects is unchanged. (3) **No status message is built.** The brief, `epics.md:1108-1113` and `surface-and-toolbar.md:101` all cite `grid.tsx:865`, which does not exist; `statusMessage` is absent, the page renders `onNotice` at `manage-contacts-table.tsx:1216-1227`, delete outcomes report through `grid-row-lifecycle.tsx:200`, the fixture states "There is no `gridStatusLine` locator any more" and `grid-edit-model.spec.ts:603-631` asserts no `role="status"` inside `gridRoot`. Known-bad state avoided: building the strip the epics describe would have been new feature work beyond CAP-6 that inverts two committed contracts.
- **2026-10-14, the composition is binding for this story.** Dwaraka: "the reference image is the source of truth; do not redesign, reinterpret, simplify, or add your own styling choices." This overrides `visual-design.md:5,10` for this story only, exactly as it did for story 6, and adds a screenshot-and-correct loop to Verification. Known-bad state avoided: shipping the band from the prose alone, which is how the wrong control heights and a `w-64` search box would have arrived.
- **2026-10-14, the spec runs 3038 words against the workflow's 1600-token guideline. Dwaraka chose to keep it whole.** CAP-6, CAP-17 and CAP-18 are one toolbar surface and one user goal; splitting would have left the *Hide fields* popover without the band it anchors to.

## Review Triage Log

## Design Notes

**Why `hide` branches on presence rather than on emptiness.** `serializeGridViewState` writes only ids whose visibility is `false`, so an un-hide has nowhere to go — and "hide nothing" is the one state a bare list cannot express. Keying on `params.has("hide")` makes the parameter a *complete* description rather than a delta, which is the only way the default set stays reversible. It is also the only encoding that leaves `hide=notes` meaning exactly what it means today.

**Why the Sort control does not need lifted open state.** `GridFilterPopover` needs its state lifted because the column menu must open *that* instance. The sort popover's per-header instances already prefill correctly by writing `sorting` first and opening after, so a toolbar instance reading the same `sorting` state prefills for the same reason. Three anchors, one state, no new plumbing.

**Why the density control stays.** The comp draws five controls and omits density; the story's control list omits it too. Both describe the reference, not the product — CAP-15 and OQ-4 keep dense as a user option and a committed spec measures its trigger's width. Deleting a documented affordance to match a screenshot is how a design gap becomes a feature regression.

**Why the selection count disappears at zero rather than reading `0`.** The band is compact and every element in it is an affordance or a measurement the operator cannot see elsewhere. `0 selected` is a statement about absence, and the header checkbox already carries the real mixed/checked state.

## Verification

**Commands:**
- `pnpm test:static` -- expected: guardrails, typecheck and lint clean, no new warning.
- `pnpm test:e2e --list grid-toolbar` -- expected: the new spec registers, and `suite-determinism.spec.ts:254` still finds the filename.
- `pnpm test:e2e grid-toolbar grid-scroll-surface manage-contacts-selection manage-contacts-bulk manage-contacts-filter grid-filter-conditions` -- expected: green.
- `pnpm test:e2e:manage` -- expected: green; story 5's per-row delete outcomes still report through their region.
- `pnpm test:e2e` -- expected: full suite green at one worker, ~5-7 min. Required before the PR: `components/grid/**` is a shared file (`docs/architecture/testing.md:239`).
- `pnpm test:e2e:determinism` -- expected: two consecutive green runs, because specs and fixtures changed.
- `pnpm test:airtable-removal` -- expected: the known pre-existing 3-of-30 failure on this branch; confirm with `git stash` and report it, never edit the gate.

**Screenshot loop -- this story's completion gate, not a nice-to-have:**
- Start the local stack, open `/manage?view=contacts&mode=admin` at **1440x900** (the composition's own viewport) with the suite's `e2e/.auth/admin.json` storage state, and capture to `/tmp/opencode/story7/`.
- Capture at rest, with *Hide fields* open, with the Sort popover open, and with three rows selected so the contextual band is on screen.
- Compare against `Visual-Design/contacts-toolbar-stitch-v1-corrected.png` and `Visual-Design/contacts-overlays-stitch-v1-corrected.png`. Correct the most noticeable divergences first — geometry and control heights, then alignment, then typography, then colour. Repeat until as close as reasonably achievable.
- Re-run at **1024x768** to confirm the band wraps without pushing the count onto its own row and that the density label is not clipped; the comp has no narrow design, so only "does not break" is claimed there.
- Write the outcome and the remaining differences into Implementation Notes, and **say plainly whether the capture was a real browser screenshot**.

**Manual checks (if no CLI):**
- Open *Hide fields* and confirm the fourteen rows read Name … Actions in order, that the five unchecked are exactly CAP-18's five, and that Name and Actions show the lock.
- Confirm no `dark:` and no raw-hex grep regressions under `components/grid/`.
- Confirm no console errors on the Contacts screen.