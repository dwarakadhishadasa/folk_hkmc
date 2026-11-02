/**
 * CAP-5's drill-down: one segment, its total, 50 per page, and a 404 for a
 * segment no rule defines.
 *
 * The dashboard fixture supplies the named segment rows; 51 extra untouched
 * contacts give the pagination a page boundary that cannot be crossed by
 * accident.
 */

import { expect, test, type Page } from "@playwright/test"

import { buildDashboardFixture, cleanupDashboardFixture, type DashboardFixture } from "../fixtures/dashboard"
import { serviceRoleClient } from "../fixtures/dialer-caller"
import { e2eProgramId } from "../fixtures/roles"
import { programDateToday, addDays, readFixtureStaff } from "../fixtures/sessions"

const PAGE_CONTACTS = 51
const pageTag = `ZDashPage${Date.now().toString(36)}`

let fixture: DashboardFixture
let pageContactIds: string[] = []

async function createPageContacts(): Promise<void> {
  const client = serviceRoleClient()
  const preacher = await readFixtureStaff(client, "preacher")
  const today = programDateToday()
  const base = String(Date.now()).slice(-7)

  const rows = Array.from({ length: PAGE_CONTACTS }, (_, index) => ({
    program_id: e2eProgramId(),
    name: `${pageTag} ${String(index + 1).padStart(2, "0")}`,
    phone: `8${base}${String(index).padStart(2, "0")}`,
    location_ids: [] as string[],
    assigned_preacher_id: preacher.id,
    collected_by_id: preacher.id,
    initial_contact: addDays(today, -45),
    source: "e2e-dashboard-page",
  }))

  const { data, error } = await client.from("contacts").insert(rows).select("id,name")

  if (error || !data) {
    throw new Error(`Creating the candidates pagination contacts failed: ${error?.message ?? "no rows"}`)
  }

  pageContactIds = (data as Array<{ id: string }>).map((row) => row.id)
}

async function deletePageContacts(): Promise<void> {
  if (pageContactIds.length === 0) {
    return
  }

  const { error } = await serviceRoleClient().from("contacts").delete().in("id", pageContactIds)
  if (error) {
    throw new Error(`Removing the candidates pagination contacts failed: ${error.message}`)
  }
}

function candidateRows(page: Page) {
  return page.locator("[data-dashboard-candidate]")
}

test.beforeAll(async ({ request }) => {
  fixture = await buildDashboardFixture(request)
  await createPageContacts()
})

test.afterAll(async () => {
  await deletePageContacts()
  await cleanupDashboardFixture(fixture)
})

test("a known segment lists every matching candidate, and only those", async ({ page }) => {
  await page.goto("/dashboard/candidates?segment=confirmed_not_attended")

  await expect(page.getByRole("heading", { level: 1, name: "Confirmed, not attended" })).toBeVisible()
  await expect(page.getByText(/1 candidate/)).toBeVisible()
  await expect(page.locator(`[data-dashboard-candidate]`)).toHaveCount(1)
  await expect(page.getByText(fixture.contactNames.confirmedAbsent, { exact: true })).toBeVisible()
  await expect(
    page.getByText(fixture.contactNames.confirmedAttended, { exact: true }),
  ).toHaveCount(0)
})

test("an unknown segment is a 404", async ({ page }) => {
  const response = await page.goto("/dashboard/candidates?segment=not-a-rule")
  expect(response?.status()).toBe(404)
})

test("a segment longer than one page paginates and keeps the segment", async ({ page }) => {
  await page.goto("/dashboard/candidates?segment=new_untouched")

  await expect(candidateRows(page)).toHaveCount(50)
  await expect(page.getByText(/Showing 1–50 of/)).toBeVisible()
  await expect(page.getByRole("link", { name: "Next" })).toBeVisible()

  await page.getByRole("link", { name: "Next" }).click()
  await expect(page).toHaveURL(/segment=new_untouched/)
  await expect(page).toHaveURL(/page=2/)
  expect(await candidateRows(page).count()).toBeGreaterThan(0)
  await expect(page.getByRole("link", { name: "Previous" })).toBeVisible()

  // The first page holds 50 of the 51 page fixtures; the 51st sorts onto
  // page two with the named fixture contact behind it.
  const secondPageText = await page.locator("main").innerText()
  expect(secondPageText).toContain(pageTag)

  await page.getByRole("link", { name: "Previous" }).click()
  await expect(page).toHaveURL(/segment=new_untouched/)
  await expect(page.getByText(/Showing 1–50 of/)).toBeVisible()
})

test("the Focus now card's View all link keeps the segment in the URL", async ({ page }) => {
  await page.goto("/dashboard?mode=admin&period=all")

  const card = page.locator('[data-dashboard-focus="new_untouched"]')
  await card.getByRole("link", { name: "View all" }).click()

  await expect(page).toHaveURL(/\/dashboard\/candidates\?segment=new_untouched/)
  await expect(page.getByRole("heading", { level: 1, name: "New and untouched" })).toBeVisible()
})
