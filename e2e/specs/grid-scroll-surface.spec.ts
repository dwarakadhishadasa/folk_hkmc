/**
 * One scroll container, and a surface that does not clip — story 5 of
 * `spec-contacts-premium-grid` (CAP-2).
 *
 * The scroll container used to be capped at `max-h-[70vh]`. That cap was the
 * cause of both symptoms CAP-2 names: the frame was a fraction of the viewport
 * rather than the space the page had left, so the page scrolled *and* the grid
 * scrolled (the nested scrollbar), and the horizontal scrollbar — which lives at
 * the bottom of a 70vh box — sat above the fold while the last column's right
 * edge sat behind it (the clipped final column). CAP-2's other half was unmet
 * too: the header row was `bg-card`, the same surface as the body, so the sticky
 * header had nothing to read against while rows scrolled under it.
 *
 * | Test       | Scenario                 | Claim under test |
 * * | ---------- | ------------------------ | ---------------- |
 * * | surface 1  | contacts at rest         | exactly one element in the document both overflows and has a scrolling `overflow`, and it is `[data-grid-scroll]`; the page itself does not scroll |
 * * | surface 2  | the grid fills its frame | the container reaches the bottom of its own frame with a positive height, and the two together account for the whole frame — so the height is distributed, not capped |
 * * | surface 3  | scrolled to its bottom   | the header `<th>` is still flush with the container's top edge — removing the cap did not cost the sticky header |
 * * | surface 4  | scrolled fully right     | the right-most header's right edge is inside the container's right edge |
 * * | surface 5  | metrics and surfaces     | the row is still exactly 32px, and the header's computed background differs from a body cell's |
 * * | surface 6  | 1024×768                 | the tab row is not squeezed, the grid still fills, and the page still does not scroll |
 * * | surface 7  | a longtext editor open   | the container's height is unchanged and the popover escapes the frame's `overflow-hidden` |
 * * | surface 8  | the bulk report open     | the panel is bounded by the frame rather than by its content, stays inside the frame, and the grid shrinks instead of vanishing |
 * * | surface 9  | the grid hydrating        | no hydration mismatch on `/manage` — dnd-kit's id counter is stable across server and client, and the suite actually watches this page's console (see the test for why `theme-switch` cannot) |
 *
 * ## Why every assertion here is behavioural
 *
 * The story's subject is a *layout* change, and the two easy ways to test a
 * layout change are both wrong here:
 *
 * - **Asserting the class.** `expect(container).toHaveClass(/max-h-\[70vh\]/)` (or
 *   its absence) freezes the CSS rather than the behaviour, so renaming `flex-1`
 *   to `grow` fails a test that was never about flex shorthand. Everything below
 *   measures boxes and overflow instead.
 * - **Asserting a number derived from the old cap.** `playwright.config.ts`
 *   configures no viewport anywhere in this repo, so Playwright's 1280×720
 *   default applied and the old container was 504px. A test written against 504
 *   — or against "the container is taller than 70vh of the viewport" — inherits
 *   the cap as its yardstick, and the yardstick disappears with the bug. Every
 *   threshold here is derived from the viewport or from the frame being measured,
 *   never from the number being removed.
 *
 * The one place a *source* assertion is right is the reversed decision itself.
 * `harness-guards.spec.ts` bans the `vh` unit outright under `components/grid/`,
 * because the unit is the thing that must never come back and no rendered
 * measurement distinguishes `max-h-[70vh]` from `min-h-0 flex-1` in a frame that
 * happens to be 70vh tall.
 *
 * ## Why `scrollingElements` counts overflow *and* a scrolling `overflow`
 *
 * The obvious version of "exactly one scroll container" — count the elements with
 * `overflow: auto` in their class — would pass on a page with four clipped
 * panels that fit their content, which is not a nested scrollbar. So the helper
 * in `manage-grid.ts` requires actual overflow on an axis whose computed
 * `overflow` is `auto`/`scroll`/`overlay`, and excludes `overflow: hidden`, which
 * clips without offering anything to scroll. That makes this a claim about what
 * the operator can scroll.
 *
 * `document.scrollingElement` is asserted separately rather than through that
 * helper: the root element propagates its overflow to the viewport, so whether it
 * *appears* in the list depends on how the browser resolves propagation, and a
 * test that depended on that would be a change-detector. `scrollHeight <=
 * innerHeight` is the honest form of "the page does not scroll".
 *
 * ## Which surface, and why `/manage` and not the preview harness
 *
 * All of it runs against `/manage?view=contacts`, because the whole chain this
 * story builds — the `h-dvh` shell, `main`, the portal, `Tabs`, the contacts
 * table — exists only there. The preview harness hosts the same `<Grid>` and is
 * bounded too, but bounding it does not prove that *one* scroll container is left
 * on a page whose other tabs, page header and tab row are all live.
 *
 * No test narrows with the global filter except the bulk one, which needs a
 * bounded, restorable row set. The rows are virtualized, so a scroll-dependent
 * assertion is fragile — but nothing here needs a named row, so it needs no
 * narrowing at all.
 */

import { expect, test, type Locator, type Page } from "@playwright/test"

import {
  bulkActionButton,
  bulkReportPanel,
  bulkReportRows,
  cellAt,
  cellIn,
  expectVisibleCount,
  filterGlobally,
  gridRoot,
  gridScrollSurface,
  headerSelectAll,
  openCellEditor,
  openContactsGrid,
  readFavoriteFlags,
  renderedRows,
  restoreFavoriteFlags,
  scrollingElements,
  selectionCount,
} from "../fixtures/manage-grid"

/**
 * Sub-pixel slack, in px, for every "flush with" and "inside" comparison.
 *
 * One pixel rather than zero: the container's content box starts at
 * `clientTop` (the border), a sticky `<th>` is positioned at `top: 0` of that
 * same box, and Chromium has been known to round a sticky offset by a fraction on
 * the way to a layout box. A zero-tolerance assertion on a sticky's position is
 * a test of the compositor's rounding, not of the grid.
 */
const FLUSH_PX = 1

/**
 * Ten generated rows, indices 0240–0249 — the same phone band
 * `manage-contacts-bulk.spec.ts` uses.
 *
 * `phone` rather than `name`, because the generator stopped writing an index
 * marker into `name` and tags rows in `source` instead. `phoneFor` is
 * `PHONE_PREFIX` plus the zero-padded index (`bulk-contact-fixtures.mjs:441`), so
 * this prefix is exactly ten rows at the default `--count 250`, and index 0000
 * has no phone so the low band cannot be addressed this way.
 */
const TEN_ROWS = "810000024"

/** A measured box, in viewport coordinates, with all four edges. */
interface Box {
  top: number
  right: number
  bottom: number
  left: number
  width: number
  height: number
}

/**
 * `boundingBox()`, normalised to all four edges.
 *
 * Playwright returns `{ x, y, width, height }`, so the edges are derived here
 * rather than read off the result: an assertion written against `containerBox.right`
 * against a `boundingBox()` that has no `right` compares `number` with `undefined`
 * and fails as a matcher error, which reads like a layout failure and is not one.
 */
async function boxOf(locator: Locator, what: string): Promise<Box> {
  const measured = await locator.boundingBox()

  if (!measured) {
    throw new Error(`${what} has no box; it is not laid out.`)
  }

  return {
    top: measured.y,
    left: measured.x,
    width: measured.width,
    height: measured.height,
    right: measured.x + measured.width,
    bottom: measured.y + measured.height,
  }
}

/**
 * An element's **parent** box, normalised to all four edges.
 *
 * For a panel that frames its own content — the bulk report's containing column —
 * where the panel is a *sibling* of the thing it is bounded against. Reaching for
 * the parent by index (`xpath=../..`) would encode the sibling order this test
 * is trying to measure.
 */
async function parentBoxOf(locator: Locator, what: string): Promise<Box> {
  const measured = await locator.evaluate((element) => {
    const parent = element.parentElement

    if (!parent) return null

    const rect = parent.getBoundingClientRect()

    return {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      right: rect.right,
      bottom: rect.bottom,
    }
  })

  if (!measured) {
    throw new Error(`${what} has no parent element to measure.`)
  }

  return measured
}

/**
 * The container's **content** top — its border box top plus its top border.
 *
 * `clientTop` rather than a read of `borderTopWidth`: `clientTop` is the border
 * width by definition, so a theme that thickens the border cannot make this
 * comparison wrong.
 */
async function contentTop(locator: Locator): Promise<number> {
  return locator.evaluate((element) => element.getBoundingClientRect().top + element.clientTop)
}

/** `clientHeight`, the container's scrollable content height. */
async function clientHeight(locator: Locator): Promise<number> {
  return locator.evaluate((element) => element.clientHeight)
}

/**
 * Wait until the virtualizer has rendered at least one window of rows.
 *
 * **This is the load-bearing wait in this file, and it is not defensive.**
 * `openContactsGrid` waits for `tbody[data-grid-panel="ready"]` and for a
 * non-zero row *count*, but the count comes from the toolbar's readout and the
 * panel key from `gridPanelKey` — neither is the row window. Measured, not
 * assumed: read immediately after `openContactsGrid`, the scroll container is
 * **32px** tall (the header row and nothing else), the grid root is 77px, and
 * the document is exactly `innerHeight` tall. Every geometry assertion in a file
 * about frame geometry passes against that transient layout — the container's
 * bottom is on screen, nothing else scrolls, nothing overflows — and proves
 * nothing. Once the window renders, the container is 354px of `flex-1` (or 504px
 * of `max-h-[70vh]`), the root is 399px, and the document is 870px.
 *
 * A second reason, specific to the reverted decision: with the cap in place the
 * container is 504px only once its content is tall enough to hit it, so the
 * pre-window 32px is the one measurement a `70vh` cap *cannot* distinguish from
 * a correct `flex-1`. Sampling too early would let the old behaviour pass.
 *
 * Everything addressed by row *index* — `cellAt`, the height check — needs this
 * too, and `grid-cell-metrics.spec.ts` already polls the same measurement for the
 * same reason.
 */
async function waitForRenderedRows(page: Page): Promise<void> {
  await expect
    .poll(async () => renderedRows(page).count(), {
      message: "the virtualizer never rendered a window of rows",
    })
    .toBeGreaterThan(0)
}

/**
 * Every distinct rendered row height, rounded, as a sorted set.
 *
 * Polled rather than read once, because a *partial* window is the same race: a
 * first render of two rows would answer `[32]` for the same reason a wrong grid
 * would, and only the settle distinguishes them.
 */
async function distinctRowHeights(page: Page): Promise<number[]> {
  await waitForRenderedRows(page)

  return renderedRows(page).evaluateAll((rows) => [
    ...new Set(rows.map((row) => Math.round(row.getBoundingClientRect().height))),
  ])
}

/**
 * Drive the container to one end of its scroll range and wait until it is there.
 *
 * `scrollHeight`/`scrollWidth` move as the virtualizer renders more rows, so a
 * single assignment can land short of the end. The poll is therefore on
 * `scrollTop + clientHeight >= scrollHeight`, which is the condition rather than
 * the coordinate — and it also catches the container that *cannot* reach the end
 * because it does not scroll at all, which is the failure mode that matters here:
 * a container sized to its content has `scrollHeight === clientHeight` forever
 * and `sticky top-0` has no scrollport to stick to.
 */
async function scrollToEnd(page: Page, axis: "vertical" | "horizontal"): Promise<void> {
  const container = gridScrollSurface(page)

  await container.evaluate((element, direction) => {
    if (direction === "vertical") {
      element.scrollTop = element.scrollHeight
      element.scrollLeft = 0
    } else {
      element.scrollLeft = element.scrollWidth
      element.scrollTop = 0
    }
  }, axis)

  await expect
    .poll(
      () =>
        container.evaluate((element, direction) => {
          const atEnd =
            direction === "vertical"
              ? element.scrollTop + element.clientHeight >= element.scrollHeight - 1
              : element.scrollLeft + element.clientWidth >= element.scrollWidth - 1

          return atEnd
        }, axis),
      { message: `the scroll container never reached the ${axis} end of its range` },
    )
    .toBe(true)
}

/**
 * The right-most edge among the rendered header cells.
 *
 * A `max` over every `[data-grid-column]` rather than the last one in DOM order:
 * the pinned run is rendered first in the DOM and is held in place by
 * `position: sticky; left: N`, so the last *rendered* header is not
 * necessarily the last one on screen, and the claim is about what an operator can
 * reach.
 */
async function rightMostHeaderEdge(page: Page): Promise<number> {
  const edges = await page
    .locator("[data-grid-column]")
    .evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().right))

  expect(edges.length, "the grid rendered no header cells at all").toBeGreaterThan(0)

  return Math.max(...edges)
}

/** The computed background colour of an element, as the browser resolved it. */
async function backgroundOf(locator: Locator): Promise<string> {
  return locator.evaluate((element) => getComputedStyle(element).backgroundColor)
}

/**
 * Whether an element's content is taller than the box it is given, past the slack.
 *
 * `FLUSH_PX` is **passed in** rather than closed over: a `page.evaluate` callback
 * is serialised and run in the page, where module scope does not exist, so a
 * captured constant resolves to a `ReferenceError` inside the browser and the
 * failure surfaces as an evaluate error rather than as an assertion.
 */
async function overflowsItsBox(locator: Locator, axis: "block" | "inline" = "block"): Promise<boolean> {
  return locator.evaluate(
    (element, [direction, slack]) => {
      const node = element as HTMLElement
      return direction === "block"
        ? node.scrollHeight > node.clientHeight + slack
        : node.scrollWidth > node.clientWidth + slack
    },
    [axis, FLUSH_PX] as const,
  )
}

/**
 * Whether the page itself scrolls.
 *
 * Asserted through `document.scrollingElement` rather than through the
 * `scrollingElements` helper: the root element's overflow propagates to the
 * viewport, so whether it *appears* in that list depends on how the browser
 * resolved propagation, and a test leaning on that would be a change-detector.
 * "Taller than the viewport" is the honest form of the claim.
 */
async function pageOverflows(page: Page): Promise<boolean> {
  return page.evaluate(
    ([slack]) => document.scrollingElement.scrollHeight - window.innerHeight > slack,
    [FLUSH_PX] as const,
  )
}

test.describe("the grid's scroll surface", () => {
  test("surface 1 — contacts at rest leaves exactly one scrolling element, and it is the grid's", async ({
    page,
  }) => {
    await openContactsGrid(page)
    await waitForRenderedRows(page)

    // The whole claim, described rather than counted: a bare count would report
    // "expected 1, got 4" without saying which four, which is a debugging session
    // rather than an assertion.
    const scrolling = await scrollingElements(page)

    expect(
      scrolling.length,
      `the contacts page must offer exactly one thing to scroll, found:\n${JSON.stringify(scrolling, null, 2)}`,
    ).toBe(1)

    expect(
      scrolling[0].testId,
      "the one scroll container on the page must be the grid's own, not a wrapper the page happened to leave behind",
    ).toBe("data-grid-scroll")

    // Asserted separately from the helper, because whether `documentElement`
    // *appears* in that list depends on how the browser propagates the root
    // element's overflow to the viewport. This is the version that cannot drift.
    expect(
      await pageOverflows(page),
      "the page itself must not scroll — a page scroller above the grid is the nested scrollbar this story removes",
    ).toBe(false)
  })

  test("surface 2 — the container fills the frame it is given rather than asserting a fraction of the viewport", async ({
    page,
  }) => {
    await openContactsGrid(page)
    await waitForRenderedRows(page)

    const container = gridScrollSurface(page)
    const root = gridRoot(page)

    const [containerBox, viewportHeight, height] = await Promise.all([
      boxOf(container, "the grid's scroll container"),
      page.evaluate(() => window.innerHeight),
      clientHeight(container),
    ])

    expect(
      containerBox.bottom,
      "the horizontal scrollbar lives at the container's bottom, so that bottom has to be on screen — this is the fix for the clipped final column",
    ).toBeLessThanOrEqual(viewportHeight + FLUSH_PX)

    expect(height, "a container with no height is not a scroll container at all").toBeGreaterThan(0)

    // **The part that distinguishes "fills the frame" from "is capped".** The
    // container's height plus every band above it is the grid root's whole
    // content box: there is nothing left over, so the height was distributed to
    // it rather than stopped at a ceiling. A `max-h-[70vh]` cap in a frame taller
    // than 70vh leaves a visible gap below the container, and this equality is
    // what fails.
    //
    // **Every sibling, not just the toolbar.** At rest that is the same single
    // sibling it always was; with rows selected the contextual selection band is
    // a second one. The claim being protected is "no leftover gap", which is a
    // property of the whole stack above the container — so naming one sibling
    // would have made the assertion silently weaker the moment a second band
    // appeared, which is precisely when it needs to hold.
    const consumed = await container.evaluate((element) => {
      let total = element.offsetHeight
      let sibling = element.previousElementSibling

      while (sibling) {
        total += (sibling as HTMLElement).offsetHeight
        sibling = sibling.previousElementSibling
      }

      return total
    })

    expect(
      consumed,
      "the scroll container plus every band above it must account for the grid frame exactly; a leftover gap is a cap, not a layout",
    ).toBe(await root.evaluate((element) => element.clientHeight))
  })

  test("surface 3 — the header stays flush with the container's top edge once it is scrolled to the bottom", async ({
    page,
  }) => {
    await openContactsGrid(page)
    await waitForRenderedRows(page)

    const container = gridScrollSurface(page)
    const header = page.locator("[data-grid-column]").first()

    // Proved *after* the scroll, so this is not a rest-state coincidence.
    await scrollToEnd(page, "vertical")

    // **Non-vacuity, and this is the row the whole story turns on.** A container
    // sized to its content reports `scrollHeight === clientHeight`, so
    // "scrolled to the bottom" is satisfied at offset 0 by never having moved —
    // and `sticky top-0`, with no scrollport to stick to, would pass the flush
    // check below while being completely broken. That is precisely what deleting
    // the cap without a bound above it produces (`grid.tsx`'s comment records
    // the reasoning), so the offset is asserted rather than assumed.
    expect(
      await container.evaluate((element) => element.scrollTop),
      "the container must actually scroll vertically, or the sticky-header assertion below is measuring a scroll that never happened",
    ).toBeGreaterThan(0)

    expect(
      Math.abs((await contentTop(header)) - (await contentTop(container))),
      "removing the viewport cap must not cost the sticky header: `sticky top-0` has to still have a scrollport",
    ).toBeLessThanOrEqual(FLUSH_PX)
  })

  test("surface 4 — the final column is inside the container's right edge when scrolled fully right", async ({
    page,
  }) => {
    await openContactsGrid(page)
    await waitForRenderedRows(page)

    const container = gridScrollSurface(page)

    // The grid is wider than its frame at the default viewport, so "scrolled fully
    // right" is a real state. Asserted rather than assumed: a table narrower than
    // its container makes the rest of this test vacuous.
    expect(
      await container.evaluate((element) => element.scrollWidth > element.clientWidth),
      "the contacts grid must overflow its container horizontally, or the clipped-final-column claim is untestable here",
    ).toBe(true)

    await scrollToEnd(page, "horizontal")

    const [containerBox, viewportHeight] = await Promise.all([
      boxOf(container, "the grid's scroll container"),
      page.evaluate(() => window.innerHeight),
    ])

    expect(
      await rightMostHeaderEdge(page),
      "the right-most header must be inside the container's right edge — this is the clipped final column",
    ).toBeLessThanOrEqual(containerBox.right + FLUSH_PX)

    // **Reachability, which the edge comparison above alone does not establish.**
    // Scrolled fully right *within its own box*, the final column is inside that
    // box at the old layout too — the box was simply parked 125px below the fold,
    // so the horizontal scrollbar that produces the box was off screen with it.
    // That is the whole complaint, and it is why the fix is the frame rather than
    // the column: the container's bottom edge is where its scrollbar lives, so the
    // scrollbar is on screen only when the container's bottom is.
    expect(
      containerBox.bottom,
      "the horizontal scrollbar sits at the container's bottom, so that bottom has to be within the viewport for the final column to be reachable at all",
    ).toBeLessThanOrEqual(viewportHeight + FLUSH_PX)
  })

  test("surface 5 — the row is still 32px and the header is a different surface from the body", async ({
    page,
  }) => {
    await openContactsGrid(page)

    // 32px is a *rule* in `design-constraints.md`, and `grid-row.tsx` enforces
    // it because the virtualizer estimates from it — so a frame change that moved
    // it would leave the scroll geometry permanently wrong, not merely ugly.
    // Rounded per row, then de-duplicated, so one odd row cannot pass as one
    // height and a second height cannot hide in the set.
    await expect
      .poll(() => distinctRowHeights(page), {
        message: "the frame change must not move the row metrics — one height, and it is 32px",
      })
      .toEqual([32])

    // **A comparison, never a literal.** "The header differs from the body" is a
    // relation between two elements' backgrounds; asserting `oklch(...)` would
    // freeze a token and fail the first time anyone tunes the accent for dark mode.
    // `design-constraints.md` bans shadows and stripes, which is exactly the CSS
    // a hardcoded appearance assertion would freeze.
    const header = page.locator("[data-grid-column]").first()

    // **Row 2, not row 0 — and this is not an arbitrary index.** `grid-row.tsx`
    // gives the *focused* row `[&>td]:bg-muted/40` and a hovered row
    // `[&:hover>td]:bg-muted/50`, and the grid focuses row 0 on mount. Measuring
    // row 0 therefore compared the header's plain surface against the focus
    // surface and passed with the header still on `bg-card`: measured at
    // baseline, row 0's cell computes to `oklab(… / 0.4)` against the header's
    // `lab(100 0 0)` — different for a reason that has nothing to do with the
    // header, so the assertion had no power at all. Row 2 carries the plain
    // per-cell `bg-card` that the change is supposed to contrast with.
    const body = cellIn(renderedRows(page).nth(2), "name")

    expect(
      await backgroundOf(header),
      "the header row must not be the same surface as the body it scrolls over",
    ).not.toBe(await backgroundOf(body))
  })

  test("surface 6 — at 1024×768 the tab row is not squeezed, the grid still fills, and the page still does not scroll", async ({
    page,
  }) => {
    // The narrow viewport is the case the viewport fraction could never survive:
    // the tab row wraps here, so the offset above the grid is *not* the same
    // offset it is at 1280 wide. A `calc(100dvh - X)` substitute would be wrong
    // by exactly the height of the wrapped row, and nothing else would notice.
    await page.setViewportSize({ width: 1024, height: 768 })
    await openContactsGrid(page)
    await waitForRenderedRows(page)

    // `shrink-0` on `TabsList`, asserted as its effect: a tab row squeezed
    // under an operator's hands changes height between renders, which moves
    // everything below it.
    const tabRow = page.getByRole("tablist")

    expect(
      await overflowsItsBox(tabRow),
      "the tab row is wrapped at this width; it must not also be compressed to fit",
    ).toBe(false)

    const container = gridScrollSurface(page)
    const [containerBox, viewportHeight, height] = await Promise.all([
      boxOf(container, "the grid's scroll container"),
      page.evaluate(() => window.innerHeight),
      clientHeight(container),
    ])

    expect(
      containerBox.bottom,
      "the grid must still reach the bottom of a shorter viewport — the chain carries the height, it does not assume one",
    ).toBeLessThanOrEqual(viewportHeight + FLUSH_PX)

    expect(height, "and it must still be scrollable at 1024×768").toBeGreaterThan(0)

    const scrolling = await scrollingElements(page)

    expect(
      scrolling.length,
      `narrowing the viewport must not create a second scroll container, found:\n${JSON.stringify(scrolling, null, 2)}`,
    ).toBe(1)

    expect(scrolling[0].testId).toBe("data-grid-scroll")
    expect(await pageOverflows(page), "and the page must still not scroll").toBe(false)
  })

  test("surface 7 — an open longtext popover leaves the container's height alone and escapes the frame's clip", async ({
    page,
  }) => {
    await openContactsGrid(page)
    await waitForRenderedRows(page)

    const container = gridScrollSurface(page)
    const notesCell = cellAt(page, 0, "notes")

    // Scroll the cell into view *before* reading the baseline: `notes` is the
    // eleventh column, so bringing it on screen moves the container's horizontal
    // offset, and a height read taken before that would be comparing two
    // different frames.
    await notesCell.scrollIntoViewIfNeeded()

    const heightBefore = await clientHeight(container)

    await openCellEditor(notesCell)

    // `notes` is `longtext`, so the editor is a Radix popover: a textarea cannot
    // fit a 32px row, which is the rule from §8 of `manage-grid-pattern.md` and
    // the reason this editor is a popover at all.
    const popover = page.getByRole("dialog")

    await expect(popover, "a longtext editor opens in a popover").toBeVisible()

    expect(
      await clientHeight(container),
      "opening an editor must not resize the frame — the grid's height is the frame's, and the popover is a portal",
    ).toBe(heightBefore)

    // The grid root is `overflow-hidden`. A popover rendered *inside* it would be
    // clipped by that box, so escaping the subtree is the structural half of
    // "not clipped by the frame"; being inside the viewport is the visual half.
    expect(
      await popover.evaluate((element) => element.closest("[data-grid-root]") !== null),
      "the popover must not be a descendant of the grid frame, whose overflow-hidden would clip it",
    ).toBe(false)

    const popoverBox = await boxOf(popover, "the open longtext popover")
    const viewport = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }))

    expect(
      popoverBox.left >= -FLUSH_PX && popoverBox.top >= -FLUSH_PX,
      `the popover must open inside the viewport, got ${JSON.stringify(popoverBox)}`,
    ).toBe(true)

    expect(
      popoverBox.right <= viewport.width + FLUSH_PX && popoverBox.bottom <= viewport.height + FLUSH_PX,
      `the popover must not run off the viewport, got ${JSON.stringify(popoverBox)} in ${JSON.stringify(viewport)}`,
    ).toBe(true)
  })

  test("surface 8 — the bulk report stays bounded and reachable, and the grid shrinks rather than vanishing", async ({
    page,
  }) => {
    await openContactsGrid(page)
    await filterGlobally(page, TEN_ROWS)
    await expectVisibleCount(page, 10)
    await waitForRenderedRows(page)

    const container = gridScrollSurface(page)
    const gridHeightBefore = await boxOf(gridRoot(page), "the grid frame before the report")

    await headerSelectAll(page).click()
    await expect(selectionCount(page)).toHaveText("10 selected")

    const before = await readFavoriteFlags(
      await renderedRows(page).evaluateAll((rows) =>
        rows.map((row) => row.getAttribute("data-grid-row") ?? "").filter(Boolean),
      ),
    )

    try {
      await bulkActionButton(page).click()

      const panel = bulkReportPanel(page)

      await expect(panel, "a per-row report for every selected row").toBeVisible()
      await expect(bulkReportRows(page), "successes included").toHaveCount(10)

      // **Bounded by the frame, not by its content.** The panel is `max-h-[40%]`
      // of the contacts column and its list scrolls inside it. The rows a bulk
      // run can produce are capped at 200 by `MANAGE_BULK_MAX_ITEMS`, and nothing
      // about the bound is specific to ten: a percentage `max-height` resolves
      // against a definite-height containing block, so it is the same fraction at
      // ten rows as at two hundred — which is exactly why the list has to scroll
      // internally instead of stretching the panel. If the panel were sized by its
      // content the list would fit and the grid would be gone.
      const list = panel.locator("ul")

      expect(
        await overflowsItsBox(list),
        "the report list must scroll inside the panel; if it fits, the panel is sized by its content and the grid has been pushed out",
      ).toBe(true)

      // **The frame is the panel's parent column, not the grid root.** Measured,
      // not assumed: the panel renders as a *sibling* of `<Grid>` inside
      // `manage-contacts-table.tsx`'s `flex min-h-0 flex-1 flex-col`, so
      // comparing its bottom against the grid root's bottom would ask the panel
      // to be inside a box it is deliberately not inside, and fail on a correct
      // layout by about 190px.
      const panelBox = await boxOf(panel, "the bulk report panel")
      const columnBox = await parentBoxOf(panel, "the contacts column that frames the panel")
      const viewportHeight = await page.evaluate(() => window.innerHeight)

      // Reachable: the panel is the last thing in the column, so "reachable" and
      // "inside the frame, which is itself inside the viewport" are one chain.
      expect(
        panelBox.bottom,
        "the panel must stay inside the column that frames it rather than being pushed out of the viewport",
      ).toBeLessThanOrEqual(columnBox.bottom + FLUSH_PX)

      expect(
        columnBox.bottom,
        "and that column is itself bounded by the viewport — the chain carries the height all the way down",
      ).toBeLessThanOrEqual(viewportHeight + FLUSH_PX)

      expect(
        panelBox.height,
        "the panel must be bounded by a fraction of the frame it shares with the grid",
      ).toBeLessThanOrEqual(columnBox.height * 0.4 + FLUSH_PX)

      // And the grid shrank rather than vanished. `> 0` is the whole claim: the
      // rows are still there and the operator can still scroll them.
      const gridHeightAfter = await clientHeight(container)

      expect(
        gridHeightAfter,
        "the grid must shrink to make room for the panel, not disappear",
      ).toBeGreaterThan(0)

      expect(
        gridHeightAfter,
        "and it must have actually given up space, or the panel is not bounding anything",
      ).toBeLessThan(gridHeightBefore.height)
    } finally {
      await restoreFavoriteFlags(before)
    }
  })

  /**
   * Not a layout claim — a *rendering* one, and the reason this file asserts the
   * console here rather than leaving it to `theme-switch.spec.ts`'s theme 12.
   *
   * That test exists and looks like it covers this. It does not: it loads `/`,
   * which mounts no grid, so it can only ever catch a mismatch raised by
   * `ThemeToggle` returning `null` before mount. Nothing in the suite watched
   * `/manage`, and `/manage` is where the grid renders.
   *
   * The mismatch was real. dnd-kit's `useUniqueId` falls back to a
   * **module-level counter** when its context has no `id`:
   *
   *     const id = ids[prefix] == null ? 0 : ids[prefix] + 1;
   *     ids[prefix] = id;
   *
   * Server and browser keep separate counters, so the drag handle's
   * `aria-describedby` was `DndDescribedBy-0` in the server HTML and
   * `DndDescribedBy-3` on the client. React recovered — it re-renders the
   * mismatched subtree — so nothing failed and nothing looked wrong; the cost is
   * a thrown-away render of every header on every load, plus a console error
   * that was never asserted on. `grid.tsx` now supplies a constant `DndContext`
   * id, which short-circuits the counter.
   *
   * So the assertion is on the console, not on a class or an attribute value:
   * the id itself is dnd-kit's business and asserting a literal would freeze it.
   * `React` prefixes hydration diagnostics with its own link, so the filter
   * matches the phrase rather than the URL.
   */
  test("surface 9 — loading the contacts grid produces no hydration mismatch", async ({ page }) => {
    const consoleOutput: string[] = []

    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        consoleOutput.push(`${message.type()}: ${message.text()}`)
      }
    })

    await openContactsGrid(page)
    // The mismatch is emitted during hydration, before the rows arrive, so the
    // grid has to be past the point where the server HTML is committed before
    // anything is read — otherwise this passes by looking away in time.
    await expect(gridScrollSurface(page), "the grid's frame must be hydrated").toBeVisible()
    await waitForRenderedRows(page)

    const hydration = consoleOutput.filter((text) =>
      /hydrat|did not match|server rendered html|server HTML/i.test(text),
    )

    expect(hydration, `console output:\n${consoleOutput.join("\n")}`).toEqual([])
  })
})