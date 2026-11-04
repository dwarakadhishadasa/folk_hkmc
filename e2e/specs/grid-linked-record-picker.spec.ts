/**
 * A linked record, pickable in the cell and in the filter — spec-linked-record-picker.
 *
 * The spec's I/O & edge-case matrix is the source of truth, and each test below
 * carries the matrix row it covers:
 *
 * | Row | Scenario          | What is asserted here                                        |
 * | --- | ----------------- | ------------------------------------------------------------ |
 * | ADD_TO_EMPTY         | a record picked in an empty cell writes `[id]`; the cell shows the name, never the id |
 * | REPLACE_WHILE_SET    | a set cell offers only its chip — no list that could make it hold two |
 * | CLEAR                | the chip's `×` writes `[]` and the cell renders empty        |
 * | SECOND_ID            | a two-id PATCH is a `400 invalid_patch` and writes nothing   |
 * | SECOND_ID_DIRECT     | a direct two-id write past the API is rejected by the CHECK  |
 * | OUT_OF_SCOPE_ID      | a Preacher PATCHing an id outside their scope is refused     |
 * | NON_ADMIN_OPTIONS    | a Preacher's picker lists exactly the locations they own     |
 * | FILTER_PICK          | a linked condition's value is a dropdown of names, and the pick stores the label |
 * | LEGACY_FILTER_TOKEN  | a bare `f.location=<label>` still reads as `contains`        |
 *
 * The two the AC names but the cell grid cannot reach are covered where they
 * actually live: `SECOND_ID_DIRECT` proves the constraint the API exists to spare
 * clients from, and the favourites view gets its own test because a shipped
 * screen must not be able to build the request the constraint refuses.
 *
 * ## Why expected counts come from the database, not the grid
 *
 * Every count assertion computes the rows the fixture data implies through the
 * service client and compares the grid against that. "The grid agrees with
 * itself" would pass for a filter that silently did nothing.
 *
 * ## Why the chosen location is derived, not spelled
 *
 * The local database carries stale locations from older seeders (names like
 * `preview-fixture-bulk-location-1-folk-T. Nagar Temple`), so a hard-coded
 * "Adyar Temple" is a substring of more than one option and a hard-coded id can
 * drift. `distinctLocationWithContacts()` picks a name that no other location
 * name contains *and* that at least one contact carries, which is what makes
 * both "the picker has one matching option" and "`contains:<name>` matches that
 * location's rows" true rather than lucky.
 */

import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"

import {
  BULK_CONTACT_COLUMNS,
  bulkFixtureClient,
  inScopeContacts,
  listBulkContacts,
  listProgramLocations,
  readPreacherLocationIds,
  type BulkContact,
} from "../fixtures/bulk-contacts"
import {
  cellIn,
  expectVisibleCount,
  filterGlobally,
  manageContactsUrl,
  openCellEditor,
  openContactsGrid,
  readContactColumn,
  restoreContactColumn,
  rowById,
} from "../fixtures/manage-grid"
import { storageStatePath } from "../fixtures/roles"

const PROGRAM = "folk"

/** The single-row route, addressed the way the grid addresses it. */
const SINGLE_CONTACT_ENDPOINT = "/api/manage/contacts"

/**
 * Every contact in the program, unscoped — the Admin's view, and the set a
 * filter's expected count is computed against.
 *
 * Deliberately not `listBulkContacts`, which is `source = 'preview-fixture-bulk'`
 * only: the program also holds seeded and spec-created rows, and a count that
 * ignored them would disagree with the grid for a reason that has nothing to do
 * with the picker.
 */
async function programContacts(): Promise<BulkContact[]> {
  const { data, error } = await bulkFixtureClient()
    .from("contacts")
    .select(BULK_CONTACT_COLUMNS)
    .eq("program_id", PROGRAM)

  if (error) throw new Error(`Reading the program's contacts failed: ${error.message}`)
  return (data ?? []) as BulkContact[]
}

/** A row's stored `location_ids`, read straight from the database. */
async function storedLocationIds(contactId: string): Promise<string[] | null> {
  return (await readContactColumn<string[]>([contactId], "location_ids")).get(contactId) ?? null
}

/** A location name that no other location name contains, and that rows carry. */
async function distinctLocationWithContacts(): Promise<{ id: string; name: string; contacts: number }> {
  const [locations, rows] = await Promise.all([listProgramLocations(PROGRAM), programContacts()])

  const counts = new Map<string, number>()
  for (const row of rows) {
    for (const id of row.location_ids ?? []) {
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
  }

  const candidates = locations
    .filter(
      (location) =>
        (counts.get(location.id) ?? 0) > 0 &&
        // No other *location* name contains this one, so the option list has a
        // single exact-text match and `contains:<name>` cannot reach another id.
        !locations.some((other) => other.id !== location.id && other.name.includes(location.name)),
    )
    .sort(
      (left, right) =>
        (counts.get(right.id) ?? 0) - (counts.get(left.id) ?? 0) || left.name.localeCompare(right.name),
    )

  const chosen = candidates[0]
  if (!chosen) {
    throw new Error(
      "No location in the program has a name unique among location names and at least one contact: the " +
        "picker's exact-text assertions need one.",
    )
  }

  return { id: chosen.id, name: chosen.name, contacts: counts.get(chosen.id) ?? 0 }
}

/** The rows whose joined location names contain `label`, as the grid evaluates them. */
async function expectedForContains(label: string): Promise<number> {
  const [locations, rows] = await Promise.all([listProgramLocations(PROGRAM), programContacts()])
  const nameById = new Map(locations.map((location) => [location.id, location.name]))

  return rows.filter((row) =>
    (row.location_ids ?? []).some((id) => (nameById.get(id) ?? "").includes(label)),
  ).length
}

/**
 * The picker's option whose label is *exactly* `label`.
 *
 * `has: getByText(label, { exact: true })` rather than a name match, because the
 * option's accessible name also carries the record's status (`Adyar Temple
 * Active`) and a substring match would also hit the stale
 * `preview-fixture-bulk-location-5-folk-Adyar Temple` row.
 */
function exactOption(page: Page, label: string) {
  return page
    .locator('[data-grid-editor="options"]')
    .getByRole("option")
    .filter({ has: page.getByText(label, { exact: true }) })
}

/** The label of every option in the open picker, in DOM order. */
async function optionLabels(page: Page): Promise<string[]> {
  return page.locator('[data-grid-editor="option"]').evaluateAll((options) =>
    options.map((option) => option.querySelector("span.truncate")?.textContent?.trim() ?? ""),
  )
}

test.describe("a linked record is picked, not typed", () => {
  test("ADD_TO_EMPTY — one click on the + opens the picker, and the cell body still opens nothing", async ({
    page,
  }) => {
    const empty = (await listBulkContacts(PROGRAM)).find(
      (contact) => (contact.location_ids ?? []).length === 0,
    )
    expect(empty, "the generated set must offer a contact with no location").toBeDefined()

    await openContactsGrid(page)
    await filterGlobally(page, empty!.name)
    await expect(rowById(page, empty!.id)).toBeVisible()

    const cell = cellIn(rowById(page, empty!.id), "location")
    const finder = page.getByRole("textbox", { name: "Find Location" })

    // The control is not hover-only. A blank cell whose only opener appears
    // after a hover the operator has not made yet reads as a dead cell — which
    // is exactly how a new row's location picker looked unreachable.
    await expect
      .poll(
        () =>
          cell
            .locator('[data-grid-editor="linked-add"]')
            .evaluate((element) => getComputedStyle(element).opacity),
        { message: "the add control is visible without a hover" },
      )
      .not.toBe("0")

    // CAP-10 still governs the cell: a click on the body focuses it and opens
    // nothing. Aimed at the far edge so the control at the leading edge is not
    // what is hit, and derived from the box rather than a fixed offset because
    // the column's width is not this spec's to assume.
    const box = await cell.boundingBox()
    expect(box, "the cell must be laid out before it can be clicked").toBeTruthy()
    await cell.click({ position: { x: box!.width - 6, y: 12 } })
    await expect(finder).toHaveCount(0)

    // And the exception is the control alone, on one click — not two.
    await cell.hover()
    await cell.locator('[data-grid-editor="linked-add"]').click()
    await expect(finder).toBeVisible()
    await expect(page.locator('[data-grid-editor="options"]')).toBeVisible()
  })

  test("ADD_TO_EMPTY — an empty cell lists the records and commits exactly one id", async ({ page }) => {
    const empty = (await listBulkContacts(PROGRAM)).find(
      (contact) => (contact.location_ids ?? []).length === 0,
    )
    expect(empty, "the generated set must offer a contact with no location").toBeDefined()

    const target = await distinctLocationWithContacts()
    const before = await readContactColumn<string[]>([empty!.id], "location_ids")

    try {
      await openContactsGrid(page)
      await filterGlobally(page, empty!.name)
      await expect(rowById(page, empty!.id)).toBeVisible()

      await openCellEditor(cellIn(rowById(page, empty!.id), "location"))

      // An empty field opens on the search + list, not on a chip.
      await expect(page.getByRole("textbox", { name: "Find Location" })).toBeVisible()
      await exactOption(page, target.name).click()

      await expect
        .poll(async () => storedLocationIds(empty!.id), {
          message: "picking a record must commit an array of exactly one id",
        })
        .toEqual([target.id])

      // The committed override is the raw id until the payload refreshes, so the
      // cell is proof the editor maps a known id back to its label.
      const cell = cellIn(rowById(page, empty!.id), "location")
      await expect(cell).toContainText(target.name)
      await expect(cell, "a raw id means the picker did not resolve its own commit").not.toContainText(
        target.id,
      )
    } finally {
      await restoreContactColumn(before, "location_ids")
    }
  })

  test("REPLACE_WHILE_SET — a set cell shows its chip and offers no second value", async ({ page }) => {
    const set = (await listBulkContacts(PROGRAM)).find(
      (contact) => (contact.location_ids ?? []).length === 1,
    )
    expect(set, "the generated set must offer a contact with one location").toBeDefined()

    const locations = await listProgramLocations(PROGRAM)
    const name = new Map(locations.map((location) => [location.id, location.name])).get(
      set!.location_ids![0],
    )
    expect(name, "a single-location row must point at a nameable location").toBeTruthy()

    await openContactsGrid(page)
    await filterGlobally(page, set!.name)
    await expect(rowById(page, set!.id)).toBeVisible()

    await openCellEditor(cellIn(rowById(page, set!.id), "location"))

    const chip = page.locator('[data-grid-editor="linked-current"]')
    await expect(chip).toBeVisible()
    await expect(chip).toContainText(name!)

    // The two surfaces that would offer a second value are absent, not merely
    // inert: a list beside the chip is the offer the one-location rule forbids.
    await expect(page.locator('[data-grid-editor="options"]')).toHaveCount(0)
    await expect(page.getByRole("textbox", { name: "Find Location" })).toHaveCount(0)
  })

  test("CLEAR — the pill's × writes an empty array and the cell renders empty", async ({ page }) => {
    const set = (await listBulkContacts(PROGRAM)).find(
      (contact) => (contact.location_ids ?? []).length === 1,
    )
    expect(set, "the generated set must offer a contact with one location").toBeDefined()

    const locations = await listProgramLocations(PROGRAM)
    const name = new Map(locations.map((location) => [location.id, location.name])).get(
      set!.location_ids![0],
    )
    const before = await readContactColumn<string[]>([set!.id], "location_ids")

    try {
      await openContactsGrid(page)
      await filterGlobally(page, set!.name)
      await expect(rowById(page, set!.id)).toBeVisible()

      // The pill's own control is the removal route, so this test never opens an
      // editor: clearing a record is not something to open a popover for.
      const cell = cellIn(rowById(page, set!.id), "location")
      await cell.hover()
      await cell.locator('[data-grid-editor="linked-remove"]').click()

      await expect
        .poll(async () => storedLocationIds(set!.id), {
          message: "the remove control must write an empty array, not null or a leftover",
        })
        .toEqual([])

      await expect(cellIn(rowById(page, set!.id), "location")).not.toContainText(name!)

      // No editor opened, then or since: the control in the pill is the whole
      // interaction.
      await expect(page.getByRole("textbox", { name: "Find Location" })).toHaveCount(0)
    } finally {
      await restoreContactColumn(before, "location_ids")
    }
  })

  test("SECOND_ID — a two-id PATCH is a 400 invalid_patch and writes nothing", async ({ request }) => {
    const rows = await programContacts()
    const contact = rows.find((row) => (row.location_ids ?? []).length > 0)
    expect(contact, "the program must offer a row to attempt the write against").toBeDefined()

    const locations = await listProgramLocations(PROGRAM)
    const [first, second] = locations
    expect(second, "the program must offer two locations").toBeDefined()

    const before = await readContactColumn<string[]>([contact!.id], "location_ids")

    const response = await request.patch(SINGLE_CONTACT_ENDPOINT, {
      data: { contactId: contact!.id, locationIds: [first.id, second.id] },
    })

    expect(response.status(), "a second id must be refused before the database is reached").toBe(400)
    const body = (await response.json()) as { error?: string; code?: string }
    expect(body.code).toBe("invalid_patch")
    expect(body.error).toMatch(/at most one location/i)

    const after = await readContactColumn<string[]>([contact!.id], "location_ids")
    expect(after.get(contact!.id)).toEqual(before.get(contact!.id))
  })

  test("OUT_OF_SCOPE_ID — a Preacher's out-of-scope id is a 400 and no write occurs", async ({
    browser,
  }) => {
    const inScope = (await inScopeContacts(PROGRAM)).find(
      (contact) => (contact.location_ids ?? []).length === 1,
    )
    expect(inScope, "the Preacher's scope must offer a row with a location to change").toBeDefined()

    const owned = new Set(await readPreacherLocationIds(PROGRAM))
    const locations = await listProgramLocations(PROGRAM)
    const outside = locations.find((location) => !owned.has(location.id))
    expect(outside, "a location outside the Preacher's scope must exist").toBeDefined()

    const before = await readContactColumn<string[]>([inScope!.id], "location_ids")
    const context = await browser.newContext({ storageState: storageStatePath("preacher") })

    try {
      const response = await context.request.patch(SINGLE_CONTACT_ENDPOINT, {
        data: { contactId: inScope!.id, locationIds: [outside!.id] },
      })

      expect(
        response.status(),
        "an id the caller cannot see must be refused, not written and hidden by a write policy",
      ).toBe(400)

      const body = (await response.json()) as { error?: string; code?: string }
      expect(body.code).toBe("invalid_patch")
      expect(body.error).toMatch(/outside your scope|do not exist/i)

      const after = await readContactColumn<string[]>([inScope!.id], "location_ids")
      expect(after.get(inScope!.id)).toEqual(before.get(inScope!.id))
    } finally {
      await context.close()
    }
  })

  test("NON_ADMIN_OPTIONS — the Preacher's picker lists exactly the locations they own", async ({
    browser,
  }) => {
    const owned = new Set(await readPreacherLocationIds(PROGRAM))
    const locations = await listProgramLocations(PROGRAM)
    const ownedNames = locations
      .filter((location) => owned.has(location.id))
      .map((location) => location.name)
      .sort()
    const outsideName = locations.find((location) => !owned.has(location.id))?.name
    expect(ownedNames.length, "the Preacher owns at least one location").toBeGreaterThan(0)
    expect(outsideName, "a location the Preacher does not own must exist").toBeTruthy()

    const empty = (await inScopeContacts(PROGRAM)).find(
      (contact) => (contact.location_ids ?? []).length === 0,
    )
    expect(empty, "the Preacher's scope must offer a contact with no location").toBeDefined()

    const context = await browser.newContext({ storageState: storageStatePath("preacher") })

    try {
      const page = await context.newPage()
      await openContactsGrid(page, { mode: "preacher" })
      await filterGlobally(page, empty!.name)
      await expect(rowById(page, empty!.id)).toBeVisible()

      await openCellEditor(cellIn(rowById(page, empty!.id), "location"))
      await expect(page.locator('[data-grid-editor="options"]')).toBeVisible()

      const labels = (await optionLabels(page)).sort()
      expect(labels, "the option list is the caller's scoped set, by name").toEqual(ownedNames)
      expect(labels, "an out-of-scope location must not be offered").not.toContain(outsideName)

      // The record rows carry a name and its status, and nothing else.
      await expect(page.locator('[data-grid-editor="option"]').first()).toContainText("Active")
    } finally {
      await context.close()
    }
  })

  test("FILTER_PICK — a linked condition's value is a dropdown of names and stores the label", async ({
    page,
  }) => {
    const target = await distinctLocationWithContacts()

    await openContactsGrid(page)

    await page.locator("[data-grid-filter-control]").click()
    const popover = page.locator("[data-grid-filter-popover]")
    await expect(popover).toBeVisible()

    // A fresh condition starts on the identity column; switch it to Location.
    await popover.getByRole("button", { name: "Add condition", exact: true }).click()
    await popover.locator('[data-grid-filter-condition="name"] [data-grid-filter-field]').click()
    await page.getByRole("option", { name: "Location", exact: true }).click()

    const row = popover.locator('[data-grid-filter-condition="location"]')
    // The value control is a record dropdown, not the free-text input `text`
    // fields get — that is the whole change.
    await expect(row.locator("[data-grid-filter-value]")).toHaveText("Choose a value")

    await row.locator("[data-grid-filter-value]").click()
    const listbox = page.getByRole("listbox")
    await expect(listbox).toBeVisible()
    await listbox.getByRole("option", { name: target.name, exact: true }).click()

    await expect
      .poll(() => new URL(page.url()).searchParams.get("f.location"), {
        message: "the pick must commit the record's label, not its id",
      })
      .toBe(`contains:${target.name}`)

    await expectVisibleCount(page, target.contacts)
  })

  test("LEGACY_FILTER_TOKEN — a bare f.location=<label> still filters as contains", async ({ page }) => {
    const target = await distinctLocationWithContacts()
    const expected = await expectedForContains(target.name)
    expect(expected, "the chosen label must match rows, or this test proves nothing").toBeGreaterThan(0)

    // The shape a shared link written before the operator travelled inside the
    // value has: no `contains:` prefix.
    await page.goto(manageContactsUrl({ params: { "f.location": target.name } }))

    await expect
      .poll(() => new URL(page.url()).searchParams.get("f.location"), {
        message: "an untouched legacy token keeps its literal spelling",
      })
      .toBe(target.name)

    await expectVisibleCount(page, expected)

    // And it reads as `contains` — the operator `legacyOperatorFor` assigns a
    // bare token, and the one that must stay first in the linked set.
    await page.locator("[data-grid-filter-control]").click()
    await expect(page.locator("[data-grid-filter-popover]")).toBeVisible()
    await expect(
      page.locator('[data-grid-filter-condition="location"] [data-grid-filter-operator]'),
    ).toHaveText("contains")
  })

  test("SECOND_ID_DIRECT — a two-id write past the API is rejected by the CHECK", async () => {
    const rows = await programContacts()
    const contact = rows.find((row) => (row.location_ids ?? []).length === 1)
    expect(contact, "the program must offer a row to attempt the write against").toBeDefined()

    const locations = await listProgramLocations(PROGRAM)
    const [first, second] = locations
    const before = await readContactColumn<string[]>([contact!.id], "location_ids")

    const { error } = await bulkFixtureClient()
      .from("contacts")
      .update({ location_ids: [first.id, second.id] })
      .eq("id", contact!.id)

    expect(error, "the CHECK is the guarantee no UI can give").not.toBeNull()
    expect(error!.message).toMatch(/location_ids_at_most_one|violates check constraint/i)

    const after = await readContactColumn<string[]>([contact!.id], "location_ids")
    expect(after.get(contact!.id)).toEqual(before.get(contact!.id))
  })

  test("the favourites view's Location control is single-select", async ({ page }) => {
    // A favourite with no location, so every pill starts unpressed and the
    // assertions below describe the control rather than the row's prior state.
    const favourite = (await programContacts()).find(
      (contact) => contact.is_favorite && (contact.location_ids ?? []).length === 0,
    )
    expect(favourite, "the fixtures must offer a favourite with no location").toBeDefined()

    await page.goto("/manage?view=favorites&mode=admin")
    await expect(page.getByRole("textbox", { name: "Search favorites" })).toBeVisible()

    await page.getByRole("button").filter({ hasText: favourite!.name }).first().click()

    const fieldset = page.locator("fieldset").filter({ hasText: /^Location/ })
    const pills = fieldset.getByRole("button")
    await expect(pills.first()).toBeVisible()

    // Picking one activates exactly one pill…
    await pills.nth(0).click()
    await expect(fieldset.locator('[aria-pressed="true"]')).toHaveCount(1)

    // …and picking another replaces it rather than adding a second.
    await pills.nth(1).click()
    await expect(fieldset.locator('[aria-pressed="true"]')).toHaveCount(1)

    // Picking the active pill clears the field.
    await fieldset.locator('[aria-pressed="true"]').click()
    await expect(fieldset.locator('[aria-pressed="true"]')).toHaveCount(0)
  })
})
