---
title: 'The filter conditions popover with per-field-type operators'
type: 'feature'
created: '2026-10-14'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '5ed8779'
context:
  - '{project-root}/docs/architecture/testing.md'
  - '{project-root}/docs/manage-grid-pattern.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The grid can only filter a column by normalized substring, and a number column by "at or above". There is no operator, so `contains` and `is` are indistinguishable, and `grid-view-state.ts:130`/`:211` guard on the *value's* length — so an empty value is indistinguishable from an absent one and is dropped in both directions. `Notes · is empty` silently vanishes on reload. There is also nowhere to build a filter: headers carry no filter control and the toolbar carries none.

**Approach:** One popover anchored under a new toolbar Filter control holds a visible list of conditions — Field · operator · value — joined by one all-or-nothing connective. The operator travels inside the serialized value, which fixes both defects at once. The column menu gains its fourth item, Filter, which opens this same popover with that column pre-filled.

## Boundaries & Constraints

**Always:**
- **The surface is a POPOVER anchored under the toolbar's Filter control.** Not an inline bar, not a modal. `components/ui/dialog.tsx` is not used. The toolbar's matching-row count stays visible because the popover hangs below the toolbar row. **Accepted cost:** the operator cannot watch *which* rows match while composing, because the popover covers the grid.
- **One connective governs the whole list** — match all or match any. The `and ▾` prefix on later rows is driven by that one value, NOT per row. The list is never a mixed `A and B or C` expression, so there are no precedence rules and no ordered serialization. State this in the code; the visual suggests otherwise.
- **No drag handle on condition rows.** Conditions are a SET of columns, so reordering cannot change the result — a handle would imply a capability with no effect. Also deliberately absent: condition groups, "Copy from another view", Ask AI. Say why in the code, or an agent reading only the reference screenshot will re-add all four.
- **An operator with no value renders its control DISABLED, not absent** (`is empty`, `is not empty`). Real `disabled`/`aria-disabled`; it must not accept a value programmatically.
- **The operator set is a typed registry keyed by field type**, not a switch. Each operator declares its `valueShape` and the row renders from that declaration.
- **Switching field type resets operator and value** to something valid. Never leave `contains` on a date field, never an orphaned value.
- **`is any of` on a multiselect uses INTERSECTION**, not the substring-per-element branch of `gridGlobalFilterFn` (`grid.tsx:142-144`), which would make "EC" match "ECE".
- **Relative-date presets serialize to a computed ABSOLUTE boundary** (OQ-14). A shared URL must not mean something different tomorrow and no assertion may depend on the wall clock.
- **A condition whose value cannot be parsed matches NO rows and marks itself invalid.** A NaN number or an unparseable date compared silently drops rows from every view with no error and no failing test. A null cell value is excluded explicitly, never compared.
- **One toolbar indicator, naming the columns** — "Filtered by Name, Phone" in `text-saffron` `font-semibold`, preceded by a `ListFilter` icon also in saffron. The button chrome is the same ghost-bordered button as Columns. It does NOT also appear on column headers; CAP-14 forbids a permanently visible per-column control.
- **APPROVED COMPOSITION: `Visual-Design/contacts-toolbar-stitch-v1-corrected.html` and its `.png`, CAP-12 surface.** Decided by Dwaraka on 2026-10-14: **the reference image is the source of truth for this story's surface — do not redesign, reinterpret or simplify it.** This overrides `visual-design.md:5,10` ("direction, not pixel spec", "where a comp and a value disagree, the value wins") for this story only. Comp values, transcribed: trigger `h-8 px-2.5 text-[13px] font-medium rounded-[6px]`; popover `w-[600px] rounded-[8px] p-4` at `left-0`/`calc(100%+6px)` with `0 10px 25px -5px rgba(15,30,84,.12), 0 8px 10px -6px rgba(15,30,84,.08)`; header `text-[12px] font-medium` + `pb-3 mb-3` hairline; each row `flex items-center gap-2` in `space-y-2.5` with slot widths `w-16 / w-44 / w-36 / w-44 / w-8`; every control `h-9 rounded-[6px] px-2.5 text-[13px]`; `Where` is a static `text-xs uppercase tracking-wider` label and only rows 2+ carry the connective select; footer `+ Add condition` (`text-[12px] font-medium text-royal`) left, `Clear all` right, split by a hairline.
- **Colours go through tokens, never the comp's hex.** `#F98B1C`→`saffron`, `#24324A`→`foreground`, `#4A5568`→`muted-foreground`, `#E2E8F0`→`border`, `#0F1E54`→`royal`, `#DC2626`→`destructive`, white→`popover`/`card`. `harness-guards.spec.ts:89` bans raw hex under `components/grid/`, and the one deliberate substitution is recorded: the comp's disabled-value `bg-[#F8FAFC]` becomes `bg-muted`, which `visual-design.md:80` requires ("No `#F8FAFC`, no `slate-50` as a surface — reach for `--muted`; `#F8FAFC` is cool, `--muted` is warm"). Same hues, token-clean.
- **Reuse `components/ui/select` and `components/ui/input`, not native `<select>`.** Both default to `h-9`, which is the comp's height, so the difference is styling only. Radix keeps keyboard and screen-reader behaviour the comp's raw `<select>` markup does not.
- **The popover closes with an `×`, and the footer carries `Clear all`.** `surface-and-toolbar.md:231` and the composition both have them; `SPEC.md:138` says "no close button". The composition and the companion agree, `SPEC.md` does not, and Dwaraka ruled the image authoritative — so both ship. Recorded in the Spec Change Log.
- **Never copy a `CURRENT STATUS` column or a `Last contacted` default.** `visual-design.md:94`: "Never build a column from a comp." The Field select is built from the grid's own columns.
- **Encoding.** `f.<colId>=<op>:<value>`; the operator is the segment before the FIRST `:`, the remainder is the value verbatim, so a value may contain `:`. Match-any mirrors the prefix: `fa.<colId>`. The connective is implied by which prefix carries the key — any `fa.` key present means match-any. Multi-value operators join with `|`, escaping `\` then `|`. `isEmpty:` is non-empty as a whole, which is what makes the empty value round-trip (OQ-20) and what lets `contains` and `is` differ in a URL (OQ-21).
- **Operator ids by type** — text/longtext/linked: `contains` `notContains` `is` `isNot` `isEmpty` `isNotEmpty` · number: `is` `isNot` `gt` `lt` `gte` `lte` `isEmpty` `isNotEmpty`, labelled `=` `≠` `>` `<` `≥` `≤` · date: `is` `isNot` `within` `after` `before` `onOrBefore` `onOrAfter` `isEmpty` `isNotEmpty` · boolean: `is` (shown, per OQ-15) · select/multiselect: `is` `isNot` `anyOf` `noneOf` `isEmpty` `isNotEmpty`. Date values are `YYYY-MM-DD`, or `YYYY-MM-DD..YYYY-MM-DD` for `within`. The number set is the spec table's six plus the two inclusive comparisons, decided by Dwaraka on 2026-10-14; symbols rather than words, because they sit beside a numeric input and read without translation.
- **The registry is keyed by `meta.grid.fieldType`**, which every data column already declares. `meta.grid.filter` is retired outright, taking `gridTextFilterFn` and `gridNumberFilterFn` with it. Consequence: every column that declares a `fieldType` is filterable, including `favorite` and the parked `lastContactedOn`.
- **An operator-less legacy token stays valid** and normalises to a real operator: `contains` for text/longtext/linked, `gte` for number. That is the only mapping under which `f.totalAttendanceCount=5` keeps meaning "5 or more" (it was `gridNumberFilterFn`'s `>=`) while every shared link keeps working. The URL is rewritten to the explicit token on the first write. A legacy token on any other field type is still read as `contains`.
- **Token-clean.** No hex, `rgb(`, `white`, `black`, `dark:` or `vh` under `components/grid/` (`harness-guards.spec.ts:89`).

**Never:**
- **Never rebuild the withdrawn inline-bar or modal arguments.** `surface-and-toolbar.md` strikes both through; OQ-18 was reversed twice and the popover is the accepted answer.
- **Never reintroduce a per-column filter popover.** The column menu's Filter item opens the SAME toolbar-anchored popover with that column's condition pre-filled and a valid operator preselected — not a popover of its own.
- **Never add a second result count.** The toolbar row already carries "N of M in scope"; the popover hangs below it precisely so that count stays live and visible.
- **Never express match-any by filtering each column and unioning in a switch.** It is a new evaluation path plus the `fa.` key family.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Empty value round-trips | `f.notes=isEmpty:` | Notes condition survives a reload | n/a |
| No second indicator | any condition active | Toolbar reads "Filtered by Name, Phone" in saffron; headers unchanged | n/a |
| Operator-less legacy token | `f.location=Velachery` | Parses as `contains`; URL is rewritten to `f.location=contains:Velachery` | n/a |
| Operator-less legacy number | `f.totalAttendanceCount=5` | Parses as `gte`; rows with 5 or more still pass, as before | n/a |
| Stale column id | `f.ghost=is:x` | Dropped, no throw | n/a |
| Match-any over two columns | `fa.name=contains:a` + `fa.phone=contains:9` | Union of matches; toolbar names both | n/a |
| Unparseable date | `f.dateOfBirth=after:not-a-date` | Zero rows match; the condition row renders `aria-invalid` | Visible in the UI, not silent |
| Null cell value | `f.dateOfBirth=after:2026-01-01`, cell is `null` | Row excluded explicitly, never compared | n/a |
| Field type changed | Field select moved Notes → Date of birth | Operator and value reset to the date set's first operator, empty value | n/a |
| Intersection | `booksRead` holds `["ECE","KRSNA"]`, `anyOf:EC` | No match — `EC` is not the element `ECE` | n/a |
| Value contains the delimiter | Notes = `call: 9900` | `f.notes=is:call: 9900`; parses back to `call: 9900` | n/a |

</frozen-after-approval>

## Code Map

**New files**
- `components/grid/grid-filter-operators.ts` — the registry. `GridFilterOperator { id, label, valueShape }` and `FILTER_OPERATORS_BY_FIELD_TYPE: Record<GridFieldType, readonly GridFilterOperator[]>`, plus `encodeCondition` / `decodeCondition` (the `op:value` codec, incl. the `|` list escaping) and `evaluateCondition(cellValue, condition, fieldType)`. Pure and React-free.
- `components/grid/grid-filter-popover.tsx` — the popover. Mirror `grid-sort-popover.tsx` exactly: `anchor: ReactNode`, controlled `open`, `data-grid-filter-popover=""`, `align="start" side="bottom"`, and the `onFocusOutside` prevention that keeps it alive when a column menu opens it. One row per condition (Field select · operator Select · value control · delete) plus `+ Add condition`.
- `components/grid/grid-filter-value.tsx` — **defect fix (AC-D4).** The `date` / `date-range` value control, split out of `grid-filter-popover.tsx` so the nested calendar is a component boundary rather than another branch in a function that already holds five shapes.
- `e2e/specs/grid-filter-conditions.spec.ts` — the new coverage.

**Changed files**
- `components/grid/grid-view-state.ts:39` — add `"fa."` to `GRID_PARAM_PREFIXES`; without it `applyGridParams` (`:257-267`) silently deletes every match-any key on write. `:126-133` — parse through `decodeCondition` and guard on the whole token, not the trimmed value. `:204-214` — encode on write. Document `f.`/`fa.` in the wire-contract table at `:8-15`.
- `components/grid/grid.tsx` — delete `gridTextFilterFn` (`:150-156`) and `gridNumberFilterFn` (`:165-190`) and the `filterKind` ternary in `columnDefinitions` (`:519-530`); every column now resolves one condition filter fn. Keep `gridGlobalFilterFn` (`:129-147`) unchanged — it serves `q`, whose substring semantics are not this story's business. Wire match-any through TanStack's `filterFromRowIds` on the `useReactTable` options (`:680-704`).
- `components/grid/grid-toolbar.tsx:69-193` — the Filter control goes immediately after the search box (`:129`), before Columns. Ghost `Button`, `aria-label="Filter conditions"`, `data-grid-filter-control`; reads "Filter" at rest and "Filtered by Name, Phone" in `text-saffron` when any condition exists. Receives `filterConditions` / `onFilterConditionsChange` props. Story 7 compacts this band later.
- `components/grid/grid-header-cell.tsx:194-222` — the fourth menu item, Filter, after Hide column. `onSelect` calls a new `onFilterColumn(columnId)`; the grid sets state and opens the toolbar popover the way `openSortPopover` (`:130-143`) does, `requestAnimationFrame` deferred, with the column's first operator of its type preselected. Mirror `openSortPopover`'s comment — the menu's close returns focus outside the popover.
- `components/grid/grid-types.ts:100` — delete `filter?: "text" | "number"`; update the `:56-58` doc-comment.
- `components/grid/index.ts:74-82` — export the new modules from the barrel.
- `components/manage/manage-contacts-table.tsx` — remove `filter:` from all 7 column defs (`:873 883 904 938 964 971 1010`). Column ids and `fieldType`s are untouched.
- `components/grid/grid-preview.tsx:69-215` — the harness declares `filter:`; update or drop it.
- `e2e/specs/grid-column-drag-menu.spec.ts:59-76, :286-305` — the menu is now FOUR items; `:73` asserts `Filter` is absent and must stop asserting that, while keeping the assertion that no Move left/Move right item exists.
- `e2e/specs/manage-contacts-filter.spec.ts:65-131` — row 17's `.toBe(LOCATION_NEEDLE)` becomes the encoded token. The coverage is untouched; the encoding is what changed.
- `e2e/fixtures/manage-grid.ts:310-317` — the `toggleSort` doc-comment names the menu's contents; update it.
- `docs/manage-grid-pattern.md:48-62` — rewrite the `meta.grid` table: `filter` is gone, `fieldType` is the operator-registry key. Rewrite `:109-113` (the paragraph that promises this story) and `:637-641` (the known gap that says headers carry no filter until story 6). AR2 puts this in the same commit.
- `_bmad-output/specs/spec-playwright-test-foundation/matrix-coverage-map.md:53` — row 17's verdict stays Covered; the notes gain the new spec. `docs/architecture/testing.md:152-157` counts and `CONTRIBUTING.md` / `docs/development-guide.md` test counts move with the new spec file.

**Do not touch**
- `e2e/fixtures/manage-grid.ts` DOM attributes — "Add attributes; do not repurpose existing ones."
- `docs/architecture/testing.md:12-29` and the suite registry: `pnpm test` still runs zero tests.
- `components/grid/grid-sort-popover.tsx` — its `:44-52` comment already reserves the toolbar entry point for story 7.

## Tasks & Acceptance

**Defect fixes** — reported by Dwaraka against the first build, 2026-10-14. All four are in `grid-filter-popover.tsx` and none touch the codec or the evaluator.

- [x] **AC-D1 / AC-D2 — the value field.** Delete the hand-rolled `draft: Record<string, string>` state in `GridFilterPopover` and the `draft` / `onDraftChange` props it threads into `FilterValueControl`. Inside `FilterValueControl`, call `useConditionValueDraft(committed, onCommit)` with a local `pending` flag. Delete the `onKeyDown` Enter handler: the hook commits on every change. Keep `onBlur` free of any commit.
- [x] **AC-D4 — the date value control.** `grid-filter-value.tsx`, per Defect-fix decisions below.
- [x] **AC-D3 — one rule below the conditions.** Move the header's hairline onto the header itself and remove the conditions container's `border-b`, so the header's rule and the footer's are the only two. Added `data-grid-filter-header` / `-conditions` / `-footer` so the invariant is assertable rather than inferred.
- [x] `e2e/specs/grid-filter-conditions.spec.ts` -- one test per AC-D below, in addition to the matrix rows.

**Defect-fix decisions (Dwaraka, 2026-10-14):**
- **The calendar is a Radix popover with no text field and no "Set" button.** Clicking a day sets the value. This reverses the free-text `Input` the first build used for `date`, and the comment at the old `:462-464` explaining why — delete that comment rather than leaving it to contradict the code.
- **The previous/next month arrows must work.** `components/ui/calendar.tsx` renders `button_previous` / `button_next` and defaults `captionLayout="label"`, so arrows come from react-day-picker and need no wrapper change. A nested popover inside the filter popover is fine: the outer `onFocusOutside` is already `preventDefault`ed, and Radix tracks the nested layer as a branch so a pointer-down in the calendar does not dismiss the parent.
- **`is within` is a range calendar**: first click sets the start, second sets the end, committing `YYYY-MM-DD..YYYY-MM-DD` once both exist. The intermediate single-click state shows `from` alone in the trigger.
- **An unparseable date can no longer be typed, but it can still arrive by URL.** `isConditionValueInvalid` and `aria-invalid` stay exactly as they are — a hand-edited `f.dateOfBirth=after:not-a-date` must still mark the row rather than silently match nothing.

**Execution:**
- [x] `components/grid/grid-filter-operators.ts` -- registry, codec, evaluator. Pure, React-free, no runtime imports, so it is safe from a server component.
- [x] `components/grid/grid-view-state.ts` -- add the `fa.` prefix; route both filter families through `decodeCondition`/`encodeCondition`; guard on the token.
- [x] `components/grid/grid.tsx` -- delete the two old filter fns and the `filterKind` branch; resolve one condition fn per column; add the match-any `filterFromRowIds` path.
- [x] `components/grid/grid-filter-popover.tsx` + `components/grid/grid-toolbar.tsx` -- the popover and its Filter control / indicator.
- [x] `components/grid/grid-header-cell.tsx` -- the fourth menu item.
- [x] `components/grid/grid-types.ts`, `components/grid/index.ts`, `components/manage/manage-contacts-table.tsx`, `components/grid/grid-preview.tsx` -- retire the `filter` meta key and re-export.
- [x] `e2e/specs/grid-filter-conditions.spec.ts` -- one test per I/O matrix row plus the operator-registry sweep.
- [x] `e2e/specs/grid-column-drag-menu.spec.ts`, `e2e/specs/manage-contacts-filter.spec.ts`, `e2e/fixtures/manage-grid.ts` -- follow the changed encoding and the fourth menu item.
- [x] `docs/manage-grid-pattern.md`, `matrix-coverage-map.md`, `docs/architecture/testing.md`, `CONTRIBUTING.md`, `docs/development-guide.md` -- the same commit, per AR2.

**Acceptance Criteria:**
- Given a text column, when the operator select is read, then it offers exactly contains / does not contain / is / is not / is empty / is not empty.
- Given a number column, when the operator select is read, then it offers exactly = / ≠ / > / < / ≥ / ≤ / is empty / is not empty.
- Given `f.totalAttendanceCount=5` with no operator token, when the grid loads, then it filters as ≥ 5 — the meaning `gridNumberFilterFn` gave it — and the URL is rewritten to `f.totalAttendanceCount=gte:5`.
- Given `is empty` or `is not empty` is selected, when the row renders, then the value control is present, disabled, `aria-disabled`, and a programmatic value write is rejected.
- Given the field select changes from Notes to Date of birth, when the row re-renders, then the operator is the date set's first and the value is empty — never `contains` and never an orphaned value.
- Given a date column, when a relative preset is chosen, then the serialized value is an absolute `YYYY-MM-DD` boundary and stays correct after a day passes.
- Given a date condition whose value will not parse, when the grid filters, then no row matches and the condition row is `aria-invalid` — never a silent drop.
- Given `booksRead` contains `ECE` and `KRSNA`, when `is any of` is given `EC`, then no row matches.
- Given a date field's condition whose cell is null, when the grid filters, then the row is excluded explicitly.
- Given the column menu for any column, when it is opened, then it holds exactly Sort ascending, Sort descending, Hide column, Filter.
- Given the column menu's Filter item, when it is chosen, then the toolbar-anchored popover opens with that column pre-filled and a valid operator — and no per-column popover exists.
- Given `f.notes=isEmpty:` is in the URL, when the grid loads, then the condition is present and the toolbar indicator names Notes.
- Given two conditions, when the connective is match all, then only rows satisfying both appear; when match any, then rows satisfying either appear — and the connective lives in ONE state value, not per row.
- Given an active filter, when the toolbar renders, then it names the columns in saffron and no column header carries an indicator.
- Given `f.location=<needle>`, when the grid loads and writes state, then the condition filters on the joined name ANDs with `q` — matrix row 17 stays Covered.
- **AC-D1.** Given a condition whose committed value is `Velachery`, when its value field is focused, blurred, focused again, and blurred again, then it reads `Velachery` every time and the placeholder never returns.
- **AC-D1.** Given a condition whose value was cleared, when it renders, then it shows the placeholder — the placeholder means "no value", never "a value that failed to display".
- **AC-D2.** Given a text condition with an empty value, when one character is typed, then the condition's value is that character and the toolbar's matching-row count has changed — with no Enter pressed and no blur.
- **AC-D2.** Given a half-typed value inside the 250 ms debounce window, when the window closes, then the final keystrokes are all present. No keystroke is dropped.
- **AC-D2.** Given a date, boolean, option-list or multi-option-list condition, when the value is chosen, then the condition commits on the choice itself.
- **AC-D2.** Given a condition with a live-updating value, when the popover is closed and reopened, then the value is still there.
- **AC-D3.** Given the popover with two or more conditions, when it renders, then exactly one hairline sits above the first condition and exactly one below the last, and no rule sits between the last condition and the footer.
- **AC-D4.** Given a date field's condition, when the value control renders, then it is a trigger showing the date — or a placeholder — and there is no text field and no Set/Apply button anywhere in the popover.
- **AC-D4.** Given the calendar is open, when the previous-month arrow is clicked and then the next-month arrow, then the caption shows the prior month and then returns to the current one.
- **AC-D4.** Given the calendar is open, when a day is clicked, then the condition's value is that day as `YYYY-MM-DD`, the trigger shows it, and the popover closes.
- **AC-D4.** Given `f.dateOfBirth=after:2026-01-15` in the URL, when the popover opens, then the trigger reads that date and the calendar marks it selected.
- **AC-D4.** Given `is within` on a date field, when a first and then a second day are clicked, then the value is `YYYY-MM-DD..YYYY-MM-DD` and rows inside that span match.
- **AC-D4.** Given a hand-edited `f.dateOfBirth=after:not-a-date`, when the popover opens, then the condition row is `aria-invalid` and no row matches — the picker makes it untypeable, not unreachable.

## Implementation Notes

## Implementation Notes

**`useConditionValueDraft`, not `useUrlBackedDraft`.** The spec's first cut proposed reusing the search box's hook, and that was wrong — read `use-grid-view-state.ts:268` again: it reconciles the draft from the committed value whenever `focused` is false, and a blur can beat the 250 ms debounced write. So the hook has exactly the defect being fixed, latent in the search box today. The replacement reconciles on `pending` (is a write of mine still in flight?) rather than on focus, which is why it cannot lose a keystroke in either direction. `useUrlBackedDraft` is left alone; changing it would move the search box's behaviour inside a popover-defect story.

**Remount as a reset mechanism.** `FilterValueControl` is keyed `columnId:operator`. A field or operator change gives it a new key, so the draft and the `pending` flag are discarded by React rather than by an effect watching for the change — there is no window in which a stale draft is on screen. That is also why the `pending`-flag design is safe: the only realistic way for `committed` to change under an in-flight draft is Back or a link, and a remount covers the other two.

**`role="combobox"` on the date trigger.** `aria-invalid` is not permitted on `role="button"`; `jsx-a11y/role-supports-aria-props` caught it. `combobox` is also the more honest role for a control that opens a popup and holds a value, and Radix's trigger already supplies `aria-haspopup="dialog"`. `aria-expanded` and `aria-controls` are declared explicitly against a `useId` content id because the linter cannot see Radix's runtime injection — which makes the trigger/content relationship real rather than assumed.

**`data-outside` is on the `td`, not the button.** Verified against `react-day-picker@9.8.0` `dist/esm/DayPicker.js`: the day CELL carries `data-outside`/`data-selected`/`data-today`, and `data-day` is this repo's own `CalendarDayButton`. A `button[data-day]:not([data-outside])` selector silently matches every day including the greyed ones from the adjacent months, which would have made the range test click whatever the calendar happened to lay out.

**Not verified by a browser.** No e2e run was made for these four fixes; see Verification below. `pnpm typecheck:workspace` and `pnpm test:static` are clean, and `pnpm test:e2e --list grid-filter-conditions` registers all 29 tests in the spec.

## Spec Change Log

- **2026-10-14, four defects in the first build.** Dwaraka reported the committed value disappearing into its placeholder, filtering waiting on Enter, two rules under the conditions, and dates needing a picker. Root causes, all in `grid-filter-popover.tsx`: `draft` was the input's `value` and `onBlur` cleared it to `""`, so an unfocused field showed nothing but the placeholder; `onChange` wrote only local state, so `onCommit` fired on Enter and `onBlur` *discarded* rather than committed; the conditions container carried `border-b` while the footer carried `border-t`, drawing two rules where the composition has one above and one below; and the `date` shape fell through to the free-text `Input` the first build used deliberately. The value-field fix is to delete the hand-rolled draft and reuse `useUrlBackedDraft`, which the search box has used all along for exactly this reason — the fourth defect had been paid for once already. The picker replaces the free-text date with a Radix calendar popover on Dwaraka's instruction; the "untypeable, not unreachable" note on `aria-invalid` is recorded so the invalid-value branch is not deleted as dead code later.

- **2026-10-14, visual verification.** Dwaraka ruled the reference PNG the source of truth for this story's surface and directed a screenshot-and-correct loop, overriding `visual-design.md:5,10`'s "direction, not pixel spec". The composition is now named in the frozen block with its values transcribed, and Verification carries the loop. Known-bad state avoided: shipping the popover from the prose alone, which is how the wrong control heights and a missing `Clear all` would have arrived.
- **2026-10-14, close button.** `SPEC.md:138` ("no close button") contradicts `surface-and-toolbar.md:231` ("a close affordance and a 'Clear all'") and the composition, which has both. Shipped with the `×` and `Clear all`. Known-bad state avoided: dropping a control the composition shows because one summary line said to. Flagged to Dwaraka rather than silently resolved.

## Review Triage Log

## Design Notes

**Why `op:value` and not `op:value` per field.** The operator must be inside the token (OQ-21) and the token must be non-empty even when the value is not (OQ-20). Splitting on the FIRST `:` satisfies both in one rule: `isEmpty:` is 8 characters, and `is:call: 9900` recovers `call: 9900` without escaping.

**Why match-any is a prefix and not a flag.** `f.` means "all of these", `fa.` means "any of these". A `fm=any` param would be a second way to say the same thing and the two could disagree — a link could say `fm=any` with no `fa.` keys, which means nothing.

**Why `filterFromRowIds`.** TanStack ANDs column filters. Match-any needs the union, and `filterFromRowIds` takes a row-id set rather than re-running the filter chain, so the two modes share one evaluator.

**Why `fieldType` retired `filter` rather than widening it.** `filter` did two jobs: choose the per-column control (gone with story 1) and supply a value type. The second job is real, but `fieldType` already answers the same question for every column and is documented as "what the cell holds" — widening `filter` would have put the same fact in two keys that can disagree. `gridTextFilterFn` and `gridNumberFilterFn` were only ever that second job in code, so they go with it.

**Why the legacy number default is `gte`.** The obvious choice was "first operator of the type", which is `is` — and that would have turned every shared `f.totalAttendanceCount=5` link into "exactly 5" with no error anywhere. `gridNumberFilterFn` was `numeric >= threshold`, so `gte` is the operator that preserves the old meaning exactly, and it is a real entry in the new set rather than a special case.

## Verification

**Commands:**
- `pnpm test:static` -- **run, clean**: guardrails, typecheck and lint pass with 0 errors and the same 12 pre-existing warnings the tree carried before this work. No new warning was introduced.
- `pnpm typecheck:workspace` -- **run, clean**.
- `pnpm test:e2e --list grid-filter-conditions` -- **run**: 29 tests registered, the 10 new AC-D tests among them.
- `pnpm test:e2e grid-filter-conditions` -- **NOT RUN.** The local stack was not started, so the 10 new tests and the 19 existing ones are unverified against a browser. This is the outstanding gap.
- `pnpm test:e2e manage-contacts-filter grid-column-drag-menu` -- **NOT RUN.** Same reason. Both are affected: `manage-contacts-filter` asserts the encoded token and `grid-column-drag-menu` asserts the four menu items.
- `pnpm test:e2e` -- **NOT RUN.**
- `pnpm test:e2e:determinism` -- **NOT RUN.** Required before this lands: a spec file changed.

**Known risk, unverified:** the date control is the only change with no existing test behind it, and the two things most likely to be wrong are (a) whether a Radix popover nested inside another Radix popover dismisses the parent when a day is clicked, and (b) whether `react-day-picker`'s controlled `mode="range"` reports a second click as a span or as a fresh single day. The code handles (b) itself rather than trusting RDP's anchor, but only a run proves it.

**Screenshot loop** -- the gate `visual-design.md:5` describes as "recorded", done for real rather than asserted:
- Run the local stack, open `/manage?view=contacts&mode=admin` at **1440x900** (the composition's own viewport) with the popover open and conditions composed, using the suite's `e2e/.auth/admin.json` storage state. Capture to `/tmp/opencode/story6/`.
- Compare against `Visual-Design/contacts-toolbar-stitch-v1-corrected.png` and correct the most noticeable divergences first — geometry and slot widths, then alignment, then typography, then colour. Repeat until it is as close as reasonably achievable.
- Re-run at **1024x768** to confirm the popover does not overflow the viewport; the comp has no narrow design, so only "does not break" is claimed there.
- Write the outcome and the remaining differences into this story file's Implementation Notes, and say plainly whether the capture was a real browser screenshot.

**Manual checks (if no CLI):**
- Open the popover from a column menu item and confirm it does not flash closed on open (the `openSortPopover` focus-yank failure mode).
- Confirm `grep -rn "dark:" components/grid/` and the raw-hex / `rgb(` / `white` / `black` / `vh` greps are 0.