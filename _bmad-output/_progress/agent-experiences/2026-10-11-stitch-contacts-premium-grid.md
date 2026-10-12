# Stitch generation log — contacts premium grid

- **Date:** 2026-10-11
- **Feature:** spec-contacts-premium-grid
- **Workflow:** wds-6-asset-generation → workflow-stitch.md
- **Operator:** Dwaraka
- **Status:** prompt prepared, generation NOT yet run

## Inputs gathered

| Input | Source | Status |
| --- | --- | --- |
| Specification | `_bmad-output/specs/spec-contacts-premium-grid/` (SPEC.md, surface-and-toolbar.md, record-review.md) | ✅ |
| Visual reference (brand) | `Visual-Design/brand-reference-home-1440x900.png` | ✅ captured via Playwright |
| Visual reference (current grid) | `Visual-Design/contacts-current-1440x900.png`, `contacts-current-1024x768.png` | ✅ captured via Playwright |
| Sketch | none exists — `E-Assets/wireframes/` was never created | ⚠️ gap |

## Why two references

The current-state grid screenshot must **not** be used as the style reference. It is the
thing the spec exists to fix; feeding it to Stitch as "match this visual style" would
reproduce the complaint. It is used only as a **Current State Notes** input — what is wrong.

The brand reference carries royal blue + saffron + ivory and is the correct style anchor.

## Current state observed (confirms spec)

From `contacts-current-1440x900.png`:

- Every column header renders **two permanently visible icon buttons** (funnel + `···`)
  alongside a sort chevron. Across 14 columns this is the single loudest problem and
  matches CAP-14's "redundant menus and icons on every column" verbatim.
- Header labels truncate to `Re...`, `S...`, `V...`, `Am...` — default widths are too tight.
- Toolbar carries only: search, Columns, density, `500 of 500 in scope`. No active-filter
  indicator, no current-view label, no selection count. Matches CAP-6's gap.
- No filter conditions bar exists — CAP-12 is unbuilt.
- Hairlines, 32px rows and ellipsis truncation are already correct. Do not redesign these.

## Blocker

No desktop browser is connected to this session, so Stitch could not be driven
automatically. **Resolved by decision:** Dwaraka pastes the prompt and brings variants
back for review.

## Decisions taken (Dwaraka, 2026-10-11)

1. **Brand vs density — tighten inside the grid only.** Brand colours (royal blue,
   saffron, ivory) carry across, but corners tighten 10px → 6px on controls and 8px on
   cards, drop shadows are removed entirely, and pill shapes are dropped. The grid reads
   as enterprise software while remaining recognisably FOLK. The marketing pages are
   untouched by this — it is a grid-local treatment.
2. **Stitch is run manually.** Dwaraka pastes the prompt at https://stitch.withgoogle.com
   and returns with variants for review against the spec.

## Result

Variant 1 was **accepted with changes** rather than regenerated wholesale. The header (CAP-1),
tab row and toolbar band (CAP-6) passed as drawn, including CAP-14's at-rest header state —
Stitch inferred that correctly without being pushed. The filter surface drove three spec
reversals, all now written into the contract so `bmad-loop` builds the approved design rather
than the superseded inline bar. Full outcome: `Visual-Design/review-v1.md`.

## Decisions taken (Dwaraka, 2026-10-12) — spec round

1. **Record review is out of scope.** CAP-5, Story 9, FR5, UX-DR13/14 and
   `record-review.md` are withdrawn. The panel's purpose is served by the joined accessor
   columns being visible by default.
2. **The filter surface is a popover** anchored under the toolbar, reversing OQ-18 twice over.
3. **One filter indicator**, naming the columns ("Filtered by Name, Phone"). The two-indicator
   rule is withdrawn with the inline bar it was compensating for.
4. **No drag handle** on condition rows — with one global connective, conditions are a set,
   not an ordered expression, so reordering cannot change the result set.
5. **Disabled, not hidden**, for the value control under `is empty` / `is not empty`.
6. **One global sort surface** — a toolbar Sort opening a popover with a field dropdown and a
   direction select; the column menu's Sort ascending / Sort descending open the same popover
   prefilled; the header label is no longer a sort button. Now CAP-17.
7. **No view label and no view dropdown** in the toolbar. OQ-1 resolved a second time.
8. **Default field set** (CAP-18): visible — Name, Phone, Location, Initial Contact,
   Total Attendance, Past 60 Days, Notes, Collected By, Actions. Hidden — Source, Books Read,
   Date of Birth, Last Contacted On, Favorite.

## Next

Screen 1 is complete and accepted. No screen 2 — record review was withdrawn, so the design
set is a single screen plus its corrected comp. The remaining work is Story 2 (sort popover +
CAP-14 menu), Story 6 (filter popover) and Story 7 (toolbar), all of which now build from
these decisions rather than the superseded inline bar.

## Review criteria when variants return

Reject any variant that:

- shows per-column filter funnels or menus permanently visible (breaks CAP-14)
- colours option values or tags (non-goal: per-option pills)
- relaxes 32px row height or drops the hairlines (already correct, must survive)
- adds drop shadows or pill-shaped controls (decision 1 above)
- invents controls that do nothing — every visible control must be one the spec ships
- ships a "Copy from another view", "Ask AI" or "+ Add condition group" affordance
  (all explicit non-goals)