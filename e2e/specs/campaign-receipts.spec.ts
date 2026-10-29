/**
 * Story 2.4 — save receipts, failure states and named refusals.
 *
 * The receipt is a line on the screen, not a toast: `Saving…` is held open with
 * `page.route`, released before `unroute`, and `Saved HH:MM` is read on the next
 * card. A network gap is `Queued — will send`, and a refused write keeps every
 * answer editable.
 */

import { expect, test } from "@playwright/test"

import {
  assignContacts,
  gotoCallerSession,
  callerForRole,
  createCallerCampaign,
  createQuestion,
  seededContacts,
} from "./campaign-caller-helpers"
import { storageStatePath } from "../fixtures/roles"

test.use({ storageState: storageStatePath("admin"), serviceWorkers: "block" })

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

async function campaignWithAssignments(
  request: Parameters<typeof createCallerCampaign>[0],
  label: string,
  count: number,
) {
  const campaign = await createCallerCampaign(request, label, { gapDuration: 5, maxAttempts: 3 })
  cleanups.push(campaign.cleanup)
  const contacts = await seededContacts(count)
  const assignments = await assignContacts(campaign.campaignId, callerId, contacts)
  return { campaignId: campaign.campaignId, contacts, assignments }
}

test("Saving… is visible while held, then Saved HH:MM persists on the next card", async ({ page, request }) => {
  const { campaignId, contacts, assignments } = await campaignWithAssignments(request, "receipt-saved", 2)
  let release: (() => void) | null = null
  const held = new Promise<void>((resolve) => {
    release = resolve
  })

  await page.route("**/api/dialer/caller/disposition", async (route) => {
    await held
    await route.continue()
  })

  await gotoCallerSession(page, `/campaigns/assignments?campaign=${campaignId}&assignment=${assignments[0].id}&phase=disposition`)
  await page.getByRole("button", { name: "Confirmed", exact: true }).click()
  await page.getByRole("button", { name: "Save & continue" }).click()

  await expect(page.getByRole("status").filter({ hasText: "Saving…" })).toBeVisible()

  release?.()
  await expect(page.getByText(/Saved \d{2}:\d{2}/)).toBeVisible()
  await expect(page.getByRole("heading", { name: contacts[1].name })).toBeVisible()

  await page.unroute("**/api/dialer/caller/disposition")
})

test("a network gap is Queued — will send, never Save failed, and the draft stays", async ({ page, request }) => {
  const { campaignId, contacts, assignments } = await campaignWithAssignments(request, "receipt-queued", 2)

  await page.route("**/api/dialer/caller/disposition", async (route) => {
    await route.abort("failed")
  })

  await gotoCallerSession(page, `/campaigns/assignments?campaign=${campaignId}&assignment=${assignments[0].id}&phase=disposition`)
  await page.getByRole("button", { name: "Confirmed", exact: true }).click()
  await page.getByRole("textbox", { name: "Notes" }).fill("Queued answer")
  await page.getByRole("button", { name: "Save & continue" }).click()

  await expect(page.getByText("Queued — will send")).toBeVisible()
  await expect(page.getByText("Save failed — try again")).not.toBeVisible()
  await expect(page.getByRole("heading", { name: contacts[1].name })).toBeVisible()

  const queued = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("dialer:offline-queue") ?? "[]"),
  )
  expect(queued).toHaveLength(1)

  const draftKeys = await page.evaluate(() =>
    Object.keys(window.localStorage).filter((key) => key.startsWith("dialer:disposition:")),
  )
  expect(draftKeys.length).toBeGreaterThan(0)

  await page.unroute("**/api/dialer/caller/disposition")
})

test("a refused write keeps every answer editable and offers no way past the screen", async ({ page, request }) => {
  const fixture = await campaignWithAssignments(request, "receipt-refused", 1)
  const { campaignId, assignment } = { ...fixture, assignment: fixture.assignments[0] }

  await createQuestion({
    campaignId,
    title: "Will you come?",
    type: "RADIO",
    required: true,
    options: [{ label: "Yes", value: "yes" }],
  })

  let currentCode = "caller_deactivated"
  await page.route("**/api/dialer/caller/disposition", async (route) => {
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ code: currentCode, message: "refused" }),
    })
  })

  await gotoCallerSession(page, `/campaigns/assignments?campaign=${campaignId}&assignment=${assignment.id}&phase=disposition`)
  await page.getByRole("button", { name: "Confirmed", exact: true }).click()
  await page.getByRole("radio", { name: "Yes" }).click()
  await page.getByRole("textbox", { name: "Notes" }).fill("He is interested")

  await page.getByRole("button", { name: "Save & continue" }).click()
  await expect(page.getByText("Caller deactivated — the call was not saved")).toBeVisible()
  await expect(page.getByText("Save failed — try again")).toBeVisible()
  await expect(page.getByRole("textbox", { name: "Notes" })).toHaveValue("He is interested")
  await expect(page.getByRole("button", { name: "Confirmed", exact: true })).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByRole("radio", { name: "Yes" })).toHaveAttribute("aria-checked", "true")

  currentCode = "assignment_reassigned"
  await page.getByRole("button", { name: "Save & continue" }).click()
  await expect(page.getByText("Assignment reassigned — the call was not saved")).toBeVisible()

  currentCode = "campaign_not_active"
  await page.getByRole("button", { name: "Save & continue" }).click()
  await expect(page.getByText("This campaign is no longer active — the call was not saved")).toBeVisible()
  await expect(page.getByRole("textbox", { name: "Notes" })).toHaveValue("He is interested")

  // The disposition screen has no exit control: the user has to answer before
  // the session can move on, and a refused write keeps every answer editable.
  await expect(page.getByRole("button", { name: "Back to the call card" })).toHaveCount(0)
  await expect(page.getByRole("heading", { name: "How did it go?" })).toBeVisible()
  await expect(page.getByRole("textbox", { name: "Notes" })).toHaveValue("He is interested")

  await page.unroute("**/api/dialer/caller/disposition")
})

test("an Assistant who cannot correct a wrong number is told who can", async ({ browser, request }) => {
  const assistant = await callerForRole("assistant")
  const campaign = await createCallerCampaign(request, "receipt-assistant", { gapDuration: 5, maxAttempts: 3 })

  try {
    const contacts = await seededContacts(1)
    const [assignment] = await assignContacts(campaign.campaignId, assistant.callerId, contacts)

    const context = await browser.newContext({ storageState: storageStatePath("assistant") })
    const page = await context.newPage()

    try {
      await gotoCallerSession(
        page,
        `/campaigns/assignments?campaign=${campaign.campaignId}&assignment=${assignment.id}&phase=disposition`,
      )
      await page.getByRole("button", { name: "Wrong number", exact: true }).click()

      await expect(page.getByText("Ask an Admin or Preacher to correct this number.")).toBeVisible()
      await expect(page.locator('a[href*="/manage"]')).toHaveCount(0)
    } finally {
      await context.close()
    }
  } finally {
    // The assignment references the caller with ON DELETE RESTRICT, so the
    // campaign's dependants must go before the profile.
    await campaign.cleanup()
    await assistant.cleanup()
  }
})
