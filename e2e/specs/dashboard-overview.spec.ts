/**
 * The dashboard overview: the preacher, session, attendance and contact
 * sections render, and the fixture's people land in the focus segments that do
 * not depend on a call log.
 *
 * One fixture is built in `beforeAll` and removed in `afterAll`. A failure in
 * a test does not skip the cleanup, so the next run does not inherit these
 * names in its focus lists.
 */

import { expect, test } from "@playwright/test"

import {
  buildDashboardFixture,
  cleanupDashboardFixture,
  type DashboardFixture,
} from "../fixtures/dashboard"
import { storageStatePath } from "../fixtures/roles"

// The app registers a service worker that can serve a previously opened
// contact record from cache. This file asserts the gateway's behaviour, so the
// fetch must reach the network (and this test's route interception).
test.use({ serviceWorkers: "block" })

let fixture: DashboardFixture

test.beforeAll(async ({ request }) => {
  fixture = await buildDashboardFixture(request)
})

test.afterAll(async () => {
  await cleanupDashboardFixture(fixture)
})

test("renders the preacher, session, attendance and contact sections", async ({ page }) => {
  await page.goto("/dashboard?mode=admin&period=all")

  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible()
  await expect(page.getByText(/contacts · .* locations · .* sessions/)).toBeVisible()

  // KPI band: the four people-focused tiles, each with a numeric value.
  for (const key of [
    "contacts-collected",
    "sessions-held",
    "unique-attendees",
    "attendance-records",
  ]) {
    const tile = page.locator(`[data-dashboard-kpi="${key}"]`)
    await expect(tile).toBeVisible()
    await expect(tile.locator("dd").first()).toHaveText(/\d[\d,]*/)
  }

  // Call work is not part of this page.
  for (const key of ["calls-made", "contacts-reached", "contacts-confirmed"]) {
    await expect(page.locator(`[data-dashboard-kpi="${key}"]`)).toHaveCount(0)
  }

  await expect(page.getByRole("heading", { name: "Preaching effort" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Attendees by preacher" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "By preacher", exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Recent sessions" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Focus now" })).toHaveCount(0)
  await expect(page.getByRole("heading", { name: "Attendance" })).toHaveCount(0)
  await expect(page.getByRole("heading", { name: "Contact generation" })).toHaveCount(0)

  await expect(page.getByRole("heading", { name: "Preaching pipeline" })).toHaveCount(0)
  await expect(page.getByRole("heading", { name: "Active campaigns" })).toHaveCount(0)
  await expect(page.getByRole("heading", { name: "Call outcomes" })).toHaveCount(0)
  await expect(page.getByRole("region", { name: "Live sessions" })).toHaveCount(0)

  await expect(page.locator('[data-dashboard-location-bar="sessions"]').first()).toBeVisible()
  await expect(page.locator('[data-dashboard-location-bar="contacts"]').first()).toBeVisible()
  await expect(page.locator('[data-dashboard-people-chart="attendees"]')).toBeVisible()

  const scorecard = page
    .locator("[data-dashboard-scorecard]")
    .filter({ hasText: fixture.preacher.name ?? fixture.preacher.email })
    .first()
  await expect(scorecard).toBeVisible()
  await expect(scorecard).toContainText("Contacts collected")
  await expect(scorecard).toContainText(fixture.location.name)

  const kpiBox = await page.locator('[data-dashboard-kpi="contacts-collected"]').boundingBox()
  const orderedHeadings = [
    page.getByRole("heading", { name: "Preaching effort" }),
    page.getByRole("heading", { name: "Attendees by preacher" }),
    page.getByRole("heading", { name: "By preacher", exact: true }),
    page.getByRole("heading", { name: "Recent sessions" }),
  ]
  const positions: number[] = []
  for (const heading of orderedHeadings) {
    const box = await heading.boundingBox()
    expect(box).toBeTruthy()
    positions.push(box?.y ?? 0)
  }
  expect(kpiBox).toBeTruthy()
  if (kpiBox) {
    expect(positions[0]).toBeGreaterThan(kpiBox.y)
  }
  for (let index = 1; index < positions.length; index += 1) {
    expect(positions[index]).toBeGreaterThan(positions[index - 1]!)
  }
  await expect(page.getByText(fixture.preacher.name ?? fixture.preacher.email).first()).toBeVisible()
})

test.describe("a Preacher's own scope", () => {
  test.use({ storageState: storageStatePath("preacher") })

  test("shows the attendee trend, Focus now, attendance and recent sessions in that order", async ({
    page,
  }) => {
    await page.goto("/dashboard?period=all")

    await expect(page.getByRole("heading", { name: "Preaching effort" })).toHaveCount(0)
    await expect(page.getByRole("heading", { name: "By preacher", exact: true })).toHaveCount(0)
    await expect(page.getByRole("heading", { name: "Attendees by preacher" })).toHaveCount(0)
    await expect(page.getByRole("heading", { name: "Focus now" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Attendance" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Recent sessions" })).toBeVisible()

    const expectations: Array<{ key: string; name: string }> = [
      { key: "new_untouched", name: fixture.contactNames.newUntouched },
      { key: "fading", name: fixture.contactNames.fading },
    ]

    for (const expectation of expectations) {
      const card = page.locator(`[data-dashboard-focus="${expectation.key}"]`)
      await expect(card).toBeVisible()
      await expect(card).toContainText(expectation.name)
    }

    // The three call-driven segments are no longer rendered.
    for (const key of ["confirmed_not_attended", "ready_to_invite", "committed_not_invited"]) {
      await expect(page.locator(`[data-dashboard-focus="${key}"]`)).toHaveCount(0)
    }

    const orderedHeadings = [
      page.getByRole("heading", { name: "Attendance" }),
      page.getByRole("heading", { name: "Focus now" }),
      page.getByRole("heading", { name: "Recent sessions" }),
    ]
    const positions: number[] = []
    for (const heading of orderedHeadings) {
      const box = await heading.boundingBox()
      expect(box).toBeTruthy()
      positions.push(box?.y ?? 0)
    }
    for (let index = 1; index < positions.length; index += 1) {
      expect(positions[index]).toBeGreaterThan(positions[index - 1]!)
    }
  })

  test("opens a focus row's contact record in place", async ({ page }) => {
    await page.goto("/dashboard?period=all")

    const trigger = page
      .locator('[data-dashboard-focus="new_untouched"] [data-contact-record-trigger]')
      .first()
    await expect(trigger).toBeVisible()
    await trigger.click()

    const dialog = page.locator("[data-contact-record-dialog]")
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole("heading", { name: "Attendance", level: 2 })).toBeVisible()
    await expect(dialog.getByRole("heading", { name: "Campaign history", level: 2 })).toBeVisible()

    await page.getByRole("button", { name: "Close dialog" }).click()
    await expect(dialog).toBeHidden()
  })

  test("a 403 from the record gateway closes the record and names the scope", async ({ page }) => {
    await page.route("**/api/manage/contacts/*/record", (route) =>
      route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ error: "This contact is outside your assigned scope." }),
      }),
    )

    await page.goto("/dashboard?period=all")

    const trigger = page
      .locator('[data-dashboard-focus="new_untouched"] [data-contact-record-trigger]')
      .first()
    await expect(trigger).toBeVisible()
    await trigger.click()

    const errorDialog = page.locator("[data-contact-record-error]")
    await expect(errorDialog).toBeVisible()
    await expect(errorDialog).toContainText("outside your contact scope")
    // The record frame is gone; a 403 is never rendered as an empty record.
    await expect(page.locator("[data-contact-record-dialog]")).toHaveCount(0)

    await errorDialog.getByRole("button", { name: "Close" }).click()
    await expect(errorDialog).toBeHidden()
  })
})
