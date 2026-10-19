/**
 * The row context menu — CAP-6's delete affordance after the `actions` column
 * retired.
 *
 * | Test | Matrix row | Claim under test |
 * | ---- | ---------- | ---------------- |
 * | selection | IN_SELECTION | the menu's label names the whole selection, and delete removes exactly those rows |
 * | outside | OUTSIDE_SELECTION | a right-click outside the selection replaces it before the menu paints, so the highlight and the target agree |
 * | refused | DELETE (error) | a refused row stays in the table and stays selected, and its report line names it and the server's reason |
 * | draft | DRAFT_ROW | a `draft-` row is removed locally with no request against an id the database never saw |
 * | empty | EMPTY | a header or the empty panel opens no menu |
 * | keyboard | KEYBOARD | `Shift+F10` on the focused row opens the same menu on that row |
 *
 * ## Why these tests create their own rows
 *
 * `contacts` is shared by every spec in the suite. A delete case that removed a
 * generated row would shrink the set the selection, filter and bulk specs read
 * from, and the failure would appear later as a mystery. Each case inserts
 * contacts tagged `preview-fixture-rowlife-`, acts on those, and
 * `cleanupRowLifecycleContacts` removes whatever is left in a `finally`.
 *
 * ## Why the service worker is blocked
 *
 * `providers.tsx` registers `/sw.js` on every page. Once the worker controls the
 * page, requests it serves bypass `page.route`, so an interception installed
 * after `goto` intermittently does not fire — observed in
 * `manage-contacts-row-lifecycle.spec.ts` as a "refused" delete that really
 * deleted the row. `serviceWorkers: "block"` removes the race.
 */

import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"

import {
  ROW_LIFECYCLE_TAG,
  cleanupRowLifecycleContacts,
  createRowLifecycleContact,
  rowLifecyclePhone,
} from "../fixtures/bulk-contacts"
import {
  SINGLE_CONTACT_ROUTE,
  addRecordButton,
  deleteCancelButton,
  deleteConfirmButton,
  deleteConfirmDialog,
  deleteReportLines,
  deleteReportPanel,
  deleteSelectedMenuItem,
  headerCell,
  openContactsGrid,
  openRowContextMenu,
  renderedRows,
  rowById,
} from "../fixtures/manage-grid"

test.use({ serviceWorkers: "block" })

const CONTACTS_ROUTE = "/api/manage/contacts"

/** A phone this run owns; `contacts.phone` is unique per program. */
function ownedPhone(offset: number): string {
  return `7${String(Date.now() + offset).slice(-9)}`
}

/**
 * Insert `count` contacts this run owns, sharing a name prefix so one `q` token
 * narrows the grid to exactly them.
 */
async function createOwnedRows(count: number): Promise<{
  rows: Array<{ id: string; name: string }>
  query: string
}> {
  const stamp = Date.now()
  const rows: Array<{ id: string; name: string }> = []

  for (let index = 0; index < count; index += 1) {
    const name = `${ROW_LIFECYCLE_TAG}${stamp}-${index}`
    const created = await createRowLifecycleContact({ name, phone: ownedPhone(index) })
    rows.push({ id: created.id, name })
  }

  return { rows, query: `${ROW_LIFECYCLE_TAG}${stamp}-` }
}

/** Every DELETE the page issues against the single-contact route, by contact id. */
function recordDeletes(page: Page): string[] {
  const deleted: string[] = []

  page.on("request", (request) => {
    if (request.method() !== "DELETE" || !request.url().includes(CONTACTS_ROUTE)) {
      return
    }

    const body = request.postDataJSON() as { contactId?: unknown } | null

    if (body && typeof body.contactId === "string") {
      deleted.push(body.contactId)
    }
  })

  return deleted
}

/** Select one row through its checkbox and wait for the highlight to follow. */
async function selectRow(page: Page, contactId: string): Promise<void> {
  await rowById(page, contactId).getByRole("checkbox").click()
  await expect(rowById(page, contactId)).toHaveAttribute("data-state", "selected")
}

/** The open menu, portalled by Radix. */
function rowMenu(page: Page) {
  return page.getByRole("menu")
}

test.describe("row context menu", () => {
  test("selection — the menu names every selected row and deletes exactly those", async ({ page }) => {
    const created = await createOwnedRows(3)
    const ids = created.rows.map((row) => row.id)

    try {
      const deleted = recordDeletes(page)

      await openContactsGrid(page, { params: { q: created.query } })
      await expect(renderedRows(page)).toHaveCount(3)

      for (const id of ids) {
        await selectRow(page, id)
      }

      await openRowContextMenu(page, ids[1])

      // The count is the claim: three rows are in scope, three are selected.
      await expect(rowMenu(page)).toBeVisible()
      await expect(rowMenu(page)).toContainText("3 selected rows")
      await expect(deleteSelectedMenuItem(page)).toBeVisible()

      await deleteSelectedMenuItem(page).click()

      await expect(deleteConfirmDialog(page), "the confirmation names the count").toContainText(
        "Delete 3 records?",
      )

      await deleteConfirmButton(page).click()

      for (const id of ids) {
        await expect(rowById(page, id), "every confirmed row leaves the table").toHaveCount(0)
      }

      await expect.poll(() => deleted.length, { message: "one DELETE per row" }).toBe(3)
      expect(new Set(deleted), "exactly the selected rows, no others").toEqual(new Set(ids))

      await expect(deleteReportPanel(page), "the outcome is reported per row").toBeVisible()
      expect(await deleteReportLines(page), "one line per row, successes included").toHaveLength(3)
    } finally {
      await cleanupRowLifecycleContacts(ids)
    }
  })

  test("outside — a right-click outside the selection replaces it before the menu opens", async ({
    page,
  }) => {
    const created = await createOwnedRows(3)
    const ids = created.rows.map((row) => row.id)

    try {
      const deleted = recordDeletes(page)

      await openContactsGrid(page, { params: { q: created.query } })
      await expect(renderedRows(page)).toHaveCount(3)

      await selectRow(page, ids[0])
      await selectRow(page, ids[1])

      // The third row is outside the selection when the pointer lands on it.
      await openRowContextMenu(page, ids[2])

      await expect(rowMenu(page)).toContainText("1 selected row")
      await expect(rowById(page, ids[2]), "the target row is now selected").toHaveAttribute(
        "data-state",
        "selected",
      )
      await expect(rowById(page, ids[0]), "the previous selection is gone").not.toHaveAttribute(
        "data-state",
        "selected",
      )
      await expect(rowById(page, ids[1])).not.toHaveAttribute("data-state", "selected")

      await deleteSelectedMenuItem(page).click()

      const dialog = deleteConfirmDialog(page)
      await expect(dialog).toContainText(created.rows[2].name)
      await expect(dialog, "the dialog names only the replaced target").not.toContainText(
        created.rows[0].name,
      )

      // Cancelling proves the target without deleting anything.
      await deleteCancelButton(page).click()
      await expect(deleteConfirmDialog(page)).toHaveCount(0)
      await expect.poll(() => deleted.length, { message: "cancelling issues no DELETE" }).toBe(0)

      for (const id of ids) {
        await expect(rowById(page, id), "no row was removed").toBeVisible()
      }
    } finally {
      await cleanupRowLifecycleContacts(ids)
    }
  })

  test("refused — a refused row stays in the table, stays selected, and names its reason", async ({
    page,
  }) => {
    const created = await createOwnedRows(3)
    const ids = created.rows.map((row) => row.id)
    const refusedId = ids[1]
    const refusedName = created.rows[1].name

    // Registered before the first navigation: the worker race is blocked, but
    // the ordering is also what makes the interception a given rather than a
    // race against the first row's DELETE.
    await page.route(SINGLE_CONTACT_ROUTE, async (route) => {
      if (route.request().method() !== "DELETE") {
        await route.continue()
        return
      }

      const body = route.request().postDataJSON() as { contactId?: unknown } | null

      if (body?.contactId !== refusedId) {
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

    try {
      const deleted = recordDeletes(page)

      await openContactsGrid(page, { params: { q: created.query } })
      await expect(renderedRows(page)).toHaveCount(3)

      for (const id of ids) {
        await selectRow(page, id)
      }

      await openRowContextMenu(page, ids[0])
      await deleteSelectedMenuItem(page).click()
      await deleteConfirmButton(page).click()

      await expect(rowById(page, refusedId), "a refused row is not removed").toBeVisible()
      await expect(
        rowById(page, refusedId),
        "a refused row keeps the selection it had",
      ).toHaveAttribute("data-state", "selected")

      await expect(rowById(page, ids[0])).toHaveCount(0)
      await expect(rowById(page, ids[2])).toHaveCount(0)

      await expect(deleteReportPanel(page)).toContainText("2 of 3 rows deleted.")
      const lines = await deleteReportLines(page)
      expect(lines, "one line per addressed row").toHaveLength(3)

      const refusedLine = lines.find((line) => line.includes(refusedName))
      expect(refusedLine, "the refused row's line names it").toBeDefined()
      expect(refusedLine, "and carries the server's own reason").toContain("attendance")

      expect(
        deleted.filter((id) => id === refusedId),
        "the refused row still had a DELETE issued — the failure is the server's answer",
      ).toHaveLength(1)
    } finally {
      await page.unroute(SINGLE_CONTACT_ROUTE)
      await cleanupRowLifecycleContacts(ids)
    }
  })

  test("draft — a draft row is removed locally with no request", async ({ page }) => {
    const deleted = recordDeletes(page)

    await openContactsGrid(page)

    await addRecordButton(page).click()

    const draftRow = renderedRows(page).last()
    const draftId = await draftRow.getAttribute("data-grid-row")
    expect(draftId, "the appended row carries a client id").toMatch(/^draft-/)

    await draftRow.getByRole("checkbox").click()
    await expect(draftRow).toHaveAttribute("data-state", "selected")

    await openRowContextMenu(page, draftId as string)

    await expect(rowMenu(page)).toContainText("1 selected row")
    await deleteSelectedMenuItem(page).click()
    await deleteConfirmButton(page).click()

    await expect(rowById(page, draftId as string), "the draft leaves the table").toHaveCount(0)
    await expect.poll(() => deleted.length, { message: "a draft id never reaches the server" }).toBe(0)
  })

  test("empty — a header and the empty panel open no menu", async ({ page }) => {
    await openContactsGrid(page)

    await headerCell(page, "name").click({ button: "right" })
    await expect(rowMenu(page), "the header is not a row").toHaveCount(0)

    // A filter that matches nothing renders the panel in the same scroll
    // surface, so this is the second non-row target the trigger must refuse.
    await openContactsGrid(page, {
      params: { q: "context-menu-probe-no-match" },
      expectRows: false,
    })

    const panel = page.locator('tbody[data-grid-panel^="empty"]')
    await expect(panel).toBeVisible()
    await panel.click({ button: "right", position: { x: 40, y: 40 } })
    await expect(rowMenu(page), "the empty panel is not a row").toHaveCount(0)
  })

  test("keyboard — Shift+F10 on the focused row opens the same menu", async ({ page }) => {
    const created = await createOwnedRows(1)
    const id = created.rows[0].id

    try {
      await openContactsGrid(page, { params: { q: created.query } })

      // Focus the cell the way an operator would: a click on the row's name.
      await rowById(page, id).getByRole("cell").first().click()
      await expect(rowById(page, id)).toHaveAttribute("data-grid-row-focused", "true")

      await page.keyboard.press("Shift+F10")

      await expect(rowMenu(page), "the keyboard opens the same menu").toBeVisible()
      await expect(rowMenu(page)).toContainText("1 selected row")
      await expect(deleteSelectedMenuItem(page)).toBeVisible()

      await page.keyboard.press("Escape")
      await expect(rowMenu(page)).toHaveCount(0)
    } finally {
      await cleanupRowLifecycleContacts([id])
    }
  })
})
