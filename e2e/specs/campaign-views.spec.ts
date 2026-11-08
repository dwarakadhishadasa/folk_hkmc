/**
 * Saved views on a campaign's assign grid.
 *
 * A campaign view is the same named arrangement the contacts grid has, stored
 * on its own `surface`: creating one here must not appear on the contacts grid,
 * and a contacts view must not appear here. The sidebar is a desktop surface.
 *
 * Views created here are deleted through the campaign endpoint in `afterEach`;
 * the database is shared by the whole suite, so a spec that leaves a view
 * behind leaves it for the next run and for the operator using the app.
 */

import { expect, test, type Page } from "@playwright/test"

import { createDisposableCampaign, deleteDisposableCampaign } from "../fixtures/dialer-campaign"
import { storageStatePath } from "../fixtures/roles"

test.use({ storageState: storageStatePath("admin") })

const createdViewIds = new WeakMap<Page, string[]>()

function trackCurrentView(page: Page): string {
  const id = new URL(page.url()).searchParams.get("view")

  if (!id) {
    throw new Error("expected the URL to name a saved view")
  }

  const tracked = createdViewIds.get(page) ?? []
  tracked.push(id)
  createdViewIds.set(page, tracked)

  return id
}

test.afterEach(async ({ page }) => {
  for (const id of createdViewIds.get(page) ?? []) {
    await page.request.delete(`/api/dialer/campaign-views/${id}`)
  }
})

test("a campaign view is created and remembered, apart from contacts views", async ({ page }) => {
  const campaignId = await createDisposableCampaign(page.request, "campaign views spec")
  const name = `Campaign view ${Date.now().toString(36)}`
  let contactsViewId: string | null = null

  try {
    await page.goto(`/campaigns/${campaignId}/assign-contacts`)

    // The views sidebar is the campaign grid's desktop chrome.
    await expect(page.locator("[data-grid-views-bar]")).toBeVisible()
    await expect(page.locator("[data-grid-view-switcher]")).toContainText("All contacts")

    // A view saved on the contacts surface belongs to a different grid.
    const contactsView = await page.request.post("/api/manage/views", {
      data: {
        name: `${name} contacts`,
        config: {},
        visibility: "personal",
      },
    })

    expect(contactsView.status()).toBe(201)
    contactsViewId = ((await contactsView.json()) as { view: { id: string } }).view.id

    await page.reload()
    await expect(
      page.locator("[data-grid-view-list-option]").filter({ hasText: `${name} contacts` }),
    ).toHaveCount(0)

    // Create a campaign view from the arrangement on screen.
    await page.locator("[data-grid-view-create]").click()

    const dialog = page.getByRole("dialog")
    await dialog.getByLabel("View name").fill(name)
    await dialog.getByRole("button", { name: "Create new view" }).click()

    await expect(page.getByRole("dialog")).toHaveCount(0)
    await expect(page.locator("[data-grid-view-switcher]")).toContainText(name)
    trackCurrentView(page)

    // The saved view is reloaded from its URL rather than from memory.
    await page.reload()
    await expect(page.locator("[data-grid-view-switcher]")).toContainText(name)

    // Back to the unsaved arrangement, and the view is still in the switcher.
    await page.locator('[data-grid-view-list-option="unsaved"]').click()
    await expect(page.locator("[data-grid-view-switcher]")).toContainText("All contacts")
    await expect(
      page.locator("[data-grid-view-list-option]").filter({ hasText: name }),
    ).toHaveCount(1)
  } finally {
    if (contactsViewId) {
      await page.request.delete(`/api/manage/views/${contactsViewId}`)
    }

    await deleteDisposableCampaign(campaignId)
  }
})
