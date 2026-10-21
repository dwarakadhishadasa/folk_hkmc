/**
 * The contact surface — the Airtable mobile interface's Contacts page, brought
 * into this app.
 *
 * The surface is a **stack**: a two-column list, a field sheet that rises over
 * it when a cell is tapped, and the whole record over the sheet when the
 * sheet's "Expand contact" is taken. These tests walk that stack and assert
 * the two things that make it worth having:
 *
 * - the **navigation** is the Airtable one — cell → sheet → record, and back
 *   the same way, so closing the record reveals the sheet it came from rather
 *   than the list;
 * - a write from the surface goes through **the grid's own write path**, so the
 *   value reaches the database and the surface's own optimistic display is
 *   the grid's.
 *
 * The list is not the grid. It shows every contact in scope in two columns —
 * the name and the phone — which is what the Airtable Contacts page showed,
 * so the list is narrowed with the surface's **own** search rather than the
 * grid's global filter. The grid's filter writes `q` into the URL and the
 * surface's does not, so the two cannot be confused.
 *
 * The phone edit restores the row in a `finally`: `global-setup.ts` seeds by
 * exact deterministic name, and `contacts.phone` is `UNIQUE (phone,
 * program_id)`, so a row left with a phone the generator would produce makes
 * the *next* run fail in seeding rather than in this spec.
 */

import { expect, test, type Locator, type Page } from "@playwright/test"

import { inScopeContacts } from "../fixtures/bulk-contacts"
import {
  openContactsGrid,
  readContactColumn,
  restoreContactColumn,
} from "../fixtures/manage-grid"

/** The surface itself. */
function overlay(page: Page): Locator {
  return page.locator("[data-contact-overlay]")
}

/** The surface's own search field — not the grid's global filter. */
function overlaySearch(page: Page): Locator {
  return page.getByRole("searchbox", { name: "Search contacts" })
}

/** The field sheet. */
function sheet(page: Page): Locator {
  return page.locator("[data-contact-sheet]")
}

/** The expanded record. */
function record(page: Page): Locator {
  return page.locator("[data-contact-record]")
}

/** One cell of the surface's list, addressed by the contact's row id. */
function listCell(page: Page, contactId: string, fieldId: string): Locator {
  return overlay(page).locator(`[data-contact-row="${contactId}"] [data-contact-cell="${fieldId}"]`)
}

/**
 * Open the surface and narrow it to one contact.
 *
 * The search is **typed**, not `fill`ed: Playwright's `fill` assigns
 * `input.value` directly, which updates React's own value tracker and can
 * suppress `onChange` — the DOM shows the text while no state change happens.
 * Real key events cannot be swallowed that way.
 */
async function openSurfaceFor(page: Page, contactId: string, name: string): Promise<void> {
  await openContactsGrid(page)
  await page.getByRole("button", { name: "Contact list" }).click()
  await expect(overlay(page)).toBeVisible()

  const search = overlaySearch(page)
  await search.click()
  await search.press("ControlOrMeta+a")
  await search.pressSequentially(name)

  await expect(listCell(page, contactId, "name")).toBeVisible()
}

test.describe("the contact surface", () => {
  test("the list shows the contact's name and phone, and a tapped cell opens that field's sheet", async ({
    page,
  }) => {
    const [contact] = await inScopeContacts()

    if (!contact) {
      throw new Error("No in-scope contact; the suite needs generated fixtures.")
    }

    await openSurfaceFor(page, contact.id, contact.name)

    // The two columns are the Airtable Contacts page's two: the primary field
    // and the phone number.
    await expect(listCell(page, contact.id, "name")).toHaveText(contact.name)
    await expect(listCell(page, contact.id, "phone")).toHaveText(contact.phone)

    // A tapped cell opens THAT cell's field — the phone sheet, not the name
    // sheet.
    await listCell(page, contact.id, "phone").click()

    await expect(sheet(page)).toBeVisible()
    await expect(sheet(page).getByRole("dialog")).toHaveAttribute("aria-label", "Edit Phone")
    await expect(sheet(page).getByRole("textbox", { name: "Phone", exact: true })).toHaveValue(
      contact.phone,
    )
  })

  test("'Expand contact' opens the whole record, and closing it returns to the sheet", async ({ page }) => {
    const [contact] = await inScopeContacts()

    if (!contact) {
      throw new Error("No in-scope contact; the suite needs generated fixtures.")
    }

    await openSurfaceFor(page, contact.id, contact.name)
    await listCell(page, contact.id, "name").click()
    await expect(sheet(page)).toBeVisible()

    await sheet(page).getByRole("button", { name: "Expand contact" }).click()

    await expect(record(page)).toBeVisible()
    await expect(record(page)).toHaveAttribute("aria-label", `Contact: ${contact.name}`)

    // The record carries the nine fields the surface shows, each under its
    // own label. The seam carries the **column id** — `totalAttendanceCount`,
    // not a name invented for this surface — so it is the same id the grid
    // addresses the field by.
    for (const fieldId of [
      "name",
      "phone",
      "location",
      "notes",
      "initialContact",
      "totalAttendanceCount",
      "past60DayAttendanceCount",
      "collectedBy",
      "favorite",
    ]) {
      await expect(record(page).locator(`[data-contact-field="${fieldId}"]`)).toBeVisible()
    }

    // Closing the record reveals the SHEET it came from, not the list: the
    // sheet is a step out of the list and the record is a step out of the
    // sheet, so unwinding one step lands on the sheet.
    await record(page).getByRole("button", { name: "Close" }).click()

    await expect(record(page)).toBeHidden()
    await expect(sheet(page)).toBeVisible()
  })

  test("the read-only fields are values, and the writable ones are controls", async ({ page }) => {
    const [contact] = await inScopeContacts()

    if (!contact) {
      throw new Error("No in-scope contact; the suite needs generated fixtures.")
    }

    await openSurfaceFor(page, contact.id, contact.name)
    await listCell(page, contact.id, "name").click()
    await sheet(page).getByRole("button", { name: "Expand contact" }).click()
    await expect(record(page)).toBeVisible()

    // Writable: name, phone, location, notes.
    await expect(record(page).locator('[data-contact-field="phone"] input')).toBeVisible()
    await expect(record(page).locator('[data-contact-field="notes"] textarea')).toBeVisible()
    await expect(record(page).locator('[data-contact-field="location"] button')).toBeVisible()

    // Read-only: the attendance rollups, the initial contact, the collector
    // and the favourite. A control on any of them would invite a write the
    // server would refuse.
    for (const fieldId of [
      "initialContact",
      "totalAttendanceCount",
      "past60DayAttendanceCount",
      "collectedBy",
      "favorite",
    ]) {
      await expect(record(page).locator(`[data-contact-field="${fieldId}"] input`)).toHaveCount(0)
      await expect(record(page).locator(`[data-contact-field="${fieldId}"] textarea`)).toHaveCount(0)
      await expect(record(page).locator(`[data-contact-field="${fieldId}"] button`)).toHaveCount(0)
    }
  })

  test("an edit in the sheet reaches the database through the grid's write path", async ({ page }) => {
    const [contact] = await inScopeContacts()

    if (!contact) {
      throw new Error("No in-scope contact; the suite needs generated fixtures.")
    }

    const previous = await readContactColumn<string>([contact.id], "notes")
    const edited = `sheet-edit-${contact.id.slice(0, 8)}`

    try {
      await openSurfaceFor(page, contact.id, contact.name)
      await listCell(page, contact.id, "name").click()
      await expect(sheet(page)).toBeVisible()

      await sheet(page).getByRole("button", { name: "Expand contact" }).click()
      await expect(record(page)).toBeVisible()

      const notes = record(page).locator('[data-contact-field="notes"] textarea')
      await notes.click()
      await notes.press("ControlOrMeta+a")
      await notes.press("Backspace")
      await notes.pressSequentially(edited)

      // The write is committed when the field loses focus.
      await record(page).getByRole("button", { name: "Close" }).click()

      await expect
        .poll(async () => (await readContactColumn<string>([contact.id], "notes")).get(contact.id), {
          message: "the note never reached the database",
        })
        .toBe(edited)
    } finally {
      await restoreContactColumn(previous, "notes")
    }
  })

  test("the surface is over the grid, and closing it leaves the grid where it was", async ({ page }) => {
    await openContactsGrid(page)

    await page.getByRole("button", { name: "Contact list" }).click()
    await expect(overlay(page)).toBeVisible()

    // The grid is still mounted underneath — the surface covers it rather
    // than replacing it.
    await expect(page.locator("[data-grid-root]")).toBeAttached()

    await overlay(page).getByRole("button", { name: "Close contacts" }).click()

    await expect(overlay(page)).toBeHidden()
    await expect(page.locator("[data-grid-root]")).toBeVisible()
  })
})
