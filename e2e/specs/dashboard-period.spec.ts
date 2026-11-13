/**
 * CAP-1's period contract: presets, a custom date range, invalid fallback, and
 * a custom window with no activity. The URL is the state throughout.
 */

import { expect, test } from "@playwright/test"

import { buildDashboardFixture, cleanupDashboardFixture, type DashboardFixture } from "../fixtures/dashboard"

let fixture: DashboardFixture

test.beforeAll(async ({ request }) => {
  fixture = await buildDashboardFixture(request)
})

test.afterAll(async () => {
  await cleanupDashboardFixture(fixture)
})

async function contactsCollected(page: import("@playwright/test").Page): Promise<number> {
  const value = await page.locator('[data-dashboard-kpi="contacts-collected"] dd').first().innerText()
  return Number(value.replace(/[^\d]/g, ""))
}

test("a preset changes the figures and a reload keeps it", async ({ page }) => {
  await page.goto("/dashboard?mode=admin&period=last30")
  await expect(page.locator("[data-dashboard-period]")).toHaveAttribute("data-period", "last30")
  const last30 = await contactsCollected(page)

  await page.locator("[data-dashboard-period]").click()
  await page.getByRole("option", { name: "All time" }).click()
  await expect(page).toHaveURL(/period=all/)
  await expect(page.locator("[data-dashboard-period]")).toHaveAttribute("data-period", "all")
  const allTime = await contactsCollected(page)

  // The fixture holds contacts 30 and 200 days old; they are in All time and
  // not in the last 30 days, so the figure must rise.
  expect(allTime).toBeGreaterThan(last30)

  await page.reload()
  await expect(page.locator("[data-dashboard-period]")).toHaveAttribute("data-period", "all")
  expect(await contactsCollected(page)).toBe(allTime)
})

test("the Custom item opens the range calendar inside the same control", async ({ page }) => {
  await page.goto("/dashboard?mode=admin&period=last30")

  await page.locator("[data-dashboard-period]").click()
  await page.getByRole("option", { name: "Custom…" }).click()

  const calendar = page.locator("[data-dashboard-date-range]")
  await expect(calendar).toBeVisible()

  // The calendar opens on the programme month; step back to October and pick
  // a fresh span. First click drafts a start, the second commits.
  await calendar.locator(".rdp-button_previous").click()
  await calendar.locator('button[data-day="10/10/2026"]').click()
  await calendar.locator('button[data-day="10/15/2026"]').click()

  await expect(calendar).toHaveCount(0)
  await expect(page).toHaveURL(/period=custom/)
  await expect(page).toHaveURL(/from=2026-10-10/)
  await expect(page).toHaveURL(/to=2026-10-15/)
})

test("a custom range names itself and stays editable in the same control", async ({ page }) => {
  await page.goto("/dashboard?mode=admin&period=custom&from=2026-10-01&to=2026-10-31")

  const trigger = page.locator("[data-dashboard-period]")
  await expect(trigger).toHaveAttribute("data-period", "custom")
  await expect(trigger).toContainText("1 Oct 2026 – 31 Oct 2026")

  await trigger.click()
  const calendar = page.locator("[data-dashboard-date-range]")
  await expect(calendar).toBeVisible()

  await calendar.locator('button[data-day="10/10/2026"]').click()
  await calendar.locator('button[data-day="10/15/2026"]').click()

  await expect(calendar).toHaveCount(0)
  await expect(page).toHaveURL(/from=2026-10-10/)
  await expect(page).toHaveURL(/to=2026-10-15/)
})

test("an invalid period falls back to last90 without an error page", async ({ page }) => {
  await page.goto("/dashboard?mode=admin&period=nonsense")
  await expect(page.locator("[data-dashboard-period]")).toHaveAttribute("data-period", "last90")

  await page.goto("/dashboard?mode=admin&period=custom&from=2026-13-01&to=2026-12-31")
  await expect(page.locator("[data-dashboard-period]")).toHaveAttribute("data-period", "last90")

  await page.goto("/dashboard?mode=admin&period=custom")
  await expect(page.locator("[data-dashboard-period]")).toHaveAttribute("data-period", "last90")
})

test("a custom window with no activity renders zeros and empty states, never a 500", async ({ page }) => {
  await page.goto("/dashboard?mode=admin&period=custom&from=2025-01-01&to=2025-01-31")

  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible()
  await expect(page.locator('[data-dashboard-kpi="contacts-collected"] dd').first()).toHaveText("0")
  await expect(page.getByText("No contacts were collected in this period.")).toBeVisible()
  await expect(page.getByRole("heading", { name: "Attendance" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "By preacher" })).toBeVisible()
})
