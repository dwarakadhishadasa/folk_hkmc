---
title: 'Attendance tab: replace the location condition popover with a location dropdown'
type: 'refactor'
created: '2026-10-21'
status: 'in-progress'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Attendance tab's only filter is a full condition builder (`GridFilterPopover`) holding a single field — Location. The operator reads a filter field, an operator and a value list to answer "which location?", on a roster whose own filter needs one question answered. The tab's filter is the tab's first impression, and it is a generic surface wearing a one-field costume.

**Approach:** Replace the condition popover with a single Radix dropdown (`components/ui/dropdown-menu.tsx`) listing the program's locations as checkboxes. It writes the *same* condition the popover wrote — `hasAnyOf` over the ticked location names — so the roster's filtering, its `attendance` descending sort and the `location` field's accessor are unchanged. Multi-select is kept: ticking several locations means "is in any of these", which is the question a location filter asks.

**What the dropdown gives up, on purpose:** the condition builder offered the whole multiselect operator set, so an operator could ask "has none of these" or "is empty" — "contacts with no location" was reachable before and is not reachable now. That is the price of a filter that is one list of places.

**What the dropdown does not change:** a contact sits in AT MOST ONE location — `contacts.location_ids` carries a `CHECK (cardinality(…)) <= 1)` bound (`supabase/migrations/20261019000000_contacts_single_location.sql`) — so the filter's question is "is this contact's location one of the ticked ones", and the union is over LOCATIONS, not over a contact's several locations.

</frozen-after-approval>

## Implementation Notes

**Route:** oneshot. No intent gaps left — the human chose multi-select over single-select, a Radix control from `components/ui`, and building on top of the uncommitted record-review work.

**Files changed**

- `components/manage/manage-location-filter.tsx` (NEW) — the dropdown: a Radix `DropdownMenu` whose items are `DropdownMenuCheckboxItem`s, one per location name, plus an "All locations" reset.
- `components/manage/manage-attendance-view.tsx` — the popover replaced by the dropdown; the condition wiring rewritten (`handleLocationChange`); the location names de-duplicated, blank-filtered and sorted.
- `components/grid/grid-filter-popover.tsx` — the `heading` prop and the `GridFilterField.operators` prop removed. Both were added by the uncommitted record-review work FOR this tab's popover, and after this change nothing supplies either.
- `components/record-review/record-review.tsx` — two test hooks: the count badge's raw value (`data-record-review-count-value`) and each record's id (`data-record-review-record-id`). No behaviour change.
- `e2e/fixtures/bulk-contacts.ts` — `listProgramContacts()` added: the program-wide contact set, paged, so a spec can compute what a roster SHOULD hold.
- `e2e/specs/record-review-attendance.spec.ts` — the location-dropdown test: one location narrows, two give the union, un-ticking narrows back, "All locations" clears.
- `package.json` — `test:e2e:attendance` script (`record-review-`).
- `docs/architecture/testing.md` — the Attendance tab's row in the feature-to-test registry, and the filter table's row for the new script.

**Decisions made during implementation**

- *Radix `Select` cannot multi-select*, so the dropdown is `DropdownMenu` + `DropdownMenuCheckboxItem` — still Radix, still from `components/ui`, and it carries the checkbox affordance the human asked for.
- *The list stays open while it is ticked.* Radix closes a menu on select; `onSelect`'s `preventDefault` stops it, and Radix composes the checkbox's own toggle without checking `defaultPrevented`, so the tick still lands.
- *The condition is written through `emptyCondition(LOCATION_FIELD_ID, "multiselect", LOCATION_OPERATOR_ID)`* so the operator is resolved through the registry rather than spelled as a bare literal.
- *Only this tab's filter is touched by a location change* — other `columnFilters` entries are preserved, so a roster that grows a second filter does not lose it.
- *The trigger keeps its text colour on hover.* The `outline` button flips its text to `--accent-foreground` on hover, which in the dark theme is near-black on a near-black translucent background. The trigger carries `hover:text-foreground` instead: its background shifts, its text does not. The MENU ITEMS keep the flip — their hover background is the light `--accent`, and dark text on it is the legible pairing.

**Review triage** — three layers ran (Blind Hunter, Edge Case Hunter, Verification Gap). Patched: the false premise about contacts holding several locations; the count badge being invisible to assistive technology; the menu's missing accessible name; the location list arriving in id order; the operator being read without checking it; a location change wiping other filters; the missing union/un-tick coverage; the count read by parsing locale-formatted text; the assertion by name rather than by id; the un-paged program-contact read; the spec's absence from the testing registry and from every feature script. Rejected: showing the ticked names on the trigger and a per-location contact count (features, not defects); a draft-state hook for the checkbox (the value is local component state, not a URL-backed one, so the grid's stale-prop hazard does not apply). Deferred: the sort comment that contradicts itself, unresolved location ids dropped by the accessor, a focused record surviving a filter that removed it, a duplicated doc block on `emptyCondition`, and a Radix outside-pointerdown listener that swallows a click landing in the frame after a menu closes — all pre-existing or upstream, recorded in `deferred-work.md`.

**Verification**

- `pnpm test:static` — guardrails, typecheck, lint: pass. (Run before the final hover-class change, which is a class string and cannot affect the type gate.)
- `pnpm test:e2e:attendance` — the Attendance tab's spec: 9 passed. (Run before the final hover-class change; the hover change was verified in the browser instead — the trigger's computed colour is now unchanged on hover in both themes.)
- `pnpm test:e2e:grid` and `pnpm test:e2e:manage` — NOT run for this change, on the human's instruction. The grid filter popover is byte-identical to `HEAD` after the dead props it had gained for this tab were removed, so this change does not touch the shared grid primitive; the grid changes in this commit belong to the record-review port that was already in the worktree.
