/**
 * The cell-metrics contract and the active cell — story 4 of
 * `spec-contacts-premium-grid`.
 *
 * | Test      | Scenario                     | Claim under test |
 * | --------- | ---------------------------- | ---------------- |
 * | metrics 1 | the default density         | the row is exactly 32px, the cell text computes to 13px, and the trigger reads "Default rows" — all three from one run, so the control cannot read one thing over a grid drawing another |
 * | metrics 2 | a single click               | exactly one cell carries `data-grid-cell-active`, no editor opens, and the clicked cell's box is byte-identical to before |
 * | metrics 3 | `ArrowRight`                 | the active attribute moves to the neighbour and leaves the cell it came from |
 * | metrics 4 | an editor open on it         | the row still measures 32px and the range marks survive, so opening an editor is not a layout event |
 * | metrics 5 | an active cell on a selected row | `tr[data-state=selected]` and the active attribute coexist on one row, and neither implies the other |
 * | metrics 6 | a long value                 | the text overflows, `title` carries the full value, and the row height does not move |
 *
 * ## What is asserted, and what is deliberately not
 *
 * **Geometry and state transitions only.** `design-constraints.md` bans shadows
 * and stripes, which is exactly the CSS an appearance assertion would hardcode,
 * and a hardcoded token fails the first time someone tunes an accent for dark
 * mode. So nothing here reads a colour, a radius or a shadow — not even to say
 * that two states "differ". The four states' *appearance* is graded by eye in
 * this story's recorded visual pass, which is the only check that does not turn
 * a token into a change-detector.
 *
 * **Mandated numbers are different.** 13px and 32px/28px are *rules* in
 * `design-constraints.md`, not preferences. A test that fails when someone tunes
 * an accent is a change-detector; one that fails when 32px becomes 34px is the
 * contract. That is the line these tests sit on.
 *
 * ## Why `data-grid-cell-active` and not the ring class
 *
 * `grid-cell-range.spec.ts` asserts `toHaveClass(/ring-1/)` to reach the focused
 * cell, which couples a behavioural spec to a Tailwind detail: renaming the ring
 * to a `box-shadow` breaks a test that was never about rings. This file asserts
 * the attribute instead — presence-only, like `data-grid-cell-selected`, so
 * "exactly one active cell" is a count rather than a scan for `="false"`.
 *
 * ## Why `role="dialog"` and not `data-grid-editor`
 *
 * `data-grid-editor` is on a cell's **closed** display too — every `select`,
 * `multiselect`, `date` and `user` cell renders one, which is 100+ matches on an
 * idle grid. It marks "this cell has an editor", not "an editor is open". A Radix
 * popover content is `role="dialog"`, and it is mounted only while open, which is
 * the claim this file actually wants.
 *
 * ## Which surface, and why
 *
 * `useState(GRID_DEFAULT_DENSITY)` exists in two places and so does the density
 * control, so metrics 1 and 5 run against `/manage` — the real consumer, and the
 * only surface with row selection at all. The rest run against
 * `/dev/grid-preview`: 500 deterministic rows, an in-memory commit, and nothing
 * written that a later run has to restore.
 *
 * No test here narrows with the global filter. The rows are virtualized, so a
 * scroll-dependent assertion is fragile — but the alternative, filtering on the
 * `preview-fixture-bulk-…` name prefix three older specs still use, matches
 * **nothing**: those names were replaced by real ones and the rows are tagged in
 * `source` instead. Every row these tests address is at the top of the initial
 * render, which needs no narrowing at all.
 */

import { expect, test, type Locator, type Page } from "@playwright/test"

import {
  activeCells,
  cellAt,
  focusCellAt,
  focusPreviewCellAt,
  gridRoot,
  openCellEditor,
  openContactsGrid,
  openPreviewGrid,
  renderedRows,
  rowById,
  selectedCells,
} from "../fixtures/manage-grid"

/**
 * The longest of the preview harness's five note fragments.
 *
 * Named rather than discovered by scanning for an overflowing cell: a scan would
 * keep passing on a short fixture, which is the one failure a truncation test
 * cannot have. The assertion that this cell holds it comes first, so a changed
 * fixture order fails loudly here instead of quietly weakening the test.
 */
const LONG_NOTE =
  "Flagged for a second pass before quarter close, pending sign-off from the regional desk."

/** The density `Select` in the toolbar — the control that names the row height. */
function densityTrigger(page: Page): Locator {
  return page.getByRole("combobox", { name: "Row density" })
}

/** Every rendered row's measured height, deduplicated and ascending. */
async function distinctRowHeights(page: Page): Promise<number[]> {
  const heights = await renderedRows(page).evaluateAll((rows) =>
    rows.map((row) => Math.round(row.getBoundingClientRect().height)),
  )

  return [...new Set(heights)].sort((a, b) => a - b)
}

/** The in-cell input the primitive mounts for a column with no typed editor. */
function cellEditor(page: Page): Locator {
  return page.getByRole("textbox", { name: "Edit cell value" })
}

/** An open popover editor body — the layout risk an editor must not become. */
function openPopoverEditor(page: Page): Locator {
  return page.getByRole("dialog")
}

/** Pick a density through the control, the way an operator does. */
async function chooseDensity(page: Page, label: string): Promise<void> {
  await densityTrigger(page).click()
  await page.getByRole("option", { name: label, exact: true }).click()
  await expect(densityTrigger(page)).toHaveText(label)
}

test.describe("cell metrics and the active cell", () => {
  test("metrics 1 — the default is 32px, the text is 13px, and the trigger agrees with both", async ({
    page,
  }) => {
    await openContactsGrid(page)

    // At rest. A grid that starts with an active cell would make every later
    // "exactly one" assertion in this file a weaker statement than it looks.
    await expect(activeCells(page), "a grid at rest has no active cell").toHaveCount(0)

    // The label is the record's, not a string in the toolbar, and the default is
    // 32px — **not** dense. This is the assertion that fails if someone "fixes"
    // the density by flipping OQ-4 back.
    await expect(densityTrigger(page)).toHaveText("Default rows")

    // `toHaveText` passes on clipped text — it reads the accessible name, not the
    // box — so a trigger too narrow for its own label still reads "Default rows"
    // here and renders as "Default ro⌄". A density readout nobody can read cannot
    // be checked by eye against the row height, which is the one thing it is for.
    await expect
      .poll(
        () =>
          densityTrigger(page).evaluate((element) => {
            const value = element.querySelector("span")
            if (!value) return -1
            return value.scrollWidth - value.clientWidth
          }),
        { message: "the density label must not be clipped by its own trigger" },
      )
      .toBeLessThanOrEqual(0)
    await expect
      .poll(() => distinctRowHeights(page), {
        message: "the default density must render one height, and it must be 32px",
      })
      .toEqual([32])

    // `design-constraints.md`: "Grid base font 13px". Computed, not a class — the
    // class is the implementation, the computed size is the contract.
    expect(
      await cellAt(page, 0, "name").evaluate((element) => getComputedStyle(element).fontSize),
      "design-constraints.md mandates a 13px grid base font",
    ).toBe("13px")

    // The horizontal padding is asserted because it *is* portable from
    // `Visual-Design/contacts-grid-states-v1.html:62-67`; the vertical padding and
    // the 24px line box deliberately are **not**, and this is the guard against
    // someone adding them back.
    //
    // The comp rule is `padding: 4px 8px` + `line-height: 24px` + `height: 32px`,
    // and 4 + 24 + 4 = 32 — but it describes a different table structure. Applied
    // to the shipped cell, on top of `[&>td]:border-b`, it measures **35px**:
    // in a CSS table `height` is a minimum and cannot clamp a cell whose padding
    // and border already exceed it (UX-DR19). So the cell keeps `px-2` and
    // `align-middle` and inherits its line box, and that is what holds 32px.
    //
    // Asserted as an equality against 0px rather than a `not.toBe` so that
    // reintroducing the comp's padding fails here by name.
    const cellBox = await cellAt(page, 0, "name").evaluate((element) => {
      const style = getComputedStyle(element)

      return {
        paddingTop: style.paddingTop,
        paddingLeft: style.paddingLeft,
        verticalAlign: style.verticalAlign,
      }
    })

    expect(cellBox.paddingLeft, "UX-DR4: 8px horizontal padding").toBe("8px")
    expect(cellBox.verticalAlign, "UX-DR3: content vertically centred").toBe("middle")
    expect(
      cellBox.paddingTop,
      "the comp's 4px vertical padding is NOT portable here — with border-b it measures 35px, not 32",
    ).toBe("0px")

    // The control follows the record: choosing an option re-renders the rows at
    // *that option's* height. A trigger that named its options in one place and
    // the grid measured in another would pass every assertion above and still be
    // able to disagree the moment the two drifted.
    await chooseDensity(page, "Dense rows")
    await expect
      .poll(() => distinctRowHeights(page), {
        message: "the dense option must render the height the record carries",
      })
      .toEqual([28])

    await chooseDensity(page, "Default rows")
    await expect
      .poll(() => distinctRowHeights(page), {
        message: "returning to the default must return to 32px",
      })
      .toEqual([32])

    // And the geometry survived the round trip rather than drifting by a pixel
    // per switch.
    expect(await distinctRowHeights(page)).toEqual([32])
  })

  test("metrics 2 — one click marks exactly one active cell, opens nothing, and moves nothing", async ({
    page,
  }) => {
    await openPreviewGrid(page)
    await expect(activeCells(page), "the preview grid starts with no active cell").toHaveCount(0)

    const cell = cellAt(page, 0, "owner")
    const boxBefore = await cell.boundingBox()

    // A hover is not a state: it is CSS on the row and adds nothing to the DOM,
    // so the addressable signals stay independent of it.
    await cellAt(page, 3, "region").hover()
    await expect(
      activeCells(page),
      "hovering must not mark a cell active — it is not React state",
    ).toHaveCount(0)

    await cell.click()

    await expect(activeCells(page), "exactly one cell is active").toHaveCount(1)
    await expect(cell).toHaveAttribute("data-grid-cell-active", "true")

    // The cell's own indicator must not cost it a layout box. `ring-inset` is
    // what makes that true, and the assertion is the byte-identical box rather
    // than the class — a ring that grew the cell would still be `ring-1`.
    expect(await cell.boundingBox(), "the active ring must not occupy a layout box").toEqual(boxBefore)

    // A click is not an edit: CAP-10 retired every single-click opener, and a
    // click that opened an editor would also have moved the row's height.
    await expect(cellEditor(page), "a click must not open an in-cell editor").toHaveCount(0)
    await expect(openPopoverEditor(page), "a click must not open a popover editor").toHaveCount(0)

    // Nor is it a range: the range has its own attribute, and an active cell
    // sitting inside one is a different fact from being one.
    await expect(selectedCells(page), "a plain click is not a range").toHaveCount(0)

    // The harder half: a column whose *closed display* advertises a popover. A
    // second click moves the active cell — one cell, still exactly one — and
    // still opens nothing.
    const popoverCell = cellAt(page, 0, "assignee")

    await popoverCell.click()

    await expect(popoverCell, "the second click became the active cell").toHaveAttribute(
      "data-grid-cell-active",
      "true",
    )
    await expect(cell, "and released the cell before it").not.toHaveAttribute("data-grid-cell-active", "true")
    await expect(activeCells(page)).toHaveCount(1)
    await expect(
      openPopoverEditor(page),
      "a single click must not open the popover its own display advertises",
    ).toHaveCount(0)
  })

  test("metrics 3 — an arrow moves the active attribute and releases the cell it left", async ({ page }) => {
    await openPreviewGrid(page)
    await focusPreviewCellAt(page, 0, "owner")

    await expect(cellAt(page, 0, "owner")).toHaveAttribute("data-grid-cell-active", "true")
    await expect(activeCells(page)).toHaveCount(1)

    await page.keyboard.press("ArrowRight")

    // Moved…
    await expect(cellAt(page, 0, "region"), "ArrowRight moves the active cell one column").toHaveAttribute(
      "data-grid-cell-active",
      "true",
    )
    // …and released. Without this, "the attribute is on the neighbour" would also
    // be satisfied by an attribute that was never removed from anywhere.
    await expect(cellAt(page, 0, "owner"), "the cell it left is no longer active").not.toHaveAttribute(
      "data-grid-cell-active",
      "true",
    )
    await expect(activeCells(page), "still exactly one active cell after the move").toHaveCount(1)

    // And an arrow is still not an edit, or a range.
    await expect(cellEditor(page), "arrowing must not open an editor").toHaveCount(0)
    await expect(selectedCells(page), "a plain arrow re-anchors rather than extending").toHaveCount(0)
  })

  test("metrics 4 — an open editor leaves the row at 32px and the range marks standing", async ({ page }) => {
    await openContactsGrid(page)

    // `/manage`'s `notes` opens a **popover**, in a portal — the strongest case for
    // "an editor is not a layout event", because a body in the document flow would
    // push the row by construction. The preview harness's `notes` declares no
    // `editor` and opens the inline input instead.
    //
    // ## Why every gesture here carries `Shift`
    //
    // `extent` tracks the focus by construction (`use-grid-keyboard.ts`: "where the
    // range ends" and "which cell is focused" are the same question), and a plain
    // pointer-down re-anchors. A **plain** double-click therefore sets anchor and
    // focus to the same cell and drops the range — CAP-4's documented behaviour,
    // and the reason a plain click reads as no range at all.
    //
    // So: anchor on the total-attendance column, walk the range right to `notes`
    // with `Shift`, then open the editor with `Shift`+double-click. The anchor
    // stays where it is, the focus lands on `notes`, and the two differ — which is
    // the only way an open editor and a live range exist at the same time.
    await focusCellAt(page, 0, "totalAttendanceCount")
    await page.keyboard.press("Shift+ArrowRight")
    await page.keyboard.press("Shift+ArrowRight")
    await page.keyboard.press("Shift+ArrowRight")
    await expect(selectedCells(page), "the range is standing before the edit").toHaveCount(4)

    const heightBefore = await distinctRowHeights(page)
    expect(heightBefore, "the default density renders 32px rows").toEqual([32])

    await openCellEditor(cellAt(page, 0, "notes"), ["Shift"])

    const popover = page.locator('[data-grid-editor="longtext"]')
    await expect(popover, "the long-text editor is open").toBeVisible()
    expect(
      await popover.evaluate((element) => element.closest("tr") !== null),
      "the popover body must not be inside a row",
    ).toBe(false)

    // The row is still 32px: opening an editor is not a layout event.
    expect(await distinctRowHeights(page), "an open editor must not resize the row").toEqual(heightBefore)

    // The range is untouched, and the edited cell is inside it — active and
    // range-marked at once, which is the state that proves the two attributes are
    // independent signals rather than two names for one thing.
    await expect(selectedCells(page), "the range survives an open editor").toHaveCount(4)
    await expect(cellAt(page, 0, "notes"), "the edited cell is the active one").toHaveAttribute(
      "data-grid-cell-active",
      "true",
    )
    await expect(cellAt(page, 0, "notes"), "and it is still inside the range").toHaveAttribute(
      "data-grid-cell-selected",
      "true",
    )
    await expect(activeCells(page)).toHaveCount(1)

    // Escape, not a commit: this test is about geometry, so it must not write. An
    // untouched draft is a no-op on the commit path, and Escape discards.
    await page.keyboard.press("Escape")
    await expect(popover, "Escape closes the editor").toHaveCount(0)
    expect(await distinctRowHeights(page), "and the row is still 32px afterwards").toEqual([32])
  })

  test("metrics 5 — an active cell and a selected row coexist, and neither implies the other", async ({
    page,
  }) => {
    await openContactsGrid(page)

    // Row selection first, so the coexistence is tested in the harder order: the
    // row is already marked when the cell becomes active.
    await renderedRows(page).nth(1).getByRole("checkbox").click()
    await expect(renderedRows(page).nth(1), "the row is selected by its own control").toHaveAttribute(
      "data-state",
      "selected",
    )

    const rowId = (await renderedRows(page).nth(1).getAttribute("data-grid-row")) ?? ""
    expect(rowId, "the selected row must carry its stable id").not.toBe("")

    await focusCellAt(page, 1, "name")

    await expect(activeCells(page), "one active cell on a selected row").toHaveCount(1)
    await expect(
      gridRoot(page).locator("tr[data-state=selected]"),
      "row selection is unaffected by the cell click",
    ).toHaveCount(1)

    // The two marks are on the same row, read through the row itself rather than
    // through the classes that draw them.
    const activeRow = await activeCells(page).evaluate((cell) => cell.closest("tr")?.getAttribute("data-grid-row"))
    expect(activeRow, "the active cell sits inside the selected row").toBe(rowId)
    await expect(rowById(page, rowId), "and that row still reads selected").toHaveAttribute("data-state", "selected")

    // Independence, both directions: a cell click started no row selection and no
    // range, and the selected row marks exactly one cell active — the clicked
    // one — rather than every cell in the row.
    await expect(selectedCells(page), "a cell click is not a cell range").toHaveCount(0)
    await expect(
      gridRoot(page).locator("tr[data-state=selected] td[data-grid-cell-active]"),
      "only the clicked cell is active inside the selected row",
    ).toHaveCount(1)
    await expect(
      gridRoot(page).locator("tr:not([data-state=selected]) td[data-grid-cell-active]"),
      "an active cell is not a row selection either",
    ).toHaveCount(0)
  })

  test("metrics 6 — a long value truncates, the title carries it, and the row does not move", async ({
    page,
  }) => {
    await openPreviewGrid(page)

    // The fifth note fragment, on the fourth rendered row: the harness numbers its
    // rows from 1 and cycles five fragments, so `row-4` is the only row on screen
    // carrying the long one. Asserted before it is measured, so a changed fixture
    // fails here rather than quietly testing a string that fits.
    const cell = cellAt(page, 3, "notes")
    await expect(cell, "this cell must hold the long fixture note for the rest to mean anything").toHaveText(
      LONG_NOTE,
    )

    const heightBefore = await distinctRowHeights(page)

    const measured = await cell.evaluate((element) => ({
      title: element.getAttribute("title"),
      // The behavioural claim, not the CSS that produces it: content wider than
      // the box it is clipped to. A `truncate` class that stopped truncating
      // would still be on the element.
      overflows: element.scrollWidth > element.clientWidth,
      clientWidth: element.clientWidth,
    }))

    expect(measured.overflows, "a 91-character note cannot fit a 260px cell, so it must overflow").toBe(true)
    expect(measured.clientWidth).toBeGreaterThan(0)
    expect(measured.title, "the full value stays inspectable behind the truncated cell").toBe(LONG_NOTE)

    // Fixed row heights are load-bearing — the virtualizer estimates from them —
    // so this is the assertion a wrapping note would break.
    expect(await distinctRowHeights(page), "truncation must not change the row height").toEqual(heightBefore)
    expect(heightBefore).toEqual([32])
  })
})