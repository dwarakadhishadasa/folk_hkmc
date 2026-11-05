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
 * * | surface 1  | contacts at rest         | exactly two elements in the document both overflow and have a scrolling `overflow` — the grid's scroller and its status strip, which mirrors it — and the page itself does not scroll |
 * * | surface 2  | the grid fills its frame | the container reaches the bottom of its own frame with a positive height, and the container plus every band around it accounts for the whole frame — so the height is distributed, not capped |
 * * | surface 3  | scrolled to its bottom   | the header `<th>` is still flush with the container's top edge — removing the cap did not cost the sticky header |
 * * | surface 4  | scrolled fully right     | the right-most header's right edge is inside the container's right edge |
 * * | surface 5  | metrics and surfaces     | the row is still exactly 32px, and the header's computed background differs from a body cell's |
 * * | surface 6  | 1024×768                 | the tab row is not squeezed, the grid still fills, no third scroller appears, and the page still does not scroll |
 * * | surface 7  | a longtext editor open   | the container's height is unchanged and the popover escapes the frame's `overflow-hidden` |
 * * | surface 8  | the grid hydrating        | no hydration mismatch on `/manage` — dnd-kit's id counter is stable across server and client, and the suite actually watches this page's console (see the test for why `theme-switch` cannot) |
 * | surface 9  | a field hidden           | the freed width is shared by every remaining column by the same ratio, and the columns still reach the frame's right edge |
 * | surface 10 | a field hidden, two widths | the pinned run's offsets stay exact adjacencies whether the table is stretched to the frame or wider than it |
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
 * No test narrows with the global filter. The rows are virtualized, so a
 * scroll-dependent assertion is fragile — but nothing here needs a named row,
 * so it needs no narrowing at all.
 */

import { expect, test, type Locator, type Page } from "@playwright/test"

import {
  cellAt,
  cellIn,
  gridRoot,
  gridScrollSurface,
  headerCell,
  openCellEditor,
  openColumnMenu,
  openContactsGrid,
  renderedRows,
  scrollingElements,
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
 * Every visible header cell's id and laid-out width, keyed by column id.
 *
 * `getBoundingClientRect().width` rather than the inline style: what is being
 * tested is what the browser *resolved*, and under the frame's stretch the
 * inline style is a share of a width the spec would have to measure to evaluate.
 */
async function headerWidths(page: Page): Promise<Record<string, number>> {
  return page.locator("[data-grid-column]").evaluateAll((cells) =>
    Object.fromEntries(
      cells.map((cell) => [cell.getAttribute("data-grid-column") ?? "", cell.getBoundingClientRect().width]),
    ),
  )
}

/**
 * Every visible header cell's left and right edge, in display order.
 *
 * Both edges rather than a width, because the claims below are about *contact*
 * between cells — a pinned column whose `left` is off by a share shows as a gap
 * or an overlap at the join, and neither is visible in the widths alone.
 */
async function headerEdges(page: Page): Promise<{ id: string; left: number; right: number }[]> {
  return page.locator("[data-grid-column]").evaluateAll((cells) =>
    cells.map((cell) => ({
      id: cell.getAttribute("data-grid-column") ?? "",
      left: cell.getBoundingClientRect().left,
      right: cell.getBoundingClientRect().right,
    })),
  )
}

/**
 * Tolerance on "every column took the same *share*", as the spread between the
 * largest and the smallest per-column growth ratio.
 *
 * Layout resolves in 1/64px units, so a ratio between two measured widths
 * carries a relative error of roughly `0.02 / width` — a few thousandths on the
 * narrowest column this grid draws. Half a percent sits two orders of magnitude
 * above that floor, and it is still roughly a hundred times tighter than the
 * smallest spread any *other* distribution rule produces on this column set (see
 * surface 9), so the assertion cannot pass on a grid that shares the width some
 * different way.
 */
const SHARE_SPREAD_TOLERANCE = 0.005

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
  test("surface 1 — contacts at rest leaves the grid's scroller and its synced status strip, and nothing else scrolls", async ({
    page,
  }) => {
    await openContactsGrid(page)
    await waitForRenderedRows(page)

    // The whole claim, described rather than counted: a bare count would report
    // "expected 2, got 4" without saying which four, which is a debugging session
    // rather than an assertion.
    const scrolling = await scrollingElements(page)

    // **Two scrollers, not one — deliberately.** The status strip below the grid
    // is a scroller by construction: it must be one to stay aligned with the
    // grid's columns under its own fields through every horizontal offset, and
    // to accept the scroll gesture itself. It carries no visible scrollbar and
    // mirrors the grid 1:1, so it is not a second scrollbar competing with the
    // first — it is the same scroll position rendered twice. What this claim
    // protects is unchanged: nothing *else* scrolls, and the page itself does
    // not scroll.
    expect(
      scrolling.length,
      `the contacts page must offer exactly the grid's scroller and its status strip, found:\n${JSON.stringify(scrolling, null, 2)}`,
    ).toBe(2)

    expect(
      scrolling.map((element) => element.testId).sort(),
      "the two scroll containers on the page must be the grid's own and its status strip, not a wrapper the page happened to leave behind",
    ).toEqual(["data-grid-footer-scroll", "data-grid-scroll"])

    // The two never disagree, even at rest: a strip that starts offset is a
    // strip whose totals start under the wrong fields. The behavioural half —
    // scrolling either one moves the other — is covered in
    // `manage-contacts-selection.spec.ts`'s status-row scroll test, which owns
    // the strip's contract; this surface owns the frame's.
    const positions = await page
      .locator("[data-grid-scroll], [data-grid-footer-scroll]")
      .evaluateAll((elements) => elements.map((element) => element.scrollLeft))
    expect(positions, "the strip must start exactly where the grid starts").toEqual([0, 0])

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
    // container's height plus every band above it plus the status strip below
    // it is the grid root's whole content box: there is nothing left over, so
    // the height was distributed to it rather than stopped at a ceiling. A
    // `max-h-[70vh]` cap in a frame taller than 70vh leaves a visible gap below
    // the container, and this equality is what fails.
    //
    // **Every sibling, not just the toolbar.** At rest that used to be the same
    // single sibling it always was; the status strip below the container is a
    // second one, and with rows selected the contextual selection band was once
    // a third. The claim being protected is "no leftover gap", which is a
    // property of the whole stack around the container — so naming one sibling
    // would have made the assertion silently weaker the moment a second band
    // appeared, which is precisely when it needs to hold.
    const consumed = await container.evaluate((element) => {
      let total = element.offsetHeight
      let sibling: Element | null = element.previousElementSibling

      while (sibling) {
        total += (sibling as HTMLElement).offsetHeight
        sibling = sibling.previousElementSibling
      }

      sibling = element.nextElementSibling

      while (sibling) {
        total += (sibling as HTMLElement).offsetHeight
        sibling = sibling.nextElementSibling
      }

      return total
    })

    // Three segments now, not two — the container, the toolbar above it and
    // the status strip below it — so their separately-rounded `offsetHeight`
    // values can disagree with the frame by a pixel where two never did. That
    // residue is subpixel stacking, not a cap: a cap leaves a visible gap, tens
    // of pixels, and `FLUSH_PX` is the same slack every other comparison in
    // this file allows the compositor.
    expect(
      Math.abs(consumed - (await root.evaluate((element) => element.clientHeight))),
      "the scroll container plus every band around it must account for the grid frame exactly; a leftover gap is a cap, not a layout",
    ).toBeLessThanOrEqual(FLUSH_PX)
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

  test("surface 5 — the row is still 32px and the header shares the body surface with a divider", async ({
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

    // **A comparison, never a literal.** The reference header uses the same
    // surface as the body; the 1px divider under it is what separates the sticky
    // row while the body scrolls. Asserting equality keeps the two on one token
    // and a hardcoded `oklch(...)` out of the test.
    const header = page.locator("[data-grid-column]").first()
    const body = cellIn(renderedRows(page).nth(2), "name")

    expect(
      await backgroundOf(header),
      "the header shares the reference grid's surface",
    ).toBe(await backgroundOf(body))

    expect(
      await header.evaluate((element) => getComputedStyle(element).borderBottomWidth),
      "the header divider is what separates the sticky row from the body",
    ).toBe("1px")
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

    // The section's tab row is `shrink-0` by effect: a row squeezed under an
    // operator's hands changes height between renders, which moves everything
    // below it. The section nav is a link strip rather than a Radix tablist, so
    // it is addressed by its accessible name.
    const tabRow = page.getByRole("navigation", { name: "Contacts sections" })

    expect(
      await overflowsItsBox(tabRow),
      "the tab row must not be compressed to fit at this width",
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

    // Two scrollers by design — see surface 1: the grid's and its status
    // strip, which mirrors it 1:1. Narrowing the viewport must not create a
    // third.
    expect(
      scrolling.length,
      `narrowing the viewport must not create another scroll container, found:\n${JSON.stringify(scrolling, null, 2)}`,
    ).toBe(2)

    expect(scrolling.map((element) => element.testId).sort()).toEqual([
      "data-grid-footer-scroll",
      "data-grid-scroll",
    ])
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
  test("surface 8 — loading the contacts grid produces no hydration mismatch", async ({ page }) => {
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

  /**
   * The frame's slack goes to every column, by share.
   *
   * Hiding a field shrinks `getTotalSize()`, and the table is `width: 100%`
   * *with* `min-width: getTotalSize()` — so the columns now fall short of the
   * frame and there is slack to place. It used to be placed by leaving the last
   * visible column `width: auto`, which is the one arrangement CSS 2.1 gives
   * **all** of it to: leftover space goes to `auto` columns and is divided only
   * among `auto` columns, so with one such column it takes the whole increase.
   * Hiding any field therefore inflated the Actions gutter and left every real
   * field exactly where it was.
   */
  test("surface 9 — a hidden field's width is shared by every remaining column, not absorbed by the last one", async ({
    page,
  }) => {
    // **Wide enough that there is slack to share at all.** At the 1280 default
    // the contacts grid's columns overflow the frame, every width is already
    // exact, and hiding a field changes nothing — surface 4 owns that regime.
    // This claim is about the other one, so the viewport is set here rather than
    // inherited from whatever the config happens to leave at.
    await page.setViewportSize({ width: 1920, height: 1080 })
    await openContactsGrid(page)
    await waitForRenderedRows(page)

    const container = gridScrollSurface(page)

    // **Non-vacuity, asserted rather than assumed.** With no slack the table is
    // exactly as wide as its columns and every ratio below is 1 — which is also
    // what a grid that distributes nothing at all looks like. So "there is slack
    // to distribute" is a precondition of the test, not one of its findings.
    expect(
      await container.evaluate((element) => element.scrollWidth <= element.clientWidth),
      "the contacts grid must fit its frame at this width, or a hide frees nothing and every ratio below is 1",
    ).toBe(true)

    const before = await headerWidths(page)

    await openColumnMenu(page, "notes", "Notes")
    await page.getByRole("menuitem", { name: "Hide column" }).click()
    await expect(headerCell(page, "notes"), "the field must actually leave the grid").toHaveCount(0)

    const after = await headerWidths(page)
    const survivors = Object.keys(after).filter((id) => id in before)

    expect(
      survivors.length,
      `hiding one field must leave every other column in place; ${survivors.length} of ${Object.keys(before).length} survived`,
    ).toBe(Object.keys(before).length - 1)

    // **Equal ratios, which is not the same claim as equal pixels.** Every column
    // carries a share of the table's width, so a smaller total scales the whole
    // set by `totalBefore / totalAfter` and every survivor moves by that one
    // ratio. Equal *gains* would be a different rule — it would make the 40px
    // checkbox gutter grow as fast as a 240px notes field — and so would
    // "whichever column is left over takes the lot".
    const factors = survivors.map((id) => after[id] / before[id])
    const lowest = Math.min(...factors)
    const highest = Math.max(...factors)

    expect(
      lowest,
      `every column takes a share of the freed width, so every column must grow; got ${JSON.stringify(factors)} for ${survivors.join(", ")}`,
    ).toBeGreaterThan(1)

    expect(
      highest - lowest,
      `the freed width must be spread by share, not handed to one column; the Actions gutter is the last visible column and must not be the one that takes it. Got ${JSON.stringify(factors)} for ${survivors.join(", ")}`,
    ).toBeLessThanOrEqual(SHARE_SPREAD_TOLERANCE)

    // **And the slack is spent rather than left behind.** A grid that shared the
    // width but stopped short would satisfy the ratios above and still look
    // broken, so the trailing edge is checked too: the last column reaches the
    // container's right edge.
    const containerBox = await boxOf(container, "the grid's scroll container")

    expect(
      Math.abs((await rightMostHeaderEdge(page)) - containerBox.right),
      "the columns must reach the container's right edge — the frame's slack is distributed, not left as a trailing gap",
    ).toBeLessThanOrEqual(FLUSH_PX)
  })

  /**
   * The pinned run's `left` offsets are shares too, so they are the other half of
   * surface 9's change: the offsets cannot be pixel counts any more, and a wrong
   * one shows as a gap or an overlap at the join between two pinned columns
   * rather than anywhere visible in the widths.
   */
  test("surface 10 — the pinned run stays exactly adjacent in both width regimes", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await openContactsGrid(page)
    await waitForRenderedRows(page)

    const container = gridScrollSurface(page)

    // **No gaps between any two columns, pinned or not.** The header's cells are
    // laid out as one run, so consecutive edges must meet — and they are read at
    // rest, where nothing is scrolled and the edges are each cell's natural
    // position. Two adjacent pairs make the pinned offsets visible by name.
    const atRest = await headerEdges(page)
    const gapsAtRest = atRest.slice(0, -1).map((cell, index) => cell.right - atRest[index + 1].left)

    for (const [index, gap] of gapsAtRest.entries()) {
      expect(
        Math.abs(gap),
        `"${atRest[index].id}" and "${atRest[index + 1].id}" must meet exactly; a gap or an overlap here is a pinned offset in the wrong unit`,
      ).toBeLessThanOrEqual(FLUSH_PX)
    }

    // **Hide, because that is what produced the slack the offsets have to share.**
    await openColumnMenu(page, "notes", "Notes")
    await page.getByRole("menuitem", { name: "Hide column" }).click()
    await expect(headerCell(page, "notes")).toHaveCount(0)

    const afterHide = await headerEdges(page)
    const gapsAfterHide = afterHide.slice(0, -1).map((cell, index) => cell.right - afterHide[index + 1].left)

    for (const [index, gap] of gapsAfterHide.entries()) {
      expect(
        Math.abs(gap),
        `after a hide, "${afterHide[index].id}" and "${afterHide[index + 1].id}" must still meet; the pinned offsets are re-derived from the new total`,
      ).toBeLessThanOrEqual(FLUSH_PX)
    }

    // **The other regime: a table wider than its frame.** Above, the percentages
    // resolve against the frame; below, `min-width` takes the table past it and
    // they resolve against the summed sizes instead. Both resolve against the
    // table's used width, and the pinned offsets have to agree with whichever
    // that is — so the run is checked again with the grid scrolled fully right,
    // where the offsets are the only thing holding the columns in place.
    await page.setViewportSize({ width: 1024, height: 768 })

    expect(
      await container.evaluate((element) => element.scrollWidth > element.clientWidth),
      "the grid must overflow its frame at 1024 wide, or the scrolled regime below is untestable here",
    ).toBe(true)

    await scrollToEnd(page, "horizontal")

    const scrolled = await headerEdges(page)
    const pinned = scrolled.filter((cell) => cell.id === "select" || cell.id === "name")

    expect(
      pinned.length,
      `the contacts grid pins "select" and "name"; found ${JSON.stringify(scrolled.map((cell) => cell.id))}`,
    ).toBe(2)

    expect(
      Math.abs(pinned[0].right - pinned[1].left),
      "the pinned run must occupy consecutive slots once the grid is scrolled right — their offsets are the only thing holding them there, and a wrong one shows as a gap or an overlap at the join",
    ).toBeLessThanOrEqual(FLUSH_PX)

    const containerBox = await boxOf(container, "the grid's scroll container")
    const containerContentLeft = await container.evaluate(
      (element) => element.getBoundingClientRect().left + element.clientLeft,
    )

    expect(
      Math.abs(pinned[0].left - containerContentLeft),
      "the pinned run must stay flush with the container's left edge while the grid scrolls under it",
    ).toBeLessThanOrEqual(FLUSH_PX)

    expect(
      pinned[1].right,
      "and the run must stay inside the container, not have been pushed out of frame",
    ).toBeLessThanOrEqual(containerBox.right + FLUSH_PX)
  })
})