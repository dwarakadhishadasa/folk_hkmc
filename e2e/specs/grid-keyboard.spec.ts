/**
 * Keyboard completion — CAP-1 and CAP-2, over the synthetic preview harness.
 *
 * | Test | Scenario | Claim under test |
 * | ---- | -------- | ---------------- |
 * | key 1 | Arrow navigation | plain arrows move focus and re-anchor, without opening an editor |
 * | key 2 | `Tab` / `Shift+Tab` | advance across the row, wrap at the ends, stop at the corners |
 * | key 3 | `Home` / `End`, `Cmd+Home/End` | row edges and grid corners |
 * | key 4 | Type-to-edit — **retired by CAP-10** | a printable character opens nothing at all |
 * | key 5 | `Space` on a text cell — **seeding retired by CAP-10** | opens nothing, and still does not scroll the page |
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
 * `Space` **was** the one key with two meanings: a toggle on a checkbox cell and a
 * printable character everywhere else, which seeded an editor with `" "`. CAP-10
 * retired the seeding half and deliberately kept the toggle — a `Space` that
 * toggled nothing would be worse than one that toggles the wrong thing, and
 * removing the toggle with the seeding would have taken a working gesture with
 * it. So the spec pins both halves separately, and key 5 now asserts that the
 * retired half is *gone*. The checkbox column is `flagged`, which carries
 * `editor: "checkbox"`.
 *
 * ## `flagged` stopped rendering as text when the editor registry landed
 *
 * `flagged` used to read `"true"` / `"false"` because the registry did not exist
 * yet, and keys 6 and 7 asserted on that text. The `checkbox` editor's display is
 * a real checkbox — "a checked box" in `editor-catalog.md` — so both keys now
 * assert on `aria-checked` instead. The behaviour under test is unchanged; only
 * the surface it is read through is.
 */

import { expect, test, type Page } from "@playwright/test"

import {
  cellAt,
  cellIn,
  filterGlobally,
  focusPreviewCellAt,
  openCellEditor,
  openPreviewGrid,
  previewScroll,
  renderedRowIds,
  rowById,
  selectedCells,
} from "../fixtures/manage-grid"


/** The in-cell editor the keyboard hook mounts. */
function cellEditor(page: Page) {
  return page.getByRole("textbox", { name: "Edit cell value" })
}

/** The preview row whose writes always reject. See `GRID_PREVIEW_FAILING_REF`. */
const FAILING_REF = "REF-0250"

/** `flagged` as a checkbox, so its state is read from `aria-checked`. */
function flaggedBox(page: Page, rowIndex: number) {
  return cellAt(page, rowIndex, "flagged").getByRole("checkbox")
}

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

  /**
   * **Retired by CAP-10 — this test asserts the removal, not the behaviour it
   * used to assert.** It used to read "typing a printable character seeds the
   * editor, replacing the value" and prove that `R` opened `owner`, seeded the
   * draft with `R`, and that `avi` appended to it.
   *
   * Why it was removed: type-to-edit was one of five ways to open a cell editor,
   * which is the opposite of the "one opener, every time" the edit model is for —
   * and a seeded draft is indistinguishable, on screen, from a deliberate
   * overwrite of the cell's whole value. Double-click is the opener now, and the
   * replacement assertion is that the key does *nothing at all*, so a later agent
   * who helpfully restores the branch sees this go red rather than reading a
   * green suite as evidence the keyboard model still works.
   */
  test("key 4 (retired) — a printable character opens nothing and leaves the cell alone", async ({ page }) => {
    await openPreviewGrid(page)
    await focusPreviewCellAt(page, 0, "owner")

    const before = (await cellAt(page, 0, "owner").textContent()) ?? ""

    await page.keyboard.press("R")

    await expect(cellEditor(page), "a printable character must not open the editor").toHaveCount(0)
    await expect(cellAt(page, 0, "owner"), "and must not change the cell").toHaveText(before)
    await expect(cellAt(page, 0, "owner"), "and must not leave it marked").not.toHaveClass(
      /text-destructive/,
    )

    // The opener that replaced it is asserted where it belongs — a
    // double-click — in `grid-edit-model.spec.ts`, and by every conversion in
    // `grid-editors.spec.ts`.
    await openCellEditor(cellAt(page, 0, "owner"))
    await expect(cellEditor(page), "a double-click is the opener that replaced it").toBeFocused()
  })

  /**
   * **`Space`-seeding retired by CAP-10; the `preventDefault` deliberately kept.**
   *
   * This used to assert that `Space` on a text cell opened the editor seeded with
   * a single space. Why that behaviour was removed: it was a fourth and fifth way
   * into an editor, it opened a draft whose entire contents were a space the
   * operator never typed into that cell, and `Space` now means exactly one thing
   * on a non-checkbox cell — nothing. What survives is that the key does not
   * scroll the page, which is what `preventDefault` is for, so that half is
   * still asserted rather than assumed.
   */
  test("key 5 (retired) — Space on a text cell opens nothing and does not scroll the page", async ({ page }) => {
    await openPreviewGrid(page)
    await focusPreviewCellAt(page, 0, "owner")

    const before = (await cellAt(page, 0, "owner").textContent()) ?? ""
    const scrollBefore = await previewScroll(page).evaluate((element) => element.scrollTop)

    await page.keyboard.press("Space")

    await expect(cellEditor(page), "Space must not open the editor on a text cell").toHaveCount(0)
    await expect(cellAt(page, 0, "owner"), "and must not change the cell").toHaveText(before)
    expect(
      await previewScroll(page).evaluate((element) => element.scrollTop),
      "Space must not scroll the page out from under the grid",
    ).toBe(scrollBefore)
  })

  test("key 6 — Space on a checkbox cell toggles through the commit path", async ({ page }) => {
    await openPreviewGrid(page)

    // Row 1 is `row-2`: `flagged` is `index % 3 === 0`, so it starts unchecked.
    await expect(flaggedBox(page, 1), "the cell starts unchecked").toHaveAttribute(
      "aria-checked",
      "false",
    )
    await focusPreviewCellAt(page, 1, "flagged")

    await page.keyboard.press("Space")
    await expect(flaggedBox(page, 1), "Space flips the checkbox value").toHaveAttribute(
      "aria-checked",
      "true",
    )

    // No editor for a toggle: the checkbox is the one editor that commits on
    // interaction rather than opening anything.
    await expect(cellEditor(page), "a toggle must not open the editor").toHaveCount(0)

    await page.keyboard.press("Space")
    await expect(flaggedBox(page, 1), "Space flips it back").toHaveAttribute(
      "aria-checked",
      "false",
    )
  })

  test("key 7 — Delete clears through the revertable path and skips what it must", async ({ page }) => {
    await openPreviewGrid(page)

    // Happy path: Delete empties the cell and it renders nothing.
    //
    // CHANGED by premium-grid story 3 (CAP-3, blank-not-dash). This asserted the
    // em-dash `GRID_EMPTY_TEXT`, which the grid no longer has: an empty value now
    // renders as nothing rather than as a placeholder glyph, because punctuation
    // is not a subtle way to show absence. The contract changed deliberately, so
    // the assertion changed with it \u2014 this is the recorded exception, not a
    // weakened gate.
    await focusPreviewCellAt(page, 2, "owner")
    await page.keyboard.press("Delete")
    await expect(cellAt(page, 2, "owner"), "a cleared cell renders nothing").toHaveText("")

    // Read-only and checkbox cells are skipped, silently: clearing a frozen
    // identity or a boolean is not a cell write.
    const refText = await cellAt(page, 2, "ref").textContent()
    await focusPreviewCellAt(page, 2, "ref")
    await page.keyboard.press("Delete")
    await expect(cellAt(page, 2, "ref"), "Delete on a read-only cell is a no-op").toHaveText(
      refText ?? "",
    )

    // Read the state rather than naming it: `flagged` is `index % 3 === 0`, so
    // which rows are checked depends on where the row lands.
    const flaggedBefore = await flaggedBox(page, 2).getAttribute("aria-checked")
    await focusPreviewCellAt(page, 2, "flagged")
    await page.keyboard.press("Backspace")
    await expect(
      flaggedBox(page, 2),
      "Delete on a checkbox cell is a no-op: a boolean's empty state is false, not blank",
    ).toHaveAttribute("aria-checked", flaggedBefore ?? "")

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
    await expect(failingCell, "the refusal rides the cell itself").toHaveAttribute(
      "data-grid-cell-error",
      /locked in the harness/,
    )
  })

  test("key 8 — Tab out of the editor commits first, then moves", async ({ page }) => {
    await openPreviewGrid(page)
    await focusPreviewCellAt(page, 0, "owner")

    await openCellEditor(cellAt(page, 0, "owner"))
    await expect(cellEditor(page)).toBeFocused()
    await page.keyboard.type("Owner-Tabbed")
    await page.keyboard.press("Tab")

    // The draft committed to the cell left behind, and focus advanced.
    await expect(cellAt(page, 0, "owner")).toHaveText("Owner-Tabbed")
    await expect(cellAt(page, 0, "region"), "Tab leaves the committed cell for the next one").toBeFocused()
    await expect(cellEditor(page), "the editor closed on Tab").toHaveCount(0)
  })
})
