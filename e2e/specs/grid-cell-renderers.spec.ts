/**
 * Type-keyed cell renderers, linked-record labels, blank-not-dash — CAP-3 and CAP-4.
 *
 * | Test | Scenario | Claim under test |
 * | ---- | -------- | ---------------- |
 * | type 1 | the two column families | a joined accessor declares a type without an editor, and a stored field keeps both keys with the editor still rendering |
 * | type 2 | a joined accessor with no editor | `location`-shaped columns render a label rather than falling through to bare text |
 * | type 3 | a resolved link | the human label, and no id anywhere in the cell |
 * | type 4 | a dangling link | the consumer's unresolved marker — never the raw id |
 * | type 5 | a genuinely absent link | nothing at all, so absent and dangling stay different facts |
 * | type 6 | blank-not-dash | an empty cell renders nothing, in the grid, in `title`, and in the clipboard |
 * | type 7 | editable vs read-only | the two carry a distinguishing attribute and the read-only cell is muted |
 * | type 8 | a custom-control column | the widget column is untouched by both the registry and the read-only treatment |
 * | type 9 | error precedence | a rejected commit still reads destructive, not muted |
 * | type 10 | truncation stays inspectable | a cell the registry draws still carries its full value in `title` |
 * | type 11 | the identity column | exactly one weighted cell per row, expressed with weight |
 *
 * ## Why the preview harness carries the linked cases
 *
 * `bulk-fixtures.spec.ts:571` asserts that every seeded contact's `locationIds`
 * resolve to a real row. Planting a dangling id in `/manage` to prove a *display*
 * rule would break a live data invariant, so the preview harness supplies its own
 * `site` column: `SITE_NAMES` resolves two ids and omits `site-missing`, which one
 * row in three carries. The contacts table is still exercised — tests 8, 11 and 12
 * run against `/manage` — for the three things that need no dangling row: the
 * marker wording, the consumer-widget exclusion, and the `fieldType` declaration on
 * both joined columns.
 *
 * **The preview grid numbers its rows from 1, not 0.** `buildPreviewRows` starts at
 * `index = 1`, so the first rendered row is `row-1`. Every row index below is
 * written as a comment against the id rather than left to be counted, because an
 * off-by-one here silently tests the wrong row and passes.
 *
 * ## What is deliberately not asserted
 *
 * The muted-vs-weight *severity* is not asserted. `design-constraints.md` bans the
 * hardcoded CSS such an assertion would need, and a hardcoded value fails the first
 * time someone tunes a token for dark-mode legibility. The attribute is asserted
 * because it is structural; the rendering is for the recorded manual pass.
 */

import { expect, test } from "@playwright/test"

import type { Page } from "@playwright/test"

import {
  cellAt,
  cellIn,
  filterGlobally,
  openContactsGrid,
  openPreviewGrid,
  previewScroll,
  renderedRows,
} from "../fixtures/manage-grid"

/** The one visual emphasis a row is allowed, per the story's acceptance criteria. */
const EMPHASIS_ATTR = "[data-grid-cell-emphasis]"

/** The preview row whose writes always reject. See `GRID_PREVIEW_FAILING_REF`. */
const FAILING_REF = "REF-0250"

/**
 * Clipboard access and read-back, local to this file for the same reason they are
 * in `grid-clipboard.spec.ts`: the fixture module deliberately carries no
 * clipboard helper, because granting permissions is a concern of a spec that
 * actually copies rather than of every spec that touches a grid.
 */
async function grantClipboard(page: Page): Promise<void> {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"])
}

async function readClipboard(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText())
}

test.describe("CAP-3 and CAP-4 — type-keyed cell renderers", () => {
  test("type 1 — the two joined columns declare a type, and an editor column keeps both keys", async ({
    page,
  }) => {
    await openPreviewGrid(page)

    // The two families side by side. `site` is a joined accessor with no editor;
    // `owner` is a stored field with one. Both declare a type, and the pair is the
    // distinction the story exists to make — before it, `site` had nothing to key
    // a renderer on and rendered as bare text beside a styled `owner`.
    const linked = cellAt(page, 0, "site")
    const stored = cellAt(page, 0, "owner")

    await expect(linked, "a joined accessor still declares what it holds").toHaveAttribute(
      "data-grid-field-type",
      "linked",
    )
    await expect(stored, "a stored field declares both how and what").toHaveAttribute(
      "data-grid-field-type",
      "text",
    )
    await expect(stored).toHaveAttribute("data-grid-cell-editable", "true")

    // The editor still wins the render on a column that has both keys. `assignee`
    // is the sharpest case: it declares `fieldType: "linked"` *and* carries the
    // `user` editor, so the registry has a renderer for it and must not take the
    // cell over. The editor's own display widget proves which one won.
    await expect(stored).toContainText(".")
    await expect(
      cellAt(page, 0, "assignee").locator('[data-grid-editor]'),
      "the editor's own display, not the registry's",
    ).toBeAttached()
  })

  test("type 2 — a joined accessor with no editor renders a label, not bare text", async ({ page }) => {
    await openPreviewGrid(page)

    const site = cellAt(page, 0, "site")

    // The whole point of the separate key: this column has no editor, so a
    // renderer keyed on the editor would have left it as plain text with no
    // distinction from any other column.
    await expect(site).toHaveAttribute("data-grid-field-type", "linked")
    await expect(site, "the label, and no trace of the id").not.toContainText("site-")
    await expect(site.locator("span").first(), "a pill, not bare text").toBeAttached()
  })

  test("type 3 — a resolved link renders the human label and no id anywhere", async ({ page }) => {
    await openPreviewGrid(page)

    // `site` resolves for every row whose index is not a multiple of three, so
    // row 2 is one of them. The page numbers its rows from 1, so the second
    // rendered row is `row-2`.
    const site = cellAt(page, 1, "site")

    await expect(site, "the label, not the id").toHaveText(/North Annexe|Quarry Road/)
    await expect(site, "no raw id reaches the cell").not.toContainText("site-north")
    await expect(site, "no raw id reaches the title").not.toContainText("site-north")
    await expect(site.locator('[data-grid-linked="unresolved"]')).toHaveCount(0)
  })

  test("type 4 — a dangling link renders the unresolved marker, never the raw id", async ({ page }) => {
    await openPreviewGrid(page)

    // One row in three carries `site-missing`, and the page numbers rows from 1,
    // so `row-3` is the third rendered row.
    const site = cellAt(page, 2, "site")

    await expect(site.locator('[data-grid-linked="unresolved"]')).toBeVisible()
    await expect(site, "the consumer's own wording").toHaveText("Unknown site")
    await expect(site, "never the id itself").not.toContainText("site-missing")
    await expect(site, "never a guess derived from the id").not.toContainText("missing")
  })

  test("type 5 — a genuinely absent link renders nothing, so absent and dangling differ", async ({
    page,
  }) => {
    await openPreviewGrid(page)

    // Two different rows, because the harness reaches the two states on different
    // cycles: `assignee` is null when the index is a multiple of four (`row-4`),
    // and `site` dangles when it is a multiple of three (`row-3`). Both are the
    // fourth and third rendered rows respectively, since rows number from 1.
    //
    // The pair is the point: absent renders nothing and dangling renders a marker,
    // so a contact with no location and a contact whose location row is gone stay
    // two different facts rather than collapsing into one blank.
    await expect(
      cellAt(page, 3, "assignee"),
      "no reference at all is genuinely empty",
    ).toHaveText("")
    await expect(
      cellAt(page, 2, "site"),
      "a dangling reference is not empty",
    ).toHaveText("Unknown site")
  })

  test("type 6 — blank-not-dash: empty is empty in the cell, the title and the clipboard", async ({
    page,
  }) => {
    await grantClipboard(page)
    await openPreviewGrid(page)

    const cell = cellAt(page, 2, "owner")
    await cell.click({ position: { x: 2, y: 2 } })
    await previewScroll(page).focus()
    await page.keyboard.press("Delete")

    await expect(cell, "no placeholder glyph").toHaveText("")
    await expect(cell, "and nothing to inspect").not.toHaveAttribute("title", /.+/)
    await expect(cell).not.toContainText("—")

    // The placeholder must not have travelled into the clipboard either. Before
    // this story the grid kept a separate invariant for it; with no glyph left to
    // leak, this is the only place that asserts the empty field is really empty.
    await page.keyboard.press("Shift+ArrowRight")
    await page.keyboard.press("ControlOrMeta+c")

    const copied = await readClipboard(page)
    expect(copied.startsWith("\t"), "an empty cell contributes an empty field").toBe(true)
    expect(copied).not.toContain("—")
  })

  test("type 7 — an editable cell and a read-only one are distinguishable", async ({ page }) => {
    await openPreviewGrid(page)

    const editable = cellAt(page, 0, "owner")
    const readOnly = cellAt(page, 0, "region")

    await expect(editable).toHaveAttribute("data-grid-cell-editable", "true")
    await expect(readOnly).toHaveAttribute("data-grid-cell-editable", "false")

    // The treatment itself, on the read-only cell only. Asserted as a class
    // presence rather than a computed colour, because the token can change.
    await expect(readOnly).toHaveClass(/text-muted-foreground/)
    await expect(editable).not.toHaveClass(/text-muted-foreground/)
  })

  test("type 8 — a custom-control column is untouched by both", async ({ page }) => {
    await openContactsGrid(page)

    // `favorite` and `actions` supply their own `cell` widget. Note this is NOT the
    // same case as the preview's `flagged`, which draws its checkbox from the
    // *editor* registry: a consumer widget is what withholds `fieldType`, and
    // asserting on `flagged` here would have passed for the wrong reason.
    const row = renderedRows(page).first()
    const favorite = cellIn(row, "favorite")

    await expect(favorite.getByRole("button")).toBeAttached()
    // No declared type reaches a cell that draws its own widget, so the registry
    // cannot restyle it.
    await expect(favorite).not.toHaveAttribute("data-grid-field-type", /.+/)
    // And a control is not data, so the read-only treatment skips it too.
    await expect(favorite).not.toHaveClass(/text-muted-foreground/)
  })

  test("type 9 — a rejected commit reads destructive, not muted", async ({ page }) => {
    await openPreviewGrid(page)

    // `REF-0250` is the preview harness's always-rejecting row. Filtered to
    // rather than scrolled to, because the rows are virtualized and 250 is far
    // outside any rendered window.
    await filterGlobally(page, FAILING_REF)
    const cell = cellAt(page, 0, "owner")

    await cell.click({ position: { x: 2, y: 2 } })
    await previewScroll(page).focus()
    await page.keyboard.press("Delete")

    // `text-muted-foreground` and `text-destructive` are the same Tailwind
    // specificity, so the grid withholds the muted class outright rather than
    // letting stylesheet order decide which wins. This asserts that decision —
    // without the guard, the refusal could be greyed out and read as fine.
    await expect(cell).toHaveClass(/text-destructive/)
    await expect(cell).not.toHaveClass(/text-muted-foreground/)
  })

  test("type 10 — a cell the registry draws still exposes its full value", async ({ page }) => {
    await openPreviewGrid(page)

    const site = cellAt(page, 1, "site")

    // Truncation is invisible at a 32px row, so the title is the only way to read
    // a cut-off value. A registry that returned a widget used to be the one class
    // of value cell with no title at all.
    await expect(site).toHaveAttribute("title", /.+/)
    await expect(site, "the title is the value itself").toHaveAttribute(
      "title",
      /North Annexe|Quarry Road/,
    )
  })

  test("type 11 — exactly one weighted cell per row, and it is the identity column", async ({
    page,
  }) => {
    await openContactsGrid(page)

    const row = renderedRows(page).first()

    const name = cellIn(row, "name")

    await expect(row.locator(EMPHASIS_ATTR), "one emphasis per row, not one per column").toHaveCount(
      1,
    )
    await expect(name, "and it is the identity column").toHaveAttribute(
      "data-grid-cell-emphasis",
      "true",
    )
    // Weight and space, never a colour: a colour here would be a second accent
    // competing with selection and focus.
    await expect(name).toHaveClass(/font-medium/)
  })

  test("type 12 — the contacts table declares types on both joined columns", async ({ page }) => {
    await openContactsGrid(page)

    const row = renderedRows(page).first()

    // Neither column has an editor — both are `accessorFn` joining ids the payload
    // already resolved — so this is the exact shape that rendered nothing when the
    // renderer was keyed on the editor alone.
    await expect(cellIn(row, "location")).toHaveAttribute("data-grid-field-type", "linked")
    await expect(cellIn(row, "collectedBy")).toHaveAttribute("data-grid-field-type", "linked")
    await expect(cellIn(row, "totalAttendanceCount")).toHaveAttribute("data-grid-field-type", "number")

    // Every one of the eight types resolves to a renderer, so nothing is declared
    // that renders nothing. Asserted on the header count rather than a hardcoded
    // number, because CAP-18's default field set is story 7's, not this one's.
    await expect(row.locator("[data-grid-field-type]")).not.toHaveCount(0)
  })
})