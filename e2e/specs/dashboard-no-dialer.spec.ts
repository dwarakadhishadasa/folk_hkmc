/**
 * CAP-9: a programme without the Campaign module.
 *
 * The Gita Life app is a second Next process on its own port, so this spec is
 * opt-in rather than part of the default folk run:
 *
 *   E2E_GITA_LIFE_URL=http://127.0.0.1:3001 \
 *   E2E_GITA_LIFE_STORAGE_STATE=e2e/.auth/gita-life-admin.json \
 *   pnpm test:e2e dashboard-no-dialer
 *
 * The storage state must hold a signed-in Gita Life staff session; the folk
 * cookie does not map to a different `public.users` row. The RPC's
 * `p_has_dialer = false` path is also asserted by `pnpm test:dashboard-contract
 * --program gita-life`, which is the check that needs no second app.
 */

import { expect, test } from "@playwright/test"

const gitaLifeUrl = process.env.E2E_GITA_LIFE_URL
const gitaLifeState = process.env.E2E_GITA_LIFE_STORAGE_STATE

test.describe("Gita Life has no Campaign surface on the dashboard", () => {
  test.skip(
    !gitaLifeUrl || !gitaLifeState,
    "Set E2E_GITA_LIFE_URL and E2E_GITA_LIFE_STORAGE_STATE to run the Gita Life dashboard spec.",
  )

  test.use({
    baseURL: gitaLifeUrl as string,
    storageState: gitaLifeState as string,
  })

  test("renders contacts, attendance, team and focus without campaign figures", async ({ page }) => {
    await page.goto("/dashboard")

    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Preaching efforts" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Attendees by preacher" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "By preacher", exact: true })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Recent sessions" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Focus now" })).toHaveCount(0)
    await expect(page.getByRole("heading", { name: "Attendance" })).toHaveCount(0)

    await expect(page.locator('[data-dashboard-location-bar="sessions"]').first()).toBeVisible()
    await expect(page.locator('[data-dashboard-location-bar="contacts"]').first()).toBeVisible()
    await expect(page.locator('[data-dashboard-location-bar="attendees"]').first()).toBeVisible()

    await expect(page.getByRole("heading", { name: "Contact generation" })).toHaveCount(0)
    await expect(page.getByRole("heading", { name: "Call outcomes" })).toHaveCount(0)
    await expect(page.getByRole("heading", { name: "Preaching pipeline" })).toHaveCount(0)
    await expect(page.getByRole("heading", { name: "Active campaigns" })).toHaveCount(0)
    await expect(page.locator('[data-dashboard-kpi="calls-made"]')).toHaveCount(0)
    await expect(page.locator('[data-dashboard-kpi="contacts-reached"]')).toHaveCount(0)
    await expect(page.locator('[data-dashboard-kpi="contacts-confirmed"]')).toHaveCount(0)

    // The own-scope layout keeps the two non-call focus segments.
    await page.goto("/dashboard?mode=preacher")
    await expect(page.getByRole("heading", { name: "Focus now" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Attendance" })).toBeVisible()
    await expect(page.locator('[data-dashboard-focus="new_untouched"]')).toBeVisible()
    await expect(page.locator('[data-dashboard-focus="fading"]')).toBeVisible()
    await expect(page.locator('[data-dashboard-focus="confirmed_not_attended"]')).toHaveCount(0)
    await expect(page.locator('[data-dashboard-focus="ready_to_invite"]')).toHaveCount(0)
    await expect(page.locator('[data-dashboard-focus="committed_not_invited"]')).toHaveCount(0)

    // No dialer request: the page's server render only calls the overview and
    // people-series RPCs, and neither reads a campaign. The browser can only
    // prove the surfaces that would consume campaign data are absent.
    const campaignRequests: string[] = []
    page.on("request", (request) => {
      if (/\/api\/dialer\//.test(request.url())) {
        campaignRequests.push(request.url())
      }
    })
    await page.reload()
    expect(campaignRequests).toEqual([])
  })
})
