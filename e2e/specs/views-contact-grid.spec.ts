/**
 * Saved views on the Contacts grid.
 *
 * The behaviour under test is the one the source product has: a view is a named
 * arrangement of the same table, every view owns its arrangement (sort, filter,
 * hidden fields, widths, row height), switching replaces the arrangement, and
 * the arrangement survives a reload because it is saved rather than carried in
 * the link.
 *
 * Views created here are deleted through the API in `afterEach`. The database is
 * seeded and shared by the whole suite, so a spec that leaves a view behind
 * leaves it for the next run — and for the operator using the app.
 */

import { expect, test, type Page } from "@playwright/test"

import { gridRoot, openContactsGrid } from "../fixtures/manage-grid"
import { storageStatePath } from "../fixtures/roles"

test.use({ storageState: storageStatePath("preacher") })

const createdViewIds = new WeakMap<Page, string[]>()

function trackCurrentView(page: Page): void {
  const id = new URL(page.url()).searchParams.get("view")

  if (!id) {
    throw new Error("expected the URL to name a saved view")
  }

  const tracked = createdViewIds.get(page) ?? []
  tracked.push(id)
  createdViewIds.set(page, tracked)
}

test.afterEach(async ({ page }) => {
  for (const id of createdViewIds.get(page) ?? []) {
    await page.request.delete(`/api/manage/views/${id}`)
  }
})

function uniqueViewName(prefix = "Views spec"): string {
  return `${prefix} ${Date.now().toString(36)}`
}

async function waitForSavedView(page: Page): Promise<void> {
  await expect(page.locator('[data-grid-view-save="saved"]')).toBeAttached({ timeout: 15_000 })
}

async function createView(
  page: Page,
  name: string,
  visibility: "Personal" | "Collaborative" = "Personal",
): Promise<void> {
  await page.locator("[data-grid-view-create]").click()

  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("View name").fill(name)

  if (visibility === "Collaborative") {
    await dialog.getByRole("radio", { name: /^Collaborative/ }).click()
  }

  await dialog.getByRole("button", { name: "Create new view" }).click()

  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(page.locator("[data-grid-view-switcher]")).toContainText(name)
  trackCurrentView(page)
}

async function switchTo(page: Page, label: string): Promise<void> {
  // The sidebar is the switcher; the view-name button opens the view's actions.
  await page.locator("[data-grid-view-list-option]").filter({ hasText: label }).click()
  await expect(page.locator("[data-grid-view-switcher]")).toContainText(label)
}

async function deleteActiveView(page: Page): Promise<void> {
  await page.locator("[data-grid-view-menu]").click()
  await page.getByRole("menuitem", { name: "Delete view" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete view" }).click()
  await expect(page.getByRole("alertdialog")).toHaveCount(0)
}

async function addNameFilter(page: Page, value: string): Promise<void> {
  await page.locator("[data-grid-filter-control]").click()
  await page.getByRole("button", { name: "Add condition" }).first().click()
  await page.getByRole("combobox", { name: "Condition 1 field" }).click()
  await page.getByRole("option", { name: "Name", exact: true }).click()
  await page.getByRole("textbox", { name: "Name value" }).fill(value)
  await page.keyboard.press("Escape")
}

async function clearFilters(page: Page): Promise<void> {
  await page.locator("[data-grid-filter-control]").click()
  await page.getByRole("button", { name: "Clear all" }).click()
  await page.keyboard.press("Escape")
}

async function sortBy(page: Page, field: string): Promise<void> {
  await page.getByRole("button", { name: "Sort", exact: true }).click()
  await page.getByRole("combobox", { name: "Sort field" }).click()
  await page.getByRole("option", { name: field, exact: true }).click()
  await page.keyboard.press("Escape")
}

test.describe("contacts saved views", () => {
  test("the New view button opens the create dialog directly", async ({ page }) => {
    await openContactsGrid(page)

    await page.locator("[data-grid-view-create]").click()

    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel("View name")).toBeVisible()
    await expect(page.locator("[data-grid-view-type]")).toHaveCount(0)

    await page.keyboard.press("Escape")
  })

  test("a view keeps its own hidden fields across a switch and a reload", async ({ page }) => {
    const name = uniqueViewName()

    await openContactsGrid(page, { params: { hide: "notes" } })
    await expect(page.locator('[data-grid-column="notes"]')).toHaveCount(0)

    await createView(page, name)
    await expect(page).toHaveURL(/[?&]view=/)
    await expect(page.locator('[data-grid-column="notes"]')).toHaveCount(0)

    await switchTo(page, "All contacts")
    await expect(page.locator("[data-grid-view-switcher]")).toContainText("All contacts")
    await expect(page).not.toHaveURL(/[?&]view=/)
    await expect(page.locator('[data-grid-column="notes"]')).toHaveCount(1)

    await switchTo(page, name)
    await expect(page.locator('[data-grid-column="notes"]')).toHaveCount(0)

    await page.reload()
    await expect(gridRoot(page)).toBeVisible()
    await expect(page.locator("[data-grid-view-switcher]")).toContainText(name)
    await expect(page.locator('[data-grid-column="notes"]')).toHaveCount(0)
  })

  test("each view keeps its own filter, and it survives a reload", async ({ page }) => {
    const a = uniqueViewName("Filter A")
    const b = uniqueViewName("Filter B")

    await openContactsGrid(page)
    await createView(page, a)
    await addNameFilter(page, "an")
    await expect(page).toHaveURL(/f\.name=contains/)
    await waitForSavedView(page)

    // A new view starts as a copy of what the operator is looking at, so B
    // arrives with A's filter; clearing it must not clear A's.
    await createView(page, b)
    await expect(page).toHaveURL(/f\.name=contains/)
    await clearFilters(page)
    await expect(page).not.toHaveURL(/f\.name=/)
    await waitForSavedView(page)

    await switchTo(page, a)
    await expect(page).toHaveURL(/f\.name=contains/)

    await switchTo(page, b)
    await expect(page).not.toHaveURL(/f\.name=/)

    // Reload on B, then open A: only A's stored configuration can bring the
    // filter back, because the URL no longer carries it.
    await page.reload()
    await expect(gridRoot(page)).toBeVisible()
    await switchTo(page, a)
    await expect(page).toHaveURL(/f\.name=contains/)
  })

  test("a change made just before switching views is kept", async ({ page }) => {
    const a = uniqueViewName("Fast A")
    const b = uniqueViewName("Fast B")

    await openContactsGrid(page)
    await createView(page, a)
    await sortBy(page, "Name")
    await waitForSavedView(page)

    await createView(page, b)
    await waitForSavedView(page)

    await switchTo(page, a)
    await expect(page).toHaveURL(/sort=name%3Aasc|sort=name:asc/)

    await sortBy(page, "Phone")
    await expect(page).toHaveURL(/sort=phone%3Aasc|sort=phone:asc/)

    // Leave inside the autosave window: the view being left still owes a write.
    await switchTo(page, b)
    await switchTo(page, a)

    await expect(page).toHaveURL(/sort=phone%3Aasc|sort=phone:asc/)
  })

  test("a personal view is invisible to other users, a collaborative one is shared", async ({
    page,
    browser,
  }) => {
    const personal = uniqueViewName("Personal")
    const shared = uniqueViewName("Shared")

    await openContactsGrid(page)
    await createView(page, personal)
    await createView(page, shared, "Collaborative")

    const otherContext = await browser.newContext({ storageState: storageStatePath("admin") })
    const otherPage = await otherContext.newPage()

    try {
      await otherPage.goto("/contacts/grid")
      const list = otherPage.locator("[data-grid-view-list-option]")

      await expect(
        list.filter({ hasText: personal }),
        "a personal view belongs to its author",
      ).toHaveCount(0)
      await expect(
        list.filter({ hasText: shared }),
        "a collaborative view is visible in the programme",
      ).toHaveCount(1)
    } finally {
      await otherContext.close()
    }
  })

  test("the last view follows the account to another browser", async ({ page, browser }) => {
    const name = uniqueViewName("Follow")

    await openContactsGrid(page)
    await createView(page, name)

    // The preference write is fire-and-forget; give it a moment to land.
    await page.waitForTimeout(1200)

    const otherContext = await browser.newContext({ storageState: storageStatePath("preacher") })
    const otherPage = await otherContext.newPage()

    try {
      await otherPage.goto("/contacts/grid")
      await expect(otherPage.locator("[data-grid-view-switcher]")).toContainText(name)
    } finally {
      await otherContext.close()
    }
  })

  test("a view can be renamed and duplicated, and both copies can be deleted", async ({ page }) => {
    const name = uniqueViewName()
    const renamed = `${name} renamed`

    await openContactsGrid(page)
    await createView(page, name)

    await page.locator("[data-grid-view-menu]").click()
    await page.getByRole("menuitem", { name: "Rename view" }).click()
    await page.getByRole("dialog").getByLabel("View name").fill(renamed)
    await page.getByRole("dialog").getByRole("button", { name: "Rename" }).click()
    await expect(page.locator("[data-grid-view-switcher]")).toContainText(renamed)

    await page.locator("[data-grid-view-menu]").click()
    await page.getByRole("menuitem", { name: "Duplicate view" }).click()
    await expect(page.locator("[data-grid-view-switcher]")).toContainText(`${renamed} copy`)
    trackCurrentView(page)

    await deleteActiveView(page)
    await switchTo(page, renamed)
    await deleteActiveView(page)
    await expect(page.locator("[data-grid-view-switcher]")).not.toContainText(renamed)
  })

  test("the views sidebar collapses, persists, and reopens from the view header", async ({ page }) => {
    await openContactsGrid(page)
    const sidebar = page.locator("[data-grid-views-bar]")
    const toggle = page.locator("[data-grid-views-toggle]")

    await expect(sidebar).toHaveAttribute("data-state", "expanded")
    await expect(page.locator("[data-grid-view-list-option]").first()).toBeVisible()

    await toggle.click()
    await expect(sidebar).toHaveAttribute("data-state", "collapsed")
    await expect(page.locator("[data-grid-view-list-option]").first()).toBeHidden()
    await expect(page.locator("[data-grid-view-switcher]")).toBeVisible()

    await page.reload()
    await expect(sidebar).toHaveAttribute("data-state", "collapsed")

    await toggle.click()
    await expect(sidebar).toHaveAttribute("data-state", "expanded")
  })
})

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true })

  test("views are a desktop surface only", async ({ page }) => {
    await page.goto("/contacts/grid")
    await expect(page.locator("[data-contact-list]")).toBeVisible()
    await expect(page.locator("[data-grid-views-bar]")).toHaveCount(0)
    await expect(page.locator("[data-grid-root]")).toHaveCount(0)
  })
})
