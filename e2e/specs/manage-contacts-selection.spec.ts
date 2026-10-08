/**
 * Matrix rows 6, 7, 8 and 12 — row selection, and what an empty selection does.
 *
 * | Row | Scenario                   | Expected                                                              |
 * | --- | -------------------------- | --------------------------------------------------------------------- |
 * | 6   | Multi-row selection        | header checkbox on a filtered set selects every filtered row; each shows `data-state="selected"` |
 * | 7   | Indeterminate header       | 3 of 40+ rows selected → the header control shows the mixed state and names the count |
 * | 8   | Select-all then filter     | selection is retained across filtering; the count reflects selected rows, not visible rows |
 * | 12  | Bulk over an empty selection | the action is inert and no request is issued                          |
 *
 * All four run as the Admin in admin scope, where the generated set puts 250 rows
 * in view — comfortably above row 7's "3 of 40". Row 6 and row 8 narrow with the
 * global filter rather than scrolling, because the rows are virtualized and the
 * toolbar's `visible of total in scope` readout is the only count that is not a
 * function of the viewport.
 */

import { expect, test, type Locator, type Page } from "@playwright/test"

import {
  bulkActionButton,
  expectVisibleCount,
  filterGlobally,
  gridRoot,
  headerSelectAll,
  inScopeCounts,
  openContactsGrid,
  renderedRows,
  selectionCount,
} from "../fixtures/manage-grid"

/**
 * Row 7's own minimum, from the matrix text "3 of 40 rows selected".
 *
 * Row 7 means nothing with fewer than 40 rows in scope: "3 of 40" is the matrix's
 * own wording, and a mixed header over three visible rows is a different state.
 */
const MIN_ROWS_FOR_MIXED = 40

/**
 * Ten generated rows, indices 0000–0009.
 *
 * `-000` matches exactly ten of the 250 because the index is zero-padded to four
 * digits, so `-0010-` cannot be confused with `-0010` — the needle is safe.
 */
const TEN_ROWS = "preview-fixture-bulk-folk-000"

/** Click the checkbox on the nth rendered row, in viewport order. */
async function selectRenderedRow(page: Page, index: number): Promise<void> {
  await renderedRows(page).nth(index).getByRole("checkbox").click()
}

/** Every rendered row's selection state, in DOM order. */
async function selectionStates(rows: Locator): Promise<Array<string | null>> {
  return rows.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-state")))
}

test.describe("row selection", () => {
  test("row 6 — the header checkbox selects every row of a filtered set", async ({ page }) => {
    await openContactsGrid(page)
    await filterGlobally(page, TEN_ROWS)
    await expectVisibleCount(page, 10)

    // Nothing selected yet, so the mixed state is not what makes this pass.
    await expect(headerSelectAll(page)).toHaveAttribute("data-state", "unchecked")

    await headerSelectAll(page).click()

    await expect(selectionCount(page)).toHaveText("10 selected")
    await expect(headerSelectAll(page)).toHaveAttribute("data-state", "checked")

    const rows = renderedRows(page)
    await expect(rows, "all ten filtered rows must be rendered for this assertion to mean anything").toHaveCount(10)

    // `data-state` is what `grid-row.tsx` keys the selected surface off, so this
    // is the visual indication itself rather than a proxy for it.
    expect(await selectionStates(rows), "every filtered row must show the selected state").toEqual(
      Array<string | null>(10).fill("selected"),
    )

    // Toggling back off clears them, which is what makes the control a control
    // rather than a one-way switch.
    await headerSelectAll(page).click()
    await expect(selectionCount(page)).toHaveText("0 selected")
    expect(await selectionStates(renderedRows(page))).toEqual(Array<string | null>(10).fill(null))
  })

  test("row 7 — a partial selection renders the header mixed and names the count", async ({ page }) => {
    await openContactsGrid(page)

    const { total } = await inScopeCounts(page)
    expect(
      total,
      `row 7 needs at least ${MIN_ROWS_FOR_MIXED} rows in scope for "3 of 40" to mean anything`,
    ).toBeGreaterThanOrEqual(MIN_ROWS_FOR_MIXED)

    await expect(selectionCount(page)).toHaveText("0 selected")

    for (const index of [0, 1, 2]) {
      await selectRenderedRow(page, index)
    }

    await expect(selectionCount(page)).toHaveText("3 selected")

    // Radix renders the mixed state as `data-state="indeterminate"` with
    // `aria-checked="mixed"`; the grid passes the state through untouched.
    await expect(headerSelectAll(page)).toHaveAttribute("data-state", "indeterminate")
    await expect(headerSelectAll(page)).toHaveAttribute("aria-checked", "mixed")

    // "names the count" is a separate clause from showing the mixed state, so it
    // is asserted separately rather than inferred from the state attribute.
    await expect(headerSelectAll(page)).toHaveAttribute(
      "aria-label",
      new RegExp(`^Select all rows in view \\(3 of ${total} in view selected\\)$`),
    )

    // Clicking it from the mixed state selects the whole view, which is the
    // other half of "renders the mixed state and names the count".
    await headerSelectAll(page).click()
    await expect(selectionCount(page)).toHaveText(`${total} selected`)
    await expect(headerSelectAll(page)).toHaveAttribute("data-state", "checked")
  })

  test("row 8 — selection survives filtering, and the count is of selected rows", async ({ page }) => {
    await openContactsGrid(page)

    const { total } = await inScopeCounts(page)
    await headerSelectAll(page).click()
    await expect(selectionCount(page)).toHaveText(`${total} selected`)

    // Narrow the global filter. Selection is per-visit state, so the rows that
    // remain visible must still be selected…
    await filterGlobally(page, TEN_ROWS)
    await expectVisibleCount(page, 10)

    const rows = renderedRows(page)
    await expect(rows).toHaveCount(10)
    expect(await selectionStates(rows)).toEqual(Array<string | null>(10).fill("selected"))

    // …and the count must still describe the whole selection, not the ten rows
    // that happen to be on screen. Reading it as 10 is the bug this row names.
    await expect(selectionCount(page)).toHaveText(`${total} selected`)

    // The header control describes the rows in view, so with all ten selected it
    // is checked rather than mixed — the two counts are deliberately different.
    await expect(headerSelectAll(page)).toHaveAttribute("data-state", "checked")
    await expect(headerSelectAll(page)).toHaveAttribute(
      "aria-label",
      /^Select all rows in view \(10 of 10 in view selected\)$/,
    )

    // Filtering is URL state, so the narrowed view is shareable — and selection
    // never appears in it.
    await expect
      .poll(() => new URL(page.url()).searchParams.get("q"), { message: "the filter must round-trip via q" })
      .toBe(TEN_ROWS)
    expect(new URL(page.url()).searchParams.toString(), "selection must never reach the URL").not.toContain(
      "rowSelection",
    )
  })

  test("row 12 — the bulk action is inert with nothing selected and issues no request", async ({ page }) => {
    const bulkRequests: string[] = []
    page.on("request", (request) => {
      if (request.url().includes("/api/manage/contacts/bulk")) {
        bulkRequests.push(`${request.method()} ${request.url()}`)
      }
    })

    await openContactsGrid(page)

    const button = bulkActionButton(page)
    await expect(selectionCount(page)).toHaveText("0 selected")
    await expect(button, "the action must not be offered at 0 selected").toBeDisabled()

    // `force` because a disabled control is exactly what is under test: the
    // point is that even a dispatched click changes nothing.
    await button.click({ force: true })
    await expect(button).toBeDisabled()

    // No request, and no report panel claiming one happened. Polled rather than
    // asserted synchronously: a request issued a tick later would otherwise slip
    // past the check.
    await expect
      .poll(() => bulkRequests, { timeout: 2_000, message: "an empty selection must issue no request" })
      .toEqual([])
    await expect(gridRoot(page)).toBeVisible()
    await expect(page.getByRole("region", { name: "Bulk action results" })).toHaveCount(0)

    // One row selected is the other half of the row: the control becomes live,
    // so the disabled state above is a function of the selection and not of the
    // control being permanently inert.
    await renderedRows(page).nth(0).getByRole("checkbox").click()
    await expect(button).toBeEnabled()
  })
})
