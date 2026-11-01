/**
 * Reports' figures are doors, and the period moves exactly the two cards that
 * say they are period-scoped.
 *
 * As with the Overview spec, the definitions are unit-tested; this asserts the
 * links and the population statements the reader depends on. Runs as the
 * Preacher so the personal scope has generated rows.
 */

import { expect, test, type Page } from "@playwright/test"

import { storageStatePath } from "../fixtures/roles"
import { gridRoot, inScopeCounts } from "../fixtures/manage-grid"

test.use({ storageState: storageStatePath("preacher") })

async function stageCount(page: Page, stage: string): Promise<number> {
  const text = await page.locator(`[data-report-stage="${stage}"]`).getAttribute("data-metric-count")
  return Number(text)
}

test.describe("contacts reports", () => {
  test("every linked figure lands on a grid that reports the same visible count", async ({ page }) => {
    await page.goto("/contacts/reports")
    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible()

    const links = await page.locator("[data-metric-link]").evaluateAll((elements) =>
      elements.map((element) => ({
        label: (element.textContent ?? "").replace(/\s+/g, " ").trim(),
        href: element.getAttribute("href") ?? "",
        count: Number(element.getAttribute("data-metric-count")),
      })),
    )

    expect(links.length, "Reports must render linked figures").toBeGreaterThan(0)

    for (const link of links) {
      expect(link.href.startsWith("/contacts/grid?"), `${link.label} must link into the grid`).toBe(true)

      await page.goto(link.href)
      await expect(gridRoot(page)).toBeVisible()

      await expect
        .poll(async () => (await inScopeCounts(page)).visible, {
          message: `"${link.label}" reported ${link.count} but the grid never agreed`,
        })
        .toBe(link.count)
    }
  })

  test("the period select moves the funnel, and All time covers the whole scope", async ({ page }) => {
    await page.goto("/contacts/reports")

    const period = page.getByRole("combobox", { name: "Period" }).first()
    await expect(period).toHaveValue("last90")

    const qualityBefore = await page.locator("[data-contact-quality] > div").allInnerTexts()

    await period.selectOption("all")
    await expect(page).toHaveURL(/period=all/)

    const scope = await page.getByText(/^\d[\d,]* contacts · \d[\d,]* locations$/).innerText()
    const contacts = Number(scope.replace(/,/g, "").match(/^(\d+) contacts/)?.[1] ?? "-1")

    expect(await stageCount(page, "collected"), "All time is the whole personal scope").toBe(contacts)
    await expect
      .poll(async () => page.locator("[data-contact-quality] > div").allInnerTexts())
      .toEqual(qualityBefore)

    await period.selectOption("last30")
    await expect(page).toHaveURL(/period=last30/)
    await expect(page.getByText(/From first contact.*Last 30 days/)).toBeVisible()
  })

  test("the month chart states its fixed twelve-month window, and the quality list does not follow the period", async ({
    page,
  }) => {
    await page.goto("/contacts/reports?period=last90")

    const qualityBefore = await page.locator("[data-contact-quality] > div").allInnerTexts()

    // The card's own subtitle states its window; that is the contract D6 asks
    // for. The column count is a function of the data (an empty window says so
    // in a sentence), so it is the subtitle and the period independence that
    // this spec can assert without inventing fixture dates.
    await expect(
      page.getByText(/last twelve months, whatever the period select says/i).first(),
    ).toBeVisible()

    await page.getByRole("combobox", { name: "Period" }).first().selectOption("last30")
    await expect(page).toHaveURL(/period=last30/)

    await expect
      .poll(async () => page.locator("[data-contact-quality] > div").allInnerTexts())
      .toEqual(qualityBefore)
  })

  test("on a phone the period is a full-width control and only the funnel and quality list render", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/contacts/reports?period=all")

    await expect(page.getByRole("combobox", { name: "Period" })).toBeVisible()
    await expect(page.locator('[data-report-stage="collected"]')).toBeVisible()
    await expect(page.locator("[data-contact-quality]")).toBeVisible()

    await expect(page.getByText("Who collects contacts").first()).toBeHidden()
    await expect(
      page.getByText(/last twelve months, whatever the period select says/i).first(),
    ).toBeHidden()
  })
})
