/**
 * Story 2.5 — the offline disposition queue and draft recovery.
 *
 * The service-worker contract is asserted as text (the worker is a shared file
 * with four dependants). The client path is exercised with the worker blocked,
 * so `page.route` can prove the `202` receipt, the drain on `409`, and the draft
 * that survives both.
 */

import { readFile } from "node:fs/promises"
import path from "node:path"

import { expect, test } from "@playwright/test"

import {
  assignContacts,
  gotoCallerSession,
  callerForRole,
  createCallerCampaign,
  runLocalSql,
  seededContacts,
} from "./campaign-caller-helpers"
import { repoRoot, storageStatePath } from "../fixtures/roles"

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

test("the service worker queues the disposition path and keeps /campaigns network-only", async () => {
  const source = await readFile(path.join(repoRoot, "public", "sw.js"), "utf8")
  const queuedBlock = source.slice(
    source.indexOf("QUEUED_POST_PATHS"),
    source.indexOf("STATIC_ASSET_DESTINATIONS"),
  )
  const dialerPaths = [...queuedBlock.matchAll(/"(\/api\/dialer[^"]*)"/g)].map((match) => match[1])

  expect(source).toContain('"/api/dialer/caller/disposition"')
  expect(dialerPaths).toEqual(["/api/dialer/caller/disposition"])
  expect(source).toContain('"/campaigns"')
})

test("a queued save is Queued — will send, drains on 409, and the draft survives", async ({ browser, request }) => {
  const { campaignId, assignments } = await campaignWithAssignments(request, "offline-drain", 2)
  const context = await browser.newContext({
    storageState: storageStatePath("admin"),
    serviceWorkers: "block",
  })
  const page = await context.newPage()
  let mode: "abort" | "refuse" = "abort"

  await page.route("**/api/dialer/caller/disposition", async (route) => {
    if (mode === "abort") {
      await route.abort("failed")
      return
    }

    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ code: "campaign_not_active", message: "This campaign is no longer active." }),
    })
  })

  try {
    await gotoCallerSession(page, `/campaigns/assignments?campaign=${campaignId}&assignment=${assignments[0].id}&phase=disposition`)
    await page.getByRole("button", { name: "Confirmed", exact: true }).click()
    await page.getByRole("textbox", { name: "Notes" }).fill("Saved in a dead zone")
    await page.getByRole("button", { name: "Save & continue" }).click()

    await expect(page.getByText("Queued — will send")).toBeVisible()
    const queued = await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem("dialer:offline-queue") ?? "[]"),
    )
    expect(queued).toHaveLength(1)

    await runLocalSql(
      `UPDATE public.dialer_campaigns SET status = 'CANCELLED' WHERE id = '${campaignId}'`,
    )

    mode = "refuse"
    await page.evaluate(() => window.dispatchEvent(new Event("online")))

    await page.waitForFunction(
      () => JSON.parse(window.localStorage.getItem("dialer:offline-queue") ?? "[]").length === 0,
      undefined,
      { timeout: 20_000 },
    )

    const draftKeys = await page.evaluate(() =>
      Object.keys(window.localStorage).filter((key) => key.startsWith("dialer:disposition:")),
    )
    expect(draftKeys.length).toBeGreaterThan(0)
  } finally {
    await page.unroute("**/api/dialer/caller/disposition")
    await context.close()
  }
})

test("the next session surfaces an unsaved draft with its answers intact", async ({ browser, request }) => {
  const { campaignId, contacts, assignments } = await campaignWithAssignments(request, "offline-draft", 1)
  const context = await browser.newContext({
    storageState: storageStatePath("admin"),
    serviceWorkers: "block",
  })
  const page = await context.newPage()

  await page.route("**/api/dialer/caller/disposition", async (route) => {
    await route.abort("failed")
  })

  try {
    await gotoCallerSession(page, `/campaigns/assignments?campaign=${campaignId}&assignment=${assignments[0].id}&phase=disposition`)
    await page.getByRole("button", { name: "May come", exact: true }).click()
    await page.getByRole("textbox", { name: "Notes" }).fill("Wants to confirm next week")
    await page.getByRole("button", { name: "Save & continue" }).click()
    await expect(page.getByText("Queued — will send")).toBeVisible()

    await gotoCallerSession(page, `/campaigns/assignments?campaign=${campaignId}`)
    await expect(page.getByRole("heading", { name: contacts[0].name })).toBeVisible()
    await expect(page.getByText("A call for this contact could not be saved. Its answers are still here.")).toBeVisible()

    await page.getByRole("button", { name: "Resume" }).click()
    await expect(page.getByRole("heading", { name: "How did it go?" })).toBeVisible()
    await expect(page.getByRole("button", { name: "May come", exact: true })).toHaveAttribute("aria-pressed", "true")
    await expect(page.getByRole("textbox", { name: "Notes" })).toHaveValue("Wants to confirm next week")
  } finally {
    await page.unroute("**/api/dialer/caller/disposition")
    await context.close()
  }
})
