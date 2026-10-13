/**
 * Cell range selection — CAP-4, and the prerequisite CAP-3's copy/paste needs.
 *
 * | Test    | Scenario                          | Claim under test                                                          |
 * | ------- | --------------------------------- | ------------------------------------------------------------------------- |
 * | range 1 | `Shift`+Arrow extends a rectangle | the range grows a row at a time and widens a column at a time — it is a rectangle, not a walk |
 * | range 2 | `Shift`+click extends a rectangle | the pointer is a second way to move the same far corner                   |
 * | range 3 | `Escape` collapses to the anchor  | the range disappears and the focus is handed back to the anchor            |
 * | range 4 | the range survives a sort         | anchors are visible-row indices, so a re-order leaves a resolvable rectangle rather than a dangling one |
 *
 * ## Why every test narrows first
 *
 * The rows are virtualized. An unfiltered `/manage` renders roughly twenty-five
 * of 250 rows, so a `Shift`+ArrowDown from row 0 would walk straight out of the
 * rendered window and the assertion would be about the virtualizer rather than
 * about the selection. `preview-fixture-bulk-folk-000` matches exactly the ten
 * generated contacts indexed 0000–0009 — the index is zero-padded to four digits,
 * so `-000` cannot be confused with `-0010` — and ten rows all render.
 *
 * ## Row selection is not cell selection
 *
 * The grid has two independent things called selection, and reading the wrong
 * one would let these tests pass without any range code running at all:
 *
 * - **Row selection** is `data-state="selected"` on the `<tr>`, driven by the
 *   consumer's checkboxes and covered by `manage-contacts-selection.spec.ts`.
 * - **Cell selection** is `data-grid-cell-selected` on the `<td>`, owned by the
 *   primitive. Every assertion below reads the `<td>` attribute only, and range 4
 *   closes by asserting the row selection stayed empty throughout.
 *
 * ## Why the range's surface is compared rather than named
 *
 * The selected surface is `bg-accent/30`, which resolves through the theme
 * tokens to a different computed colour in light and dark. Rather than pin a
 * value the theme story will legitimately change, range 1 asserts that a
 * selected cell and an unselected one *differ* in computed background — which is
 * what "the range is distinguishable from the single focused cell" actually
 * claims, in both themes, without naming a colour.
 */

import { expect, test, type Page } from "@playwright/test"

import {
  cellAt,
  filterGlobally,
  focusCellAt,
  GRID_CELL_KEY_SEPARATOR,
  gridRoot,
  openContactsGrid,
  renderedRowIds,
  selectedCellKeys,
  selectedCells,
  toggleSort,
} from "../fixtures/manage-grid"

/** The ten generated contacts indexed 0000–0009. See the module comment. */
const TEN_ROWS = "preview-fixture-bulk-folk-000"

const NAME_COLUMN = "name"
const PHONE_COLUMN = "phone"

interface SelectedCell {
  rowId: string
  columnId: string
}

/**
 * Split selected keys into their row and column halves.
 *
 * `gridCellKey` joins a row id and a column id with `~`, so this inverts the
 * grid's own addressing rather than guessing at a second one.
 */
function splitKeys(keys: string[]): SelectedCell[] {
  return keys.map((key) => {
    const at = key.lastIndexOf(GRID_CELL_KEY_SEPARATOR)

    if (at === -1) {
      throw new Error(`"${key}" is not a gridCellKey; the separator is missing.`)
    }

    return { rowId: key.slice(0, at), columnId: key.slice(at + 1) }
  })
}

/**
 * The range's cells addressed as `{ rowIndex, columnId }` in DOM order.
 *
 * Positions rather than ids, because the contract is about *where in the order
 * the operator is looking*: a diff of `[{ rowIndex: 0, columnId: 'name' }, …]`
 * states the rectangle outright, where a diff of ids would only state which
 * contacts it happened to land on.
 */
async function selectedPositions(page: Page): Promise<Array<{ rowIndex: number; columnId: string }>> {
  const rowIds = await renderedRowIds(page)

  return splitKeys(await selectedCellKeys(page)).map((key) => ({
    rowIndex: rowIds.indexOf(key.rowId),
    columnId: key.columnId,
  }))
}

/** Open the grid narrowed to the ten-row fixture and wait for it to settle. */
async function openTenRows(page: Page): Promise<void> {
  await openContactsGrid(page)
  await filterGlobally(page, TEN_ROWS)
  await expect(selectedCells(page), "a fresh grid has no cell range").toHaveCount(0)
}

test.describe("cell range selection", () => {
  test("range 1 — Shift+Arrow extends a rectangle, a column at a time and a row at a time", async ({ page }) => {
    await openTenRows(page)
    await focusCellAt(page, 0, NAME_COLUMN)

    // A single focused cell is not a range. Asserting that first is what makes
    // the counts below mean something: without it, "3 cells after two presses"
    // is equally satisfied by a focus that moved twice and selected nothing.
    await expect(selectedCells(page), "one clicked cell must not read as a range").toHaveCount(0)

    await page.keyboard.press("Shift+ArrowDown")
    await page.keyboard.press("Shift+ArrowDown")

    await expect(selectedCells(page)).toHaveCount(3)
    expect(await selectedPositions(page)).toEqual([
      { rowIndex: 0, columnId: NAME_COLUMN },
      { rowIndex: 1, columnId: NAME_COLUMN },
      { rowIndex: 2, columnId: NAME_COLUMN },
    ])

    // One column right: the rectangle widens. A linear walk would have added a
    // single cell instead, which is the whole reason this is a rectangle.
    await page.keyboard.press("Shift+ArrowRight")

    await expect(selectedCells(page)).toHaveCount(6)
    expect(await selectedPositions(page)).toEqual([
      { rowIndex: 0, columnId: NAME_COLUMN },
      { rowIndex: 0, columnId: PHONE_COLUMN },
      { rowIndex: 1, columnId: NAME_COLUMN },
      { rowIndex: 1, columnId: PHONE_COLUMN },
      { rowIndex: 2, columnId: NAME_COLUMN },
      { rowIndex: 2, columnId: PHONE_COLUMN },
    ])

    // Nothing outside the rectangle is marked. A highlight bleeding onto a
    // neighbouring row would still satisfy every count above.
    const markedPerRow = await page.locator("tr[data-grid-row]").evaluateAll((rows) =>
      rows.map((row) => row.querySelectorAll("[data-grid-cell-selected]").length),
    )
    expect(markedPerRow, "only rows 0-2 may carry the range").toEqual([2, 2, 2, 0, 0, 0, 0, 0, 0, 0])

    // The range reads as its own surface. Compared against an unselected cell in
    // the same column, so the control is the same cell type in the same place in
    // the row and only the range differs.
    const [selectedBackground, unselectedBackground] = await Promise.all([
      cellAt(page, 1, NAME_COLUMN).evaluate((node) => getComputedStyle(node).backgroundColor),
      cellAt(page, 3, NAME_COLUMN).evaluate((node) => getComputedStyle(node).backgroundColor),
    ])
    expect(
      selectedBackground,
      "the range surface must differ from an unselected cell in the same column",
    ).not.toBe(unselectedBackground)

    // The focused cell keeps its focus ring *inside* the range, so the two
    // signals stay separable rather than one overwriting the other.
    await expect(cellAt(page, 2, PHONE_COLUMN)).toHaveClass(/ring-1/)
  })

  test("range 2 — Shift+click extends the same range from the anchor", async ({ page }) => {
    await openTenRows(page)
    await focusCellAt(page, 1, NAME_COLUMN)
    await expect(selectedCells(page)).toHaveCount(0)

    // `Shift` reaches the grid through the same cell pointer handler; the
    // modifier is the only difference between this and a plain click.
    await cellAt(page, 4, NAME_COLUMN).click({ modifiers: ["Shift"] })

    await expect(selectedCells(page)).toHaveCount(4)
    expect(await selectedPositions(page)).toEqual([
      { rowIndex: 1, columnId: NAME_COLUMN },
      { rowIndex: 2, columnId: NAME_COLUMN },
      { rowIndex: 3, columnId: NAME_COLUMN },
      { rowIndex: 4, columnId: NAME_COLUMN },
    ])

    // The anchor did not travel: growing from row 1 to row 4 covers four rows,
    // not the three a re-anchored range would have covered.
    await expect(cellAt(page, 1, NAME_COLUMN), "the anchor must still be inside the range").toHaveAttribute(
      "data-grid-cell-selected",
      "true",
    )

    // A plain click re-anchors and collapses. Without this, "Shift+click
    // extended" would also be satisfied by a click that merely moved focus.
    await cellAt(page, 7, PHONE_COLUMN).click()
    await expect(selectedCells(page), "a plain click must drop the range").toHaveCount(0)
  })

  test("range 3 — Escape collapses the range to its anchor and hands focus back", async ({ page }) => {
    await openTenRows(page)
    await focusCellAt(page, 2, NAME_COLUMN)

    await page.keyboard.press("Shift+ArrowDown")
    await page.keyboard.press("Shift+ArrowDown")
    await page.keyboard.press("Shift+ArrowDown")
    await expect(selectedCells(page)).toHaveCount(4)

    await page.keyboard.press("Escape")

    await expect(selectedCells(page), "Escape must leave no range behind").toHaveCount(0)

    // The focus is back on the anchor, which is the cell the range collapsed
    // *to*. A collapse that left the focus on the far corner would silently
    // re-anchor the next range one row further down than the operator expects.
    await expect(cellAt(page, 2, NAME_COLUMN), "Escape must restore focus to the anchor").toBeFocused()
    await expect(cellAt(page, 5, NAME_COLUMN), "the former far corner must be released").not.toHaveAttribute(
      "data-grid-cell-selected",
      "true",
    )

    // A range built after the collapse anchors on the restored focus, so the
    // collapse really did put the operator back where they started.
    await page.keyboard.press("Shift+ArrowDown")
    await expect(selectedCells(page)).toHaveCount(2)
    expect(await selectedPositions(page)).toEqual([
      { rowIndex: 2, columnId: NAME_COLUMN },
      { rowIndex: 3, columnId: NAME_COLUMN },
    ])
  })

  test("range 4 — the range stays a resolvable rectangle across a sort", async ({ page }) => {
    await openTenRows(page)
    await focusCellAt(page, 1, NAME_COLUMN)
    await page.keyboard.press("Shift+ArrowDown")

    await expect(selectedCells(page)).toHaveCount(2)
    const beforeSort = await renderedRowIds(page)

    // DELIBERATE CONTRACT CHANGE (story 2 of spec-contacts-premium-grid,
    // CAP-14 / CAP-17): the header label is not a sort button, so this sorts
    // through the column menu's absolute-direction items rather than by
    // toggling a label button. Descending certainly reorders the ten
    // zero-padded generated names, which arrive in ascending payload order.
    await toggleSort(page, NAME_COLUMN, "Name", "asc")
    await toggleSort(page, NAME_COLUMN, "Name", "desc")

    await expect
      .poll(() => renderedRowIds(page), {
        message: "the sort must actually reorder the rows for this test to mean anything",
      })
      .not.toEqual(beforeSort)

    const afterSort = await renderedRowIds(page)

    // Still exactly the same rectangle, on the same *positions*. Anchors are
    // visible-row indices, so a re-order moves which rows the range covers —
    // that is the documented behaviour — and what it must never do is dangle on
    // rows that are no longer rendered, or quietly resize itself.
    await expect(selectedCells(page), "a sort must not add or drop range cells").toHaveCount(2)
    expect(await selectedPositions(page)).toEqual([
      { rowIndex: 1, columnId: NAME_COLUMN },
      { rowIndex: 2, columnId: NAME_COLUMN },
    ])
    expect(
      await selectedCellKeys(page),
      "the range must sit on whatever is rendered at its positions",
    ).toEqual([
      `${afterSort[1]}${GRID_CELL_KEY_SEPARATOR}${NAME_COLUMN}`,
      `${afterSort[2]}${GRID_CELL_KEY_SEPARATOR}${NAME_COLUMN}`,
    ])

    // Escape still works after the re-order, which is the operator's way out if
    // the range landed somewhere they did not want it.
    await page.keyboard.press("Escape")
    await expect(selectedCells(page)).toHaveCount(0)
    await expect(cellAt(page, 1, NAME_COLUMN)).toBeFocused()

    // Row selection is untouched by all of the above: the range is a cell
    // concern, and a shift-click on the grid must not have started selecting
    // rows behind the operator's back.
    await expect(gridRoot(page).locator("tr[data-state='selected']")).toHaveCount(0)
    await expect(page.locator("[data-bulk-selection-count]")).toHaveText("0 selected")
  })
})