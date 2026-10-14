---
title: 'One scroll container, and a surface that does not clip'
type: 'feature'
created: '2026-10-13'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '49ecbe2f6edd9a56be5fcf0ac13fb7cbe195ad46'
context:
  - '{project-root}/docs/manage-grid-pattern.md'
  - '{project-root}/docs/architecture/testing.md'
  - '{project-root}/_bmad-output/specs/spec-manage-dashboard-grid/design-constraints.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `grid.tsx:982` caps the scroll container at `max-h-[70vh]`. The cap is the cause of both symptoms CAP-2 names — the clipped final column and a nested scrollbar — because a viewport-height-capped inner scroller inside a page that also scrolls produces a viewport-dependent frame, and the last column's right edge is exactly where the horizontal scrollbar's thumb sits. CAP-2's other half is also unmet: the header row is `bg-card`, the same surface as the body, so the header is not visually distinct.

**Approach:** Make the grid's frame a bounded flex column, so the container takes the height it is given instead of asserting a viewport fraction, and the page stops being a second scroller. The header takes a `--muted` surface. Assert the *behaviour* — one scroll container, a sticky header that still sticks, the last column reachable — rather than the CSS that produces it.

**Decided by Dwaraka, 2026-10-13:**

- **The `/manage` shell is bounded to the viewport** (`h-dvh`, `overflow-hidden`), and Dashboard, Sessions, Attendance and Favorites each become their own `overflow-auto` tab scroller. Contacts is the one surface with a single scroller, and the page header and tab row stay pinned while the grid scrolls. *Accepted cost:* `manage-attendance-view.tsx:166` and `manage-favorites-view.tsx:330` already hold a `max-h-[60vh]` inner scroller, which now sits inside a scroller — a nested scrollbar on those two tabs, recorded rather than fixed, because neither is the grid. *Rejected:* bounding only the Contacts tab (the offset above the grid is not a constant — header height, a tab row that wraps at narrow widths, and a preacher-mode scope notice all move it), and simply deleting the cap (the container stops scrolling, so `sticky top-0` has no scrollport and the horizontal scrollbar lands ~8,000px down).
- **`BulkReportPanel` is bounded rather than moved:** `shrink-0` on its section and `max-h-[40%] overflow-y-auto` on its `<ul>`. A fraction of the container, not of the viewport, so it holds whatever the chrome above it measures. The panel stays reachable at 200 rows and the grid shrinks instead of vanishing. *Rejected:* leaving it (crushed or clipped out of reach) and moving it above the grid (displaces the toolbar — a visual-order change that belongs to story 7).

## Boundaries & Constraints

**Always:**
- **One scroll container, and it is the grid's.** The page must not scroll on the Contacts tab; the horizontal scrollbar must therefore always be on screen, which is the actual fix for the clipped final column.
- **The scroll container must keep scrolling vertically.** Header cells are `sticky top-0` (`grid-header-cell.tsx:159`); a container that stops scrolling kills the sticky header, so "fill the space" must never mean "grow to content height".
- **`grid.tsx` keeps emitting `<table>` directly.** `components/ui/table`'s div is a second scroll container.
- **Do not rewrite `grid-row.tsx:165-232`** — the hairline, the per-cell frozen `bg-card`, the doubled `[data-grid-cell-selected]` specificity and the single `border-r` on the last frozen column are load-bearing.
- Header/body distinction is `bg-muted` against the body's `bg-card`. No new colour, no raw token.
- Token-clean: `grep -rn "dark:" components/grid/` and the raw-hex / `rgb(` / `white` / `black` greps stay **0**.

**Never:**
- **Never reintroduce a viewport fraction.** No `70vh`, and no `calc(100dvh - X)` substitute: the chrome above the grid is not a constant (the header height, a tab row that wraps at narrow widths, and a scope notice that renders only in preacher mode all move), so any hardcoded offset is a guess. The chain must carry the height instead.
- **Never add a scroll shadow, stripe or heavy border** as a workaround (`design-constraints.md` bans all three).
- **Never assert a computed colour value.** "Header differs from body" is a comparison of two elements' backgrounds, not a hex.
- Never add a `data-*` seam that repurposes an existing one; new seams only (NFR14).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Contacts at rest | `/manage?view=contacts` | Exactly one scrolling element on the page; `document.scrollingElement.scrollHeight <= innerHeight` | N/A |
| Grid fills its frame | same | Scroll container's `bottom <= innerHeight + 1` and `clientHeight > 0`; not a `70vh` fraction | N/A |
| Vertical scroll | container scrolled down | Header `<th>` stays within 1px of the container's top edge | N/A |
| Horizontal scroll | container scrolled fully right | Last column's `right <= container.right + 1` — never clipped | N/A |
| Row metrics | any state | Row still measures 32px after the container change | N/A |
| Header vs body | at rest | `getComputedStyle(th).backgroundColor !== getComputedStyle(td).backgroundColor` | N/A |
| Narrow viewport | 1024×768 | Tab row wraps; the grid still fills; no page scrollbar appears | N/A |
| Editor open | longtext popover | Container height unchanged; the popover is not clipped by the frame | N/A |
| Bulk report open | up to 200 rows | Panel stays reachable and bounded; the grid shrinks rather than vanishing | N/A |

</frozen-after-approval>

## Code Map

- `components/grid/grid.tsx:946-949` — grid root, `data-grid-root`, `bg-card overflow-hidden rounded-md border border-border` + the merged `className` prop (`:457`). Becomes `flex min-h-0 flex-1 flex-col`; the internal layout is the primitive's own job, so no consumer has to pass a class.
- `components/grid/grid.tsx:977-984` — the scroll container. `max-h-[70vh] overflow-auto` → `min-h-0 flex-1 overflow-auto`. **The only `vh` anywhere under `components/grid/`** (verified by grep) — a source-text assertion can therefore ban the whole unit. Add `data-grid-scroll=""` here; it is the first `data-*` seam on this element and `role=group` + `aria-label` + `tabIndex` already identify it.
- `components/grid/grid-toolbar.tsx:92` — toolbar root has no `shrink-0`; in a bounded column it would compress when the grid is short. Add it.
- `components/grid/grid-header-cell.tsx:159` — `bg-card` → `bg-muted`. It is the only header surface; `grid-panel.tsx:22`'s `bg-card` is the in-body panel row and stays.
- `apps/folk/app/manage/page.tsx:37` / `apps/gita-life/app/manage/page.tsx:37` — `min-h-screen bg-background`; the root of the whole problem. `:39` `main.container mx-auto px-4 py-6` → flex column, `min-h-0 flex-1`. **Both apps must stay byte-identical** (`md5sum`).
- `components/manage/manage-portal.tsx:59` `space-y-6` → `flex min-h-0 flex-1 flex-col gap-6` (same 24px rhythm; story 8 compacts it). `:115` `Tabs` already `flex flex-col gap-4` — add `min-h-0 flex-1`. `:116` `TabsList` needs `shrink-0` (it wraps at narrow widths). `:127-129` the contacts `TabsContent` carries the chain into the grid; the other four need `overflow-auto`.
- `components/manage/manage-contacts-table.tsx:1162` `space-y-3` → `flex min-h-0 flex-1 flex-col gap-3`. The `role="status"` notice at `:1167` is **above** the grid, so it stays visible in a bounded layout. `BulkReportPanel` at `:1202` is below it — `shrink-0` on the `:386` section, `max-h-[40%] overflow-y-auto` on the `:405` `<ul>`, per the decision recorded above.
- `components/manage/manage-{dashboard,sessions-view,attendance-view,favorites-view}.tsx` — all four exceed the viewport and must not regress once the page stops scrolling. Inactive tab content is unmounted by Radix, so only the active one is live.
- `components/grid/grid-preview.tsx:347` + `apps/{folk,gita-life}/app/dev/grid-preview/page.tsx:98` — the harness renders `<Grid>` with 500 rows and is the second of only **two** `<Grid>` call sites (`harness-guards.spec.ts:97` claims four; no other view imports `@/components/grid`). It must be bounded too, or removing the cap makes it 16,000px tall.
- **Do not touch `grid-row.tsx:165-232`.**
- `e2e/fixtures/manage-grid.ts:19-20` — the seam table; add the `data-grid-scroll` row. `:81-83` `gridScroll` already locates the container by accessible name, so the new seam is for the *count-one* assertion.
- `e2e/specs/grid-keyboard.spec.ts:207-216` — the only `scrollTop` assertion in the suite. It reads `scrollTop` before and after `Space`, so it survives either way, but it is the first thing to check if the container's scroll behaviour shifts.
- `playwright.config.ts` — **no viewport is configured anywhere in the repo**; Playwright's 1280×720 default applies. So `max-h-[70vh]` was 504px and the assertions must not be written against a number derived from it.
- `docs/manage-grid-pattern.md` §9 porting checklist — the home for "the grid fills the frame, and its ancestors must carry the height". A future table author cannot satisfy this contract without being told.

## Tasks & Acceptance

**Execution:**
- [x] `components/grid/grid.tsx` — root → `flex min-h-0 flex-1 flex-col`; scroll container → `min-h-0 flex-1 overflow-auto`, dropping `max-h-[70vh]`; add `data-grid-scroll=""`. The container stays the virtualizer's scroll element (`grid.tsx:722`) and keeps `role`/`aria-label`/`tabIndex`/`keyboard.containerProps`.
- [x] `components/grid/grid-toolbar.tsx` — `shrink-0` on the root.
- [x] `components/grid/grid-header-cell.tsx` — `bg-card` → `bg-muted` on the `<th>`.
- [x] `apps/folk/app/manage/page.tsx`, `apps/gita-life/app/manage/page.tsx` — bound the shell and make `main` a flex column. Keep the two files byte-identical.
- [x] `components/manage/manage-portal.tsx` — flex chain root, `Tabs`, `TabsList`; contacts `TabsContent` continues the chain, the other four scroll.
- [x] `components/manage/manage-contacts-table.tsx` — flex chain; `shrink-0` on the bulk report section and `max-h-[40%] overflow-y-auto` on its list.
- [x] `components/grid/grid-preview.tsx`, `apps/{folk,gita-life}/app/dev/grid-preview/page.tsx` — bound the harness the same way.
- [x] `e2e/fixtures/manage-grid.ts` — add the `data-grid-scroll` seam row.
- [x] `e2e/specs/grid-scroll-surface.spec.ts` — NEW. Every row of the I/O matrix.
- [x] `docs/manage-grid-pattern.md` — the fill-height contract plus a porting-checklist line.

**Acceptance Criteria:**
- Given `/manage?view=contacts` at rest, when every element in the document is measured, then **exactly one** element both overflows and has a scrolling `overflow`, and it is `[data-grid-scroll]`; the page itself does not scroll.
- Given the same view, when the grid's frame is measured, then the container's bottom edge is within 1px of the viewport bottom and its `clientHeight` is greater than zero — the horizontal scrollbar is always on screen, which is the fix for the clipped final column.
- Given the container scrolled to its bottom, when the header is measured, then the header row is still flush with the container's top edge — removing the cap did not cost the sticky header.
- Given the container scrolled fully right, when the last column is measured, then its right edge is inside the container's right edge.
- Given the grid at rest, when the row is measured, then it is **32px**, and when the header and a body cell are compared, then their computed backgrounds differ — a comparison, never a literal.
- Given `components/grid/**` is read as text, when it is scanned, then no `vh` unit appears — the reversed decision cannot be quietly reinstated.
- Given `pnpm test:e2e:grid`, `pnpm test:e2e:manage` and `pnpm test:static` run, then they are green and both greps return 0.

## Implementation Notes

**Two defects found and fixed while verifying, neither caused by this story.** Both were invisible
to the suite as written, which is the reason they survived to here.

**1. A hydration mismatch on every `/manage` load — pre-existing since story 2.** dnd-kit's
`useUniqueId` assigns ids from a **module-level counter** when its context has no `id`:

```js
const id = ids[prefix] == null ? 0 : ids[prefix] + 1;
ids[prefix] = id;
```

The server and the browser keep separate counters, so `useDraggable`'s `aria-describedby` on the
drag handle was `DndDescribedBy-0` server-side and `DndDescribedBy-3` client-side. React recovered
by re-rendering the mismatched subtree, so **no test failed and nothing looked wrong** — the cost is
a discarded render of every header on every load plus an unasserted console error. Introduced by
`41e310b` (story 2's dnd-kit commit), confirmed present at this story's baseline.

*Fix:* `grid.tsx` passes a constant `id` to `<DndContext>`, which short-circuits the counter
(`if (value) return value`). Constant rather than derived from `ariaLabel`, because a per-grid suffix
is stable only if both sides mount the same number of grids — the exact assumption that broke.
*Test:* `grid-scroll-surface.spec.ts` **surface 9**, which watches `/manage`'s console. The existing
`theme-switch.spec.ts` theme 12 looks like it covers this and **cannot**: it loads `/`, which mounts
no grid, so it only ever catches `ThemeToggle` returning `null` before mount.

**2. `books_read` residue in the local database, plus one assertion that was wrong about its
subject.** `pnpm test:e2e:grid` failed 3 of 118, all in `grid-editors.spec.ts`'s "multiselect, on
`/manage`" — exactly the `books_read` failure story 4 predicted and left unfixed.

- *Residue.* Row `03547da5…` (`Girish Neelakantan`) held **8** books. `booksFor(index)`
  (`fixture-reference-data.mjs:313`) returns `2 + (index % 3)` entries and de-duplicates, so it can
  produce **2–4, never 8** — this was provably test residue from an interrupted earlier run, not
  fixture data. Restored to the 4 the generator produces for that index. Verified afterwards: 0 rows
  outside the 2–4 range, 0 rows with intra-row duplicates.
- *Assertion.* The rejection test built `before = array.join(", ")` and asserted `toHaveText(before)`.
  A multiselect cell renders one `<Pill>` per entry (first two, then a muted `+N`), so its
  `textContent` is the pills **run together with no separator** — and a comma between pills would be
  a stray visual artifact. The comma-joined string is real, but it is the `title`. The test now
  asserts **both**: the full comma-joined value on `title`, and the unseparated pills as the cell's
  text. The component was right; the expectation was wrong.

**This was local database state, not committed code.** Nothing in the repository encoded the polluted
value, so it survives `git checkout` and would have trapped the next agent identically. The repair is
the seed state; it is not in the diff and cannot be recovered from it.

**The three multiselect tests were wrong about the renderer in two separate ways**, and only the
second was obvious from a red run. A multiselect cell shows at most **two** values plus a `+N` badge
(`grid-editors.tsx:755-768`), so:

1. **`toContainText(pickedBook)` fails whenever the pick lands third or later.** The book is absent
   from the text *by design* — it is behind the `+N`. All three tests now assert against `title`,
   which is where the full comma-joined value is reachable from, which is also how an operator
   reaches a collapsed value.
2. **The pills carry no separator**, so `array.join(", ")` as *cell text* was asserting a comma the
   component is built not to render.

A third correction, worth recording because it is a design property rather than a test bug: **a cell
error is sticky.** `use-grid-keyboard.ts:796-799` writes
`{ value: previousText, error: message }` and nothing clears it until the next edit, so the operator
can still read *why* a write was refused — and `title` carries the error for as long as it stands.
An intermediate version of this fix asserted that the error clears on its own; that is the opposite
of the intended behaviour, and it failed. The revert is proved by the pills returning to the stored
value plus the database never taking the draft, which is unambiguous either way.

The block is now `mode: "serial"` and `inScopeRow` offsets are 49/51/53, so the three tests write to
three distinct rows — serial means a failure skips the rest instead of letting a downstream test
read a row the previous one had mutated.

## Spec Change Log

- **`md5sum apps/*/app/manage/page.tsx` — the "expected: identical" expectation was wrong.** Those
  two files have never been byte-identical: `gita-life` carries `sm:py-8` on `main` and `folk` does
  not, at baseline `49ecbe2` and before it. Verified against the baseline, not assumed. The edit was
  applied symmetrically and **preserved** that pre-existing difference rather than erasing it. The
  parity rule that does hold is on `<html>` in `layout.tsx`, asserted by `harness-guards.spec.ts`.
- **Added an acceptance criterion not in the approved plan: no `vh` unit under `components/grid/`.**
  Implemented in `harness-guards.spec.ts` alongside the token-clean guard, which already read those
  files as text. It bans the **unit**, not the one literal value, so a `calc(100dvh - X)` substitute
  cannot return through the side door. No rendered measurement distinguishes `max-h-[70vh]` from
  `min-h-0 flex-1` in a frame that happens to be 70vh tall, so a source assertion is the only one
  that can.

## Review Triage Log

## Design Notes

**Why "fill the space you are given" needs the whole chain and not one line.** `flex-1` distributes *free* space; it never creates a bound. Every ancestor between `main` and the container is content-sized today — `Tabs` is `flex flex-col` and `TabsContent` is `flex-1`, and both are inert without a bounded parent — so the height has to be established at `page.tsx:37` and carried down through `min-h-0` on every hop. `min-h-0` is the part that is easy to miss: a flex item's default `min-height: auto` refuses to shrink below its content, so a chain missing it silently grows the page again and reintroduces the nested scrollbar the story exists to remove.

**Why "delete the cap" is not the minimal change.** With the cap gone and no bound above it, the container's height becomes the virtualizer's total (~8,000px at 250 rows). It then never scrolls vertically, so `position: sticky; top: 0` on the header has no scrollport to stick to and the header scrolls away; the horizontal scrollbar lands at the bottom of that 8,000px, which is the clipped-final-column complaint arriving by a different route.

**The chain crosses into story 8's file, and it must survive that story.** `manage-portal.tsx`'s root and `Tabs` become a bounded flex column here; story 8 (`CAP-1`, page header) compacts the header in the same file. Story 8 may change spacing and type and nothing else about the chain — an `h-*` on the root, or a dropped `min-h-0` on any hop, silently reinstates the nested scrollbar this story removes, and it would read as a page that simply scrolls again.

**Scope gate: kept whole.** ~3,900 tokens against the 1,600 proposal, which is the smallest of the five stories in this spec (1: ~6,300 · 2: ~4,500 · 3: ~4,250 · 4: ~5,700). The separable piece — the header/body surface change — is ~2 lines and one assertion; carving it into its own story would buy a second PR rather than less context. **Dwaraka chose to keep the full spec, 2026-10-13.**

## Verification

**Commands actually run, and their real results.** Baseline `49ecbe2` plus this story's diff, one
worker, `E2E_BASE_URL` `http://127.0.0.1:3000`. Nothing below is inherited from an earlier run.

| Command | Result |
| --- | --- |
| `pnpm test:static` | **exit 0** — guardrails passed, `typecheck:workspace` 6/6 projects, lint 0 errors / 12 pre-existing warnings (all in files this story does not touch) |
| `pnpm test:e2e grid-scroll-surface grid-editors.spec.ts` | **49 passed** (5.4m), exit 0 — all 9 surfaces and all 40 editor tests |
| `pnpm test:e2e:grid` | **115 passed, 3 failed** (12.1m) — the run that *found* the multiselect residue; all 3 green since |
| `grep -rn "dark:" components/grid/` | **0** |
| raw-hex / `rgb(` / `white` / `black` grep under `components/grid/` | **0** |
| `vh` unit grep under `components/grid/` | **0** |
| `pnpm test:e2e` (full) | **NOT RUN** — stopped on Dwaraka's instruction |
| `pnpm test:e2e:determinism` | **NOT RUN** — `testing.md` requires it, and this story changes both a spec and a fixture |
| recorded visual pass | **NOT DONE** |

### The `pnpm test:e2e:grid` failures were not this story's

`grid-editors.spec.ts`'s multiselect block was the sole failure in 118 tests. Diagnosed from the
source and repaired; the detail is in Implementation Notes above. Two of the three were wrong
assertions about a renderer that is correct, and the third was database state that is not in this
diff — so a fresh clone plus `pnpm seed:bulk-local` starts clean.

**Commands:**
- `pnpm test:static` -- expected: guardrails, `typecheck:workspace`, lint all pass.
- `pnpm test:e2e grid-scroll-surface` -- expected: the new spec green.
- `pnpm test:e2e:grid` -- expected: green. Touches a shared component, so this is a **feature-level** gate, not targeted.
- `pnpm test:e2e:manage` -- expected: green.
- `pnpm test:e2e` -- expected: full run, because `grid.tsx`, `grid-row-lifecycle.tsx` and the manage shell are all in the shared-components table in `docs/architecture/testing.md`.
- `pnpm test:e2e:determinism` -- expected: two back-to-back runs, since specs and fixtures both change.
- `grep -rn "dark:" components/grid/` and the raw-hex / `rgb(` / `rgba(` / `white` / `black` grep under `components/grid/` -- expected: 0 and 0.
- `md5sum apps/folk/app/manage/page.tsx apps/gita-life/app/manage/page.tsx` -- **withdrawn**; see Spec Change Log.

**Manual checks (not yet done):**
- Record a visual pass at 1440×900 and 1024×768, light only (`ThemeProvider` stays unmounted): the header reads as a distinct surface, the horizontal scrollbar is visible without scrolling the page, the header stays pinned while the body scrolls, and the frozen leading run holds its offsets.