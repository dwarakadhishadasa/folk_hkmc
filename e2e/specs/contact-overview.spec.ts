/**
 * The Overview's one invariant: a figure clicked and the grid's status readout
 * report the same number.
 *
 * The definitions themselves are asserted in `lib/contacts/metrics.test.ts`;
 * this spec exists because a definition that renders a link into the wrong row
 * set is still a defect the unit layer cannot see.
 *
 * Runs as the Preacher, whose scope has enough generated rows for the links to
 * be non-trivial. The section is personal-scope for every role, so the account
 * is the only difference between this and an Admin's view.
 */

import { expect, test, type Page } from "@playwright/test"

import { storageStatePath } from "../fixtures/roles"
import { gridRoot, inScopeCounts } from "../fixtures/manage-grid"

test.use({
  storageState: storageStatePath("preacher"),
  viewport: { width: 1440, height: 900 },
})

interface MetricLink {
  label: string
  href: string
  count: number
}

async function readOverviewLinks(page: Page): Promise<MetricLink[]> {
  await page.goto("/contacts")
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible()

  const links = await page.locator("[data-metric-link]").evaluateAll((elements) =>
    elements.map((element) => ({
      label: (element.textContent ?? "").replace(/\s+/g, " ").trim(),
      href: element.getAttribute("href") ?? "",
      count: Number(element.getAttribute("data-metric-count")),
    })),
  )

  expect(links.length, "the Overview must render linked figures").toBeGreaterThan(0)

  for (const link of links) {
    expect(link.href.startsWith("/contacts/grid?"), `${link.label} must link into the grid`).toBe(true)
    expect(Number.isNaN(link.count), `${link.label} must carry a numeric count`).toBe(false)
  }

  return links
}

test.describe("contacts overview", () => {
  test("every linked figure lands on a grid that reports the same visible count", async ({ page }) => {
    // The body now carries the funnel and collector links as well; the default
    // 60s budget is not enough for one page load per figure.
    test.setTimeout(120_000)

    const links = await readOverviewLinks(page)

    expect(
      links.some((link) => link.count > 0),
      "at least one figure must be non-zero, or the invariant is asserted over nothing",
    ).toBe(true)

    for (const link of links) {
      await page.goto(link.href)
      await expect(gridRoot(page), `${link.label} must land on the grid`).toBeVisible()

      await expect
        .poll(async () => (await inScopeCounts(page)).visible, {
          message: `"${link.label}" reported ${link.count} but the grid never agreed`,
        })
        .toBe(link.count)
    }
  })

  test("the scope line's contact count is the grid's whole-scope total", async ({ page }) => {
    await page.goto("/contacts/grid")
    await expect(gridRoot(page)).toBeVisible()

    const scope = await page.getByText(/^\d[\d,]* contacts · \d[\d,]* locations$/).innerText()
    const contacts = Number(scope.replace(/,/g, "").match(/^(\d+) contacts/)?.[1] ?? "-1")

    expect(contacts, "the scope line must name a contact count").toBeGreaterThan(0)

    await expect
      .poll(async () => (await inScopeCounts(page)).total, {
        message: "the grid's in-scope total must equal the section header's count",
      })
      .toBe(contacts)
  })

  test("on a phone a tile lands on a list whose footer reports the same count", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/contacts")

    const tile = page.getByRole("link", { name: /Never attended/i }).first()
    const count = Number(await tile.getAttribute("data-metric-count"))
    expect(count, "the fixture scope must have a non-zero tile to click").toBeGreaterThan(0)

    await tile.click()
    await expect(page).toHaveURL(/\/contacts\/grid/)
    await expect(page.locator("[data-contact-list]")).toBeVisible()
    await expect(page.locator("[data-contact-filter-chip]")).toContainText("Filtered:")
    await expect(page.locator("[data-contact-list-count]")).toHaveText(
      `${count.toLocaleString("en-IN")} records`,
    )
  })
})
