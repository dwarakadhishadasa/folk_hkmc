/**
 * Keyboard completion — CAP-1 and CAP-2, over the synthetic preview harness.
 *
 * | Test | Scenario | Claim under test |
 * | ---- | -------- | ---------------- |
 * | key 1 | Arrow navigation | plain arrows move focus and re-anchor, without opening an editor |
 * | key 2 | `Tab` / `Shift+Tab` | advance across the row, wrap at the ends, stop at the corners |
 * | key 3 | `Home` / `End`, `Cmd+Home/End` | row edges and grid corners |
 * | key 4 | Type-to-edit | a printable character seeds the editor, replacing rather than appending |
 * | key 5 | `Space` on a text cell | seeds the editor with `" "` instead of scrolling the page |
 * | key 6 | `Space` on a checkbox cell | toggles the value through the commit path |
 * | key 7 | `Delete` clears, skips, and reverts | empty commits through the revertable path; read-only and checkbox cells are skipped; a rejected clear reverts visibly |
 * | key 8 | `Tab` out of the editor | commits first, then moves |
 *
 * ## Why the preview harness and not `/manage`
 *
 * Every behaviour here is primitive-owned: no contacts column, no PATCH route,
 * noSupabase. The preview grid commits in memory, so each test gets a fresh
 * page and fresh row state with nothing to restore afterwards — the failure
 * row (`REF-0250`, which rejects every write) plays the part the intercepted
 * 400s play in `manage-contacts-edit.spec.ts`.
 *
 * ## Why `Space` needs its own two tests
 *
 * `Space` is the one key with two meanings: a toggle on a checkbox cell and a
 * printable character everywhere else. Making it inert everywhere would be
 * worse — an operator typing a space into a text cell would get nothing — so
 * the spec pins both behaviours separately. The checkbox column is `flagged`,
 * which carries `editor: "checkbox"` and renders its boolean as text until
 * the typed-editor registry lands; the toggle is asserted on that text.
 */

import { expect, test, type Page } from "@playwright/test"

import {
  cellAt,
  cellIn,
  filterGlobally,
  focusPreviewCellAt,
  gridStatusLine,
  openPreviewGrid,
  previewScroll,
  renderedRowIds,
  rowById,
  selectedCells,
} from "../fixtures/manage-grid"

const GRID_EMPTY_TEXT = "—" // `GRID_EMPTY_TEXT` in components/grid/use-grid-keyboard.ts

/** The in-cell editor the keyboard hook mounts. */
function cellEditor(page: Page) {
  return page.getByRole("textbox", { name: "Edit cell value" })
}

/** The preview row whose writes always reject. See `GRID_PREVIEW_FAILING_REF`. */
const FAILING_REF = "REF-0250"

test.describe("grid keyboard completion", () => {
  test("key 1 — arrows move focus a cell at a time without editing", async ({ page }) => {
    await openPreviewGrid(page)
    await focusPreviewCellAt(page, 0, "owner")

    await page.keyboard.press("ArrowRight")
    await expect(cellAt(page, 0, "region"), "ArrowRight moves one column").toBeFocused()

    await page.keyboard.press("ArrowDown")
    await expect(cellAt(page, 1, "region"), "ArrowDown moves one row").toBeFocused()

    await page.keyboard.press("ArrowLeft")
    await expect(cellAt(page, 1, "owner"), "ArrowLeft moves back").toBeFocused()

    await page.keyboard.press("ArrowUp")
    await expect(cellAt(page, 0, "owner"), "ArrowUp moves back").toBeFocused()

    // Navigation never opens the editor and never starts a range: a move that
    // left either behind would satisfy every focus assertion above.
    await expect(cellEditor(page), "arrowing must not open the editor").toHaveCount(0)
    await expect(selectedCells(page), "a plain arrow re-anchors, it does not extend").toHaveCount(0)
  })

  test("key 2 — Tab advances, wraps at the row ends, and stops at the corners", async ({ page }) => {
    await openPreviewGrid(page)
    await focusPreviewCellAt(page, 0, "ref")

    await page.keyboard.press("Tab")
    await expect(cellAt(page, 0, "owner"), "Tab advances within the row").toBeFocused()

    // The last column is `flagged`; Tab from it wraps to the next row's first cell.
    await focusPreviewCellAt(page, 0, "flagged")
    await page.keyboard.press("Tab")
    await expect(cellAt(page, 1, "ref"), "Tab on the last cell wraps to the next row").toBeFocused()

    await page.keyboard.press("Shift+Tab")
    await expect(cellAt(page, 0, "flagged"), "Shift+Tab wraps back").toBeFocused()

    // The grid's corners are stops: Shift+Tab on the very first cell stays
    // put rather than wrapping anywhere.
    await focusPreviewCellAt(page, 0, "ref")
    await page.keyboard.press("Shift+Tab")
    await expect(cellAt(page, 0, "ref"), "Shift+Tab on the first cell stays").toBeFocused()
  })

  test("key 3 — Home/End jump to the row edges, Cmd+Home/End to the grid corners", async ({ page }) => {
    await openPreviewGrid(page)
    await focusPreviewCellAt(page, 0, "volume")

    await page.keyboard.press("Home")
    await expect(cellAt(page, 0, "ref"), "Home jumps to the row's first cell").toBeFocused()

    await page.keyboard.press("End")
    await expect(
      cellAt(page, 0, "flagged"),
      "End jumps to the row's last cell",
    ).toBeFocused()

    await focusPreviewCellAt(page, 2, "volume")
    await page.keyboard.press("ControlOrMeta+Home")
    await expect(cellAt(page, 0, "ref"), "Cmd+Home jumps to the first row").toBeFocused()

    await page.keyboard.press("ControlOrMeta+End")

    // The jump is proven by position: the rendered window now ends on the
    // final data row. The focused cell unmounted with the jump, so focus is
    // parked on the container — which is what keeps the next key alive.
    await expect
      .poll(async () => (await renderedRowIds(page)).at(-1), {
        message: "Cmd+End must scroll the window to the final row",
      })
      .toBe("row-500")
    await expect(previewScroll(page), "the jump must not lose keyboard focus").toBeFocused()

    // One ArrowUp afterwards lands on the second-to-last data row, which only
    // a real jump to the end could have left behind. `Cmd+End` lands on the
    // last cell of the last row, so the column under test is `flagged`.
    await page.keyboard.press("ArrowUp")
    await expect(
      cellIn(rowById(page, "row-499"), "flagged"),
      "ArrowUp from the jumped-to end lands on row-499",
    ).toBeFocused()
  })

  test("key 4 — typing a printable character seeds the editor, replacing the value", async ({ page }) => {
    await openPreviewGrid(page)
    await focusPreviewCellAt(page, 0, "owner")

    const before = await cellAt(page, 0, "owner").textContent()

    await page.keyboard.press("R")
    await expect(cellEditor(page), "a printable character opens the editor").toBeFocused()

    // Seeded with the character, not with the display text: had the opener
    // pre-filled the old value, the editor would hold the whole owner name.
    await expect(cellEditor(page)).toHaveValue("R")

    // The seed is selected on mount, so typing next would replace it. `End`
    // collapses the selection first, and the rest appends to the seed.
    await cellEditor(page).press("End")
    await page.keyboard.type("avi")
    await page.keyboard.press("Enter")

    // Exactly `Ravi`: the opening keystroke was prevented, so it seeded the
    // draft once rather than typing itself next to the seed — and the old
    // value is gone, so the seed replaced rather than appended.
    await expect(cellAt(page, 0, "owner")).toHaveText("Ravi")
    expect(before, "the test needs a non-empty owner for the replace claim").not.toBe("Ravi")
  })

  test("key 5 — Space on a text cell seeds a space instead of scrolling the page", async ({ page }) => {
    await openPreviewGrid(page)
    await focusPreviewCellAt(page, 0, "owner")

    await page.keyboard.press("Space")
    await expect(cellEditor(page), "Space opens the editor on a text cell").toBeFocused()
    await expect(cellEditor(page), "the draft is a single space").toHaveValue(" ")

    // Cancelled, so the grid is unchanged for the tests after this one — and
    // the page never scrolled, which is what the preventDefault is for.
    await page.keyboard.press("Escape")
    await expect(cellEditor(page)).toHaveCount(0)
  })

  test("key 6 — Space on a checkbox cell toggles through the commit path", async ({ page }) => {
    await openPreviewGrid(page)

    // Row 1 is `row-2`: `flagged` is `index % 3 === 0`, so it starts `false`.
    await expect(cellAt(page, 1, "flagged")).toHaveText("false")
    await focusPreviewCellAt(page, 1, "flagged")

    await page.keyboard.press("Space")
    await expect(
      cellAt(page, 1, "flagged"),
      "Space flips the checkbox value",
    ).toHaveText("true")

    // No editor for a toggle: the checkbox is the one editor that commits on
    // interaction rather than opening anything.
    await expect(cellEditor(page), "a toggle must not open the editor").toHaveCount(0)

    await page.keyboard.press("Space")
    await expect(cellAt(page, 1, "flagged"), "Space flips it back").toHaveText("false")
  })

  test("key 7 — Delete clears through the revertable path and skips what it must", async ({ page }) => {
    await openPreviewGrid(page)

    // Happy path: Delete empties the cell and the placeholder shows.
    await focusPreviewCellAt(page, 2, "owner")
    await page.keyboard.press("Delete")
    await expect(
      cellAt(page, 2, "owner"),
      "a cleared cell shows the empty placeholder",
    ).toHaveText(GRID_EMPTY_TEXT)

    // Read-only and checkbox cells are skipped, silently: clearing a frozen
    // identity or a boolean is not a cell write.
    const refText = await cellAt(page, 2, "ref").textContent()
    await focusPreviewCellAt(page, 2, "ref")
    await page.keyboard.press("Delete")
    await expect(cellAt(page, 2, "ref"), "Delete on a read-only cell is a no-op").toHaveText(
      refText ?? "",
    )

    const flaggedText = await cellAt(page, 2, "flagged").textContent()
    await focusPreviewCellAt(page, 2, "flagged")
    await page.keyboard.press("Backspace")
    await expect(cellAt(page, 2, "flagged"), "Delete on a checkbox cell is a no-op").toHaveText(
      flaggedText ?? "",
    )

    // Revert path: the failing row rejects the clear, so the original value
    // returns with the destructive marker and the harness message.
    await openPreviewGrid(page)
    await filterGlobally(page, FAILING_REF)
    await focusPreviewCellAt(page, 0, "owner")

    const original = await cellAt(page, 0, "owner").textContent()
    await page.keyboard.press("Delete")

    const failingCell = cellAt(page, 0, "owner")
    await expect(failingCell, "a rejected clear restores the original value").toHaveText(original ?? "")
    await expect(failingCell, "a rejected clear marks the cell destructive").toHaveClass(
      /text-destructive/,
    )
    await expect(gridStatusLine(page)).toContainText("locked in the harness")
  })

  test("key 8 — Tab out of the editor commits first, then moves", async ({ page }) => {
    await openPreviewGrid(page)
    await focusPreviewCellAt(page, 0, "owner")

    await page.keyboard.press("e")
    await expect(cellEditor(page)).toBeFocused()
    await page.keyboard.type("Owner-Tabbed")
    await page.keyboard.press("Tab")

    // The draft committed to the cell left behind, and focus advanced.
    await expect(cellAt(page, 0, "owner")).toHaveText("Owner-Tabbed")
    await expect(cellAt(page, 0, "region"), "Tab leaves the committed cell for the next one").toBeFocused()
    await expect(cellEditor(page), "the editor closed on Tab").toHaveCount(0)
  })
})
