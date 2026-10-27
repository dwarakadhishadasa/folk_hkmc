/**
 * Story 2.2 — pacing, Skip, Pause, the campaign switch, the single-tab lock
 * and reload recovery.
 *
 * Each test owns its campaigns and assignments; the caller profile is shared
 * and removed at the end. The gap assertions read the visible countdown twice
 * to prove it derives from wall-clock time rather than a decrementing counter.
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

test("the gap is visible and derived from elapsed time; Pause and Resume keep the card", async ({ page, request }) => {
  const contacts = await seededContacts(3)
  const { campaignId, assignments } = await campaignWithContacts(request, "a-session", contacts.slice(0, 2), 30)
  await campaignWithContacts(request, "b-session", contacts.slice(2), 30)

  await gotoCallerSession(page, `/campaigns/assignments?campaign=${campaignId}`)
  await expect(page.getByRole("heading", { name: contacts[0].name })).toBeVisible()

  await page.getByRole("button", { name: "Skip" }).click()
  await expect(page.getByRole("heading", { name: contacts[1].name })).toBeVisible()

  const countdown = page.getByText(/Next call in \d+s/)
  await expect(countdown).toBeVisible()
  const firstText = (await countdown.textContent()) ?? ""
  const firstSeconds = Number(firstText.match(/(\d+)s/)?.[1] ?? "0")
  expect(firstSeconds).toBeGreaterThan(0)

  await page.waitForTimeout(1_300)
  const secondText = (await countdown.textContent()) ?? ""
  const secondSeconds = Number(secondText.match(/(\d+)s/)?.[1] ?? "0")
  expect(secondSeconds).toBeLessThan(firstSeconds)

  await page.getByRole("button", { name: "Pause" }).click()
  await expect(page.getByText("Paused — answers and place kept")).toBeVisible()
  await expect(page.getByRole("button", { name: "Paused" })).toBeDisabled()

  await page.getByRole("button", { name: "Resume" }).click()
  await expect(page.getByRole("heading", { name: contacts[1].name })).toBeVisible()
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible()

  await page.getByRole("button", { name: "Skip" }).click()

  // Both A assignments are skipped, so the next entry is in the second
  // campaign and the notice is awaited before the next call can start.
  const notice = page.getByRole("dialog")
  await expect(notice.getByText("Next campaign")).toBeVisible()
  await expect(notice.getByText(/b-session/).first()).toBeVisible()
  await expect(notice.getByRole("button", { name: /Continue to/ })).toBeVisible()
  await notice.getByRole("button", { name: /Continue to/ }).click()
  await expect(notice).not.toBeVisible()
  await expect(page.getByRole("heading", { name: contacts[2].name })).toBeVisible()
  await expect(page.getByText(/Next call in \d+s/)).toBeVisible()

  expect(await assignmentStatus(assignments[0].id)).toBe("SKIPPED")
  expect(await assignmentStatus(assignments[1].id)).toBe("SKIPPED")
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
