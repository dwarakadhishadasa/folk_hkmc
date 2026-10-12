import { expect, test } from "@playwright/test"
import { cellIn, filterGlobally, openContactsGrid, rowById } from "../fixtures/manage-grid"
import { inScopeContacts } from "../fixtures/bulk-contacts"

test("debug select open", async ({ page }) => {
  const rows = await inScopeContacts()
  const target = rows[43]!
  page.on("console", (m) => console.log("BROWSER:", m.text()))
  await openContactsGrid(page)
  await filterGlobally(page, target.name)
  await expect(rowById(page, target.id)).toBeVisible()

  await cellIn(rowById(page, target.id), "source").click()
  await page.waitForTimeout(500)
  console.log("A options:", await page.getByRole("option").count())

  await page.keyboard.press("Escape")
  for (const w of [0, 20, 50, 100, 200, 400]) {
    await page.waitForTimeout(w)
    console.log(`t=${w}`, await page.evaluate(() => document.activeElement?.getAttribute("data-grid-cell") ?? document.activeElement?.tagName))
  }
})
