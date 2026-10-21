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
  SINGLE_CONTACT_ROUTE,
} from "../fixtures/manage-grid"
import { storageStatePath } from "../fixtures/roles"

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
  return page.locator("[data-contact-record]")
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
  return page.getByRole("status").filter({ hasText: message })
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

    await openListFor(page, contact.id, contact.name)
    await listCell(page, contact.id, "name").click()
    await expect(sheet(page)).toBeVisible()

    await sheet(page).getByRole("button", { name: "Expand contact" }).click()

    await expect(record(page)).toBeVisible()
    await expect(record(page)).toHaveAttribute("aria-label", `Contact: ${contact.name}`)

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

  test("a refused write is reported on the notice line, and the value reverts", async ({ page }) => {
    const [contact] = await inScopeContacts()

    if (!contact) {
      throw new Error("No in-scope contact; the suite needs generated fixtures.")
    }

    // The server's own refusal, forced: the list is not a grid, so it cannot
    // mark a cell — the refusal rides the one notice line, above the list.
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

    try {
      await openListFor(page, contact.id, contact.name)
      await listCell(page, contact.id, "name").click()
      await expect(sheet(page)).toBeVisible()

      const name = sheet(page).getByRole("textbox", { name: "Name", exact: true })
      await name.click()
      await name.press("ControlOrMeta+a")
      await name.press("Backspace")
      await name.pressSequentially(`${contact.name}-Refused`)

      // `Enter` commits the field — the same gesture the grid's own editors
      // use — and the write goes through the grid's one write path.
      await name.press("Enter")

      await expect(notice(page, "Name is required.")).toBeVisible()

      // Nothing was written.
      expect((await readContactColumn<string>([contact.id], "name")).get(contact.id)).toBe(contact.name)

      // And the field shows the value it held: `Escape` puts the draft back,
      // and the reopened sheet starts from the stored value.
      await name.press("Escape")
      await expect(sheet(page)).toBeHidden()

      await listCell(page, contact.id, "name").click()
      await expect(sheet(page).getByRole("textbox", { name: "Name", exact: true })).toHaveValue(
        contact.name,
      )
    } finally {
      await page.unroute(SINGLE_CONTACT_ROUTE)
    }
  })
})
