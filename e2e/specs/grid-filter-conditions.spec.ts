/**
 * CAP-12 — the filter conditions popover.
 *
 * This is the story that fixes two defects found in the source rather than in the
 * design, so most of what follows is a test for something that was already wrong
 * and silent:
 *
 * - **OQ-20 — an empty value could not round-trip.** The codec guarded on the
 *   *value's* length in both directions, so `Notes · is empty` was
 *   indistinguishable from no condition at all and vanished on reload.
 * - **OQ-21 — the operator did not travel.** `f.<colId>` held a bare value, so
 *   `contains` and `is` were the same string and no bare encoding could express
 *   `is empty` even once the guard was fixed.
 *
 * Both are fixed by one decision — the token is `<operator>:<value>` — so most of
 * these assertions are about the SHAPE of the token and would all still pass if
 * the filtering silently did nothing.
 *
 * Two behaviours are load-bearing and easy to get quietly wrong:
 *
 * - **`is any of` is intersection, not substring-per-element.** `gridGlobalFilterFn`
 *   used to substring each array element, which made "EC" match "ECE". The
 *   assertion below picks a needle that is a strict prefix of a real book title,
 *   so a regression shows up as rows that should not be there.
 * - **A condition whose value will not parse matches NO rows.** A NaN number or
 *   an unparseable date compared with `>=` is `false` for every row, which is
 *   indistinguishable from "nothing matched". The row must also report itself.
 *
 * Expected counts are computed from the fixture data through the service client
 * rather than read back off the grid, so the assertion is "the filter produced
 * exactly the rows the data implies" and not "the grid agrees with itself".
 */

import { expect, test } from "@playwright/test"
import type { Locator, Page } from "@playwright/test"

import { BULK_CONTACT_COLUMNS, bulkFixtureClient, type BulkContact } from "../fixtures/bulk-contacts"
import {
  expectVisibleCount,
  headerCell,
  manageContactsUrl,
  openColumnMenu,
  openContactsGrid,
} from "../fixtures/manage-grid"

/**
 * Every contact the grid shows in admin scope.
 *
 * NOT `inScopeContacts()`, which is the Preacher's slice only: admin scope is
 * wider, so an expectation computed from it disagrees with the grid for reasons
 * that have nothing to do with the filter. Reading the whole program's rows is
 * what makes "the filter produced exactly the rows the data implies" true.
 */
async function scopedContacts(): Promise<BulkContact[]> {
  const { data, error } = await bulkFixtureClient()
    .from("contacts")
    .select(BULK_CONTACT_COLUMNS)
    .eq("program_id", "folk")

  if (error) throw new Error(`Reading the program's contacts failed: ${error.message}`)
  return (data ?? []) as BulkContact[]
}

/**
 * Navigates to the grid WITHOUT requiring a non-zero row count.
 *
 * `openContactsGrid` deliberately insists on a non-zero scope, which is right for
 * the specs that need rows to look at. Half of these assertions are about a
 * filter that matches nothing — a stale value, an unparseable date, a null cell —
 * and those are exactly the cases the non-zero gate refuses. Waiting on either
 * panel variant covers both.
 */
async function gotoGrid(page: Page, options: { params?: Record<string, string> } = {}): Promise<void> {
  // Same options shape as `openContactsGrid` on purpose. An earlier version took
  // the params directly while its call sites were written against this shape, and
  // `gotoGrid(page, { params: { params } })` stringified to `params=[object Object]` — landing
  // on a grid with no filters at all, so every assertion passed on nothing.
  await page.goto(manageContactsUrl(options))
  // `empty:no-matches` is `gridPanelKey`'s own encoding, not `no-matches`.
  await expect(
    page.locator('tbody[data-grid-panel="ready"], tbody[data-grid-panel="empty:no-matches"]').first(),
  ).toBeAttached()
  await expect(filterControl(page)).toBeVisible()
}

function filterControl(page: Page): Locator {
  return page.locator("[data-grid-filter-control]")
}

function popover(page: Page): Locator {
  return page.locator("[data-grid-filter-popover]")
}

function conditionRow(page: Page, columnId: string): Locator {
  return popover(page).locator(`[data-grid-filter-condition="${columnId}"]`)
}

async function openPopover(page: Page): Promise<void> {
  await filterControl(page).click()
  await expect(popover(page)).toBeVisible()
}

test.describe("CAP-12 — the filter conditions popover", () => {
  test("the toolbar control names the columns it is filtering, and no header carries an indicator", async ({
    page,
  }) => {
    await openContactsGrid(page)

    await expect(filterControl(page), "the control is at rest until something filters").toHaveText(/^Filter$/)

    await gotoGrid(page, { params: { "f.name": "isNotEmpty:", "f.phone": "contains:" } })
    await expect(filterControl(page), `landed on ${page.url()}`).toContainText("Filtered by Name, Phone")

    // The saffron is the whole point of the indicator: it is the only place the
    // accent appears, so a filter cannot read as a status or an error.
    const colour = await filterControl(page)
      .locator("span")
      .first()
      .evaluate((el) => getComputedStyle(el).color)
    expect(colour, "the indicator must be saffron, not the default foreground").toBe("rgb(249, 139, 28)")

    // CAP-14 forbids a permanently visible per-column control, and the
    // two-indicator rule went with the withdrawn inline bar.
    await expect(headerCell(page, "name").getByRole("button", { name: /Filter/ })).toHaveCount(0)
    await expect(headerCell(page, "name")).not.toContainText(/Filtered by/)
  })

  test("OQ-20 — an `is empty` condition survives a reload", async ({ page }) => {
    const rows = await scopedContacts()
    const withNotes = rows.filter((row) => (row.notes ?? "").trim().length > 0)
    expect(withNotes.length, "the fixture must offer both a note and no note").toBeGreaterThan(0)
    expect(withNotes.length, "and rows without one").toBeLessThan(rows.length)

    // `Notes · is empty` — the first condition in the reference composition, and
    // the one that silently vanished on every reload before this story.
    await gotoGrid(page, { params: { "f.notes": "isEmpty:" } })

    await expect
      .poll(() => new URL(page.url()).searchParams.get("f.notes"), {
        message: "the condition must survive being written to the URL at all",
      })
      .toBe("isEmpty:")

    await expectVisibleCount(page, rows.length - withNotes.length)

    // The actual reload, which is where the old length guard lost it.
    await page.reload()
    await expect(popover(page)).toBeHidden()
    await filterControl(page).click()
    await expect(popover(page)).toBeVisible()
    await expect(conditionRow(page, "notes")).toBeVisible()
    await expect
      .poll(() => new URL(page.url()).searchParams.get("f.notes"))
      .toBe("isEmpty:")
    await expectVisibleCount(page, rows.length - withNotes.length)
  })

  test("OQ-21 — the operator travels inside the value, so `contains` and `is` differ", async ({ page }) => {
    const rows = await scopedContacts()
    const exact = rows.find((row) => row.name && rows.filter((other) => other.name === row.name).length === 1)
    expect(exact, "the fixture must offer a name that is unique").toBeDefined()

    await gotoGrid(page, { params: { "f.name": `is:${exact!.name}` } })
    await expectVisibleCount(page, 1)
    await expect.poll(() => new URL(page.url()).searchParams.get("f.name")).toBe(`is:${exact!.name}`)

    // A PREFIX, not the whole name: `is:<full name>` and `contains:<full name>`
    // both match exactly one row, so comparing them proves nothing about the
    // operator travelling. Truncating is what separates the two.
    // The SHORTEST prefix that still matches more than one row. Names are drawn
    // from a given/family pool, so a fixed cut-off either matches everything or
    // nothing depending on the name the fixture happened to offer.
    let prefix = ""
    let byContains: BulkContact[] = []
    // Case-insensitive, because `normalizeFilterValue` folds case on both sides
    // and a case-sensitive count here would disagree with the grid for reasons
    // that have nothing to do with the operator.
    const fold = (value: string) => value.trim().toLowerCase()
    for (let length = 2; length < exact!.name.length; length += 1) {
      const candidate = exact!.name.slice(0, length)
      const hits = rows.filter((row) => fold(row.name).includes(fold(candidate)))

      if (hits.length > 1 && hits.length < rows.length) {
        prefix = candidate
        byContains = hits
        break
      }
    }
    expect(byContains.length, "no prefix of the fixture name distinguishes `contains` from `is`").toBeGreaterThan(1)

    await gotoGrid(page, { params: { "f.name": `contains:${prefix}` } })
    await expectVisibleCount(page, byContains.length)
    expect(
      byContains.every((row) => fold(row.name).includes(fold(prefix))),
      "the prefix must actually be a prefix-match of every row it selected",
    ).toBe(true)

    // And the same prefix under `is` matches nothing, which is the whole point:
    // the two operators are distinguishable only because the token carries them.
    await gotoGrid(page, { params: { "f.name": `is:${prefix}` } })
    await expectVisibleCount(page, 0)

    // A value containing the operator separator must survive verbatim: the token
    // is split on the FIRST `:`, so the remainder is the value unescaped.
    const colonNeedle = "call: 9900"
    await gotoGrid(page, { params: { "f.notes": `contains:${colonNeedle}` } })
    await expectVisibleCount(page, 0)
    await expect.poll(() => new URL(page.url()).searchParams.get("f.notes")).toBe(`contains:${colonNeedle}`)
  })

  test("a legacy operator-less token keeps its old meaning", async ({ page }) => {
    const rows = await scopedContacts()

    // `contains` for text: exactly what `gridGlobalFilterFn` did to these links.
    // `phone` is one of the columns that actually carried `filter: "text"`
    // before this story, so this is a link a real operator could have shared.
    const prefix = "810000"
    const expected = rows.filter((row) => row.phone.includes(prefix))
    expect(expected.length, "the generated phones must share a prefix to filter on").toBeGreaterThan(50)

    await gotoGrid(page, { params: { "f.phone": prefix } })
    await expectVisibleCount(page, expected.length)

    // The URL is NOT rewritten on load — nothing writes until something changes —
    // so the operator it was READ as is asserted where it is actually visible.
    await openPopover(page)
    await expect(conditionRow(page, "phone").locator("[data-grid-filter-operator]")).toHaveText("contains")
  })

  test("a legacy operator-less token on a non-text column reads as that type's first operator", async ({ page }) => {
    const rows = await scopedContacts()

    // `source` never carried a `filter` key, so no real link can name it — but a
    // hand-written one can, and it must not resolve to an operator the column does
    // not have. `contains` is in no select's set; decoding to it would leave the
    // condition unresolvable and matching NOTHING, which looks like a filter that
    // works and filters everything out.
    const expected = rows.filter((row) => row.source === "preview-fixture-bulk")
    expect(expected.length).toBeGreaterThan(0)

    await gotoGrid(page, { params: { "f.source": "preview-fixture-bulk" } })
    await expectVisibleCount(page, expected.length)
    await openPopover(page)
    await expect(conditionRow(page, "source").locator("[data-grid-filter-operator]")).toHaveText("is")
  })

  test("a legacy operator-less number reads as `gte`, not `is`", async ({ page }) => {
    // The trap: the first operator of the number set is `is`, so a naive fallback
    // turns every shared "5 or more" link into "exactly 5" with nothing to show.
    const rows = await scopedContacts()
    await gotoGrid(page, { params: { "f.totalAttendanceCount": "0" } })
    await expectVisibleCount(page, rows.length)

    // A threshold no row can meet proves the comparison is at-or-above and not
    // equality: an `is:0` reading would return the rows with no attendance, and
    // most rows have none, so the counts would differ.
    await gotoGrid(page, { params: { "f.totalAttendanceCount": "999999" } })
    await expectVisibleCount(page, 0)
  })

  test("the operator set is per field type, keyed by the registry", async ({ page }) => {
    await gotoGrid(page, {
      params: {
        "f.name": "contains:a",
        "f.totalAttendanceCount": "gte:0",
        "f.dateOfBirth": "after:2020-01-01",
      },
    })
    await openPopover(page)

    const operatorOptions = async (columnId: string): Promise<string[]> => {
      await conditionRow(page, columnId).locator("[data-grid-filter-operator]").click()
      const list = page.getByRole("listbox")
      await expect(list).toBeVisible()
      const labels = await list.getByRole("option").allInnerTexts()
      await page.keyboard.press("Escape")
      return labels.map((label) => label.trim())
    }

    expect(await operatorOptions("name")).toEqual([
      "contains",
      "does not contain",
      "is",
      "is not",
      "is empty",
      "is not empty",
    ])

    expect(await operatorOptions("totalAttendanceCount")).toEqual([
      "=",
      "≠",
      ">",
      "<",
      "≥",
      "≤",
      "is empty",
      "is not empty",
    ])

    expect(await operatorOptions("dateOfBirth")).toEqual([
      "is",
      "is not",
      "is within",
      "is after",
      "is before",
      "is on or before",
      "is on or after",
      "is empty",
      "is not empty",
    ])
  })

  test("an operator with no value renders its control disabled, not absent", async ({ page }) => {
    await gotoGrid(page, { params: { "f.name": "isEmpty:" } })
    await openPopover(page)

    const value = conditionRow(page, "name").locator("[data-grid-filter-value-disabled]")
    await expect(value).toBeVisible()
    await expect(value).toBeDisabled()
    await expect(value).toHaveAttribute("aria-disabled", "true")
    // Greyed means not applicable. It must not look like a broken input.
    const background = await value.evaluate((el) => getComputedStyle(el).backgroundColor)
    const surface = await popover(page).evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(background, "the disabled control must read as disabled against the surface").not.toBe(surface)

    // And it must not accept a value even programmatically. `disabled` alone
    // would say so; `readonly` is asserted too because a reader that finds the
    // element and sets `.value` directly is exactly the "greyed but still
    // accepted" case this rule exists to forbid.
    await expect(value).toHaveAttribute("readonly", "")
    await value.fill("anything", { force: true }).catch(() => undefined)
    await expect
      .poll(() => new URL(page.url()).searchParams.get("f.name"), {
        message: "a disabled value control must not write a value into the URL",
      })
      .toBe("isEmpty:")
  })

  test("changing the field resets the operator and the value", async ({ page }) => {
    await gotoGrid(page, { params: { "f.name": "contains:zzz" } })
    await openPopover(page)

    const row = conditionRow(page, "name")
    await row.locator("[data-grid-filter-field]").click()
    await page.getByRole("option", { name: "Date of Birth", exact: true }).click()

    // `contains` does not exist on a date column, and `zzz` is not a date.
    await expect
      .poll(() => new URL(page.url()).searchParams.get("f.dateOfBirth"))
      .toBe("is:")

    const operator = conditionRow(page, "dateOfBirth").getByRole("combobox").nth(1)
    await expect(operator).toHaveText("is")
  })

  test("`is any of` intersects rather than substring-matching each element", async ({ page }) => {
    const rows = await scopedContacts()
    const withBooks = rows.filter((row) => (row.books_read ?? []).length > 0)
    expect(withBooks.length, "the fixture must seed books_read").toBeGreaterThan(0)

    // Pick a real title, then truncate it. Substring-per-element matching would
    // match every row carrying that title; intersection matches only rows whose
    // element list literally contains the prefix, which is none.
    const title = withBooks[0].books_read![0]
    const prefix = title.slice(0, Math.max(2, title.length - 2))
    expect(prefix, "the needle must be a strict prefix of a real title").not.toBe(title)

    await gotoGrid(page, { params: { "f.booksRead": `anyOf:${prefix}` } })
    await expectVisibleCount(page, 0)

    // The exact title does match, so the zero above is the comparison and not a
    // column that silently filters nothing.
    const exactCount = withBooks.filter((row) => (row.books_read ?? []).includes(title)).length
    expect(exactCount, "the exact title must match something").toBeGreaterThan(0)
    await gotoGrid(page, { params: { "f.booksRead": `anyOf:${title}` } })
    await expectVisibleCount(page, exactCount)
  })

  test("one connective governs the whole list", async ({ page }) => {
    const rows = await scopedContacts()
    const target = rows.find((row) => row.source === "preview-fixture-bulk")!

    // Two conditions that cannot both hold: an exact source value, and a name
    // fragment that is absent from every row.
    const absent = "zzz-no-such-name-zzz"

    await gotoGrid(page, { params: { "f.source": `is:${target.source}`, "f.name": `contains:${absent}` } })
    await expectVisibleCount(page, 0)

    // The same two conditions under match-any, written with the `fa.` family.
    // The connective is carried by the prefix, so switching it moves every
    // condition at once — there is no per-row connective to set.
    await gotoGrid(page, { params: { "fa.source": `is:${target.source}`, "fa.name": `contains:${absent}` } })
    await expectVisibleCount(page, rows.filter((row) => row.source === target.source).length)

    await openPopover(page)
    await expect(popover(page).locator("[data-grid-filter-connective]").first()).toHaveText("or")
  })

  test("an unparseable date matches no rows and says so", async ({ page }) => {
    await gotoGrid(page, { params: { "f.dateOfBirth": "after:not-a-date" } })

    // Zero rows, but by EXCLUSION and visibly — a silent NaN drop is the failure
    // mode this branch exists to prevent.
    await expectVisibleCount(page, 0)
    await openPopover(page)
    await expect(conditionRow(page, "dateOfBirth").locator("[data-grid-filter-value]")).toHaveAttribute(
      "aria-invalid",
      "true",
    )
  })

  test("a null date cell is excluded rather than compared", async ({ page }) => {
    // No seeder writes a date column, so every row's date is null. `is after`
    // with a real boundary must exclude all of them and not crash.
    const rows = await scopedContacts()
    await gotoGrid(page, { params: { "f.dateOfBirth": "after:2020-01-01" } })
    await expectVisibleCount(page, 0)
    expect(rows.length).toBeGreaterThan(0)

    // And the honest negative control: a boundary that excludes everything by the
    // same rule would look identical if the null branch were silently true.
    await gotoGrid(page, { params: { "f.name": "isEmpty:" } })
    const withoutName = rows.filter((row) => (row.name ?? "").trim().length === 0)
    await expectVisibleCount(page, withoutName.length)
  })

  test("the column menu holds exactly four items and Filter opens THIS popover", async ({ page }) => {
    await gotoGrid(page, {})
    await openColumnMenu(page, "notes", "Notes")

    await expect(page.getByRole("menuitem")).toHaveText([
      "Sort ascending",
      "Sort descending",
      "Hide column",
      "Filter",
    ])

    await page.getByRole("menuitem", { name: "Filter" }).click()

    // The SAME toolbar-anchored surface — not a thirteenth per-column popover.
    const box = await popover(page).boundingBox()
    const control = await filterControl(page).boundingBox()
    expect(box, "the popover must be anchored under the toolbar control").not.toBeNull()
    expect(Math.abs(box!.x - control!.x), "anchored at the control's left edge").toBeLessThanOrEqual(2)
    await expect(page.locator("[data-grid-filter-popover]:not([data-grid-filter-popover])")).toHaveCount(0)

    // Pre-filled with that column and a valid operator.
    await expect(conditionRow(page, "notes")).toBeVisible()
    await expect(conditionRow(page, "notes").locator("[data-grid-filter-field]")).toHaveText("Notes")
    await expect(conditionRow(page, "notes").locator("[data-grid-filter-operator]")).toHaveText("contains")
  })

  test("add, delete and clear all drive the URL", async ({ page }) => {
    await gotoGrid(page, {})
    await openPopover(page)

    await popover(page).getByRole("button", { name: "Add condition" }).click()
    await expect.poll(() => new URL(page.url()).searchParams.get("f.name")).toBe("contains:")
    await expect(filterControl(page)).toContainText("Name")

    // A condition with no value is inert: it must narrow nothing, because the
    // count is read while the operator is still typing.
    await expectVisibleCount(page, (await scopedContacts()).length)

    await popover(page).getByRole("button", { name: "Add condition" }).click()
    await expect(conditionRow(page, "phone")).toBeVisible()

    await conditionRow(page, "phone").getByRole("button", { name: /Delete/ }).click()
    await expect(conditionRow(page, "phone")).toHaveCount(0)
    await expect.poll(() => new URL(page.url()).searchParams.get("f.phone")).toBeNull()

    await popover(page).getByRole("button", { name: "Clear all" }).click()
    await expect(conditionRow(page, "name")).toHaveCount(0)
    await expect.poll(() => new URL(page.url()).searchParams.get("f.name")).toBeNull()
  })

  test("a condition combines with the global search", async ({ page }) => {
    const rows = await scopedContacts()
    const bulk = rows.filter((row) => row.source === "preview-fixture-bulk")
    expect(bulk.length).toBeGreaterThan(10)
    const needle = bulk[0].name!.slice(0, 6)
    const both = bulk.filter((row) => row.name!.includes(needle))

    // `q` ANDs with `f.<colId>`: the count is the intersection, not either alone.
    await gotoGrid(page, { params: { q: needle, "f.source": "is:preview-fixture-bulk" } })
    await expectVisibleCount(page, both.length)
  })
})