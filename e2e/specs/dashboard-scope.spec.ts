/**
 * CAP-1: one dashboard, one scope.
 *
 * The fixture's people are assigned to the Preacher, so the Admin's All scope
 * contains them and the Admin's Own scope does not. That difference is the
 * assertion: every section must narrow together, the programme-only sections
 * (Preaching effort and By preacher) disappear in Own scope, Focus now is
 * Own-scope only, and the URL must reproduce the view.
 */

import { expect, test } from "@playwright/test"

import { buildDashboardFixture, cleanupDashboardFixture, type DashboardFixture } from "../fixtures/dashboard"
import { storageStatePath } from "../fixtures/roles"

let fixture: DashboardFixture

test.beforeAll(async ({ request }) => {
  fixture = await buildDashboardFixture(request)
})

test.afterAll(async () => {
  await cleanupDashboardFixture(fixture)
})

async function scopeCount(page: import("@playwright/test").Page): Promise<number> {
  const line = page.getByText(/^\d[\d,]* contacts · \d[\d,]* locations · \d[\d,]* sessions$/).first()
  const text = (await line.textContent()) ?? ""
  const match = /^([\d,]+) contacts/.exec(text.trim())
  return Number((match?.[1] ?? "0").replace(/,/g, ""))
}

test("an Admin's All and Own scopes narrow every section and survive a reload", async ({ page }) => {
  await page.goto("/dashboard?mode=admin&period=all")

  const allScopeCount = await scopeCount(page)
  await expect(page.getByRole("heading", { name: "Preaching effort" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "By preacher", exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Focus now" })).toHaveCount(0)

  await page.getByRole("link", { name: "Own scope" }).click()
  await expect(page).toHaveURL(/mode=preacher/)
  await expect(page).toHaveURL(/period=all/)

  const ownScopeCount = await scopeCount(page)
  expect(ownScopeCount).toBeLessThan(allScopeCount)
  await expect(page.getByRole("heading", { name: "Preaching effort" })).toHaveCount(0)
  await expect(page.getByRole("heading", { name: "By preacher", exact: true })).toHaveCount(0)
  await expect(page.getByRole("heading", { name: "By location" })).toHaveCount(0)
  await expect(page.getByRole("heading", { name: "Attendees by preacher" })).toHaveCount(0)
  await expect(page.getByRole("heading", { name: "Attendance" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Focus now" })).toBeVisible()
  await expect(page.getByText(/Showing only rows scoped to your own staff account/)).toHaveCount(0)
  await expect(page.locator('[data-dashboard-focus-count="new_untouched"]')).toHaveText("0")
  await expect(page.locator('[data-dashboard-focus="new_untouched"]')).not.toContainText(
    fixture.contactNames.newUntouched,
  )

  // The URL is the state: a reload reproduces the narrowed page.
  await page.reload()
  await expect(page).toHaveURL(/mode=preacher/)
  await expect(page.getByRole("heading", { name: "Focus now" })).toBeVisible()
  await expect(page.locator('[data-dashboard-focus-count="new_untouched"]')).toHaveText("0")

  await page.getByRole("link", { name: "All preachers" }).click()
  await expect(page).toHaveURL(/mode=admin/)
  await expect(page.getByRole("heading", { name: "By preacher", exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Focus now" })).toHaveCount(0)
})

test.describe("a Preacher", () => {
  test.use({ storageState: storageStatePath("preacher") })

  test("sees their own patch with no scope switch", async ({ page }) => {
    await page.goto("/dashboard?period=all")

    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible()
    await expect(page.getByRole("navigation", { name: "Data scope" })).toHaveCount(0)
    await expect(page.getByText(/Showing only rows scoped to your own staff account/)).toHaveCount(0)
    await expect(page.getByRole("heading", { name: "Preaching effort" })).toHaveCount(0)
    await expect(page.getByRole("heading", { name: "By preacher", exact: true })).toHaveCount(0)
    await expect(page.getByRole("heading", { name: "By location" })).toHaveCount(0)
    await expect(page.getByRole("heading", { name: "Attendees by preacher" })).toHaveCount(0)
    await expect(page.getByRole("heading", { name: "Attendance" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Focus now" })).toBeVisible()
    await expect(page.locator(`[data-dashboard-focus="fading"]`)).toContainText(
      fixture.contactNames.fading,
    )
  })
})

test.describe("an Assistant", () => {
  test.use({ storageState: storageStatePath("assistant") })

  test("reads the preacher's patch and is told whose it is", async ({ page }) => {
    await page.goto("/dashboard?period=all")

    await expect(page.getByRole("navigation", { name: "Data scope" })).toHaveCount(0)
    await expect(page.getByText(/the preacher you assist/)).toBeVisible()
    await expect(page.getByRole("heading", { name: "Preaching effort" })).toHaveCount(0)
    await expect(page.getByRole("heading", { name: "By preacher", exact: true })).toHaveCount(0)
    await expect(page.getByRole("heading", { name: "By location" })).toHaveCount(0)
    await expect(page.getByRole("heading", { name: "Attendees by preacher" })).toHaveCount(0)
    await expect(page.getByRole("heading", { name: "Attendance" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Focus now" })).toBeVisible()
    await expect(page.locator('[data-dashboard-focus="new_untouched"]')).toContainText(
      fixture.contactNames.newUntouched,
    )
  })
})

test.describe("a Volunteer", () => {
  test.use({ storageState: storageStatePath("volunteer") })

  test("is refused and never sees the dashboard", async ({ page }) => {
    await page.goto("/dashboard")
    await expect(page).toHaveURL(/\/auth\/error\?code=staff-authorization-failed/)
    await expect(
      page.getByText("Your sign-in succeeded, but this email is not authorized as active staff."),
    ).toBeVisible()
  })
})
