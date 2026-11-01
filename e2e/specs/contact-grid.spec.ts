/**
 * The Contacts tab's one create control, and the retired inline create.
 *
 * CAP-4 / D7: the Manage grid moves into the section unchanged except that the
 * toolbar's `+ Add record` is not rendered; `Add contact` in the header opens
 * the existing form.
 */

import { expect, test } from "@playwright/test"

import { storageStatePath } from "../fixtures/roles"
import { openContactsGrid, gridRoot, inScopeCounts } from "../fixtures/manage-grid"

test.use({ storageState: storageStatePath("preacher") })

test.describe("contacts tab", () => {
  test("the desktop header offers Add contact and the toolbar offers no Add record", async ({ page }) => {
    await openContactsGrid(page)

    await expect(page.getByRole("link", { name: "Add contact" }).first()).toHaveAttribute(
      "href",
      "/contact",
    )
    await expect(
      page.getByRole("button", { name: /Add record/ }),
      "the inline create is retired on this tab",
    ).toHaveCount(0)
    await expect(
      page.locator("[data-grid-add-record]"),
      "the control is not painted and is absent from the accessibility tree",
    ).toBeHidden()
  })

  test("the tab is the personal scope: the header count is the grid's whole-scope total", async ({ page }) => {
    await openContactsGrid(page)
    await expect(gridRoot(page)).toBeVisible()

    const scope = await page.getByText(/^\d[\d,]* contacts · \d[\d,]* locations$/).innerText()
    const contacts = Number(scope.replace(/,/g, "").match(/^(\d+) contacts/)?.[1] ?? "-1")

    await expect
      .poll(async () => (await inScopeCounts(page)).total)
      .toBe(contacts)
  })

  test("a retired /manage?view=contacts link redirects to the grid, dropping mode and keeping grid params", async ({
    page,
  }) => {
    await page.goto("/manage?view=contacts&mode=admin&q=Padmavathi&f.phone=isEmpty%3A")

    await expect(page).toHaveURL(/\/contacts\/grid\?/)
    const params = new URL(page.url()).searchParams
    expect(params.get("q")).toBe("Padmavathi")
    expect(params.get("f.phone")).toBe("isEmpty:")
    expect(params.get("mode"), "the section has no scope switch").toBeNull()
    expect(params.get("view")).toBeNull()
    await expect(gridRoot(page)).toBeVisible()
  })
})
