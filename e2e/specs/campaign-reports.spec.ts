/**
 * Story 3.1 — the desktop reports screen (frame 790).
 *
 * One fixture, two readers. An Admin counts the whole programme; a Preacher
 * counts the contacts whose `assigned_preacher_id` is theirs. The fixture makes
 * that difference visible with a fifth assignment outside the Preacher's scope,
 * so the two sets of expected numbers are not accidentally equal.
 *
 * The screen is graded against the five KPI buckets, the outcome mix, the
 * leaderboard and recent activity. The RPC's arithmetic is Story 1.9's test,
 * not this one's: here the assertions are that the payload is rendered,
 * labelled and scoped.
 */

import { expect, test, request as playwrightRequest, type Page } from "@playwright/test"

import { createDisposableCampaign, deleteDisposableCampaign } from "../fixtures/dialer-campaign"
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
    fixture = await buildReportFixture(request, "reports desktop")
  } finally {
    await request.dispose()
  }
})

test.afterAll(async () => {
  await fixture?.cleanup()
})

async function expectKpis(page: Page, expected: Record<string, number>) {
  for (const [key, value] of Object.entries(expected)) {
    await expect(page.locator(`[data-report-kpi="${key}"]:visible`)).toHaveAttribute(
      "data-report-kpi-value",
      String(value),
    )
  }
}

test("an Admin reads the whole programme's totals, mix, leaderboard and activity", async ({ page }) => {
  await page.goto(`/campaigns/reports?campaign=${fixture.campaignId}`)

  await expect(page.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Reports" })).toHaveAttribute("aria-current", "page")
  await expect(page.getByText(fixture.campaignName, { exact: false }).first()).toBeVisible()

  await expectKpis(page, {
    assigned: 5,
    attempted: 4,
    reached: 2,
    confirmed: 2,
    neverAttempted: 1,
  })

  await expect(page.locator('[data-report-outcome="CONFIRMED"]')).toHaveAttribute(
    "data-report-outcome-count",
    "2",
  )
  await expect(page.locator('[data-report-outcome="MAY_COME"]')).toHaveAttribute(
    "data-report-outcome-count",
    "0",
  )
  await expect(page.locator('[data-report-outcome="NOT_REACHABLE"]')).toHaveAttribute(
    "data-report-outcome-count",
    "1",
  )
  await expect(page.locator('[data-report-outcome="WRONG_NUMBER"]')).toHaveAttribute(
    "data-report-outcome-count",
    "1",
  )

  await expect(page.getByText(/Ranked on completed attempts only/i).first()).toBeVisible()
  const leaderboard = page.locator("[data-report-caller]:visible")
  await expect(leaderboard).toHaveCount(2)
  await expect(leaderboard.first()).toHaveAttribute("data-report-caller-calls", "3")
  await expect(leaderboard.nth(1)).toHaveAttribute("data-report-caller-calls", "1")

  await expect(page.locator("[data-report-activity]:visible")).toHaveCount(4)

  await expect(
    page.locator('[data-report-export="desktop"]').getByRole("button", { name: "Export CSV" }),
  ).toBeVisible()
})

test("a Preacher sees only their own contacts, even though the campaign row is visible", async ({ browser }) => {
  const context = await browser.newContext({ storageState: storageStatePath("preacher") })
  const page = await context.newPage()

  try {
    await page.goto(`/campaigns/reports?campaign=${fixture.campaignId}`)

    await expect(page.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible()

    await expectKpis(page, {
      assigned: 4,
      attempted: 3,
      reached: 1,
      confirmed: 1,
      neverAttempted: 1,
    })

    await expect(page.locator('[data-report-outcome="CONFIRMED"]')).toHaveAttribute(
      "data-report-outcome-count",
      "1",
    )
    await expect(page.locator('[data-report-outcome="NOT_REACHABLE"]')).toHaveAttribute(
      "data-report-outcome-count",
      "1",
    )
    await expect(page.locator('[data-report-outcome="WRONG_NUMBER"]')).toHaveAttribute(
      "data-report-outcome-count",
      "1",
    )

    const leaderboard = page.locator("[data-report-caller]:visible")
    await expect(leaderboard).toHaveCount(2)
    await expect(leaderboard.first()).toHaveAttribute("data-report-caller-calls", "2")
    await expect(leaderboard.nth(1)).toHaveAttribute("data-report-caller-calls", "1")

    await expect(page.locator("[data-report-activity]:visible")).toHaveCount(3)
  } finally {
    await context.close()
  }
})

test("a campaign with no assignments names the next action instead of drawing five zeroes", async ({
  page,
  request,
}) => {
  const campaignId = await createDisposableCampaign(request, "reports empty")

  try {
    await page.goto(`/campaigns/reports?campaign=${fixture.campaignId}`)
    await expect(page.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible()

    // The picker carries the choice in the URL, so the empty campaign is
    // selected without a second page and a reload keeps the same report.
    await page.getByRole("combobox", { name: "Campaign", exact: true }).selectOption(campaignId)
    await expect(page).toHaveURL(new RegExp(`campaign=${campaignId}`))

    await expect(page.getByText("Nothing to report yet")).toBeVisible()
    await expect(page.getByRole("link", { name: "Assign contacts" })).toHaveAttribute(
      "href",
      `/campaigns/${campaignId}/assign-contacts`,
    )
    await expect(page.locator("[data-report-kpi]:visible")).toHaveCount(0)
  } finally {
    await deleteDisposableCampaign(campaignId)
  }
})
