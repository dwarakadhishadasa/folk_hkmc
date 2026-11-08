/**
 * The contact list — the phone's view of the contacts tab.
 *
 * The contacts tab shows **one** view per device: the contacts grid on a wide
 * viewport, the two-column contact list on a narrow one. The viewport decides,
 * so there is no control to press — and on a phone the list is not a panel
 * over the grid, it **is** the contacts view, with the grid not mounted
 * behind it.
 *
 * These tests walk both sides of the breakpoint, and then the stack the list
 * owns: cell → field sheet → expanded record, and back the same way. The
 * things that make the list worth having are asserted:
 *
 * - the **navigation** is the Airtable one — cell → sheet → record, and back
 *   the same way, so closing the record reveals the sheet it came from rather
 *   than the list;
 * - a write from the list goes through **the grid's own write path**, so the
 *   value reaches the database and a refused write is reported on the one
 *   notice line, above whichever view is showing.
 *
 * The list is not the grid. It shows every contact in scope in two columns —
 * the name and the phone — which is what the Airtable Contacts page showed,
 * so the list is narrowed with the list's **own** search rather than the
 * grid's global filter. The grid's filter writes `q` into the URL and the
 * list's does not, so the two cannot be confused.
 *
 * The phone edit restores the row in a `finally`: `global-setup.ts` seeds by
 * exact deterministic name, and `contacts.phone` is `UNIQUE (phone,
 * program_id)`, so a row left with a phone the generator would produce makes
 * the *next* run fail in seeding rather than in this spec.
 */

import { expect, test, type Locator, type Page } from "@playwright/test"

import { inScopeContacts } from "../fixtures/bulk-contacts"
import {
  manageContactsUrl,
  openContactsGrid,
  readContactColumn,
  restoreContactColumn,
  rowById,
  SINGLE_CONTACT_ROUTE,
} from "../fixtures/manage-grid"
import { storageStatePath } from "../fixtures/roles"

test.use({ storageState: storageStatePath("preacher"), serviceWorkers: "block" })

/**
 * A phone-shaped viewport — narrower than the repository's `MOBILE_BREAKPOINT`.
 */
const PHONE_VIEWPORT = { width: 390, height: 844 }

/**
 * A desktop-shaped viewport — at or above the breakpoint.
 *
 * 1280 is Playwright's own default viewport, which is also the width every
 * other spec in the suite runs at, so the grid specs are unaffected by this
 * file.
 */
const DESKTOP_VIEWPORT = { width: 1280, height: 800 }

/** The contact list itself. */
function contactList(page: Page): Locator {
  return page.locator("[data-contact-list]")
}

/** The list's own search field — not the grid's global filter. */
function listSearch(page: Page): Locator {
  return page.getByRole("searchbox", { name: "Search contacts" })
}

/** The field sheet. */
function sheet(page: Page): Locator {
  return page.locator("[data-contact-sheet]")
}

/** The expanded record. */
function record(page: Page): Locator {
  return page.locator("[data-contact-record-phone]")
}

/** One cell of the list, addressed by the contact's row id. */
function listCell(page: Page, contactId: string, fieldId: string): Locator {
  return contactList(page).locator(`[data-contact-row="${contactId}"] [data-contact-cell="${fieldId}"]`)
}

/**
 * The one notice line, wherever it is.
 *
 * Scoped by the message rather than by position, so the assertion is about the
 * refusal being *reported* and not about which status region happened to be
 * on the page.
 */
function notice(page: Page, message: string): Locator {
  return page.getByRole("alert").filter({ hasText: message })
}

/**
 * Open the list on a phone and narrow it to one contact.
 *
 * The search is **typed**, not `fill`ed: Playwright's `fill` assigns
 * `input.value` directly, which updates React's own value tracker and can
 * suppress `onChange` — the DOM shows the text while no state change happens.
 * Real key events cannot be swallowed that way.
 */
async function openListFor(page: Page, contactId: string, name: string): Promise<void> {
  await page.setViewportSize(PHONE_VIEWPORT)
  await page.goto(manageContactsUrl())
  await expect(contactList(page)).toBeVisible()

  const search = listSearch(page)
  await search.click()
  await search.press("ControlOrMeta+a")
  await search.pressSequentially(name)

  await expect(listCell(page, contactId, "name")).toBeVisible()
}

test.describe("the device-detected contacts view", () => {
  test("a wide viewport shows the grid and no contact list", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await openContactsGrid(page)

    await expect(page.locator("[data-grid-root]")).toBeVisible()
    await expect(contactList(page), "the list is the phone's view, not the desktop's").toHaveCount(0)
  })

  test("a narrow viewport shows the contact list and no grid", async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT)
    await page.goto(manageContactsUrl())

    await expect(contactList(page)).toBeVisible()
    await expect(
      page.locator("[data-grid-root]"),
      "the grid must not be mounted behind the list — nothing may leak into the tab order",
    ).toHaveCount(0)
  })

  test("the breakpoint is the repository's 768", async ({ page }) => {
    // One pixel either side of the boundary. The width *at* the breakpoint is
    // a desktop, because the boundary is exclusive on both sides: `md:` starts
    // at 768, so 768 is a desktop and 767 is a phone.
    await page.setViewportSize({ width: 767, height: 844 })
    await page.goto(manageContactsUrl())
    await expect(contactList(page)).toBeVisible()

    await page.setViewportSize({ width: 768, height: 844 })
    await expect(page.locator("[data-grid-root]")).toBeVisible()
    await expect(contactList(page)).toHaveCount(0)
  })

  test("the view swaps when the viewport crosses the breakpoint, leaving nothing behind", async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT)
    await page.goto(manageContactsUrl())
    await expect(contactList(page)).toBeVisible()

    await page.setViewportSize(DESKTOP_VIEWPORT)
    await expect(page.locator("[data-grid-root]")).toBeVisible()
    await expect(contactList(page), "the list must not linger behind the grid").toHaveCount(0)

    await page.setViewportSize(PHONE_VIEWPORT)
    await expect(contactList(page)).toBeVisible()
    await expect(page.locator("[data-grid-root]"), "the grid must not linger behind the list").toHaveCount(0)
  })

  test("there is no 'Contact list' button at either viewport", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await openContactsGrid(page)
    await expect(
      page.getByRole("button", { name: "Contact list" }),
      "the detection replaces the button, so the button must be gone",
    ).toHaveCount(0)

    await page.setViewportSize(PHONE_VIEWPORT)
    await expect(contactList(page)).toBeVisible()
    await expect(page.getByRole("button", { name: "Contact list" })).toHaveCount(0)
  })

  test("the served page carries neither view, because the viewport is not known yet", async ({
    browser,
    baseURL,
  }) => {
    // A context with JavaScript off sees exactly what the server sent: the
    // hydration that would pick a view never happens, so what is on the page
    // is the served HTML and nothing else. A guess would show up here — the
    // grid's markup or the list's — and the first render is exactly where a
    // guess is most expensive.
    const context = await browser.newContext({
      javaScriptEnabled: false,
      storageState: storageStatePath("admin"),
      baseURL,
    })

    try {
      const page = await context.newPage()
      await page.goto(manageContactsUrl())

      // The portal itself rendered, so the two counts below are about the
      // views and not about an error page.
      await expect(page.getByRole("heading", { name: "Contacts" })).toBeVisible()

      await expect(page.locator("[data-grid-root]")).toHaveCount(0)
      await expect(page.locator("[data-contact-list]")).toHaveCount(0)
    } finally {
      await context.close()
    }
  })
})

test.describe("the contact list", () => {
  test("the list shows the contact's name and phone, and a tapped cell opens that field's sheet", async ({
    page,
  }) => {
    const [contact] = await inScopeContacts()

    if (!contact) {
      throw new Error("No in-scope contact; the suite needs generated fixtures.")
    }

    await openListFor(page, contact.id, contact.name)

    // The two columns are the Airtable Contacts page's two: the primary field
    // and the phone number.
    await expect(listCell(page, contact.id, "name")).toHaveText(contact.name)
    await expect(listCell(page, contact.id, "phone")).toHaveText(contact.phone)

    // A tapped cell opens THAT cell's field — the phone sheet, not the name
    // sheet.
    await listCell(page, contact.id, "phone").click()

    await expect(sheet(page)).toBeVisible()
    await expect(sheet(page)).toHaveAccessibleName("Edit Phone")
    await expect(sheet(page).getByRole("textbox", { name: "Phone", exact: true })).toHaveValue(
      contact.phone,
    )
  })

  test("'Expand contact' opens the whole record, and closing it returns to the sheet", async ({ page }) => {
    const [contact] = await inScopeContacts()

    if (!contact) {
      throw new Error("No in-scope contact; the suite needs generated fixtures.")
    }

    await openListFor(page, contact.id, contact.name)
    await listCell(page, contact.id, "name").click()
    await expect(sheet(page)).toBeVisible()

    await sheet(page).getByRole("button", { name: "Expand contact" }).click()

    await expect(record(page)).toBeVisible()
    await expect(record(page)).toHaveAccessibleName(`Contact record: ${contact.name}`)

    // The record carries the nine fields the list shows, each under its own
    // label. The seam carries the **column id** — `totalAttendanceCount`,
    // not a name invented for this list — so it is the same id the grid
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
    // Focus returns to the control that opened the record, not to the page.
    await expect(sheet(page).getByRole("button", { name: "Expand contact" })).toBeFocused()
  })

  test("Escape in an inline editor discards the draft and keeps the record open", async ({
    page,
  }) => {
    const [contact] = await inScopeContacts()

    if (!contact) {
      throw new Error("No in-scope contact; the suite needs generated fixtures.")
    }

    await openListFor(page, contact.id, contact.name)
    await listCell(page, contact.id, "name").click()
    await sheet(page).getByRole("button", { name: "Expand contact" }).click()
    await expect(record(page)).toBeVisible()

    const name = record(page).getByLabel("Name")
    await name.click()
    await name.fill(`${contact.name}-Draft`)
    await name.press("Escape")

    // The editor discarded the draft; the record did not close.
    await expect(record(page)).toBeVisible()
    await expect(name).toHaveValue(contact.name)
  })

  test("the grid's gutter opens the shared record and mirrors its write", async ({ page }) => {
    const [contact] = await inScopeContacts()

    if (!contact) {
      throw new Error("No in-scope contact; the suite needs generated fixtures.")
    }

    const previous = await readContactColumn<string>([contact.id], "notes")
    const edited = `record-${contact.id.slice(0, 8)}`

    try {
      await page.setViewportSize(DESKTOP_VIEWPORT)
      await openContactsGrid(page, { params: { q: contact.phone } })

      const row = rowById(page, contact.id)
      await row.hover()
      await row.locator("[data-grid-row-expand]").click()

      const dialog = page.locator("[data-contact-record-dialog]")
      await expect(dialog).toBeVisible()
      await expect(dialog.getByLabel("Phone")).toHaveValue(contact.phone)

      const notes = dialog.getByLabel("Notes")
      await notes.fill(edited)
      await notes.press("Tab")

      // The record's commit and the grid's mirror are one write: the cell
      // behind the dialog must carry the new value before a reload.
      await expect
        .poll(async () => (await readContactColumn<string>([contact.id], "notes")).get(contact.id))
        .toBe(edited)

      await page.getByRole("button", { name: "Close dialog" }).click()
      await expect(dialog).toBeHidden()
      await expect(rowById(page, contact.id)).toContainText(edited)
    } finally {
      await restoreContactColumn(previous, "notes")
    }
  })

  test("a refused record write re-reads, reports the message, and keeps the original value", async ({
    page,
  }) => {
    const [contact] = await inScopeContacts()

    if (!contact) {
      throw new Error("No in-scope contact; the suite needs generated fixtures.")
    }

    await page.setViewportSize(DESKTOP_VIEWPORT)
    await openContactsGrid(page, { params: { q: contact.phone } })

    const recordReads: string[] = []

    await page.route(SINGLE_CONTACT_ROUTE, async (route) => {
      if (route.request().method() !== "PATCH") {
        await route.continue()
        return
      }

      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Name is required." }),
      })
    })
    await page.route(/\/api\/manage\/contacts\/[^/]+\/record$/, async (route) => {
      if (route.request().method() === "GET") {
        recordReads.push(route.request().url())
      }

      await route.continue()
    })

    const row = rowById(page, contact.id)
    await row.hover()
    await row.locator("[data-grid-row-expand]").click()

    const dialog = page.locator("[data-contact-record-dialog]")
    await expect(dialog).toBeVisible()

    const readsAfterOpen = recordReads.length

    try {
      const name = dialog.getByLabel("Name")
      await name.click()
      await name.press("ControlOrMeta+a")
      await name.press("Backspace")
      await name.pressSequentially(`${contact.name}-Refused`)
      await name.press("Enter")

      // The frame owns the message; the field editor reverts the rejected
      // draft because the commit rejected, not because the row changed.
      await expect(notice(page, "Name is required.")).toBeVisible()
      await expect(name).toHaveValue(contact.name)

      // The rejected write re-read the record rather than leaving the draft.
      await expect
        .poll(() => recordReads.length, { message: "the rejected write must re-read the record" })
        .toBeGreaterThan(readsAfterOpen)

      // Nothing was written.
      expect((await readContactColumn<string>([contact.id], "name")).get(contact.id)).toBe(contact.name)
    } finally {
      await page.unroute(SINGLE_CONTACT_ROUTE)
      await page.unroute(/\/api\/manage\/contacts\/[^/]+\/record$/)
    }

    await page.getByRole("button", { name: "Close dialog" }).click()
    await expect(dialog).toBeHidden()

    // The grid row behind the record still carries the stored value.
    await expect(
      rowById(page, contact.id).getByRole("cell", { name: contact.name, exact: true }),
    ).toBeVisible()
  })

  test("the grid's row context menu opens the record from the keyboard", async ({ page }) => {
    const [contact] = await inScopeContacts()

    if (!contact) {
      throw new Error("No in-scope contact; the suite needs generated fixtures.")
    }

    await page.setViewportSize(DESKTOP_VIEWPORT)
    await openContactsGrid(page, { params: { q: contact.phone } })

    const row = rowById(page, contact.id)
    await row.getByRole("cell", { name: contact.name, exact: true }).click()
    await page.keyboard.press("Shift+F10")

    await page.getByRole("menuitem", { name: "Expand record" }).click()

    const dialog = page.locator("[data-contact-record-dialog]")
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel("Phone")).toHaveValue(contact.phone)

    await page.getByRole("button", { name: "Close dialog" }).click()
    await expect(dialog).toBeHidden()
  })

  test("Previous and Next step through the grid's visible order", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await openContactsGrid(page)

    const rows = page.locator("tr[data-grid-row]")
    let firstIndex = -1
    let secondIndex = -1
    let firstPhone = ""
    let secondPhone = ""

    for (let index = 0; index < (await rows.count()); index += 1) {
      const phone = (await rows.nth(index).locator("td").nth(2).innerText()).trim()

      if (!phone) {
        continue
      }

      if (firstIndex < 0) {
        firstIndex = index
        firstPhone = phone
      } else {
        secondIndex = index
        secondPhone = phone
        break
      }
    }

    expect(firstIndex, "the grid needs two rows with a phone").toBeGreaterThanOrEqual(0)
    expect(secondIndex, "the grid needs two rows with a phone").toBeGreaterThan(firstIndex)

    const firstRow = rows.nth(firstIndex)
    await firstRow.hover()
    await firstRow.locator("[data-grid-row-expand]").click()

    const dialog = page.locator("[data-contact-record-dialog]")
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel("Phone")).toHaveValue(firstPhone)

    await dialog.getByRole("button", { name: "Next contact" }).click()
    await expect(dialog.getByLabel("Phone")).toHaveValue(secondPhone)

    await dialog.getByRole("button", { name: "Previous contact" }).click()
    await expect(dialog.getByLabel("Phone")).toHaveValue(firstPhone)

    await page.getByRole("button", { name: "Close dialog" }).click()
    await expect(dialog).toBeHidden()
  })

  test("the read-only fields are values, and the writable ones are controls", async ({ page }) => {
    const [contact] = await inScopeContacts()

    if (!contact) {
      throw new Error("No in-scope contact; the suite needs generated fixtures.")
    }

    await openListFor(page, contact.id, contact.name)
    await listCell(page, contact.id, "name").click()
    await sheet(page).getByRole("button", { name: "Expand contact" }).click()
    await expect(record(page)).toBeVisible()

    // Writable: name, phone, location, notes, initial contact.
    await expect(record(page).locator('[data-contact-field="phone"] input')).toBeVisible()
    await expect(record(page).locator('[data-contact-field="notes"] textarea')).toBeVisible()
    await expect(record(page).locator('[data-contact-field="location"] button')).toBeVisible()
    await expect(record(page).locator('[data-contact-field="initialContact"] button')).toBeVisible()

    // Read-only: the attendance rollups, the collector and the favourite. A
    // control on any of them would invite a write the server would refuse.
    for (const fieldId of [
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
      await openListFor(page, contact.id, contact.name)
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
})
