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
  inScopeCounts,
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

/**
 * Every control in the popover row, plus the query string, read in ONE
 * `page.evaluate`.
 *
 * **Why a raw `evaluate` and not `expect(locator).toHaveText(...)`.** A web-first
 * assertion retries, so it passes on the slow build too: the field Select used to
 * settle on the right text a quarter second later, so "it eventually reads Phone"
 * proves nothing about whether it read Phone *immediately*. What these specs claim
 * is the pair — the trigger has moved AND the URL has not — and the pair is only
 * honest if both sides are read at the same instant, one JS turn, with no retry in
 * between. The window is the 250 ms debounce plus a router transition; the read
 * lands within a few milliseconds of the click that armed it.
 *
 * `valueDisabled` is in the same read because the value control's SHAPE is part of
 * the claim: an operator that takes no value renders a greyed control, and whether
 * that happened on this paint is the same question.
 */
async function choiceState(
  page: Page,
): Promise<{ field: string; operator: string; connective: string; valueDisabled: boolean; search: string }> {
  return page.evaluate(() => ({
    field: document.querySelector("[data-grid-filter-field]")?.textContent?.trim() ?? "",
    operator: document.querySelector("[data-grid-filter-operator]")?.textContent?.trim() ?? "",
    connective: document.querySelector("[data-grid-filter-connective]")?.textContent?.trim() ?? "",
    valueDisabled: document.querySelector("[data-grid-filter-value-disabled]") !== null,
    search: window.location.search,
  }))
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

  /**
   * `columnId` is a condition's identity — `grid-filter-operators.ts:60` states
   * there is at most one condition per column — so the field Select must not offer
   * a column another row is already filtering on. It offered every column, and the
   * pick was accepted: rows `Name` + `Phone` with row 2 set to `Name` produced two
   * conditions sharing one id, which collides on the row's `key` and paints the
   * same column twice.
   *
   * **THE URL COULD NOT SHOW IT.** `serializeGridViewState` writes into a
   * `Record<string, string>`, so the two collapse to a single `f.name` param and the
   * list reads back with one row — the duplicate lived only in the popover's mirror,
   * where nothing contradicted it. The console check below is the only place React
   * itself reports it, and React drops that warning from a production build, so it
   * asserts because the suite boots the app in development; against a built app it
   * is a check that cannot fail, and the row assertions are what carry the claim.
   *
   * Disabled rather than absent, which is what `grid-header-cell.tsx:216` and
   * `grid-toolbar.tsx:210` do for menu items they cannot offer: the column is not
   * withdrawn from the operator's view, only marked unavailable.
   *
   * Four things are claimed here, and the middle two are the ones that are easy to
   * get backwards: the exclusion is PER ROW and not global (row 1's list disables
   * `Phone` while row 2's disables `Name`), and it is RECOMPUTED from the live list
   * rather than snapshotted — a set captured once at mount would satisfy every
   * earlier assertion and still be wrong here.
   */
  test("a column already filtered by another row is disabled in the field list", async ({ page }) => {
    const consoleOutput: string[] = []

    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        consoleOutput.push(`${message.type()}: ${message.text()}`)
      }
    })

    await gotoGrid(page, { params: { "f.name": "contains:a", "f.phone": "contains:9" } })
    await openPopover(page)

    const rows = popover(page).locator("[data-grid-filter-condition]")

    await expect(rows).toHaveCount(2)

    // --- row 2's list ---
    await conditionRow(page, "phone").locator("[data-grid-filter-field]").click()

    const list = page.getByRole("listbox")
    const option = (label: string) => list.getByRole("option", { name: label, exact: true })

    // Row 1's column. Offering it on row 2 is an offer to build two conditions
    // with one identity.
    await expect(option("Name")).toHaveAttribute("aria-disabled", "true")

    // Row 2's OWN column is in the taken set by definition, so the exclusion has
    // to be of every row but this one — otherwise the row's current value is
    // greyed and the same-row re-pick stops working.
    await expect(option("Phone")).not.toHaveAttribute("aria-disabled", "true")

    // A column nobody is filtering on is offered normally.
    await expect(option("Notes")).not.toHaveAttribute("aria-disabled", "true")

    // The pick that used to build the duplicate, forced past the
    // `pointer-events-none` a disabled item carries. What lands the click is not the
    // point — the point is that no pick reaches `onValueChange`, so the rows are
    // asserted rather than the absence of an error.
    await option("Name").click({ force: true })
    await page.keyboard.press("Escape")

    await expect(rows).toHaveCount(2)
    await expect(conditionRow(page, "name")).toHaveCount(1)

    // --- row 1's list: the same rule from the other side ---
    await conditionRow(page, "name").locator("[data-grid-filter-field]").click()

    await expect(option("Phone")).toHaveAttribute("aria-disabled", "true")
    await expect(option("Name")).not.toHaveAttribute("aria-disabled", "true")

    await page.keyboard.press("Escape")

    // --- a real pick, made with a disabled option on screen ---
    // Every other field pick in this file runs against an empty taken set, so
    // nothing else covers choosing from a list that has something unavailable in it.
    await conditionRow(page, "phone").locator("[data-grid-filter-field]").click()
    await option("Notes").click()

    await expect.poll(() => new URL(page.url()).searchParams.get("f.notes")).toBe("contains:")
    expect(
      new URL(page.url()).searchParams.get("f.phone"),
      "the row's old column must not survive the switch",
    ).toBeNull()
    await expect(conditionRow(page, "notes")).toHaveCount(1)

    // --- the set is recomputed, not snapshotted ---
    // `Phone` was taken when this list was first opened and is free now, because
    // row 2 has moved to `Notes`. A set built once would still disable it.
    await conditionRow(page, "notes").locator("[data-grid-filter-field]").click()

    await expect(option("Name")).toHaveAttribute("aria-disabled", "true")
    await expect(option("Notes")).not.toHaveAttribute("aria-disabled", "true")
    await expect(option("Phone")).not.toHaveAttribute("aria-disabled", "true")

    await page.keyboard.press("Escape")

    const duplicateKeys = consoleOutput.filter((text) => /same key/i.test(text))

    expect(duplicateKeys, `console output:\n${consoleOutput.join("\n")}`).toEqual([])
  })

  test("a multiselect offers the four set operations", async ({ page }) => {
    await gotoGrid(page, {})
    await openPopover(page)
    await popover(page).getByRole("button", { name: "Add condition" }).click()

    await conditionRow(page, "name").locator("[data-grid-filter-field]").click()
    await page.getByRole("option", { name: "Books Read", exact: true }).click()

    await conditionRow(page, "booksRead").locator("[data-grid-filter-operator]").click()
    const labels = (await page.getByRole("listbox").getByRole("option").allInnerTexts()).map((t) => t.trim())
    await page.keyboard.press("Escape")

    expect(labels).toEqual([
      "has all of",
      "has any of",
      "is exactly",
      "has none of",
      "is empty",
      "is not empty",
    ])
  })

  test("a single select offers is / is not and nothing set-shaped", async ({ page }) => {
    await gotoGrid(page, {})
    await openPopover(page)
    await popover(page).getByRole("button", { name: "Add condition" }).click()

    await conditionRow(page, "name").locator("[data-grid-filter-field]").click()
    await page.getByRole("option", { name: "Source", exact: true }).click()

    await conditionRow(page, "source").locator("[data-grid-filter-operator]").click()
    const labels = (await page.getByRole("listbox").getByRole("option").allInnerTexts()).map((t) => t.trim())
    await page.keyboard.press("Escape")

    // `any of` / `none of` on a one-valued column would be a different operator
    // wearing the same clothes.
    expect(labels).toEqual(["is", "is not", "is empty", "is not empty"])
  })

  test("a renamed multiselect operator still reads a shared link", async ({ page }) => {
    const rows = await scopedContacts()
    const withBooks = rows.filter((row) => (row.books_read ?? []).length > 0)
    expect(withBooks.length, "the fixture must seed books_read").toBeGreaterThan(0)
    const title = withBooks[0].books_read![0]

    // `anyOf` became `hasAnyOf`. A link written before the rename must keep
    // meaning "holds any of", not quietly become a legacy bare value.
    await gotoGrid(page, { params: { "f.booksRead": `anyOf:${title}` } })
    const expected = withBooks.filter((row) => (row.books_read ?? []).includes(title)).length
    expect(expected).toBeGreaterThan(0)
    await expectVisibleCount(page, expected)

    await openPopover(page)
    await expect(conditionRow(page, "booksRead").locator("[data-grid-filter-operator]")).toHaveText(
      "has any of",
    )
  })

  test("`has any of` intersects rather than substring-matching each element", async ({ page }) => {
    const rows = await scopedContacts()
    const withBooks = rows.filter((row) => (row.books_read ?? []).length > 0)
    expect(withBooks.length, "the fixture must seed books_read").toBeGreaterThan(0)

    // Pick a real title, then truncate it. Substring-per-element matching would
    // match every row carrying that title; intersection matches only rows whose
    // element list literally contains the prefix, which is none.
    const title = withBooks[0].books_read![0]
    const prefix = title.slice(0, Math.max(2, title.length - 2))
    expect(prefix, "the needle must be a strict prefix of a real title").not.toBe(title)

    await gotoGrid(page, { params: { "f.booksRead": `hasAnyOf:${prefix}` } })
    await expectVisibleCount(page, 0)

    // The exact title does match, so the zero above is the comparison and not a
    // column that silently filters nothing.
    const exactCount = withBooks.filter((row) => (row.books_read ?? []).includes(title)).length
    expect(exactCount, "the exact title must match something").toBeGreaterThan(0)
    await gotoGrid(page, { params: { "f.booksRead": `hasAnyOf:${title}` } })
    await expectVisibleCount(page, exactCount)
  })

  test("`has all of`, `is exactly` and `has none of` are three different questions", async ({ page }) => {
    const rows = await scopedContacts()
    // A row carrying at least two distinct titles, so "all of A" and "exactly A"
    // can disagree — which is the whole reason the rename happened.
    const multi = rows.find((row) => new Set(row.books_read ?? []).size >= 2)
    expect(multi, "the fixture must seed a row with two books").toBeTruthy()

    const [first] = multi!.books_read!
    const allOf = await visibleCountWith("hasAnyOf", first)
    expect(allOf, "the exact title must match rows").toBeGreaterThan(0)

    const exactly = await visibleCountWith("isExactly", first)
    // `is exactly [one title]` matches only rows whose whole list is that one.
    const expectedExactly = rows.filter(
      (row) => (row.books_read ?? []).length === 1 && (row.books_read ?? [])[0] === first,
    ).length
    expect(exactly).toBe(expectedExactly)
    expect(
      exactly,
      "`is exactly` must not mean `has all of`",
    ).toBeLessThanOrEqual(allOf)

    const noneOf = await visibleCountWith("hasNoneOf", first)
    expect(
      rows.length - noneOf,
      "`has none of` must exclude exactly the rows `has any of` includes",
    ).toBe(allOf)

    async function visibleCountWith(operator: string, value: string): Promise<number> {
      await gotoGrid(page, { params: { "f.booksRead": `${operator}:${value}` } })
      // The count readout, not a row tally: it reports the filtered total
      // including anything virtualised out of the DOM.
      await expectVisibleCount(page, rows.filter(predicateFor(operator, value)).length)
      return (await inScopeCounts(page)).visible
    }

    function predicateFor(operator: string, value: string): (row: BulkContact) => boolean {
      return (row) => {
        const cell = row.books_read ?? []

        switch (operator) {
          case "hasAnyOf":
            return cell.includes(value)
          case "hasAllOf":
            return cell.every((entry) => entry === value)
          case "isExactly":
            return cell.length === 1 && cell[0] === value
          case "hasNoneOf":
            return !cell.includes(value)
          default:
            return false
        }
      }
    }
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
    const rows = await scopedContacts()
    const boundary = "2020-01-01"

    // Computed from the data, NOT from an assumption that no row has a date. An
    // earlier version of this test asserted 0 because it believed the seeder
    // never wrote `dateOfBirth`; it now writes two, so the assertion failed for
    // a reason that had nothing to do with the code under test.
    const withDate = rows.filter((row) => (row.date_of_birth ?? "") !== "")
    const withoutDate = rows.filter((row) => (row.date_of_birth ?? "") === "")
    const afterBoundary = withDate.filter((row) => String(row.date_of_birth).slice(0, 10) > boundary)

    // The test is only meaningful if nulls actually exist here -- otherwise
    // "nulls are excluded" is true of an empty set and proves nothing.
    expect(withoutDate.length, "the fixture must seed null dates for this test to mean anything").toBeGreaterThan(0)

    await gotoGrid(page, { params: { "f.dateOfBirth": `after:${boundary}` } })
    await expectVisibleCount(page, afterBoundary.length)

    // The null rows are the point: they are excluded, never compared. If the
    // null branch were absent they would either crash or be silently included.
    expect(
      afterBoundary.length,
      "a null date must not be compared against the boundary",
    ).toBeLessThan(withoutDate.length)

    // And the honest negative control: a condition that IS satisfiable on the
    // same data, so the count above is a comparison rather than an accident.
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

/**
 * The four defects Dwaraka reported against the first build on 2026-10-14.
 *
 * Each of these was a value or a rule the operator could see was wrong, so each
 * asserts the OBSERVABLE thing rather than the implementation: the field's text
 * after a blur, the URL after a keystroke, the computed borders, the calendar.
 */
test.describe("CAP-12 — the four reported defects", () => {
  test("AC-D1: a committed value survives focus and blur", async ({ page }) => {
    const rows = await scopedContacts()
    const name = rows.find((row) => (row.name ?? "").length > 3)!.name!

    await gotoGrid(page, { params: { "f.name": `is:${name}` } })
    await openPopover(page)

    const value = conditionRow(page, "name").locator("[data-grid-filter-value]")
    await expect(value).toHaveValue(name)

    // Two full cycles. The first build cleared its draft to "" on blur, so the
    // SECOND cycle is where the value was visibly gone and the placeholder back.
    for (let cycle = 0; cycle < 2; cycle += 1) {
      await value.click()
      await value.blur()
      await expect(value, `cycle ${cycle + 1} must still read the committed value`).toHaveValue(name)
    }

    // And the condition is still doing its job, not merely displaying.
    await expect
      .poll(() => new URL(page.url()).searchParams.get("f.name"))
      .toBe(`is:${name}`)
  })

  test("AC-D1: an emptied value shows the placeholder, not a stale value", async ({ page }) => {
    await gotoGrid(page, { params: { "f.name": "contains:abc" } })
    await openPopover(page)

    const value = conditionRow(page, "name").locator("[data-grid-filter-value]")
    await value.click()
    await value.fill("")
    await value.blur()

    await expect(value).toHaveValue("")
    await expect(value).toHaveAttribute("placeholder", "Enter a value")
    // An empty value is inert, not invalid — it must not paint the error border.
    await expect(value).not.toHaveAttribute("aria-invalid", "true")
  })

  test("AC-D2: a keystroke filters, with no Enter and no blur", async ({ page }) => {
    const rows = await scopedContacts()
    const bulk = rows.filter((row) => row.source === "preview-fixture-bulk")
    expect(bulk.length).toBeGreaterThan(10)
    const name = bulk[0].name!
    const partial = name.slice(0, 4)

    await gotoGrid(page, {})
    await openPopover(page)
    await popover(page).getByRole("button", { name: "Add condition" }).click()

    const value = conditionRow(page, "name").locator("[data-grid-filter-value]")
    await value.click()

    // No `press("Enter")` and no `blur()` anywhere in this test. The URL must
    // carry a partial value because the commit is the keystroke.
    await value.fill(partial)

    await expect
      .poll(() => new URL(page.url()).searchParams.get("f.name"), { timeout: 5000 })
      .toBe(`contains:${partial}`)

    // And the grid actually narrowed, which is what "filtering" means. The URL
    // alone would pass even if nothing evaluated the condition.
    await expectVisibleCount(page, rows.filter((row) => (row.name ?? "").includes(partial)).length)
  })

  test("AC-D2: every keystroke inside the debounce window survives", async ({ page }) => {
    await gotoGrid(page, {})
    await openPopover(page)
    await popover(page).getByRole("button", { name: "Add condition" }).click()

    const value = conditionRow(page, "name").locator("[data-grid-filter-value]")
    await value.click()

    // Typed faster than the 250 ms write debounce. A draft that reconciles from
    // the URL mid-typing drops characters; this asserts the last one survives.
    await value.pressSequentially("abcdefgh", { delay: 10 })
    await expect
      .poll(() => new URL(page.url()).searchParams.get("f.name"), { timeout: 5000 })
      .toBe("contains:abcdefgh")

    await value.blur()
    await expect(value).toHaveValue("abcdefgh")
  })

  test("AC-D3: one rule above the conditions and one below", async ({ page }) => {
    await gotoGrid(page, { params: { "f.name": "contains:a", "f.phone": "contains:9" } })
    await openPopover(page)

    /** Every horizontal rule on one element, in px. */
    const rules = (attribute: string) =>
      popover(page)
        .locator(`[data-grid-filter-${attribute}]`)
        .evaluate((el) => [
          getComputedStyle(el).borderTopWidth,
          getComputedStyle(el).borderBottomWidth,
        ])

    // The conditions list carries NO rule of its own. It used to carry a
    // `border-b`, which put a second hairline directly under the conditions
    // once the footer added its own `border-t`.
    const [conditionsTop, conditionsBottom] = await rules("conditions")
    expect(conditionsBottom, "no rule between the conditions and the footer").toBe("0px")
    expect(conditionsTop, "the header's rule belongs to the header").toBe("0px")

    // The two that remain: the header's below it, the footer's above it.
    const [headerTop, headerBottom] = await rules("header")
    expect(headerBottom, "the header carries the rule above the conditions").not.toBe("0px")
    expect(headerTop, "and nothing above the header").toBe("0px")

    const [footerTop, footerBottom] = await rules("footer")
    expect(footerTop, "the footer carries the rule below the conditions").not.toBe("0px")
    expect(footerBottom, "and nothing below the footer").toBe("0px")
  })

  test("AC-D4: a date is picked from a calendar, not typed", async ({ page }) => {
    await gotoGrid(page, { params: { "f.dateOfBirth": "after:2020-01-01" } })
    await openPopover(page)

    const row = conditionRow(page, "dateOfBirth")
    const trigger = row.locator("[data-grid-filter-calendar-trigger]")

    // The value arrived by URL, so the trigger renders it.
    await expect(trigger).toContainText("2020")
    await expect(row.locator('input[type="text"]')).toHaveCount(0)

    await trigger.click()
    const calendar = page.locator("[data-grid-filter-calendar]")
    await expect(calendar).toBeVisible()

    // No text field and no "Set"/"Apply" button anywhere in the calendar.
    await expect(calendar.locator("input")).toHaveCount(0)
    await expect(calendar.getByRole("button", { name: /^(set|apply|ok|done)$/i })).toHaveCount(0)
  })

  test("AC-D4: the month arrows move the month and come back", async ({ page }) => {
    await gotoGrid(page, { params: { "f.dateOfBirth": "after:2020-01-01" } })
    await openPopover(page)
    await conditionRow(page, "dateOfBirth").locator("[data-grid-filter-calendar-trigger]").click()

    const calendar = page.locator("[data-grid-filter-calendar]")
    await expect(calendar).toBeVisible()

    const caption = () => calendar.locator(".rdp-caption_label").innerText()
    const start = await caption()
    expect(start.trim().length, "the caption names a month").toBeGreaterThan(0)

    await calendar.locator(".rdp-button_previous").click()
    const previous = await caption()
    expect(previous, "the previous arrow must move the caption").not.toBe(start)

    await calendar.locator(".rdp-button_next").click()
    expect(await caption(), "the next arrow must move it back").toBe(start)
  })

  test("AC-D4: clicking a day sets the value", async ({ page }) => {
    await gotoGrid(page, {})
    await openPopover(page)
    await popover(page).getByRole("button", { name: "Add condition" }).click()

    const row = conditionRow(page, "name")
    await row.locator("[data-grid-filter-field]").click()
    await page.getByRole("option", { name: "Date of Birth", exact: true }).click()

    const dateRow = conditionRow(page, "dateOfBirth")
    await dateRow.locator("[data-grid-filter-calendar-trigger]").click()

    const calendar = page.locator("[data-grid-filter-calendar]")
    await expect(calendar).toBeVisible()

    // `data-outside` is on the day CELL (the `td`), not on the button the
    // calendar's DayButton renders — so it is excluded on the `td` or not at all,
    // and an outside day would otherwise be clickable as day one.
    const day = calendar.locator("td:not([data-outside]) button[data-day]").first()
    const dayText = (await day.innerText()).trim()
    expect(dayText.length, "a day cell must be named").toBeGreaterThan(0)
    await day.click()

    // The picker is the whole interaction: the calendar closed and the value
    // landed, with no Set button to press.
    await expect(calendar).toHaveCount(0)
    await expect
      .poll(() => new URL(page.url()).searchParams.get("f.dateOfBirth"))
      .toMatch(/^is:\d{4}-\d{2}-\d{2}$/)
    await expect(dateRow.locator("[data-grid-filter-calendar-trigger]")).not.toHaveText("Choose a date")
  })

  test("AC-D4: `is within` takes two clicks and serialises a span", async ({ page }) => {
    await gotoGrid(page, {})
    await openPopover(page)
    await popover(page).getByRole("button", { name: "Add condition" }).click()

    await conditionRow(page, "name").locator("[data-grid-filter-field]").click()
    await page.getByRole("option", { name: "Date of Birth", exact: true }).click()

    const row = conditionRow(page, "dateOfBirth")
    await row.locator("[data-grid-filter-operator]").click()
    await page.getByRole("option", { name: "is within", exact: true }).click()

    // Let both local writes land before the calendar is opened. This assertion
    // below reads the query string directly, and a URL that has not been written
    // yet answers `null` — which is not the same thing as "not a span". It also
    // means the two clicks that follow are not racing a landing write.
    await expect.poll(() => new URL(page.url()).searchParams.get("f.dateOfBirth")).toBe("within:")

    await row.locator("[data-grid-filter-calendar-trigger]").click()
    const calendar = page.locator("[data-grid-filter-calendar]")
    await expect(calendar).toBeVisible()

    const days = calendar.locator("td:not([data-outside]) button[data-day]")
    // Resolved BY DAY, not by index: the first click re-renders the calendar, and
    // an index-based locator re-resolves against the new DOM — pointing at a
    // different day, or at a node that was detached mid-click.
    const first = await days.nth(2).getAttribute("data-day")
    const second = await days.nth(6).getAttribute("data-day")
    expect(first && second, "the calendar must name its days").toBeTruthy()

    await calendar.locator(`button[data-day="${first}"]`).click()

    // The first click alone must NOT commit a half-built range: a span with one
    // end is unparseable and would match nothing while looking finished.
    await expect(calendar).toBeVisible()
    expect(
      await new URL(page.url()).searchParams.get("f.dateOfBirth"),
      "one click is not yet a span",
    ).not.toMatch(/\.\./)

    await calendar.locator(`button[data-day="${second}"]`).click()

    await expect(calendar).toHaveCount(0)
    await expect
      .poll(() => new URL(page.url()).searchParams.get("f.dateOfBirth"))
      .toMatch(/^within:\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}$/)
  })

  test("AC-D4: an unparseable date from a URL is still reported", async ({ page }) => {
    await gotoGrid(page, { params: { "f.dateOfBirth": "after:not-a-date" } })
    await openPopover(page)

    // The picker makes this untypeable, not unreachable — a shared link can still
    // carry it, and it must still be visible rather than silently matching nothing.
    await expect(conditionRow(page, "dateOfBirth").locator("[data-grid-filter-value]")).toHaveAttribute(
      "aria-invalid",
      "true",
    )
    await expectVisibleCount(page, 0)
  })
})

/**
 * Dwaraka's follow-up, 2026-10-14: an unfinished condition should not outlive
 * the popover, the choice controls should look like dropdowns, and the stack
 * should grow downward.
 */
test.describe("CAP-12 — the follow-up requests", () => {
  test("an unfinished condition is removed when the popover closes", async ({ page }) => {
    await gotoGrid(page, {})
    await openPopover(page)
    await popover(page).getByRole("button", { name: "Add condition" }).click()

    await expect(conditionRow(page, "name")).toBeVisible()
    await expect
      .poll(() => new URL(page.url()).searchParams.get("f.name"))
      .toBe("contains:")

    // Walk away without typing anything.
    await popover(page).getByRole("button", { name: "Close filters" }).click()
    await expect(popover(page)).toHaveCount(0)

    await expect
      .poll(() => new URL(page.url()).searchParams.get("f.name"), {
        message: "an abandoned, unfilled condition must not survive the close",
      })
      .toBeNull()
    await expect(filterControl(page)).toHaveText(/^Filter$/)
  })

  test("`is empty` is complete without a value and must survive the close", async ({ page }) => {
    await gotoGrid(page, {})
    await openPopover(page)
    await popover(page).getByRole("button", { name: "Add condition" }).click()

    await conditionRow(page, "name").locator("[data-grid-filter-operator]").click()
    await page.getByRole("option", { name: "is empty", exact: true }).click()

    await popover(page).getByRole("button", { name: "Close filters" }).click()
    await expect(popover(page)).toHaveCount(0)

    // The condition has no value BY DESIGN. Pruning it would delete the one
    // operator whose whole meaning is an absent value.
    await expect
      .poll(() => new URL(page.url()).searchParams.get("f.name"))
      .toBe("isEmpty:")
    await openPopover(page)
    await expect(conditionRow(page, "name")).toBeVisible()
  })

  test("a filled condition and an unfinished one: only the unfinished one goes", async ({ page }) => {
    await gotoGrid(page, {})
    await openPopover(page)
    await popover(page).getByRole("button", { name: "Add condition" }).click()

    const value = conditionRow(page, "name").locator("[data-grid-filter-value]")
    await value.click()
    await value.fill("a")
    await expect.poll(() => new URL(page.url()).searchParams.get("f.name")).toBe("contains:a")

    await popover(page).getByRole("button", { name: "Add condition" }).click()
    await expect
      .poll(() => new URL(page.url()).searchParams.get("f.phone"))
      .toBe("contains:")

    await popover(page).getByRole("button", { name: "Close filters" }).click()

    await expect.poll(() => new URL(page.url()).searchParams.get("f.name")).toBe("contains:a")
    await expect
      .poll(() => new URL(page.url()).searchParams.get("f.phone"))
      .toBeNull()
  })

  test("a single select's value is chosen from a dropdown", async ({ page }) => {
    await gotoGrid(page, {})
    await openPopover(page)
    await popover(page).getByRole("button", { name: "Add condition" }).click()

    await conditionRow(page, "name").locator("[data-grid-filter-field]").click()
    await page.getByRole("option", { name: "Source", exact: true }).click()

    const row = conditionRow(page, "source")
    await expect(row.locator("[data-grid-filter-value]")).toHaveText("Choose a value")

    await row.locator("[data-grid-filter-value]").click()
    const listbox = page.getByRole("listbox")
    await expect(listbox).toBeVisible()
    const options = (await listbox.getByRole("option").allInnerTexts()).map((t) => t.trim())
    expect(options.length, "the dropdown must offer the column's own options").toBeGreaterThan(0)

    await listbox.getByRole("option").first().click()
    await expect
      .poll(() => new URL(page.url()).searchParams.get("f.source"))
      .toBe(`is:${options[0]}`)
    await expect(row.locator("[data-grid-filter-value]")).toHaveText(options[0])
  })

  test("a freshly added multiselect condition survives the URL round trip", async ({ page }) => {
    await gotoGrid(page, {})
    await openPopover(page)
    await popover(page).getByRole("button", { name: "Add condition" }).click()

    await conditionRow(page, "name").locator("[data-grid-filter-field]").click()
    await page.getByRole("option", { name: "Books Read", exact: true }).click()

    // The regression: a set operator's empty value encodes to `hasAllOf:`, and a
    // decoder that treated an empty list as "no condition" dropped the row the
    // moment the debounced write landed — picking the column looked impossible.
    await expect.poll(() => new URL(page.url()).searchParams.get("f.booksRead")).toBe("hasAllOf:")
    await expect(conditionRow(page, "booksRead")).toBeVisible()
    await expect(conditionRow(page, "booksRead").locator("[data-grid-filter-operator]")).toHaveText(
      "has all of",
    )
    // Still inert, not filtering everything out.
    await expectVisibleCount(page, (await scopedContacts()).length)
})

test("a multiselect's values are ticked in a dropdown", async ({ page }) => {
    await gotoGrid(page, {})
    await openPopover(page)
    await popover(page).getByRole("button", { name: "Add condition" }).click()

    await conditionRow(page, "name").locator("[data-grid-filter-field]").click()
    await page.getByRole("option", { name: "Books Read", exact: true }).click()

    const row = conditionRow(page, "booksRead")
    // A dropdown, not the inline checkbox box the first build rendered into the
    // row — which was taller than its own slot and broke the row's alignment.
    const trigger = row.locator("[data-grid-filter-multi-trigger]")
    await expect(trigger).toHaveText("Choose values")

    await trigger.click()
    const list = page.locator("[data-grid-filter-multi]")
    await expect(list).toBeVisible()

    // The checkbox itself carries no text -- the label is a sibling span -- so
    // the option text has to be read from the rows, not from the checkboxes.
    const labels = (await list.locator("label > span").allInnerTexts()).map((t) => t.trim())
    expect(labels.length, "the dropdown must offer the column's own options").toBeGreaterThan(1)

    await list.getByText(labels[0], { exact: true }).click()
    await expect
      .poll(() => new URL(page.url()).searchParams.get("f.booksRead"))
      .toBe(`hasAllOf:${labels[0]}`)

    await list.getByText(labels[1], { exact: true }).click()
    await expect
      .poll(() => new URL(page.url()).searchParams.get("f.booksRead"))
      .toBe(`hasAllOf:${labels[0]}|${labels[1]}`)
    await expect(trigger).toContainText(labels[0])
    await expect(trigger).toContainText(labels[1])
  })

  test("a long list of chosen values truncates instead of overflowing", async ({ page }) => {
    await gotoGrid(page, {})
    await openPopover(page)
    await popover(page).getByRole("button", { name: "Add condition" }).click()

    await conditionRow(page, "name").locator("[data-grid-filter-field]").click()
    await page.getByRole("option", { name: "Books Read", exact: true }).click()

    const trigger = conditionRow(page, "booksRead").locator("[data-grid-filter-multi-trigger]")
    await trigger.click()
    const list = page.locator("[data-grid-filter-multi]")
    await expect(list).toBeVisible()

    const labels = (await list.locator("label > span").allInnerTexts()).map((t) => t.trim())
    // Enough of them that the joined text cannot possibly fit 154px.
    const chosen = labels.slice(0, Math.min(4, labels.length))
    expect(chosen.length, "the fixture must offer several books").toBeGreaterThanOrEqual(3)

    for (const label of chosen) {
      await list.getByText(label, { exact: true }).click()
    }

    await expect.poll(() => new URL(page.url()).searchParams.get("f.booksRead")).toBe(
      `hasAllOf:${chosen.join("|")}`,
    )

    // The visible text is clipped to the control's own box. An inline span
    // ignores `overflow: hidden`, so this is what regressed: the value spilled
    // out over its neighbours as soon as a couple of books were ticked.
    //
    // **MEASURED BY CONTAINMENT, NOT BY `scrollWidth`.** The first version of
    // this assertion read `span.scrollWidth - el.clientWidth`, which is
    // inverted and passed on the very bug it was written to catch. `scrollWidth`
    // is CONTENT width whether or not the content is clipped, so a correctly
    // truncated span reports the full text width and the assertion went red on
    // the fix; and `scrollWidth` is 0 for a non-replaced INLINE element, so the
    // inline span — the defect — reported 0 and passed. It cannot distinguish a
    // spilling value from a clipped one, because a clipped value and a spilling
    // one have the same content width. The question this test actually asks is
    // whether the span's PAINTED box sits inside the control, so it compares
    // right edges. Do not restore `scrollWidth` here.
    const overflow = await trigger.evaluate((el) => {
      const span = el.querySelector("span")

      if (span === null) {
        return -1
      }

      return span.getBoundingClientRect().right - el.getBoundingClientRect().right
    })

    expect(overflow, "the value must not be wider than its own control").toBeLessThanOrEqual(0)
    await expect(trigger).toHaveAttribute("title", chosen.join(", "))
  })

  test("conditions stack downward, in the order they were added", async ({ page }) => {
    await gotoGrid(page, {})
    await openPopover(page)

    // `name` sorts early in the grid's column order, which is exactly what made
    // the parse rebuild the list in column order and insert this row at the top.
    await popover(page).getByRole("button", { name: "Add condition" }).click()
    await expect
      .poll(() => new URL(page.url()).searchParams.get("f.name"))
      .toBe("contains:")
    // `+ Add condition` offers the row's identity column first.
    await expect(conditionRow(page, "name").locator("[data-grid-filter-field]")).toHaveText("Name")

    await popover(page).getByRole("button", { name: "Add condition" }).click()
    await expect.poll(() => new URL(page.url()).searchParams.get("f.phone")).toBe("contains:")

    const order = await popover(page)
      .locator("[data-grid-filter-condition]")
      .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-grid-filter-condition")))

    // Top to bottom: Name, then Phone. A parse that iterated column order would
    // yield this pair in whichever order the grid happens to sort them.
    expect(order).toEqual(["name", "phone"])
  })

  test("the stack survives a reload in the order it was built", async ({ page }) => {
    await gotoGrid(page, {
      params: { "f.name": "contains:a", "f.phone": "contains:9", "f.notes": "contains:z" },
    })
    await openPopover(page)

    const order = await popover(page)
      .locator("[data-grid-filter-condition]")
      .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-grid-filter-condition")))

    // The query string's own key order, which is the order they were added.
    expect(order).toEqual(["name", "phone", "notes"])
  })
})
/**
 * The three choice controls — field, operator, connective — render from a local
 * mirror, so the option just picked is on screen before the URL carries it.
 *
 * Everything in here is about the ORDER of two things that used to be the wrong
 * way round. The commit is immediate and local; the URL is a debounced
 * `router.replace` for a condition change and a whole `router.push` transition
 * for the connective. The controls rendered straight from the prop, so each one
 * showed the value from BEFORE the pick for as long as the write took — the
 * field Select snapping back to the previous column, the operator Select to the
 * previous operator, the connective to `and`.
 *
 * The risk of fixing that is a second source of truth, and it is the one thing
 * that would make this worse than the bug: a display that stops believing the URL
 * is a display that keeps showing conditions a shared link, Back or `Clear
 * filters` has already removed. So the last test here is the one that matters
 * most — it drives an external change and asserts the mirror follows it.
 */
test.describe("CAP-12 — the choice controls lead the URL", () => {
  test("the field trigger shows a newly picked field before the URL changes", async ({ page }) => {
    await gotoGrid(page, { params: { "f.name": "contains:a" } })
    await openPopover(page)

    await conditionRow(page, "name").locator("[data-grid-filter-field]").click()
    await page.getByRole("option", { name: "Phone", exact: true }).click()

    const picked = await choiceState(page)

    expect(picked.field, "the field trigger leads the URL").toBe("Phone")
    // The URL is still the pre-pick query — that is what makes the assertion
    // above mean anything. On the old build this read "Name", and would have
    // started reading "Phone" only once these two lines became false.
    expect(new URLSearchParams(picked.search).get("f.name")).toBe("contains:a")
    expect(new URLSearchParams(picked.search).get("f.phone")).toBeNull()

    // And it settles under the URL rather than snapping back: the row moves to
    // the new column, carrying the same operator and an empty value.
    await expect.poll(() => new URL(page.url()).searchParams.get("f.phone")).toBe("contains:")
    await expect(conditionRow(page, "phone").locator("[data-grid-filter-field]")).toHaveText("Phone")
    await expect(conditionRow(page, "phone").locator("[data-grid-filter-operator]")).toHaveText("contains")
  })

  test("the operator trigger shows a newly picked operator, and the value control changes shape", async ({
    page,
  }) => {
    await gotoGrid(page, { params: { "f.name": "contains:a" } })
    await openPopover(page)

    await conditionRow(page, "name").locator("[data-grid-filter-operator]").click()
    await page.getByRole("option", { name: "is empty", exact: true }).click()

    const picked = await choiceState(page)

    expect(picked.operator, "the operator trigger leads the URL").toBe("is empty")
    expect(new URLSearchParams(picked.search).get("f.name")).toBe("contains:a")
    // The control renders the NEW operator's shape on this paint rather than the
    // text box that belonged to the operator just replaced: `is empty` takes no
    // value, so it is greyed out — present, not absent.
    expect(picked.valueDisabled, "the value control follows the operator's shape").toBe(true)

    await expect.poll(() => new URL(page.url()).searchParams.get("f.name")).toBe("isEmpty:")
    await expect(conditionRow(page, "name").locator("[data-grid-filter-operator]")).toHaveText("is empty")
  })

  test("the connective trigger shows the new connective before the URL carries it", async ({ page }) => {
    await gotoGrid(page, { params: { "f.name": "contains:a", "f.phone": "contains:9" } })
    await openPopover(page)

    await popover(page).locator("[data-grid-filter-connective]").first().click()
    await page.getByRole("option", { name: "or", exact: true }).click()

    const picked = await choiceState(page)

    // The connective is the same lag for a different reason — `setFilterConnective`
    // PUSHES rather than debouncing, so the prop is a whole router transition
    // away — which is why it needs the mirror as much as the two Selects do.
    expect(picked.connective, "the connective trigger leads the URL").toBe("or")
    // `f.` means match-all and `fa.` match-any, so the keys have not moved yet.
    expect(new URLSearchParams(picked.search).get("f.name")).toBe("contains:a")
    expect(new URLSearchParams(picked.search).get("fa.name")).toBeNull()

    // **AND NOTHING ABOUT WHERE THAT WRITE LANDS IS ASSERTED HERE.** Switching the
    // connective in the popover loses every condition: the push writes the `fa.`
    // family correctly, and the table's own match-any state then hands TanStack an
    // EMPTY `columnFilters` (`grid.tsx:743`), which the next state change writes
    // back over the URL. Reproduced on `c5d9b71` with no mirror in the file, and it
    // lives in the write layer this story is forbidden to touch — so the test above
    // claims the control, and the defect is left for whoever owns `write`.
  })

  test("three field picks inside one debounce window all display, and the URL carries the last", async ({
    page,
  }) => {
    await gotoGrid(page, {})
    await openPopover(page)
    await popover(page).getByRole("button", { name: "Add condition" }).click()
    await expect.poll(() => new URL(page.url()).searchParams.get("f.name")).toBe("contains:")

    // Each pick is read back in the instant it is made, so a build that displays
    // only after the write lands fails on the SECOND pick rather than quietly
    // passing on the last. The picks are issued faster than the 250 ms debounce
    // and nothing here waits for the URL; that they share one window is what the
    // debounce is for, and the assertions do not depend on it.
    //
    // `Source` sits in the middle on purpose. It is a single-valued select, so
    // `emptyCondition` hands it `value: []` while the codec reads the same token
    // back as `value: ""` — a round trip that is invisible in the UI and breaks
    // any comparison made on the raw list rather than on what the URL will carry.
    const picks: ReadonlyArray<readonly [string, string]> = [
      ["phone", "Phone"],
      ["source", "Source"],
      ["notes", "Notes"],
    ]

    let columnId = "name"

    for (const [nextColumn, label] of picks) {
      await conditionRow(page, columnId).locator("[data-grid-filter-field]").click()
      await page.getByRole("option", { name: label, exact: true }).click()

      const picked = await choiceState(page)

      expect(picked.field, `the ${label} pick must display on the next paint`).toBe(label)
      columnId = nextColumn
    }

    // One surviving write, carrying the last pick and neither of the others: each
    // pick replaced the same condition rather than adding to a list the prop had
    // not caught up with.
    await expect.poll(() => new URL(page.url()).searchParams.get("f.notes")).toBe("contains:")
    await expect(new URL(page.url()).searchParams.get("f.phone")).toBeNull()
    await expect(new URL(page.url()).searchParams.get("f.source")).toBeNull()
    await expect(popover(page).locator("[data-grid-filter-condition]")).toHaveCount(1)
    await expect(conditionRow(page, "notes").locator("[data-grid-filter-field]")).toHaveText("Notes")
  })

  test("Back restores the previous conditions, so the mirror is not the only truth", async ({ page }) => {
    // `Clear filters` is a PUSH and the only control in the grid that puts a
    // change in history — a condition change is a debounced `replace`, so nothing
    // else here can build the entry Back needs. It is also only reachable from the
    // no-matches panel, which is why the grid is landed on a filter that matches
    // nothing.
    await gotoGrid(page, { params: { "f.name": "contains:zzz-no-such-name-zzz" } })
    await expectVisibleCount(page, 0)
    await openPopover(page)

    // A local change that lands, so the mirror has been through a full round trip
    // and has handed the display back to the prop before Back arrives. The value
    // is filled on purpose: an unfinished condition is pruned on close, and a
    // pruned row would leave nothing for Back to restore.
    await conditionRow(page, "name").locator("[data-grid-filter-field]").click()
    await page.getByRole("option", { name: "Notes", exact: true }).click()

    const value = conditionRow(page, "notes").locator("[data-grid-filter-value]")
    await value.click()
    await value.pressSequentially("zzz")
    await expect.poll(() => new URL(page.url()).searchParams.get("f.notes")).toBe("contains:zzz")

    await popover(page).getByRole("button", { name: "Close filters" }).click()
    await expect(popover(page)).toHaveCount(0)

    await page.getByRole("button", { name: "Clear filters" }).click()
    await expect.poll(() => new URL(page.url()).searchParams.get("f.notes")).toBeNull()
    await expectVisibleCount(page, (await scopedContacts()).length)

    await page.goBack()

    await expect.poll(() => new URL(page.url()).searchParams.get("f.notes")).toBe("contains:zzz")
    await expectVisibleCount(page, 0)

    // The rows are rendered from the mirror, so a mirror that had stopped
    // reconciling shows an EMPTY list here — and passes both assertions above.
    // This is the assertion that keeps the mirror subordinate to the URL.
    await openPopover(page)
    await expect(conditionRow(page, "notes")).toBeVisible()
    await expect(conditionRow(page, "notes").locator("[data-grid-filter-field]")).toHaveText("Notes")
    await expect(conditionRow(page, "notes").locator("[data-grid-filter-value]")).toHaveValue("zzz")
  })
})
