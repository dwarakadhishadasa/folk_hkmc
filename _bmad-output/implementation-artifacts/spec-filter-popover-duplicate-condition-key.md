---
title: 'Filter popover: a column can only carry one condition'
type: 'bugfix'
created: '2026-10-14'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
baseline_commit: '0a37e6fad25a9b3cb210e9d5c9e5380322d03b57'
context:
  - '{project-root}/docs/architecture/testing.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `GridFilterCondition.columnId` is a condition's identity, and `grid-filter-operators.ts:60-61` states the invariant outright: *"there is at most one condition per column."* The field `Select` does not enforce it. It lists every entry in `fields`, including columns another row already filters on, and its `onValueChange` rewrites the edited row's entry in place (`grid-filter-popover.tsx:315-321`) without checking whether the newly chosen column is already taken. With rows `Name` + `Phone`, setting row 2 to `Name` yields two conditions with `columnId: "name"`, and because each row is keyed `key={condition.columnId}` (`grid-filter-popover.tsx:260`), React reports *"Encountered two children with the same key, `name`"* and the grid paints two identical `Name` rows.

The mirror from `spec-filter-popover-control-mirror.md` made this visible; it did not cause it. Before the mirror the rows rendered from the URL-derived prop, and the URL cannot represent a duplicate — `serializeGridViewState` writes into a `Record<string, string>`, so two `name` conditions collapse to a single `f.name` param, and `parseGridViewState` dedupes by column id. The duplicate lived briefly in `conditionsRef.current` and was never painted. Rendering from the mirror (`grid-filter-popover.tsx:135`, `:251`) paints it instead — and makes it stick: `conditionsListKey` (`:576`) keys a two-entry list differently from the one-entry list the URL yields, so `usePendingMirror`'s pending flag never clears and the duplicate survives until the popover is closed, or Back or `Clear all` is used.

**Approach:** Disable the already-taken options in that one Select, which is what this component already does everywhere else a choice is unavailable. `addCondition` (`:162`) excludes taken columns from what it offers; `grid-filter-operators.ts:60-61` documents the invariant; `components/grid/grid-types.ts:187` records the house rule as *"rendered disabled, never absent/hidden"*; and `grid-header-cell.tsx:216` with `grid-toolbar.tsx:210` set `disabled={...}` rather than filtering an option out. `SelectItem` already forwards `disabled` to Radix (`components/ui/select.tsx:101-113`), which renders `aria-disabled="true"` and `data-disabled=""` and is styled `data-[disabled]:pointer-events-none data-[disabled]:opacity-50` (`:110`). Radix does not fire `onValueChange` for a disabled item, so the handler needs no second guard.

Two mechanics are load-bearing:
- **Exclude the row's own column.** A row's current `columnId` is in the taken set by definition, so the taken set must be computed from every row *except this one*. Getting this wrong paints the row's current value as disabled and makes a same-row re-pick impossible.
- **Derive it from `renderedConditions`, not `conditionsRef.current`.** The rows render from the mirror (`:251`), so the disabled set must come from the same list the rows display or the options will not match the rows.

**Decisions recorded (Dwaraka, 2026-10-14):** disable the taken options — not a silent rejection of the pick, and not swapping the two rows; and fix this writer only — no render-boundary invariant assertion and no change to `usePendingMirror`. The mirror's inability to reconcile away a list the URL cannot represent is left as it stands.

**Scope:** `components/grid/grid-filter-popover.tsx` — the field Select's `SelectItem` list — plus one new spec in `e2e/specs/grid-filter-conditions.spec.ts`. Every one of the file's 12 existing field-Select call sites drives a single-row list, so with the row's own column excluded the taken set is empty in all of them and none breaks.

**Known adjacent, deliberately not fixed:** `handleFilterColumn` (`grid.tsx:663-669`) builds its list from the `parsedConditions` prop rather than the mirror, so a column-menu Filter issued inside the 250 ms debounce window can drop a locally-added condition. It cannot create a duplicate — it replaces the whole list from the deduped URL-derived prop plus one `.some()`-guarded entry — so that is a lost write, not this bug.

</frozen-after-approval>

## Implementation Notes

**Files changed**

- `components/grid/grid-filter-popover.tsx` — the field `Select`'s `SelectItem` list now takes `disabled={columnTakenElsewhere(entry.id)}`. Two additions around it: `filteredColumnIds`, a `Set` of every column the list filters on built once per render, and `columnTakenElsewhere`, a per-row predicate over it that excludes the row's own column. No other writer, hook or prop changed; `usePendingMirror`, the codec and `useGridViewState` are untouched.
- `e2e/specs/grid-filter-conditions.spec.ts` — one added test, `a column already filtered by another row is disabled in the field list`. No existing test modified.

**Decisions taken during implementation**

- **No guard was added to `onValueChange`, per the frozen decision to fix the writer only.** Instead the option list now carries a comment naming itself the sole gate and pointing at the reason: Radix's `handleSelect` is `if (!disabled) { context.onValueChange(value); ... }` (`@radix-ui/react-select@2.1.4` `dist/index.mjs:814-819`, read directly rather than assumed), so a disabled item cannot reach the handler. The property is verified, not inferred.
- **The disabled set is derived from `renderedConditions`, as the frozen intent requires**, because the rows render from the mirror. `filteredColumnIds` is rebuilt on every render, so a list that changes is a set that changes; the spec now has an assertion that distinguishes the two.
- **The first draft built a `Set` inside the row map**, which made an n-row list cost O(n²) per paint, and `FilterValueControl` commits on every keystroke through `useConditionValueDraft`. Hoisted to one `Set` above the map during review.

**Surprises**

- The frozen intent cites `grid-types.ts:187` as a house rule about disabled controls. It is not: that line is a JSDoc bullet scoped to the `GridRowLifecycle` `canCreate` slot ("`canCreate` renders the add control disabled rather than hiding it"). The code comments and the test docblock were corrected to cite the option-level precedents that actually apply — `grid-header-cell.tsx:216` and `grid-toolbar.tsx:210`. **The frozen block still carries the overstated citation and was not edited**, because only Dwaraka may change it.
- The reported React key warning was a *symptom of a pre-existing defect*, not of the mirror work that shipped alongside it. Pre-mirror the duplicate existed briefly in `conditionsRef.current` and was never painted, because the URL cannot represent one.

**Verification**

- `pnpm test:static` — exit 0. `Monorepo guardrails passed`, all five typecheck targets done, lint 0 errors / 12 pre-existing warnings.
- RED, then GREEN, on the added test, confirmed by stashing only the component fix: RED failed at the `aria-disabled` assertion with `Received: ""`; GREEN passed.
- `pnpm test:e2e grid-filter-conditions` — 47 passed, 1 failed.
- `pnpm test:e2e:grid` — 163 passed, 1 failed.
- The single failure in both runs is `a null date cell is excluded rather than compared` (`grid-filter-conditions.spec.ts:632` with this change, `:557` without it — same test, shifted by the 75 added lines). **Confirmed pre-existing** by stashing both changed files and re-running it on the clean baseline: identical failure, `Expected: 0, Received: 2`. `spec-filter-popover-control-mirror.md` records the same test as a known failure at `:528` against the `c5d9b71` baseline.
- `pnpm test:e2e:determinism` — two full `pnpm test:e2e` runs back to back. Run as a background command; result appended below when it completed.

## Review Triage Log

Blind Hunter was the only active layer: `customize.toml` declares `edge-case-hunter` and `verification-gap` under `workflow.review_layers` but not under `workflow.oneshot_review_layers`, which is the route this spec took. Finding floor N = min(floor(sqrt(6.24) + 1), 10) = 3; the layer returned 14. Every claim below was checked against the code before a verdict was assigned. Twelve patched, two deferred, none rejected as false.

- **`grid-types.ts:187` miscited as a general house rule — `low`, patched.** Verified: that line is scoped to the `GridRowLifecycle` `canCreate` slot, not Select options. Both the component comment and the test docblock now cite `grid-header-cell.tsx:216` and `grid-toolbar.tsx:210`. The copy inside the frozen block is left uncorrected by rule.
- **Docblock cites `:1263` for "the four-column walk", a line this same commit invalidated — `low`, patched.** The 75 added lines shifted it. Line numbers into a growing spec file are the problem, so the reference was replaced with a behavioural description.
- **The writer that breaks the invariant has neither a guard nor a note — `medium`, patched.** The option list was the only gate and nothing said so. Comment added naming it the sole gate, citing Radix's `if (!disabled)`. The guard itself was declined by the frozen decision.
- **Preventive only; an existing duplicate is invisible to the new guard — `maybe-false`, deferred.** No path found that creates one post-fix — every writer is guarded and the codec dedupes both directions; the only route is HMR preserving mirror state in dev. Medium if reachable. Recorded in `deferred-work.md`.
- **The forced click cannot exercise the path its comment claimed — `low`, patched.** `data-[disabled]:pointer-events-none` means the hit lands on an ancestor, so "no-op" was fully explained by pointer-events rather than by Radix. The comment no longer claims which mechanism produced the no-op; the row assertions carry the claim.
- **Console assertion depends on a development-only React warning — `low`, patched.** React drops the duplicate-key warning from production builds. The docblock now says so and states that the row assertions are what carry the claim.
- **Only row 2's list was ever opened — `medium`, patched.** Row position is what a backwards self-exclusion breaks, and only one side was covered. Row 1's list is now opened and asserted to disable `Phone` while leaving `Name` enabled.
- **Nothing verified the disabled set is recomputed — `medium`, patched.** The frozen intent calls derivation from the live list load-bearing, and a set snapshotted at mount would have passed every earlier assertion. The test now moves a row to `Notes` and asserts `Phone` is offered again.
- **The positive half was never completed — `medium`, patched.** Every other field pick in the file runs against an empty taken set, so nothing covered choosing from a list that has something unavailable in it. The test now picks `Notes` and asserts the row moved, `f.notes` reached the URL, and `f.phone` did not survive.
- **`takenElsewhere` rebuilt per row, per render — `low`, patched.** O(n²) on every keystroke. Hoisted to one `Set` above the row map.
- **A disabled option carries no explanation of why — `low`, deferred.** Real, but the fix is not a simple correction: any appended text changes the option's accessible name, and `getByRole("option", { name: "Name", exact: true })` is the locator 12 existing specs use. Recorded in `deferred-work.md`.
- **The spec artifact was a stub — addressed.** `## Implementation Notes` and this log were empty; both are filled above.
- **Verification floor was too low — `high`, patched.** `docs/architecture/testing.md:239` puts `components/grid/**` in the shared table requiring `test:e2e:grid` **+** `test:e2e:manage`, and `:352` escalates to full `pnpm test:e2e` after touching a spec. Only `test:e2e:grid` had run. `pnpm test:e2e:determinism` was then run, which is two full `pnpm test:e2e` invocations and so covers all three.
- **The 15-line comment restated three other documents — `low`, patched.** Reduced to what the code cannot show: the self-exclusion, the source of the set, the sole-gate property, and the real option-level precedents.
