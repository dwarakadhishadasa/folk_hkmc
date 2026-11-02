/**
 * CAP-7: the session-to-campaign link.
 *
 * Drives the real `+ New session` popover twice — once with a campaign, once
 * with `No campaign` — and reads the persisted `sessions.campaign_id` back
 * through the service role. A foreign programme's campaign and a cancelled
 * campaign are rejected as named 400s, not as a 500 or a silent null.
 *
 * Starting a session for the formerly unlinked campaign changes the dashboard's
 * campaign card from `—` to `0`: the invite is now measurable and no one has
 * attended yet. That is the conversion change this spec watches.
 */

import { expect, test, type Page } from "@playwright/test"

import { createDisposableCampaign, deleteDisposableCampaign } from "../fixtures/dialer-campaign"
import { buildDashboardFixture, cleanupDashboardFixture, type DashboardFixture } from "../fixtures/dashboard"
import { serviceRoleClient } from "../fixtures/dialer-caller"
import { e2eProgramId, storageStatePath } from "../fixtures/roles"

let fixture: DashboardFixture
const extraCampaignIds: string[] = []
const createdSessionIds: string[] = []

async function readCreatedSession(sessionId: string): Promise<{ id: string; campaignId: string | null }> {
  const { data, error } = await serviceRoleClient()
    .from("sessions")
    .select("id,campaign_id")
    .eq("id", sessionId)
    .eq("program_id", e2eProgramId())
    .single()

  if (error || !data) {
    throw new Error(`Reading the created session failed: ${error?.message ?? "no row"}`)
  }

  return { id: data.id as string, campaignId: (data.campaign_id as string | null) ?? null }
}

async function deleteCreatedSessions(): Promise<void> {
  if (createdSessionIds.length === 0) {
    return
  }

  await serviceRoleClient().from("attendance").delete().in("session_id", createdSessionIds)
  await serviceRoleClient().from("sessions").delete().in("id", createdSessionIds)
}

async function startSessionFromPopover(page: Page, name: string, campaignId: string | null): Promise<string> {
  await page.goto("/sessions")

  await page.getByRole("button", { name: "New session" }).first().click()
  await expect(page.locator("[data-session-name]")).toBeVisible()
  await page.locator("[data-session-name]").fill(name)

  if (campaignId) {
    await page.locator("[data-session-campaign]").selectOption(campaignId)
  } else {
    await expect(page.locator("[data-session-campaign]")).toHaveValue("")
  }

  await page.getByRole("button", { name: "Start session" }).click()
  await page.waitForURL(/\/sessions\/[0-9a-f-]{36}\/live/)

  const match = /\/sessions\/([0-9a-f-]{36})\/live/.exec(page.url())
  if (!match) {
    throw new Error(`The session route did not carry an id: ${page.url()}`)
  }

  return match[1]!
}

test.describe("a session's campaign link", () => {
  test.use({ storageState: storageStatePath("preacher") })

  test.beforeAll(async ({ request }) => {
    fixture = await buildDashboardFixture(request)
  })

  test.afterAll(async () => {
    await deleteCreatedSessions()
    for (const campaignId of extraCampaignIds) {
      await deleteDisposableCampaign(campaignId)
    }
    await cleanupDashboardFixture(fixture)
  })

  test("persists the campaign chosen in the new-session popover and leaves No campaign unlinked", async ({
    page,
  }) => {
    const linkedSessionId = await startSessionFromPopover(
      page,
      `ZDash ${fixture.tag} UI linked session`,
      fixture.unlinkedCampaignId,
    )
    createdSessionIds.push(linkedSessionId)

    const linked = await readCreatedSession(linkedSessionId)
    expect(linked.campaignId).toBe(fixture.unlinkedCampaignId)

    const unlinkedSessionId = await startSessionFromPopover(
      page,
      `ZDash ${fixture.tag} UI unlinked session`,
      null,
    )
    createdSessionIds.push(unlinkedSessionId)

    const unlinked = await readCreatedSession(unlinkedSessionId)
    expect(unlinked.campaignId).toBeNull()
  })

  test("the dashboard's conversion for an unlinked campaign becomes measurable", async ({ page }) => {
    const sessionId = await startSessionFromPopover(
      page,
      `ZDash ${fixture.tag} UI conversion session`,
      fixture.unlinkedCampaignId,
    )
    createdSessionIds.push(sessionId)

    await page.goto("/dashboard?mode=admin&period=all")

    const attended = page.locator(
      `[data-dashboard-campaign-attended="${fixture.unlinkedCampaignId}"]`,
    )
    await expect(attended).toHaveText("0")

    // The formerly unlinked campaign now has at least the session this test
    // created; the previous test in this file may have added one too.
    const row = page.locator(`[data-dashboard-campaign="${fixture.unlinkedCampaignId}"]`)
    const sessionCount = Number(await row.getAttribute("data-dashboard-campaign-sessions"))
    expect(sessionCount).toBeGreaterThanOrEqual(1)
  })

  test("rejects another programme's campaign as a named 400", async ({ request }) => {
    const client = serviceRoleClient()
    const { data, error } = await client
      .from("dialer_campaigns")
      .insert({
        program_id: "gita-life",
        name: `ZDash ${fixture.tag} foreign campaign`,
        campaign_date: fixture.today,
        status: "ACTIVE",
      })
      .select("id")
      .single()

    if (error || !data) {
      throw new Error(`Creating the foreign campaign failed: ${error?.message ?? "no row"}`)
    }

    const foreignCampaignId = data.id as string
    extraCampaignIds.push(foreignCampaignId)

    const response = await request.post("/api/sessions", {
      data: {
        name: `ZDash ${fixture.tag} foreign attempt`,
        locationId: fixture.location.id,
        campaignId: foreignCampaignId,
      },
    })

    expect(response.status()).toBe(400)
    const body = (await response.json()) as { code?: string }
    expect(body.code).toBe("campaign_not_found")
  })

  test("rejects a cancelled campaign as a named 400", async ({ request }) => {
    const campaignId = await createDisposableCampaign(request, `dashboard-cancelled-${fixture.tag}`)
    extraCampaignIds.push(campaignId)

    const { error } = await serviceRoleClient()
      .from("dialer_campaigns")
      .update({ status: "CANCELLED" })
      .eq("id", campaignId)
      .eq("program_id", e2eProgramId())

    if (error) {
      throw new Error(`Cancelling the fixture campaign failed: ${error.message}`)
    }

    const response = await request.post("/api/sessions", {
      data: {
        name: `ZDash ${fixture.tag} cancelled attempt`,
        locationId: fixture.location.id,
        campaignId,
      },
    })

    expect(response.status()).toBe(400)
    const body = (await response.json()) as { code?: string }
    expect(body.code).toBe("campaign_cancelled")
  })
})
