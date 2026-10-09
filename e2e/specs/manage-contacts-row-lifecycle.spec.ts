/**
 * CAP-6 — the row lifecycle on the contacts grid.
 *
 * | Test | Scenario | Claim under test |
 * | ---- | -------- | ---------------- |
 * | add | `+ Add record` then immediately type | the new row's **first editable cell** holds DOM focus, and a printable character seeds that cell's editor rather than being swallowed by the button that was clicked |
 * | invalid | a draft committed with a required field blank | the real handler answers `400 Phone is required.`; the cell reverts, marks destructive, the status line names the server's own reason, and nothing was written |
 * | confirm | delete confirmation | the dialog names the row and **no** `DELETE` is issued until it is confirmed; cancelling issues none either |
 * | report | per-row delete outcomes | one visible line per deleted row naming the row and the server's message, successes included; a refused delete keeps its row and claims no success |
 * | revert | a failed create | an intercepted `500` reverts the cell and names the failure, and writes nothing |
 *
 * ## Why the delete cases create their own row
 *
 * `contacts` is shared by every spec in this suite. A delete case that removed a
 * generated row would shrink the set the selection, filter and bulk rows read
 * from, and the failure would surface in a later spec as a mystery. So each
 * delete case inserts a contact tagged `preview-fixture-rowlife-`, deletes
 * *that*, and `cleanupRowLifecycleContacts` removes whatever is left in a
 * `finally` — refusing, by name, to delete anything that is not tagged.
 *
 * The tag is deliberately **not** the bulk tag: `bulk-fixtures.spec.ts` asserts
 * invariants over the generated set (exactly one blank-phone row, every row
 * assigned to the program's Preacher or Admin, every name distinct) and the
 * generator re-asserts them on the next run, so a leftover spec row must not
 * land inside it.
 *
 * ## Why the add cases run unfiltered
 *
 * A draft row's cells are all blank, so any active global filter hides it — and
 * the grid reports that rather than losing focus silently. Filtering first would
 * test the filter, not the lifecycle.
 *
 * ## Why the optimistic assertions are held open
 *
 * "The value appears before the write resolves" is only observable if the write
 * is still unresolved when the assertion runs. Both add assertions park the POST
 * in a `page.route` handler and assert against the in-flight state, and both
 * assert the interception actually caught the request — otherwise a slow server
 * would satisfy them just as well as a fast optimistic render.
 *
 * ## Why "add then immediately type" is its own test
 *
 * The focus lands on a *cell*, not on the editor: `+ Add record` moves the
 * keyboard model, and the first printable character opens the editor through the
 * story-2 type-to-edit branch. Two different mechanisms; a single combined
 * assertion would pass if only one of them worked.
 */

import { expect, test, type Page } from "@playwright/test"

import {
  ROW_LIFECYCLE_TAG,
  bulkFixtureClient,
  cleanupRowLifecycleContacts,
  createRowLifecycleContact,
} from "../fixtures/bulk-contacts"
import {
  SINGLE_CONTACT_ROUTE,
  addRecordButton,
  cellIn,
  deleteCancelButton,
  deleteConfirmButton,
  deleteConfirmDialog,
  deleteReportLines,
  deleteReportPanel,
  gridStatusLine,
  manageContactsUrl,
  openContactsGrid,
  renderedRows,
  rowById,
  rowDeleteButton,
} from "../fixtures/manage-grid"

/** The in-cell editor the grid mounts for a text column. */
function cellEditor(page: Page) {
  return page.getByRole("textbox", { name: "Edit cell value" })
}

/** The row the grid appended last, which is the draft under test. */
function draftRow(page: Page) {
  return renderedRows(page).last()
}

/**
 * A phone this run owns.
 *
 * `contacts.phone` is `NOT NULL` and `UNIQUE (phone, program_id)`, so a spec that
 * creates a record needs one it owns. The `7` prefix cannot collide with the
 * generator's `80…` range or the seeder's `9000000001-4`.
 */
function ownedPhone(offset: number): string {
  return `7${String(Date.now() + offset).slice(-9)}`
}

/** A name this run owns, tagged so cleanup may remove it and nothing else. */
function ownedName(offset: number): string {
  return `${ROW_LIFECYCLE_TAG}${Date.now()}${offset}`
}

/** The row ids holding `name`, read straight from the database. */
async function idsForName(name: string): Promise<string[]> {
  const { data, error } = await bulkFixtureClient().from("contacts").select("id").eq("name", name)

  if (error) {
    throw new Error(`Reading ids for "${name}" failed: ${error.message}`)
  }

  return (data ?? []).map((row) => row.id as string)
}

/** The names holding each of `phones`, read straight from the database. */
async function namesForPhones(phones: readonly string[]): Promise<Map<string, string | null>> {
  const found = new Map<string, string | null>(phones.map((phone) => [phone, null]))

  const { data, error } = await bulkFixtureClient()
    .from("contacts")
    .select("phone,name")
    .in("phone", [...phones])

  if (error) {
    throw new Error(`Reading ${phones.length} phone(s) failed: ${error.message}`)
  }

  for (const row of (data ?? []) as Array<{ phone: string; name: string }>) {
    found.set(row.phone, row.name)
  }

  return found
}

/**
 * Park every POST aimed at the single-contact route until `release()` is called.
 *
 * Returns the release handle plus a counter, so a spec can both hold the write
 * open for an optimistic assertion and then prove the interception actually ran
 * rather than passing against a value that appeared because the server had
 * already answered.
 */
function holdCreateRequests(page: Page) {
  let release: () => void = () => undefined
  let intercepted = 0

  const held = new Promise<void>((resolve) => {
    release = resolve
  })

  const handler = async (route: import("@playwright/test").Route) => {
    if (route.request().method() !== "POST") {
      await route.continue()
      return
    }

    intercepted += 1
    await held
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Unable to create the contact." }),
    })
  }

  page.route(SINGLE_CONTACT_ROUTE, handler)

  return {
    release,
    get intercepted() {
      return intercepted
    },
    async unroute() {
      release()
      await page.unroute(SINGLE_CONTACT_ROUTE, handler)
    },
  }
}

test.describe("row lifecycle", () => {
  test("add — the new row's first editable cell takes focus, and typing seeds that cell's editor", async ({
    page,
  }) => {
    const held = holdCreateRequests(page)

    try {
      await openContactsGrid(page)
      await expect(addRecordButton(page), "the lifecycle is opt-in and the control is offered").toBeEnabled()

      await addRecordButton(page).click()

      // Focus lands through the keyboard model on the row's first *editable*
      // column — `name`, which is also the frozen identity column — and on the
      // cell, not on the grid frame and not on the editor.
      const nameCell = cellIn(draftRow(page), "name")
      await expect(nameCell, "the appended row's first editable cell holds focus").toBeFocused()
      await expect(cellEditor(page), "the editor is not opened for them").toHaveCount(0)

      // A printable character opens the editor through the story-2 type-to-edit
      // branch, seeded with itself. Had focus stayed on the button, this text
      // would have gone nowhere.
      await page.keyboard.type("Ravi")
      await expect(cellEditor(page), "typing seeds the editor with what was typed").toHaveValue("Ravi")
      await expect(nameCell, "the editor is inside the new row's name cell").toBeVisible()

      await page.keyboard.press("Enter")

      // Held open, so this is the optimistic display and not a fast server.
      await expect(nameCell, "the committed value paints before the write resolves").toHaveText("Ravi")
      expect(held.intercepted, "the interception caught the create write").toBe(1)
    } finally {
      await held.unroute()
    }
  })

  test("invalid — a draft with a required field blank is refused, names the reason, and writes nothing", async ({
    page,
  }) => {
    const name = ownedName(0)
    const phone = ownedPhone(0)
    const created: string[] = []

    try {
      await openContactsGrid(page)
      await addRecordButton(page).click()

      await page.keyboard.type(name)
      await page.keyboard.press("Enter")

      // The real handler, not an interception: `parseContactPatch` is the one
      // place the required-field rules live, and this is the assertion that the
      // create path actually runs through it.
      await expect(
        gridStatusLine(page),
        "the server's own wording reaches the grid's status line",
      ).toHaveText("Phone is required.")
      await expect(
        cellIn(draftRow(page), "name"),
        "the refused cell is marked destructive",
      ).toHaveClass(/text-destructive/)

      expect(
        await namesForPhones([phone]),
        "a refused create wrote nothing",
      ).toEqual(new Map([[phone, null]]))

      // The draft survives its refusal, so the record can be completed: the
      // second commit carries the first field's value along. Dropping the draft
      // instead would make a two-`NOT NULL` record impossible to create.
      await cellIn(draftRow(page), "phone").click()
      await page.keyboard.type(phone)
      await page.keyboard.press("Enter")

      await expect(
        gridStatusLine(page),
        "a completed draft clears the previous failure",
      ).not.toHaveText("Phone is required.")

      await expect
        .poll(async () => (await namesForPhones([phone])).get(phone), {
          message: "the completed draft was never created",
        })
        .toBe(name)

      created.push(...(await idsForName(name)))

      // Survives a reload, read through a filter so the row is addressable: the
      // rows are virtualized and the created row is last in an unfiltered set.
      await page.goto(manageContactsUrl({ params: { q: name } }))
      await expect(
        gridStatusLine(page),
        "the grid loaded the contacts tab after the reload",
      ).toBeAttached()
      await expect(
        page.getByText(name, { exact: true }).first(),
        "the created record survives a reload",
      ).toBeVisible()
    } finally {
      created.push(...(await idsForName(name)))
      await cleanupRowLifecycleContacts(created)
    }
  })

  test("confirm — the dialog names the row and nothing is deleted until it is confirmed", async ({ page }) => {
    const name = ownedName(1)
    const phone = ownedPhone(1)
    let ids: string[] = []

    try {
      const created = await createRowLifecycleContact({ name, phone })
      ids = [created.id]

      const requests: string[] = []
      page.on("request", (request) => {
        if (request.method() === "DELETE") requests.push(request.url())
      })

      await openContactsGrid(page)
      await page.getByText(name, { exact: true }).first().waitFor()

      await rowDeleteButton(page, created.id).click()

      await expect(deleteConfirmDialog(page), "the confirmation is shown").toBeVisible()
      await expect(
        deleteConfirmDialog(page),
        "the confirmation names the row it will remove",
      ).toContainText(name)
      expect(requests, "opening the dialog issues no DELETE").toHaveLength(0)

      await deleteCancelButton(page).click()
      await expect(deleteConfirmDialog(page), "cancelling closes it").toHaveCount(0)
      expect(requests, "cancelling issues no DELETE").toHaveLength(0)
      await expect(rowById(page, created.id), "the row is untouched").toBeVisible()

      await rowDeleteButton(page, created.id).click()
      await deleteConfirmButton(page).click()

      await expect(rowById(page, created.id), "the confirmed delete removes the row").toHaveCount(0)
      await expect
        .poll(() => requests.length, { message: "confirming never issued the DELETE" })
        .toBe(1)

      await expect(deleteReportPanel(page), "the outcome is reported per row, not toasted").toBeVisible()
      const lines = await deleteReportLines(page)
      expect(lines, "one line for the one row acted on").toHaveLength(1)
      expect(lines[0], "the line names the row").toContain(name)
      expect(lines[0], "a success says so").toContain("Deleted.")

      // The row is gone for good, so the spec owns nothing to clean up.
      ids = []
    } finally {
      await cleanupRowLifecycleContacts(ids)
    }
  })

  test("report — a refused delete keeps its row and claims no success", async ({ page }) => {
    const name = ownedName(2)
    const phone = ownedPhone(2)
    let ids: string[] = []

    try {
      const created = await createRowLifecycleContact({ name, phone })
      ids = [created.id]

      await openContactsGrid(page)
      await page.getByText(name, { exact: true }).first().waitFor()

      // Forced `409`, which is a reachable real answer: `deleteManageContact`
      // maps the attendance foreign-key violation to exactly this status, and
      // this wording.
      await page.route(SINGLE_CONTACT_ROUTE, async (route) => {
        if (route.request().method() !== "DELETE") {
          await route.continue()
          return
        }

        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            error: "This contact has attendance recorded against it and cannot be deleted.",
            code: "manage_contact_has_attendance",
          }),
        })
      })

      await rowDeleteButton(page, created.id).click()
      await deleteConfirmButton(page).click()

      await expect(deleteReportPanel(page), "the outcome is reported, not toasted").toBeVisible()

      const lines = await deleteReportLines(page)
      expect(lines, "one line for the one row acted on").toHaveLength(1)
      expect(lines[0], "the line names the row").toContain(name)
      expect(lines[0], "the line carries the server's own reason").toContain(
        "This contact has attendance recorded against it and cannot be deleted.",
      )
      expect(lines[0], "a refused row claims no success").not.toContain("Deleted.")

      await expect(
        rowById(page, created.id),
        "a row the server refused stays on screen",
      ).toBeVisible()
    } finally {
      await page.unroute(SINGLE_CONTACT_ROUTE).catch(() => undefined)
      await cleanupRowLifecycleContacts(ids)
    }
  })

  test("revert — a failed create reverts the cell, names the failure, and writes nothing", async ({ page }) => {
    const name = ownedName(3)
    const phone = ownedPhone(3)
    const created: string[] = []
    const held = holdCreateRequests(page)

    try {
      await openContactsGrid(page)
      await addRecordButton(page).click()

      await page.keyboard.type(name)
      await cellIn(draftRow(page), "phone").click()
      await page.keyboard.type(phone)
      await page.keyboard.press("Enter")

      // In flight: the value is on screen while the write is unresolved.
      await expect(cellIn(draftRow(page), "name")).toHaveText(name)
      expect(held.intercepted, "the interception caught the create write").toBe(1)

      await held.release()

      await expect(
        gridStatusLine(page),
        "the failed create reverts through the one rejection path",
      ).toHaveText("Unable to create the contact.")
      await expect(
        cellIn(draftRow(page), "phone"),
        "the refused cell is marked destructive",
      ).toHaveClass(/text-destructive/)

      expect(
        await namesForPhones([phone]),
        "a failed create wrote nothing",
      ).toEqual(new Map([[phone, null]]))

      created.push(...(await idsForName(name)))
    } finally {
      await held.unroute()
      await cleanupRowLifecycleContacts(created)
    }
  })
})
