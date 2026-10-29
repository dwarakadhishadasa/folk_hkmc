/**
 * Story 2.2 — the campaign switch, the single-tab lock, reload recovery and the
 * automatic return from the phone app.
 *
 * Each test owns its campaigns and assignments; the caller profile is shared
 * and removed at the end. The queue roster is asserted after a save because a
 * completed row must stay on the list rather than vanish.
 */

import { expect, test } from "@playwright/test"

import {
  assignContacts,
  gotoCallerSession,
  assignmentStatus,
  callerForRole,
  createCallerCampaign,
  seededContacts,
} from "./campaign-caller-helpers"
import type { ContactFixture } from "./campaign-caller-helpers"
import { storageStatePath } from "../fixtures/roles"

test.use({ storageState: storageStatePath("admin") })

let callerCleanup: (() => Promise<void>) | null = null
let callerId = ""

const cleanups: Array<() => Promise<void>> = []

test.beforeAll(async () => {
  const caller = await callerForRole("admin")
  callerCleanup = caller.cleanup
  callerId = caller.callerId
})

test.afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()?.()
  }
})

test.afterAll(async () => {
  await callerCleanup?.()
})

async function campaignWithContacts(
  request: Parameters<typeof createCallerCampaign>[0],
  label: string,
  contacts: ContactFixture[],
  gapDuration = 30,
) {
  const campaign = await createCallerCampaign(request, label, { gapDuration, maxAttempts: 3 })
  cleanups.push(campaign.cleanup)
  const assignments = await assignContacts(campaign.campaignId, callerId, contacts)
  return { campaignId: campaign.campaignId, assignments }
}

test("a saved disposition keeps the contact on the queue roster and announces the next campaign", async ({ page, request }) => {
  const contacts = await seededContacts(3)
  const { campaignId, assignments } = await campaignWithContacts(request, "a-session", contacts.slice(0, 1), 30)
  await campaignWithContacts(request, "b-session", contacts.slice(1), 30)

  await gotoCallerSession(
    page,
    `/campaigns/assignments?campaign=${campaignId}&assignment=${assignments[0].id}&phase=disposition`,
  )
  await expect(page.getByRole("heading", { name: "How did it go?" })).toBeVisible()

  await page.getByRole("button", { name: "Confirmed", exact: true }).click()
  await page.getByRole("button", { name: "Save & continue" }).click()

  // The only A assignment is done, so the next entry is in the second campaign
  // and the notice is awaited before the next call can start.
  const notice = page.getByRole("dialog")
  await expect(notice.getByText("Next campaign")).toBeVisible()
  await expect(notice.getByText(/b-session/).first()).toBeVisible()
  await expect(notice.getByRole("button", { name: /Continue to/ })).toBeVisible()
  await notice.getByRole("button", { name: /Continue to/ }).click()
  await expect(notice).not.toBeVisible()
  await expect(page.getByRole("heading", { name: contacts[1].name })).toBeVisible()

  // The saved contact stays in the session roster with its outcome instead of
  // disappearing from the queue the moment the row is no longer actionable.
  await page.getByRole("button", { name: "Queue", exact: true }).click()
  const drawer = page.getByRole("dialog")
  await expect(drawer.getByText(/showing \d+ of 3/)).toBeVisible()
  await expect(drawer.getByText(contacts[0].name)).toBeVisible()
  await expect(drawer.getByText("Confirmed", { exact: true })).toBeVisible()
  await drawer.getByRole("button", { name: "Close the queue" }).click()

  expect(await assignmentStatus(assignments[0].id)).toBe("COMPLETED")
})

test("the queue scrolls a long roster to the last contact", async ({ page, request }) => {
  const contacts = await seededContacts(60)
  const { campaignId } = await campaignWithContacts(request, "virtual-queue", contacts, 20)
  const lastContact = contacts[contacts.length - 1]

  await gotoCallerSession(page, `/campaigns/assignments?campaign=${campaignId}`)
  await page.getByRole("button", { name: "Queue", exact: true }).click()

  const drawer = page.getByRole("dialog")
  await expect(drawer.getByText(/showing \d+ of 60/)).toBeVisible()

  // The drawer renders one window of rows, so the last contact is not in the
  // DOM until the list is scrolled. A queue that never re-renders on scroll
  // leaves the user stuck on the first window with the rest unreachable.
  await expect(drawer.getByText(lastContact.name, { exact: true })).toHaveCount(0)

  await drawer.locator("div.overflow-y-auto").evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })

  const lastRow = drawer.locator("div.overflow-y-auto button").last()
  await expect(lastRow).toContainText(lastContact.name)
  await expect(lastRow.locator("span.w-6")).toHaveText("60")

  // Jumping to the last contact and reopening the drawer must scroll the
  // virtualized window to that row, not restart at the first one.
  await lastRow.click()
  await expect(page.getByRole("heading", { level: 2, name: lastContact.name })).toBeVisible()
  await page.getByRole("button", { name: "Queue", exact: true }).click()
  const reopened = page.getByRole("dialog")
  await expect(reopened.getByText("← you")).toBeVisible()
})

test("returning to the tab opens the disposition screen with no I’m back tap", async ({ page, request }) => {
  const contacts = await seededContacts(1)
  const { campaignId } = await campaignWithContacts(request, "auto-return", contacts, 20)

  await gotoCallerSession(page, `/campaigns/assignments?campaign=${campaignId}`)
  await expect(page.getByRole("heading", { name: contacts[0].name })).toBeVisible()

  await page.getByRole("button", { name: /^Call / }).click()
  await expect(page.getByRole("button", { name: "Call in progress" })).toBeDisabled()
  await expect(page.getByRole("button", { name: /I’m back/ })).toHaveCount(0)

  // The dialer takes the app out of the foreground; Playwright has no native
  // app to switch to, so the two window events that signal the same transition
  // are dispatched directly. The blur is ignored inside the first second, the
  // same guard a user gets after tapping Call.
  await page.waitForTimeout(1_100)
  await page.evaluate(() => window.dispatchEvent(new Event("blur")))
  await page.evaluate(() => window.dispatchEvent(new Event("focus")))

  await expect(page.getByRole("heading", { name: "How did it go?" })).toBeVisible()
})

test("a second tab is refused loudly and the first tab keeps working", async ({ page, request }) => {
  const contacts = await seededContacts(1)
  const { campaignId } = await campaignWithContacts(request, "single-tab", contacts, 20)

  await gotoCallerSession(page, `/campaigns/assignments?campaign=${campaignId}`)
  await expect(page.getByRole("heading", { name: contacts[0].name })).toBeVisible()

  const second = await page.context().newPage()

  try {
    await second.goto(`/campaigns/assignments?campaign=${campaignId}`)
    await expect(second.getByText("Another tab is using this queue")).toBeVisible()
    await expect(second.getByText(/Close the other tab/)).toBeVisible()
    await expect(page.getByRole("heading", { name: contacts[0].name })).toBeVisible()
  } finally {
    await second.close()
  }
})

test("a reload restores the same contact and the in-flight draft", async ({ page, request }) => {
  const contacts = await seededContacts(1)
  const { campaignId, assignments } = await campaignWithContacts(request, "draft-restore", contacts, 20)
  const assignmentId = assignments[0].id

  await gotoCallerSession(page, `/campaigns/assignments?campaign=${campaignId}&assignment=${assignmentId}&phase=disposition`)
  await expect(page.getByRole("heading", { name: "How did it go?" })).toBeVisible()

  await page.getByRole("button", { name: "Confirmed", exact: true }).click()
  await page.getByRole("textbox", { name: "Notes" }).fill("Interested, wants a call next week")
  await page.waitForFunction(() => Object.keys(window.localStorage).some((key) => key.startsWith("dialer:disposition:")))

  await page.reload()
  await page.waitForFunction(() => document.body.dataset.callerSession === "ready")

  await expect(page.getByRole("heading", { name: "How did it go?" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Confirmed", exact: true })).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByRole("textbox", { name: "Notes" })).toHaveValue("Interested, wants a call next week")
  expect(new URL(page.url()).searchParams.get("assignment")).toBe(assignmentId)
})
