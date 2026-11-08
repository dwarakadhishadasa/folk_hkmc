/**
 * The dashboard overview: every section renders, and the fixture's people
 * land in the segment their history says they belong to.
 *
 * The seed holds no campaigns and no call logs, so this file owns the rows
 * that make the pipeline and the campaign card non-zero. Assertions that name
 * a fixture person are immune to seed changes; the campaign row's counts are
 * exact because the fixture campaign holds only this run's assignments.
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

let fixture: DashboardFixture

test.beforeAll(async ({ request }) => {
  fixture = await buildDashboardFixture(request)
})

test.afterAll(async () => {
  await cleanupDashboardFixture(fixture)
})

test("renders every section and the fixture's campaign arithmetic", async ({ page }) => {
  await page.goto("/dashboard?mode=admin&period=all")

  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible()
  await expect(page.getByText(/contacts · .* locations · .* sessions/)).toBeVisible()

  // KPI band: five tiles with a numeric value and a caption.
  for (const key of [
    "contacts-collected",
    "calls-made",
    "contacts-reached",
    "contacts-confirmed",
    "unique-attendees",
  ]) {
    const tile = page.locator(`[data-dashboard-kpi="${key}"]`)
    await expect(tile).toBeVisible()
    await expect(tile.locator("dd").first()).toHaveText(/\d[\d,]*/)
  }

  // The pipeline names its five nested stages and the invite readout.
  const pipeline = page.getByRole("heading", { name: "Preaching pipeline" })
  await expect(pipeline).toBeVisible()
  for (const stage of ["Collected", "Assigned", "Called", "Reached (invited)", "Confirmed"]) {
    await expect(page.getByText(stage, { exact: true }).first()).toBeVisible()
  }

  // Attendance and the team table sit directly under the KPI band. Coverage,
  // outcomes and the live band are retired from the All-preachers view.
  await expect(page.getByRole("heading", { name: "Attendance" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "By preacher" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Contact coverage" })).toHaveCount(0)
  await expect(page.getByRole("heading", { name: "Call outcomes" })).toHaveCount(0)
  await expect(page.getByRole("region", { name: "Live sessions" })).toHaveCount(0)

  const kpiBox = await page.locator('[data-dashboard-kpi="contacts-collected"]').boundingBox()
  const attendanceBox = await page.getByRole("heading", { name: "Attendance" }).boundingBox()
  const teamBox = await page.getByRole("heading", { name: "By preacher" }).boundingBox()
  expect(kpiBox && attendanceBox && teamBox).toBeTruthy()
  if (kpiBox && attendanceBox && teamBox) {
    expect(attendanceBox.y).toBeGreaterThan(kpiBox.y)
    expect(teamBox.y).toBeGreaterThan(attendanceBox.y)
  }
  await expect(page.getByText(fixture.preacher.name ?? fixture.preacher.email).first()).toBeVisible()

  // The linked campaign aggregates two sessions and one invited attendee.
  const linkedRow = page.locator(`[data-dashboard-campaign="${fixture.campaignId}"]`)
  await expect(linkedRow).toBeVisible()
  await expect(linkedRow).toContainText(fixture.campaignName)
  await expect(linkedRow).toContainText("+1 more")
  await expect(page.locator(`[data-dashboard-campaign-attended="${fixture.campaignId}"]`)).toHaveText("1")

  // An unlinked campaign is a dash, never a zero conversion.
  const unlinkedRow = page.locator(`[data-dashboard-campaign="${fixture.unlinkedCampaignId}"]`)
  await expect(unlinkedRow).toBeVisible()
  await expect(unlinkedRow).toContainText("No session linked")
  await expect(page.locator(`[data-dashboard-campaign-attended="${fixture.unlinkedCampaignId}"]`)).toHaveText(
    "—",
  )
})

test("puts each fixture contact in the focus segment its history defines", async ({ page }) => {
  await page.goto("/dashboard?mode=admin&period=all")

  const expectations: Array<{ key: string; name: string }> = [
    { key: "confirmed_not_attended", name: fixture.contactNames.confirmedAbsent },
    { key: "ready_to_invite", name: fixture.contactNames.readyToInvite },
    { key: "committed_not_invited", name: fixture.contactNames.committed },
    { key: "new_untouched", name: fixture.contactNames.newUntouched },
    { key: "fading", name: fixture.contactNames.fading },
  ]

  for (const expectation of expectations) {
    const card = page.locator(`[data-dashboard-focus="${expectation.key}"]`)
    await expect(card).toBeVisible()
    await expect(card).toContainText(expectation.name)
  }

  // The contact who confirmed and then attended is not "confirmed, not attended".
  await expect(page.locator('[data-dashboard-focus="confirmed_not_attended"]')).not.toContainText(
    fixture.contactNames.confirmedAttended,
  )
  // The organic attendee was never reached in a campaign and is not ready to invite.
  await expect(page.locator('[data-dashboard-focus="ready_to_invite"]')).not.toContainText(
    fixture.contactNames.organic,
  )
})

test("opens a focus row's contact record in place", async ({ page }) => {
  await page.goto("/dashboard?mode=admin&period=all")

  const trigger = page
    .locator('[data-dashboard-focus="ready_to_invite"] [data-contact-record-trigger]')
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

  await page.goto("/dashboard?mode=admin&period=all")

  const trigger = page
    .locator('[data-dashboard-focus="ready_to_invite"] [data-contact-record-trigger]')
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

test("a campaign with no linked session is flagged rather than shown as zero conversion", async ({
  page,
}) => {
  await page.goto("/dashboard?mode=admin&period=all")

  await expect(page.getByText(/reached contacts but have no linked session/)).toBeVisible()
  await expect(
    page.locator(`[data-dashboard-campaign-attended="${fixture.unlinkedCampaignId}"]`),
  ).toHaveText("—")
})
