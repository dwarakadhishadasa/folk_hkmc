---
title: 'Filter popover: render field, operator and connective from a local mirror'
type: 'bugfix'
created: '2026-10-14'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'c5d9b71024767fae089da5d8a4a9291fbcb60926'
context:
  - '{project-root}/docs/architecture/testing.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The filter popover's three Selects render from the `conditions` and `connective` props, which are URL-backed and arrive only after a `router.replace` — behind a 250 ms debounce for condition changes. Choosing a field or an operator therefore cannot display the option just picked until that write lands and the whole query re-parses. The component already knows this: `conditionsRef` exists because *"it round-trips through the URL, which in dev takes a second or two"*, and two sibling drafts (`useConditionValueDraft`, `useMultiSelectDraft`) already solve exactly this for text and list values. The Selects were never given it.

**Approach:** Give the condition list and the connective the same mirror the other controls already use — authoritative while a local change is in flight, reconciled from the prop otherwise — so the rows render from it and the URL stays the single source of truth.

**Second defect, same root cause, different file.** `components/ui/calendar.tsx` passed `Root`, `Chevron` and `WeekNumber` to react-day-picker as **inline arrow functions**. React matches an element by the identity of its component type, so each of those is a different component on every render — every re-render of `Calendar` unmounts and remounts the entire day-picker subtree. It is invisible until something holds a node across the re-render, and a pointer is exactly that: clicking a day while the URL write the date control was waiting for lands dispatches the click into a detached tree. This is the pre-existing `grid-filter-conditions.spec.ts:819` failure ("element was detached from the DOM, retrying"). Scope widened by Dwaraka on 2026-10-14 to include it.

## Boundaries & Constraints

**Always:**
- The URL stays the only source of truth. Nothing about view-state ownership changes, so Back, Forward, shared links, reload, `?mode=` byte-identity and the `f.`/`fa.` connective-by-prefix rule (`docs/manage-grid-pattern.md:471-474`) keep working by construction.
- `conditionsRef` is **kept**. It is the write base for `replace`, `addCondition` and the close-time `pruneUnfilled` — not a display buffer — and `commit` must keep writing it synchronously.
- `commit` updates the mirror, `conditionsRef` and the parent in that order, so every writer in this file agrees on one list.
- A mirror change is surrendered only once the committed prop catches up. Reconciling on focus is not enough — closing the popover can beat the write — and reconciling "whenever they differ" is wrong, because during the debounce they legitimately differ.
- The mirror's identity is a `JSON.stringify` key of the list, matching how `useMultiSelectDraft` keys its set and how `sameExceptFilters` already compares.

**Never:**
- Do not change `useGridViewState`, the codec, or `GridViewStateController`'s shape.
- Do not delete `useUrlBackedDraft`, `useConditionValueDraft`, `useMultiSelectDraft` or `conditionsRef` — this spec is the mirror layer, not a removal of it.
- Do not add a URL param or a state flag that duplicates one.
- Do not reorder `commit`'s three writes; the prune reads `conditionsRef` before the prop arrives.
- Do not move any `components/ui/calendar.tsx` component back into the render body, and do not "tidy" its single-quote style into double — it is generated shadcn code, and `components/grid/**` is the boundary the guard test scans.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | Operator picks a different field | Field trigger displays it on the next paint, before the URL changes | N/A |
| Happy path | Operator picks an operator | Operator trigger displays it immediately; the value control remounts on its new shape | N/A |
| Repeated picks | Three picks inside 250 ms | All three display; the URL carries the last | N/A |
| External change | Back, a shared link, or `Clear all` changes the conditions from outside | Mirror reconciles to the prop; display follows | N/A |
| Close mid-flight | Popover closed before the write lands | `pruneUnfilled` reads `conditionsRef`, sees the latest list, drops only unfilled conditions | N/A |
| Malformed token | `f.name=zzz` | Takes the legacy-operator branch (`grid-filter-operators.ts:328-337`), not the throw fallback — already covered at `grid-filter-conditions.spec.ts:212` | Existing |
| Empty multiselect | `+ Add condition` on a multiselect | `hasAllOf:` with nothing ticked still decodes; condition inert, matches every row | Covered by `c5d9b71` |

</frozen-after-approval>

## Code Map

- `components/grid/grid-filter-popover.tsx` — **the only file that changes.**
  - `conditionsRef` :139 — the write base. **Keep.** `commit` :145, `replace` :150, `addCondition` :158 and `pruneUnfilled` :175-182 all read it.
  - `commit` :145 — currently sets the ref then calls out. Gains a third write: the mirror.
  - Render source :248 — `conditions.map(...)`. Switch to the mirror.
  - Field Select :285, `onValueChange` :287-311 — resets operator and value; builds from `conditionsRef.current`.
  - Operator Select :328, `onValueChange` :330-338 — calls `replace`, which reads `conditionsRef.current`.
  - Connective Select :266 — `value={connective}` is the third lagging control; same 250 ms-free but full-transition lag via `write(state, "push", next)`.
  - `useConditionValueDraft` :451 — the sibling pattern to copy. Leave it alone.
- `components/grid/grid-filter-value.tsx` — `useMultiSelectDraft` :249 (call site :307) is the sibling pattern for lists. Leave it alone.
- `components/grid/use-grid-view-state.ts` — **read-only.** `setFilterConnective` :183-192 does `write(state, "push", next)`, which is why the connective lags by a whole router transition.
- `components/ui/calendar.tsx` — **second file that changes.** `Root` (:128-136), `Chevron` (:137-152) and `WeekNumber` (:153-161) are inline in the `components` object and become module-scope `CalendarRoot` / `CalendarChevron` / `CalendarWeekNumber`. `CalendarDayButton` was already module-scope, which is why the churn was invisible in a profile. Single quotes throughout — this is a generated shadcn primitive, not app code. **A shared primitive:** `docs/architecture/testing.md:245` puts `components/ui/*` in the shared table, which widens the verification floor.
- `e2e/specs/grid-filter-conditions.spec.ts` — 39 tests. The file that gates this: AC-D1 :632 and :656 (draft survives focus/blur), AC-D2 :671 and :698 (debounce survives), `one connective governs the whole list` :494, `add, delete and clear all drive the URL` :587, `an unfinished condition is removed when the popover closes` :881.
- `e2e/specs/harness-guards.spec.ts:99-131` — scans every file under `components/grid/`; bans raw colour, `dark:`, `theme-toggle`/`ThemeToggle`, and `vh`/`dvh`/`vw` units.
- Verified absent: no `goBack`/`popstate` coverage and no `size.<colId>` coverage anywhere in `e2e/`. Both are **out of scope here** — the mirror does not change URL ownership, so it introduces no new Back risk.

## Tasks & Acceptance

**Execution:**
- [x] `components/grid/grid-filter-popover.tsx` -- add `useConditionMirror(committed, onCommit)`, modelled on `useConditionValueDraft` :451 and `useMultiSelectDraft` :249: hold the list, key it with `JSON.stringify`, reconcile only while nothing is pending, and expose `commit` as the sole writer
- [x] `components/grid/grid-filter-popover.tsx` -- fold `conditionsRef` into that hook so the mirror and the write base are one value -- keeps `replace`, `addCondition` and `pruneUnfilled` reading exactly what the rows render
- [x] `components/grid/grid-filter-popover.tsx` -- render `conditions.map` from the mirror, and drive the connective Select from its own mirror -- the connective is the same bug in the same file and leaving it inconsistent would be the third control that half-works
- [x] `components/ui/calendar.tsx` -- hoist `Root`, `Chevron` and `WeekNumber` to module scope as `CalendarRoot` / `CalendarChevron` / `CalendarWeekNumber`, keeping the existing single-quote style -- an inline component is a new type every render, which remounts the whole day-picker and detaches the button under the cursor
- [x] `e2e/specs/grid-filter-conditions.spec.ts` -- add specs: the field trigger shows a newly picked field before the URL changes; the operator trigger likewise; three picks inside the debounce window all display and the URL carries the last; Back still restores the previous conditions (guards the mirror reconciling) -- none is covered today
- [x] `docs/manage-grid-pattern.md` -- add one line to the filter section recording that the popover rows render from a local mirror while the URL stays authoritative, so the next agent does not "remove the mirror" as redundant

**Acceptance Criteria:**
- Given the filter popover is open, when the operator picks a different field, then the field trigger displays it without waiting for a URL change
- Given the operator picks an operator, then the operator trigger displays it immediately and the value control renders the new operator's shape
- Given three field picks inside 250 ms, then all three display and the URL carries the last one
- Given the operator presses Back after a change has landed, then the mirror reconciles and the grid shows the previous conditions
- Given an unfinished condition and a completed one, when the popover closes, then only the unfinished one is dropped — `pruneUnfilled` must still see the latest list
- Given `AC-D2: every keystroke inside the debounce window survives` :698, then it still passes — the debounce is untouched, only the render source changes
- Given `one connective governs the whole list` :494, then it still passes

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm test:static` -- expected: exit 0
- `pnpm test:e2e:grid` -- expected: no new failures against the `c5d9b71` baseline of 156 passed / 2 pre-existing failed (`:528` null-date-cell and `:819` AC-D4), plus the new mirror specs passing
- `pnpm test:e2e:manage` -- expected: 34 passed, 2 pre-existing failed unchanged (`manage-contacts-filter.spec.ts:65` and `:151`, both missing bulk-fixture data)

**Baseline note:** the `c5d9b71` numbers above were measured by `pnpm test:e2e:grid` and `pnpm test:e2e:manage` on a running local stack. Re-measure before comparing rather than trusting them.
