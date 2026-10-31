/**
 * Story 3.3 — the phone reports screen (frame 1968, with Decision D3).
 *
 * The frame's funnel has four rows; this screen has five, because Confirmed is
 * the number the frame's omission would hide. Outcome mix and recent activity
 * stay desktop detail, and the screen says so in words rather than leaving a
 * reader to assume the phone is complete.
 *
 * The viewport is the design's 390x844. One desktop assertion proves the wide
 * layout is the other branch, not a second screen shipped to phones.
 */

import { expect, test, request as playwrightRequest } from "@playwright/test"

import { buildReportFixture, type ReportFixture } from "../fixtures/dialer-reports"
import { storageStatePath } from "../fixtures/roles"

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000"

let fixture: ReportFixture

test.beforeAll(async () => {
  const request = await playwrightRequest.newContext({
    baseURL: BASE_URL,
    storageState: storageStatePath("admin"),
  })

  try {
    fixture = await buildReportFixture(request, "reports mobile")
  } finally {
    await request.dispose()
  }
})

test.afterAll(async () => {
  await fixture?.cleanup()
})

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  storageState: storageStatePath("admin"),
})

test("the phone gets all five buckets, the scoped leaderboard and a visible reduced-view statement", async ({
  page,
}) => {
  await page.goto(`/campaigns/reports?campaign=${fixture.campaignId}`)

  await expect(page.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible()

  await expect(page.locator("[data-report-funnel]:visible")).toHaveCount(5)
  await expect(page.locator('[data-report-funnel="Confirmed"]:visible')).toHaveAttribute(
    "data-report-funnel-value",
    "2",
  )

  await expect(page.locator("[data-report-caller]:visible")).toHaveCount(2)

  // The desktop-only sections are absent from the phone layout, and the screen
  // says so rather than silently dropping them.
  await expect(page.locator('[data-report-outcome="CONFIRMED"]')).toBeHidden()
  await expect(page.getByText("Recent activity", { exact: true }).first()).toBeHidden()
  await expect(
    page.getByText("Outcome mix and recent activity are available on desktop."),
  ).toBeVisible()

  await expect(page.locator('[data-report-export="mobile"]')).toBeVisible()
  await expect(
    page.locator('[data-report-export="mobile"]').getByRole("button", { name: "Export CSV" }),
  ).toBeVisible()
  await expect(page.locator('[data-report-export="desktop"]')).toBeHidden()

  // 390px is the design's width: no sideways scroll, no clipped export bar.
  const widths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }))
  expect(widths.document).toBeLessThanOrEqual(widths.viewport)
})

test("a desktop viewport shows the desktop reports layout", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`/campaigns/reports?campaign=${fixture.campaignId}`)

  await expect(page.locator('[data-report-outcome="CONFIRMED"]')).toBeVisible()
  await expect(page.getByText("Recent activity", { exact: true }).first()).toBeVisible()
  await expect(
    page.getByText("Outcome mix and recent activity are available on desktop."),
  ).toBeHidden()
  await expect(page.locator('[data-report-export="desktop"]')).toBeVisible()
  await expect(page.locator('[data-report-export="mobile"]')).toBeHidden()
})
