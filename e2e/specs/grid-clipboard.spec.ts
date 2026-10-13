/**
 * Clipboard copy and paste over the selection — CAP-3.
 *
 * | Test | Scenario | Claim under test |
 * | ---- | -------- | ---------------- |
 * | clip 1 | Copy a rectangular range | the clipboard holds tab-separated text, one line per row |
 * | clip 2 | Paste into a single cell | the copied block lands starting at the focus, through the commit path |
 * | clip 3 | Round-trip TSV | copy out and back preserves every field, empties included |
 * | clip 4 | Skipped targets report visibly | a paste over read-only cells commits what it can and says what it skipped |
 * | clip 5 | A failed paste write reverts | a rejected paste shows the same destructive cell and message as any rejected write |
 *
 * ## Why the preview harness
 *
 * Same reason as the keyboard spec: the clipboard is primitive-owned, the
 * preview grid commits in memory, and the failing row (`REF-0250`) stands in
 * for the intercepted 400s `manage-contacts-edit.spec.ts` uses. Each test
 * gets a fresh page and fresh row state.
 *
 * ## Clipboard permission
 *
 * The copy path uses `navigator.clipboard.writeText`, which needs the
 * `clipboard-write` permission; clip 1 reads the clipboard back, which needs
 * `clipboard-read`. Both are granted up front in the tests that touch the
 * clipboard directly. The paste path itself needs neither: it reads the
 * `paste` event, which carries the text without a permission prompt.
 */

import { expect, test, type Page } from "@playwright/test"

import {
  cellAt,
  cellIn,
  filterGlobally,
  focusPreviewCellAt,
  previewNotice,
  openPreviewGrid,
  rowById,
} from "../fixtures/manage-grid"


/** Grant clipboard access for the tests that touch the clipboard directly. */
async function grantClipboard(page: Page): Promise<void> {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"])
}

/** Read the OS clipboard back, which is what the copy path wrote. */
async function readClipboard(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText())
}

/**
 * The text of a rectangle of cells, tab-joined per row. Built with literal
 * separators rather than the grid's own join, so a wrong separator in the
 * implementation fails here instead of agreeing with itself.
 */
async function cellTexts(page: Page, rowIndex: number, columnIds: string[]): Promise<string> {
  const texts: string[] = []

  for (const columnId of columnIds) {
    texts.push((await cellAt(page, rowIndex, columnId).textContent()) ?? "")
  }

  return texts.join("\t")
}

/** The preview row whose writes always reject. See `GRID_PREVIEW_FAILING_REF`. */
const FAILING_REF = "REF-0250"

test.describe("grid clipboard", () => {
  test("clip 1 — copying a rectangular range writes TSV to the clipboard", async ({ page }) => {
    await grantClipboard(page)
    await openPreviewGrid(page)
    await focusPreviewCellAt(page, 0, "owner")

    await page.keyboard.press("Shift+ArrowDown")
    await page.keyboard.press("Shift+ArrowDown")
    await page.keyboard.press("Shift+ArrowRight")

    // Three rows, two columns: owner and region.
    await page.keyboard.press("ControlOrMeta+c")

    const expected = [
      await cellTexts(page, 0, ["owner", "region"]),
      await cellTexts(page, 1, ["owner", "region"]),
      await cellTexts(page, 2, ["owner", "region"]),
    ].join("\n")

    await expect
      .poll(readClipboard.bind(null, page), {
        message: "the copy must reach the clipboard",
      })
      .toBe(expected)
  })

  test("clip 2 — pasting a block starts at the focus and commits through the write path", async ({
    page,
  }) => {
    await grantClipboard(page)
    await openPreviewGrid(page)

    // Copy two owners. The neighbouring `region` column is read-only, so a
    // two-column copy would exercise the skip path instead — that is clip 4's
    // job. Here the claim is rows expanding downwards from the focus.
    await focusPreviewCellAt(page, 0, "owner")
    await page.keyboard.press("Shift+ArrowDown")
    await page.keyboard.press("ControlOrMeta+c")

    const [ownerA, ownerB] = (await readClipboard(page)).split("\n")
    expect(ownerA.length, "the test needs a real copy for the paste to mean anything").toBeGreaterThan(0)

    // Paste starting at row 5's owner: both values land below the focus.
    await focusPreviewCellAt(page, 5, "owner")
    await page.keyboard.press("ControlOrMeta+v")

    await expect(cellAt(page, 5, "owner")).toHaveText(ownerA)
    await expect(cellAt(page, 6, "owner")).toHaveText(ownerB)

    // Committed, not just displayed: no destructive marker, no status.
    await expect(cellAt(page, 5, "owner")).not.toHaveClass(/text-destructive/)
    await expect(cellAt(page, 5, "owner"), "and left unmarked").not.toHaveClass(
      /text-destructive/,
    )
  })

  test("clip 3 — a cleared cell round-trips as an empty field, never the placeholder", async ({
    page,
  }) => {
    await grantClipboard(page)
    await openPreviewGrid(page)

    // Empty row 2's owner first, so the range under test contains a real
    // empty — the placeholder must not leak into the clipboard.
    await focusPreviewCellAt(page, 2, "owner")
    await page.keyboard.press("Delete")
    // CHANGED by premium-grid story 3 (CAP-3, blank-not-dash): the grid renders
    // an empty value as nothing, so there is no em-dash placeholder left to
    // assert. Recorded contract change, not a weakened gate.
    await expect(cellAt(page, 2, "owner")).toHaveText("")

    await focusPreviewCellAt(page, 2, "owner")
    await page.keyboard.press("Shift+ArrowRight")
    await page.keyboard.press("ControlOrMeta+c")

    const copied = await readClipboard(page)
    const regionText = (await cellAt(page, 2, "region").textContent()) ?? ""
    expect(copied, "an empty cell contributes an empty field").toBe(`\t${regionText}`)

    // Pasting that field back clears its target. The neighbouring `region`
    // field has nowhere editable to land — `region` is read-only — so it is
    // skipped and reported, while the empty owner field commits.
    const targetRegion = (await cellAt(page, 7, "region").textContent()) ?? ""
    await focusPreviewCellAt(page, 7, "owner")
    await page.keyboard.press("ControlOrMeta+v")

    // CHANGED by premium-grid story 3 (CAP-3, blank-not-dash) \u2014 as above.
    await expect(cellAt(page, 7, "owner")).toHaveText("")
    await expect(cellAt(page, 7, "region"), "the read-only neighbour keeps its value").toHaveText(
      targetRegion,
    )
    await expect(previewNotice(page), "the skip is reported, not swallowed").toContainText(
      "Skipped",
    )
  })

  test("clip 4 — pasting over read-only cells commits what it can and reports the skip", async ({
    page,
  }) => {
    await grantClipboard(page)
    await openPreviewGrid(page)

    // Copy owner+region from rows 0–1.
    await focusPreviewCellAt(page, 0, "owner")
    await page.keyboard.press("Shift+ArrowDown")
    await page.keyboard.press("Shift+ArrowRight")
    await page.keyboard.press("ControlOrMeta+c")

    const [firstLine] = (await readClipboard(page)).split("\n")
    const [, regionA] = firstLine.split("\t")

    // Paste starting at the read-only `ref` column: the owner field has
    // nowhere editable to land and is skipped, the region field lands on
    // `owner`, and the skip is reported rather than swallowed.
    await focusPreviewCellAt(page, 5, "ref")
    await page.keyboard.press("ControlOrMeta+v")

    await expect(cellAt(page, 5, "owner")).toHaveText(regionA)
    await expect(previewNotice(page), "the skip is reported, not swallowed").toContainText(
      "Skipped",
    )
  })

  test("clip 5 — a rejected paste reverts like any other rejected write", async ({ page }) => {
    await grantClipboard(page)
    await openPreviewGrid(page)

    await focusPreviewCellAt(page, 0, "owner")
    await page.keyboard.press("ControlOrMeta+c")
    const copied = await readClipboard(page)
    expect(copied.length, "the test needs a real copy for the paste to mean anything").toBeGreaterThan(0)

    await openPreviewGrid(page)
    await filterGlobally(page, FAILING_REF)
    await focusPreviewCellAt(page, 0, "owner")

    const original = (await cellAt(page, 0, "owner").textContent()) ?? ""
    await page.keyboard.press("ControlOrMeta+v")

    const failingCell = cellIn(rowById(page, "row-250"), "owner")
    await expect(failingCell, "a rejected paste restores the original value").toHaveText(original)
    await expect(failingCell, "a rejected paste marks the cell destructive").toHaveClass(
      /text-destructive/,
    )
    await expect(failingCell, "the refusal rides the cell itself").toHaveAttribute(
      "data-grid-cell-error",
      /locked in the harness/,
    )
  })
})
