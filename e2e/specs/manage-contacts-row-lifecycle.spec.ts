/**
 * The delete half of the grid's row lifecycle, plus the primitive's opt-in.
 *
 * The Contacts section retires the toolbar's inline create (spec-contacts-section
 * CAP-4 / D7): its one create control is `Add contact`, which opens the form.
 * The add cases that used to live here therefore moved to `contact-grid.spec.ts`
 * as an absence assertion, and this file keeps what still ships:
 *
 * | Test | Claim |
 * | ---- | ----- |
 * | opt-in | a `Grid` with no `rowLifecycle` offers neither an add control nor a context menu |
 * | confirm | the dialog names the row, and no `DELETE` is issued until it is confirmed |
 * | report | a refused delete keeps its row and reports the server's own reason |
 *
 * Delete cases create their own tagged row: `contacts` is shared by every spec,
 * and removing a generated row would shrink the set later specs read from. The
 * service worker is blocked because `page.route` cannot intercept what a
 * controlling worker serves — the race is described in
 * `docs/architecture/testing.md:804`.
 */

import { expect, test, type Page } from "@playwright/test"

import {
  ROW_LIFECYCLE_TAG,
  cleanupRowLifecycleContacts,
  createRowLifecycleContact,
} from "../fixtures/bulk-contacts"
import {
  SINGLE_CONTACT_ROUTE,
  deleteCancelButton,
  deleteConfirmButton,
  deleteConfirmDialog,
  deleteReportLines,
  deleteReportPanel,
  deleteSelectedMenuItem,
  openContactsGrid,
  openPreviewGrid,
  openRowContextMenu,
  renderedRows,
  rowById,
} from "../fixtures/manage-grid"

test.use({ serviceWorkers: "block" })

function ownedPhone(offset: number): string {
  return `6${String(Date.now()).slice(-8)}${offset}`.slice(0, 10)
}

function ownedName(offset: number): string {
  return `${ROW_LIFECYCLE_TAG}${Date.now()}${offset}`
}

/**
 * Make every `DELETE` on the single-contact route answer `409` with the
 * attendance-conflict wording.
 *
 * Registered before navigation; see the file header on the service worker.
 */
async function refuseDeletes(page: Page): Promise<void> {
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
}

test.describe("row lifecycle", () => {
  test("opt-in — a grid without rowLifecycle has neither affordance", async ({ page }) => {
    // The preview harness renders the same `Grid` primitive with no
    // `rowLifecycle`, which is the only honest way to prove the slot is opt-in:
    // the contacts grid still supplies it for delete.
    await openPreviewGrid(page)

    await expect(
      page.getByRole("button", { name: /Add record/ }),
      "no add control is injected into a grid that did not ask for one",
    ).toHaveCount(0)
    await expect(
      page.getByRole("button", { name: /^Delete / }),
      "no per-row delete button exists either",
    ).toHaveCount(0)
    await expect(
      page.locator("[data-grid-add-record]"),
      "and the add control's own marker is absent, not merely unnamed",
    ).toHaveCount(0)

    // Delete is a row context menu now, so the opt-in claim has to cover it
    // too: a right-click on a preview row opens nothing at all.
    await renderedRows(page).first().click({ button: "right" })
    await expect(
      page.getByRole("menu"),
      "no context menu is wired into a grid that did not ask for one",
    ).toHaveCount(0)
    await expect(renderedRows(page).first(), "the grid itself did render").toBeVisible()
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

      // Filtered to the one row: the grid is virtualized over 250+ contacts,
      // and a row inserted at the end of the set sits outside the rendered
      // window entirely.
      await openContactsGrid(page, { params: { q: name } })
      await expect(rowById(page, created.id), "the inserted row is addressable").toBeVisible()

      await openRowContextMenu(page, created.id)
      await deleteSelectedMenuItem(page).click()

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

      await openRowContextMenu(page, created.id)
      await deleteSelectedMenuItem(page).click()
      await deleteConfirmButton(page).click()

      await expect(rowById(page, created.id), "the confirmed delete removes the row").toHaveCount(0)
      await expect
        .poll(() => requests.length, { message: "confirming never issued the DELETE" })
        .toBe(1)

      // A successful delete reports nothing: the row leaving the grid is the
      // confirmation, and the operator already knows what they asked for.
      await expect(deleteReportPanel(page), "a success is not reported").toHaveCount(0)

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

      // Forced `409`, which is a reachable real answer: `deleteManageContact`
      // maps the attendance foreign-key violation to exactly this status.
      await refuseDeletes(page)

      await openContactsGrid(page, { params: { q: name } })
      await expect(rowById(page, created.id), "the inserted row is addressable").toBeVisible()

      await openRowContextMenu(page, created.id)
      await deleteSelectedMenuItem(page).click()
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
})
