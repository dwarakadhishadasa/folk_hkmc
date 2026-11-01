/**
 * Matrix rows 6, 7, 8 and 12 — row selection, and what an empty selection does.
 *
 * | Row | Scenario                   | Expected                                                              |
 * | --- | -------------------------- | --------------------------------------------------------------------- |
 * | 6   | Multi-row selection        | header checkbox on a filtered set selects every filtered row; each shows `data-state="selected"` |
 * | 7   | Indeterminate header       | 3 of 40+ rows selected → the header control shows the mixed state and names the count |
 * | 8   | Select-all then filter     | selection is retained across filtering; the count reflects selected rows, not visible rows |
 * | 12  | Bulk over an empty selection | the readout carries the record count, no request is issued, and no bulk action exists at all |
 *
 * All four run as the Preacher in the Contacts section's personal scope, where
 * the generated set puts 225 rows in view — comfortably above row 7's
 * "3 of 40". Row 6 and row 8 narrow with the global filter rather than
 * scrolling, because the rows are virtualized and the toolbar's
 * `visible of total in scope` readout is the only count that is not a function
 * of the viewport.
 *
 * **What changed in row 12, and why the claim did not.** The claim was always
 * "an empty selection issues no request"; the mechanism behind it is not. The
 * selection readout moved out of the contextual band into the status row below
 * the grid — the reference implementation's footer pattern: a strip under the
 * scroll area that never scrolls away, with the record count at its left and
 * each number field's total under its own column. The readout is therefore
 * always in the frame, and an empty selection asserts that it carries the
 * record count while the selection count is the thing that appears. Recording
 * that here is the point: a green run of the old assertions would have proved
 * the old contract, and a reader needs to know the mechanism changed.
 * `matrix-coverage-map.md` row 12 carries the same note.
 */

import { expect, test, type Locator, type Page } from "@playwright/test"

import { bulkFixtureClient, preacherId } from "../fixtures/bulk-contacts"
import { e2eProgramId, storageStatePath } from "../fixtures/roles"
import {
  expectVisibleCount,
  filterGlobally,
  gridRoot,
  gridScrollSurface,
  headerCell,
  headerSelectAll,
  inScopeCounts,
  openContactsGrid,
  renderedRows,
  statusAggregate,
  statusCount,
  statusFooter,
  statusFooterCell,
  statusFooterScroll,
} from "../fixtures/manage-grid"

test.use({ storageState: storageStatePath("preacher") })

/**
 * Row 7's own minimum, from the matrix text "3 of 40 rows selected".
 *
 * Row 7 means nothing with fewer than 40 rows in scope: "3 of 40" is the
 * matrix's own wording, and a mixed header over three visible rows is a
 * different state.
 */
const MIN_ROWS_FOR_MIXED = 40

/**
 * Nine generated rows, indexes 0240–0248.
 *
 * `-000` used to match exactly ten because the index was zero-padded into the
 * *name*. It no longer is — the generator writes real names and tags rows in
 * `source` (`bulk-contacts.ts:70`) — so the old needle matched nothing.
 *
 * `phone` carries the index instead: `PHONE_PREFIX` plus eight zero-padded
 * digits (`bulk-contact-fixtures.mjs:441`), making `810000024` exactly indexes
 * 0240–0249 at the default `--count 250`. Index 0249 is out of the Preacher's
 * scope by the generator's every-tenth rule, so the personal scope sees nine.
 * The low band is unusable: index 0000 has no phone, because `phoneFor`
 * returns `""` there so that a `UNIQUE (phone, program_id)` index still
 * permits one phone-less contact.
 */
const TEN_ROWS = "810000024"
const FILTERED_ROWS = 9

/** The two number fields the status row totals, by column id. */
const TOTAL_ATTENDANCE_COLUMN = "totalAttendanceCount"
const PAST_60_COLUMN = "past60DayAttendanceCount"

/** How far two horizontally-centred boxes may disagree before it is drift. */
const CENTRE_TOLERANCE_PX = 1

/** Click the checkbox on the nth rendered row, in viewport order. */
async function selectRenderedRow(page: Page, index: number): Promise<void> {
  await renderedRows(page).nth(index).getByRole("checkbox").click()
}

/** Every rendered row's selection state, in DOM order. */
async function selectionStates(rows: Locator): Promise<Array<string | null>> {
  return rows.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-state")))
}

/** The ids of the rows currently rendered, in viewport order. */
async function renderedIds(page: Page): Promise<string[]> {
  const ids = await renderedRows(page).evaluateAll((rows) =>
    rows.map((row) => row.getAttribute("data-grid-row") ?? "").filter(Boolean),
  )

  return ids
}

/**
 * Every contact in the Preacher's personal scope — the set the section payload
 * resolves, and therefore the set the status row totals at rest.
 *
 * Not `inScopeContacts`: that is the generated subset rows 6–8 select from, and
 * summing the bar against a subset would fail on a correct bar. The seeded
 * contact assigned to the Preacher is in the payload too.
 */
async function programContactIds(): Promise<string[]> {
  const staffId = await preacherId(e2eProgramId())
  const { data, error } = await bulkFixtureClient()
    .from("contacts")
    .select("id")
    .eq("program_id", e2eProgramId())
    .eq("assigned_preacher_id", staffId)

  if (error) throw new Error(`Reading program contacts failed: ${error.message}`)

  return ((data ?? []) as Array<{ id: string }>).map((row) => row.id)
}

/**
 * The attendance rollups for the given rows, read from the view the server reads.
 *
 * `contact_attendance_counts` is the payload's own source, so this is the value
 * the bar must equal — a second client-side sum of what the UI happens to show
 * would let the bar and the spec drift together.
 */
async function rollupSums(ids: readonly string[]): Promise<{ total: number; past60: number }> {
  // Chunked: 226 ids in one `.in()` list blows PostgREST's URI length limit,
  // and the failure arrives as a 414-shaped error rather than data.
  const CHUNK = 50
  let total = 0
  let past60 = 0

  for (let at = 0; at < ids.length; at += CHUNK) {
    const { data, error } = await bulkFixtureClient()
      .from("contact_attendance_counts")
      .select("contact_id,total_attendance_count,past_60_day_attendance_count")
      .in("contact_id", [...ids.slice(at, at + CHUNK)])

    if (error) throw new Error(`Reading attendance rollups failed: ${error.message}`)

    for (const row of (data ?? []) as Array<{
      contact_id: string
      total_attendance_count: number | null
      past_60_day_attendance_count: number | null
    }>) {
      total += row.total_attendance_count ?? 0
      past60 += row.past_60_day_attendance_count ?? 0
    }
  }

  return { total, past60 }
}

/** A box's horizontal centre, the coordinate "under its field" is measured in. */
async function centreX(locator: Locator): Promise<number> {
  const box = await locator.boundingBox()

  if (!box) throw new Error("Expected a laid-out element with a bounding box.")

  return box.x + box.width / 2
}

test.describe("row selection", () => {
  test("row 6 — the header checkbox selects every row of a filtered set", async ({ page }) => {
    await openContactsGrid(page)
    await filterGlobally(page, TEN_ROWS)
    await expectVisibleCount(page, FILTERED_ROWS)

    const { total } = await inScopeCounts(page)

    // Nothing selected yet, so the mixed state is not what makes this pass — and
    // the status row reads the record count at rest, which is the state below.
    await expect(statusCount(page), "at rest the readout is the record count").toHaveText(`${total} records`)
    await expect(headerSelectAll(page)).toHaveAttribute("data-state", "unchecked")

    await headerSelectAll(page).click()

    await expect(statusCount(page)).toHaveText(`${FILTERED_ROWS} selected`)
    await expect(headerSelectAll(page)).toHaveAttribute("data-state", "checked")

    const rows = renderedRows(page)
    await expect(rows, "every filtered row must be rendered for this assertion to mean anything").toHaveCount(FILTERED_ROWS)

    // `data-state` is what `grid-row.tsx` keys the selected surface off, so this
    // is the visual indication itself rather than a proxy for it.
    expect(await selectionStates(rows), "every filtered row must show the selected state").toEqual(
      Array<string | null>(FILTERED_ROWS).fill("selected"),
    )

    // Toggling back off clears them, which is what makes the control a control
    // rather than a one-way switch — and the readout swaps back to the record
    // count rather than reading a `0`.
    await headerSelectAll(page).click()
    await expect(statusCount(page)).toHaveText(`${total} records`)
    expect(await selectionStates(renderedRows(page))).toEqual(Array<string | null>(FILTERED_ROWS).fill(null))
  })

  test("row 7 — a partial selection renders the header mixed and names the count", async ({ page }) => {
    await openContactsGrid(page)

    const { total } = await inScopeCounts(page)
    expect(
      total,
      `row 7 needs at least ${MIN_ROWS_FOR_MIXED} rows in scope for "3 of 40" to mean anything`,
    ).toBeGreaterThanOrEqual(MIN_ROWS_FOR_MIXED)

    // Nothing selected yet, so the mixed state asserted below cannot be what
    // makes this pass — at rest the readout carries the whole record count.
    await expect(statusCount(page)).toHaveText(`${total} records`)

    for (const index of [0, 1, 2]) {
      await selectRenderedRow(page, index)
    }

    await expect(statusCount(page)).toHaveText("3 selected")

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
    await expect(statusCount(page)).toHaveText(`${total} selected`)
    await expect(headerSelectAll(page)).toHaveAttribute("data-state", "checked")
  })

  test("row 8 — selection survives filtering, and the count is of selected rows", async ({ page }) => {
    await openContactsGrid(page)

    const { total } = await inScopeCounts(page)
    await headerSelectAll(page).click()
    await expect(statusCount(page)).toHaveText(`${total} selected`)

    // Narrow the global filter. Selection is per-visit state, so the rows that
    // remain visible must still be selected…
    await filterGlobally(page, TEN_ROWS)
    await expectVisibleCount(page, FILTERED_ROWS)

    const rows = renderedRows(page)
    await expect(rows).toHaveCount(FILTERED_ROWS)
    expect(await selectionStates(rows)).toEqual(Array<string | null>(FILTERED_ROWS).fill("selected"))

    // …and the count must still describe the whole selection, not the nine rows
    // that happen to be on screen. Reading it as nine is the bug this row names.
    await expect(statusCount(page)).toHaveText(`${total} selected`)

    // The header control describes the rows in view, so with all nine selected it
    // is checked rather than mixed — the two counts are deliberately different.
    await expect(headerSelectAll(page)).toHaveAttribute("data-state", "checked")
    await expect(headerSelectAll(page)).toHaveAttribute(
      "aria-label",
      /^Select all rows in view \(9 of 9 in view selected\)$/,
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

  test("row 12 — an empty selection reads the record count, offers no action, and issues no request", async ({
    page,
  }) => {
    const bulkRequests: string[] = []
    page.on("request", (request) => {
      if (request.url().includes("/api/manage/contacts/bulk")) {
        bulkRequests.push(`${request.method()} ${request.url()}`)
      }
    })

    await openContactsGrid(page)
    const { total } = await inScopeCounts(page)

    // **The readout is always in the frame** — the status row sits below the
    // scroll area, so it renders at rest too, carrying the record count. What an
    // empty selection protects is the *request*: with no bulk action anywhere on
    // the page, an empty selection cannot be dispatched at all.
    await expect(statusCount(page), "at rest the readout is the record count").toHaveText(`${total} records`)
    await expect(
      page.getByRole("button", { name: /Add selected to favorites/ }),
      "no bulk action may be offered anywhere",
    ).toHaveCount(0)

    // Polled rather than asserted synchronously: a request issued a tick later
    // would otherwise slip past the check.
    await expect
      .poll(() => bulkRequests, { timeout: 2_000, message: "an empty selection must issue no request" })
      .toEqual([])
    await expect(gridRoot(page)).toBeVisible()
    await expect(page.getByRole("region", { name: "Bulk action results" })).toHaveCount(0)

    // One row selected is the other half of the row: the readout swaps to the
    // selection, so the count above is a function of the selection and not of a
    // readout that never changes.
    await selectRenderedRow(page, 0)
    await expect(statusCount(page)).toHaveText("1 selected")
  })

  test("status row — the totals sit under their fields, below the rows, and follow the selection", async ({
    page,
  }) => {
    await openContactsGrid(page)
    const { total } = await inScopeCounts(page)
    await expect(statusCount(page)).toHaveText(`${total} records`)

    // **Below the scroll area, inside the grid frame.** Placement is the whole
    // reason the row exists — it must be the grid frame's own footer, directly
    // under the scroll container, or rows that scroll take it away.
    await expect
      .poll(async () =>
        statusFooter(page).evaluate((bar) => {
          const parent = bar.parentElement
          const sibling = bar.previousElementSibling

          return {
            inFrame: parent?.getAttribute("data-grid-root") !== null,
            underScroller: sibling?.getAttribute("data-grid-scroll") !== null,
          }
        }),
      )
      .toEqual({ inFrame: true, underScroller: true })

    // The totals equal the server's own rollup sums over every row in scope —
    // the same value the payload resolves, read from its source rather than
    // re-summed from what the grid happens to render.
    const expected = await rollupSums(await programContactIds())
    await expect(statusAggregate(page, TOTAL_ATTENDANCE_COLUMN)).toHaveText(
      `Sum ${expected.total.toLocaleString("en-IN")}`,
    )
    await expect(statusAggregate(page, PAST_60_COLUMN)).toHaveText(
      `Sum ${expected.past60.toLocaleString("en-IN")}`,
    )

    // **Exactly under their fields.** Measured as centres rather than edges: the
    // cells carry the same widths as their columns, so a centre that has drifted
    // is a bar that has come loose from the grid it belongs to.
    for (const columnId of [TOTAL_ATTENDANCE_COLUMN, PAST_60_COLUMN]) {
      const [headerCentre, totalCentre] = [
        await centreX(headerCell(page, columnId)),
        await centreX(statusFooterCell(page, columnId)),
      ]

      expect(
        Math.abs(headerCentre - totalCentre),
        `the ${columnId} total must sit under its own column`,
      ).toBeLessThanOrEqual(CENTRE_TOLERANCE_PX)
    }

    // The readout sits under the identity column, the one column that is frozen,
    // so it stays put while the operator works in the fields to the right.
    const [nameCentre, readoutCentre] = [
      await centreX(headerCell(page, "name")),
      await centreX(statusFooterCell(page, "name")),
    ]
    expect(Math.abs(nameCentre - readoutCentre)).toBeLessThanOrEqual(CENTRE_TOLERANCE_PX)

    // Select rows and the whole basis swaps: count and totals both describe the
    // selection, never the scope total beside a selection count.
    await selectRenderedRow(page, 0)
    await selectRenderedRow(page, 1)
    await expect(statusCount(page)).toHaveText("2 selected")

    const selected = await rollupSums((await renderedIds(page)).slice(0, 2))
    await expect(statusAggregate(page, TOTAL_ATTENDANCE_COLUMN)).toHaveText(
      `Sum ${selected.total.toLocaleString("en-IN")}`,
    )
    await expect(statusAggregate(page, PAST_60_COLUMN)).toHaveText(
      `Sum ${selected.past60.toLocaleString("en-IN")}`,
    )
  })

  test("status row — vertical scroll keeps it on screen and horizontal scroll keeps it aligned", async ({ page }) => {
    await openContactsGrid(page)
    await expect(renderedRows(page).first(), "rows must be rendered for the scroll to mean anything").toBeVisible()

    const barBefore = await statusFooter(page).boundingBox()
    expect(barBefore, "the status row must be laid out").not.toBeNull()

    // **Vertical: the rows move, the row stays.** Scrolled to the very bottom
    // of the row set, the bar is still on screen and still at its place.
    await gridScrollSurface(page).evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await expect
      .poll(async () => (await statusFooter(page).boundingBox())?.y, { message: "the bar must not move" })
      .toBeCloseTo(barBefore?.y ?? -1, 1)

    const scrolledRows = await renderedIds(page)
    expect(scrolledRows.length, "the rows must really have scrolled for the claim to mean anything").toBeGreaterThan(0)

    // **Horizontal, from the grid: the totals track their fields.** Scrolling
    // the grid moves both the header and the bar by the same delta.
    const headerBefore = await centreX(headerCell(page, TOTAL_ATTENDANCE_COLUMN))
    await gridScrollSurface(page).evaluate((element) => {
      element.scrollLeft = 240
    })
    await expect
      .poll(
        async () => {
          const [headerCentre, totalCentre] = [
            await centreX(headerCell(page, TOTAL_ATTENDANCE_COLUMN)),
            await centreX(statusFooterCell(page, TOTAL_ATTENDANCE_COLUMN)),
          ]
          return Math.abs(headerCentre - totalCentre)
        },
        { message: "the total must stay under its column however far right the grid is scrolled" },
      )
      .toBeLessThanOrEqual(CENTRE_TOLERANCE_PX)
    expect(await centreX(headerCell(page, TOTAL_ATTENDANCE_COLUMN))).toBeLessThan(headerBefore)

    // **Horizontal, from the bar: the grid follows.** A strip the operator
    // cannot scroll is a strip that answers to only half of the gestures, so
    // scrolling the strip drags the grid along with it.
    await statusFooterScroll(page).evaluate((element) => {
      element.scrollLeft = 60
    })
    await expect
      .poll(async () => gridScrollSurface(page).evaluate((element) => element.scrollLeft), {
        message: "scrolling the bar must scroll the grid",
      })
      .toBe(60)

    // The readout is under the frozen identity column, so it survives the scroll
    // — a count that disappears is not a count.
    await expect(statusCount(page)).toBeInViewport()
  })
})
