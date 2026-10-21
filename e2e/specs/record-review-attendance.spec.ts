/**
 * The record-review interface on the Attendance tab.
 *
 * The tab used to render a stacked list-then-detail table. It now renders a
 * record review: a roster of contact cards beside the focused contact's
 * record, which is the arrangement the Airtable interface this was ported from
 * uses. The spec covers the five properties that arrangement is made of, and
 * one that it is *not*:
 *
 * | Property                | Claim                                                                 |
 * | ----------------------- | --------------------------------------------------------------------- |
 * | A roster of cards       | the roster is a listbox of options, not a table — no `<table>` anywhere |
 * | A focused record        | selecting a card fills the detail pane, and marks exactly that card     |
 * | A shareable focus       | the focused record's id is in the URL, so a link names a record          |
 * | A narrowing search      | the search field narrows the roster                                     |
 * | A location filter       | the location dropdown narrows the roster to the ticked locations         |
 * | Read-only detail        | the detail pane offers no write affordance at all                       |
 *
 * The last row is the negative half of the port. The Airtable page this came
 * from was read-only throughout, and the ported detail pane is too: the
 * editing surface in this app is the contacts grid, and a second write path
 * for the same fields would be the thing the grid pattern exists to prevent.
 */

import { expect, test, type Locator, type Page } from "@playwright/test"

import { listProgramContacts, listProgramLocations } from "../fixtures/bulk-contacts"

const ATTENDANCE_URL = "/manage?view=attendance&mode=admin"

/** The roster: the listbox of contact cards. */
function roster(page: Page): Locator {
  return page.getByRole("listbox", { name: "Contacts" })
}

/** The detail pane. */
function detail(page: Page): Locator {
  return page.locator("[data-record-review-detail]")
}

/** The detail pane's identity — the record's own name, in the pane's heading. */
function detailHeading(page: Page): Locator {
  return detail(page).locator("h2").first()
}

/**
 * How many records the roster holds right now.
 *
 * The badge's RAW value, not its formatted text: the badge reads "1,234", and
 * a count read by stripping separators is a count one locale away from being
 * wrong.
 */
async function rosterCount(page: Page): Promise<number> {
  const value = await page
    .locator("[data-record-review-roster] [data-record-review-count]")
    .getAttribute("data-record-review-count-value")

  return Number(value ?? "")
}

/** The location filter's trigger, and the menu it opens. */
function locationTrigger(page: Page): Locator {
  return page.locator("[data-manage-location-filter]")
}

/** Open the location filter and wait for the menu it opens. */
async function openLocationMenu(page: Page): Promise<void> {
  await locationTrigger(page).click()
  await expect(page.getByRole("menu")).toBeVisible()
}

/** One location's checkbox in the open menu. */
function locationOption(page: Page, name: string): Locator {
  // Exact, because the local database carries locations from older seeders
  // whose names carry a prefix — "Adyar Temple" and
  // "preview-fixture-bulk-location-5-folk-Adyar Temple" are two different
  // locations, and a substring match would resolve to both.
  return page.getByRole("menuitemcheckbox", { name, exact: true })
}

/** The ids of the records the roster currently renders. */
async function renderedRecordIds(page: Page): Promise<string[]> {
  return page.locator("[data-record-review-record-id]").evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-record-review-record-id") ?? ""),
  )
}

test.describe("the record-review interface on the Attendance tab", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ATTENDANCE_URL)
    await expect(roster(page)).toBeVisible()
  })

  test("the roster is a list of cards, not a table", async ({ page }) => {
    await expect(roster(page)).toBeVisible()

    // The card list replaced a table. A `<table>` on this surface would mean
    // the old table is still here, or that the detail pane's records list
    // grew one — neither is the shape this surface is supposed to have.
    await expect(page.locator("table")).toHaveCount(0)

    // Cards are options: one per record, each carrying a name and a phone.
    const options = roster(page).getByRole("option")
    await expect(options.first()).toBeVisible()
    expect(await options.count()).toBeGreaterThan(0)

    const first = options.first()
    await expect(first).toHaveAttribute("aria-selected", "false")
    await expect(first.locator("div").first()).not.toBeEmpty()
  })

  test("selecting a card fills the detail pane and marks that card", async ({ page }) => {
    const options = roster(page).getByRole("option")
    await expect(options.first()).toBeVisible()

    const name = (await options.nth(1).innerText()).split("\n")[0]?.trim()
    expect(name, "the second card carries a name").toBeTruthy()

    await options.nth(1).click()

    // Exactly one card is selected, and it is the one that was clicked.
    await expect(options.nth(1)).toHaveAttribute("aria-selected", "true")
    await expect(options.nth(0)).toHaveAttribute("aria-selected", "false")

    // The detail pane now names the record that was picked.
    await expect(detailHeading(page)).toContainText(name as string)
  })

  test("the focused record is in the URL, so a link names a record", async ({ page }) => {
    const options = roster(page).getByRole("option")
    await expect(options.first()).toBeVisible()

    await options.nth(2).click()

    await expect(page).toHaveURL(/[?&]rec=/)

    // The id in the URL is the id of the record that was focused, and opening
    // that URL again focuses the same record.
    const rec = new URL(page.url()).searchParams.get("rec")
    expect(rec, "the focused record's id is in the URL").toBeTruthy()

    await page.goto(ATTENDANCE_URL)
    await expect(roster(page)).toBeVisible()
    await page.goto(`${ATTENDANCE_URL}&rec=${rec}`)
    await expect(roster(page)).toBeVisible()

    await expect(page.locator("[role='option'][aria-selected='true']")).toHaveCount(1)
  })

  test("the search narrows the roster", async ({ page }) => {
    const options = roster(page).getByRole("option")
    await expect(options.first()).toBeVisible()

    const before = await options.count()

    const search = page.getByRole("searchbox", { name: "Search name or phone" })
    await search.fill("__no_such_contact__")

    await expect(options).toHaveCount(0)
    await expect(page.getByText("No contacts match the current filters.")).toBeVisible()

    await search.fill("")
    await expect(options.first()).toBeVisible()
    expect(await options.count()).toBe(before)
  })

  test("the detail pane is read-only", async ({ page }) => {
    const options = roster(page).getByRole("option")
    await expect(options.first()).toBeVisible()
    await options.nth(0).click()

    // A record review reads. The write surface for a contact is the contacts
    // grid, and a second one here would be a second truth.
    await expect(detail(page).locator("input, textarea, select")).toHaveCount(0)
    await expect(detail(page).getByRole("button", { name: /save|commit|edit/i })).toHaveCount(0)
  })

  test("the location dropdown narrows the roster to the ticked locations", async ({ page }) => {
    // The expectation is read from the database rather than named: the seeded
    // program's locations change with the seeder's pool, and a test that names
    // one of them stops being a test the moment that pool moves.
    const locations = await listProgramLocations()
    const contacts = await listProgramContacts()

    const nameCounts = new Map<string, number>()
    for (const location of locations) {
      nameCounts.set(location.name, (nameCounts.get(location.name) ?? 0) + 1)
    }

    // TWO locations whose names are unique in the program and which hold
    // contacts. Two, because the filter's operator is "is in ANY of these" and
    // one location cannot tell it apart from "is in ALL of these" — with a
    // single name, `hasAnyOf` and `hasAllOf` return the same answer.
    const candidates = locations.filter((location) => {
      if ((nameCounts.get(location.name) ?? 0) !== 1) {
        return false
      }

      return contacts.some((contact) => (contact.location_ids ?? []).includes(location.id))
    })

    expect(
      candidates.length,
      "the program must offer at least two locations holding contacts",
    ).toBeGreaterThanOrEqual(2)

    const [first, second] = candidates
    const contactsIn = (locationId: string) =>
      contacts.filter((contact) => (contact.location_ids ?? []).includes(locationId))

    const firstContacts = contactsIn(first.id)
    const secondContacts = contactsIn(second.id)

    expect(firstContacts.length, "the first location must hold contacts").toBeGreaterThan(0)
    expect(secondContacts.length, "the second location must hold contacts").toBeGreaterThan(0)

    // A contact sits in at most one location, so the two sets are disjoint and
    // the union is their sum. Asserting it rather than assuming it keeps a
    // schema change from quietly turning the union assertion into a lie.
    expect(
      firstContacts.filter((contact) => secondContacts.some((other) => other.id === contact.id)),
      "the two locations must hold disjoint contacts",
    ).toHaveLength(0)

    await page.goto(ATTENDANCE_URL)
    await expect(roster(page)).toBeVisible()

    const before = await rosterCount(page)

    // The precondition every count below rests on: the admin roster holds
    // every program contact, so the roster's count and the database's count
    // are the same number. If this fails, the counts are comparing two
    // different sets and the assertions after it would fail for the wrong
    // reason.
    expect(before, "the admin roster holds every program contact").toBe(contacts.length)
    expect(
      contacts.length - firstContacts.length - secondContacts.length,
      "a contact must sit outside both locations",
    ).toBeGreaterThan(0)

    // Tick the first location.
    await openLocationMenu(page)
    await locationOption(page, first.name).click()

    // The list stays OPEN while it is ticked. A multi-select dropdown that
    // closes on every tick makes ticking two locations two round trips to the
    // same menu, and the operator loses the list they were reading.
    await expect(page.getByRole("menu")).toBeVisible()
    await expect(locationOption(page, first.name)).toHaveAttribute("aria-checked", "true")
    await expect.poll(() => rosterCount(page)).toBe(firstContacts.length)

    // Tick the second one: the roster is now the UNION of the two locations.
    await locationOption(page, second.name).click()
    await expect(page.getByRole("menu")).toBeVisible()
    await expect(locationOption(page, second.name)).toHaveAttribute("aria-checked", "true")
    await expect.poll(() => rosterCount(page)).toBe(firstContacts.length + secondContacts.length)

    // Every record on screen belongs to one of the two locations — by ID, not
    // by name: `contacts.name` carries no uniqueness constraint, so a name
    // can satisfy the assertion for the wrong record.
    const expectedIds = new Set([...firstContacts, ...secondContacts].map((contact) => contact.id))
    for (const id of await renderedRecordIds(page)) {
      expect(expectedIds.has(id), `${id} must sit in a ticked location`).toBe(true)
    }

    // Un-ticking the second one narrows back to the first. The delete branch
    // of the checkbox is a branch like any other: untested, it could keep the
    // name and leave the operator looking at the wrong roster.
    await locationOption(page, second.name).click()
    await expect(locationOption(page, second.name)).toHaveAttribute("aria-checked", "false")
    await expect.poll(() => rosterCount(page)).toBe(firstContacts.length)

    // "All locations" clears it, and the roster comes back.
    await page.getByRole("menuitem", { name: "All locations", exact: true }).click()
    await expect.poll(() => rosterCount(page)).toBe(before)
  })
})
