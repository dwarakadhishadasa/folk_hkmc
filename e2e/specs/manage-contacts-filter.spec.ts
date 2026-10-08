/**
 * Matrix rows 17, 18 and 19 — filtering, sorting against a committed edit, and
 * the empty scope.
 *
 * | Row | Scenario            | Expected                                                                    |
 * | --- | ------------------- | --------------------------------------------------------------------------- |
 * | 17  | Location filter     | narrows to rows whose joined location names contain the text; combines with the global filter; round-trips via `f.location`; never throws on a stale column id |
 * | 18  | Sort after edit     | ordering uses the committed value, not the pre-edit value                     |
 * | 19  | Zero rows in scope  | the `No records` panel; no header checkbox interaction                        |
 *
 * Row 17's expected count is computed from the fixture data rather than read back
 * from the grid, so the assertion is "the filter produced exactly the rows the
 * joined names imply" and not "the grid agrees with itself".
 *
 * Row 19 needs a genuinely empty scope, which no session has on a populated
 * database. It is produced by reassigning the rows assigned to the Admin onto the
 * Preacher, reading `/manage?mode=preacher` as the Admin — where the app-layer
 * narrowing leaves nothing — and putting them back in a `finally`, with the
 * restoration verified rather than assumed.
 *
 * The blast radius is **every folk contact assigned to the Admin**, seeded and
 * generated alike, not only the `preview-fixture-bulk-` rows: an Admin in
 * preacher-mode scope sees exactly the rows assigned to them, and filtering the
 * reassignment to the generated set would leave the seeded row behind and the
 * scope non-empty. Both are tagged `preview-fixture-` rows that
 * `pnpm seed:local --wipe` owns, so restoring them matters.
 */

import { expect, test } from "@playwright/test"

import { adminId, bulkFixtureClient, contactsByLocationName, listBulkContacts, preacherId } from "../fixtures/bulk-contacts"
import {
  cellIn,
  expectVisibleCount,
  filterGlobally,
  headerCell,
  manageContactsUrl,
  openContactsGrid,
  readContactNames,
  renderedRows,
  restoreContactNames,
} from "../fixtures/manage-grid"

/** One of the five generated locations, addressed by the fragment that is unique to it. */
const LOCATION_NEEDLE = "bulk-location-3"

/** Global-filter needle covering roughly a hundred generated rows. */
const BROAD_NEEDLE = "preview-fixture-bulk-folk-01"

/** The name the row under test is renamed to; sorts ahead of every other row. */
const SORTS_FIRST_NAME = "preview-fixture-bulk-folk-0000-AAA-Zero"

/** Ids of every contact in `program` assigned to `staffId`. */
async function contactsAssignedTo(staffId: string): Promise<Array<{ id: string }>> {
  const db = bulkFixtureClient()
  const { data, error } = await db.from("contacts").select("id").eq("program_id", "folk").eq("assigned_preacher_id", staffId)

  if (error) throw new Error(`Reading contacts assigned to ${staffId} failed: ${error.message}`)
  return (data ?? []) as Array<{ id: string }>
}

test.describe("filtering, sorting and the empty scope", () => {
  test("row 17 — the location column filter narrows on the joined name and combines with the global filter", async ({ page }) => {
    const groups = await contactsByLocationName("folk")
    const matching = groups.filter((group) => group.locationName.includes(LOCATION_NEEDLE))

    expect(matching.length, `the generated set must offer a location matching "${LOCATION_NEEDLE}"`).toBeGreaterThan(0)

    // The expected count is the **intersection** of the two filters, because both
    // are active when the assertion runs. Deriving it from the location filter
    // alone would overcount, and the row's count assertion would then be wrong by
    // however many matching rows the global filter excludes.
    const matchingIds = new Set(matching.flatMap((group) => group.contacts.map((contact) => contact.id)))
    const rows = await listBulkContacts("folk")
    const nameById = new Map(rows.map((row) => [row.id, row.name]))
    const expected = new Set(
      [...matchingIds].filter((id) => (nameById.get(id) ?? "").includes(BROAD_NEEDLE)),
    )

    expect(expected.size, "a filter with a single expected count proves nothing").toBeGreaterThan(5)

    await openContactsGrid(page)

    // Narrow with the global filter first, so the per-column filter has to work
    // on top of another filter rather than on the whole set.
    const broadVisible = await filterGlobally(page, BROAD_NEEDLE)
    expect(broadVisible).toBeGreaterThan(expected.size)

    // The header's own filter control, not a URL written by hand.
    await headerCell(page, "location").getByRole("button", { name: /^Filter Location$/ }).click()
    // The popover trigger carries the same accessible name as the input it labels,
    // so the role is what disambiguates the field from the button that opened it.
    const columnFilter = page.getByRole("textbox", { name: "Filter Location" })
    await expect(columnFilter).toBeVisible()

    // Typed rather than filled, for the reason `filterGlobally` documents: a
    // `fill` can leave React's state untouched while the input *looks* filled.
    await columnFilter.click()
    await columnFilter.pressSequentially(LOCATION_NEEDLE)

    await expect
      .poll(() => new URL(page.url()).searchParams.get("f.location"), {
        message: "the per-column filter must reach the URL before the count is read",
      })
      .toBe(LOCATION_NEEDLE)

    // Exactly the rows whose joined location names contain the text, on top of
    // the global filter that is still active.
    await expectVisibleCount(page, expected.size)
    // Every rendered cell shows a location the needle matched, and no cell shows a
    // raw id — a stale `location_ids` entry would degrade to a UUID here.
    const rendered = renderedRows(page)
    expect(await rendered.count()).toBeGreaterThan(0)
    const locationCells = await rendered.locator('[data-grid-cell$="~location"]').allInnerTexts()
    for (const cell of locationCells) {
      expect(cell).toContain(LOCATION_NEEDLE)
      expect(cell, "a raw uuid means the location name did not resolve").not.toMatch(/^[0-9a-f-]{36}$/)
    }

    // Clearing it restores the broader view, which is what makes the control a
    // filter rather than a one-way narrowing.
    await columnFilter.click()
    await columnFilter.press("ControlOrMeta+a")
    await columnFilter.press("Backspace")
    await expectVisibleCount(page, broadVisible)
    await expect
      .poll(() => new URL(page.url()).searchParams.get("f.location"), {
        message: "clearing the per-column filter must drop f.location from the URL",
      })
      .toBeNull()
  })

  test("row 17 (error handling) — a stale column filter id renders instead of throwing", async ({ page }) => {
    const pageErrors: string[] = []
    page.on("pageerror", (error) => pageErrors.push(error.message))

    // `f.ghost` names a column that does not exist — the shape a link written by
    // an older build leaves behind.
    await openContactsGrid(page, { params: { "f.ghost": "zzz" } })

    await expect(page.locator('tbody[data-grid-panel="ready"]')).toBeAttached()
    await expect(renderedRows(page).first()).toBeVisible()
    expect(pageErrors, "a stale column id must not throw").toEqual([])
  })

  test("row 18 — sorting by name uses the committed value, not the pre-edit value", async ({ page }) => {
    await openContactsGrid(page)

    // The row is chosen by its rendered position rather than by index, because the
    // rows are virtualized and payload order is not index order — the seeded rows
    // are interleaved with the generated ones.
    const target = renderedRows(page).nth(2)
    await expect(target).toBeVisible()

    const editedId = (await target.getAttribute("data-grid-row")) ?? ""
    expect(editedId, "the row under test must carry a stable id").not.toBe("")

    const nameBefore = await cellIn(target, "name").innerText()
    expect(nameBefore, "row 18 needs the edited row to start somewhere else").not.toBe(SORTS_FIRST_NAME)

    const originalNames = await readContactNames([editedId])
    expect(originalNames.get(editedId), "the row under test must exist in the database").toBe(nameBefore)

    try {
      await cellIn(target, "name").click()
      await page.keyboard.press("e")
      await expect(page.getByRole("textbox", { name: "Edit cell value" })).toBeFocused()
      await page.keyboard.type(SORTS_FIRST_NAME)
      await page.keyboard.press("Enter")

      await expect
        .poll(async () => (await readContactNames([editedId])).get(editedId), {
          message: "the rename must commit before the sort can be judged",
        })
        .toBe(SORTS_FIRST_NAME)

      // Now sort. The renamed row sorts ahead of index 0000 and ahead of the seeded
      // rows even though it was third in payload order — which can only be true if
      // the sort read the committed value rather than the pre-edit one.
      await headerCell(page, "name").getByRole("button", { name: "Sort by Name" }).click()

      await expect(headerCell(page, "name")).toHaveAttribute("aria-sort", "ascending")
      await expect
        .poll(() => new URL(page.url()).searchParams.get("sort"), { message: "sorting must round-trip via sort" })
        .toBe("name:asc")

      await expect(cellIn(renderedRows(page).first(), "name")).toHaveText(SORTS_FIRST_NAME)
      await expect(renderedRows(page).first()).toHaveAttribute("data-grid-row", editedId)

      // And the rest of the window is in alphabetical order, not payload order.
      const window = await renderedRows(page).evaluateAll((elements) =>
        elements.map((element) => element.querySelector('[data-grid-cell$="~name"]')?.textContent ?? ""),
      )
      expect(window.length).toBeGreaterThan(3)
      expect(window, `rendered names must be sorted: ${JSON.stringify(window.slice(0, 5))}`).toEqual(
        [...window].sort(),
      )
    } finally {
      await restoreContactNames(originalNames)
    }
  })

  test("row 19 — an empty scope renders the No records panel and no usable header checkbox", async ({ page }) => {
    const admin = await adminId("folk")
    const preacher = await preacherId("folk")

    // Preacher-mode scope for this Admin is exactly "rows assigned to me", so
    // moving those rows onto the Preacher empties it without touching a row any
    // other spec selects from.
    const moved = await contactsAssignedTo(admin)
    expect(moved.length, "the Admin must have some rows, or this row proves nothing").toBeGreaterThan(0)

    const db = bulkFixtureClient()
    try {
      const { error } = await db
        .from("contacts")
        .update({ assigned_preacher_id: preacher })
        .in("id", moved.map((row) => row.id))
      if (error) throw new Error(`Emptying the Admin's preacher-mode scope failed: ${error.message}`)

      await page.goto(manageContactsUrl({ mode: "preacher" }))

      await expect(page.locator('tbody[data-grid-panel="empty:no-records"]')).toBeAttached()
      await expect(page.getByText("No records")).toBeVisible()
      await expect(renderedRows(page), "an empty scope renders no rows").toHaveCount(0)

      // "No header checkbox interaction": the control is present and disabled, so
      // there is nothing to select and nothing to act on.
      const headerCheckbox = headerCell(page, "select").getByRole("checkbox")
      await expect(headerCheckbox).toBeDisabled()
      await expect(headerCheckbox).toHaveAttribute("data-state", "unchecked")
      await headerCheckbox.click({ force: true, timeout: 2_000 }).catch(() => undefined)
      await expect(headerCheckbox).toBeDisabled()

      // The selection count agrees there is nothing to select.
      await expect(page.locator("[data-bulk-selection-count]")).toHaveText("0 selected")
      await expect(page.getByRole("button", { name: /Add selected to favorites/ })).toBeDisabled()
    } finally {
      const { error } = await db
        .from("contacts")
        .update({ assigned_preacher_id: admin })
        .in("id", moved.map((row) => row.id))
      if (error) throw new Error(`Restoring the Admin's preacher-mode scope failed: ${error.message}`)

      // The restoration is verified, not assumed: a spec that leaves the shared
      // fixtures scoped differently makes every later run's preconditions a lie.
      const backWithAdmin = new Set((await contactsAssignedTo(admin)).map((row) => row.id))
      const notRestored = moved.map((row) => row.id).filter((id) => !backWithAdmin.has(id))
      expect(
        notRestored,
        `the ${notRestored.length} moved row(s) must be assigned back to the Admin`,
      ).toEqual([])
    }
  })

  test("row 19 (neighbouring panel) — a filter that matches nothing is a different panel", async ({ page }) => {
    await openContactsGrid(page)
    await filterGlobally(page, "no-such-contact-name-anywhere")

    // The distinction row 19 depends on: filtering everything away is
    // `no-matches`, while an empty scope is `no-records`. A spec that asserted
    // only "the grid is empty" could not tell them apart.
    await expect(page.locator('tbody[data-grid-panel="empty:no-matches"]')).toBeAttached()
    await expect(page.getByText("No rows match the current filters")).toBeVisible()
  })
})
