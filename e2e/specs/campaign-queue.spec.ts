/**
 * Story 2.1 — the caller queue, the call card and contact history.
 *
 * The fixture owns a campaign, an active caller profile, three contacts and one
 * prior call on the first contact, so the card's history panel and the queue's
 * current/next rows are visible. The foreign-caller row proves the body-less
 * 404 with a role that actually holds a caller profile, and the empty row proves
 * the actionable state rather than a screen of zeroes.
 */

import { expect, test, request as playwrightRequest } from "@playwright/test"

import {
  assignContacts,
  callerForRole,
  createCallLog,
  createCallerCampaign,
  gotoCallerSession,
  runLocalSql,
  seededContacts,
} from "./campaign-caller-helpers"
import type { AssignmentFixtureRow, ContactFixture } from "./campaign-caller-helpers"
import { storageStatePath } from "../fixtures/roles"

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000"

test.use({ storageState: storageStatePath("admin") })

let campaignId = ""
let campaignCleanup: (() => Promise<void>) | null = null
let adminCallerCleanup: (() => Promise<void>) | null = null
let preacherCallerCleanup: (() => Promise<void>) | null = null
let contacts: ContactFixture[] = []
let assignments: AssignmentFixtureRow[] = []

test.beforeAll(async ({ request }) => {
  const campaign = await createCallerCampaign(request, "queue", { gapDuration: 20, maxAttempts: 3 })
  campaignId = campaign.campaignId
  campaignCleanup = campaign.cleanup

  const adminCaller = await callerForRole("admin")
  adminCallerCleanup = adminCaller.cleanup

  const preacherCaller = await callerForRole("preacher")
  preacherCallerCleanup = preacherCaller.cleanup

  contacts = await seededContacts(3)
  assignments = await assignContacts(campaignId, adminCaller.callerId, contacts)

  await createCallLog({
    assignmentId: assignments[0].id,
    callerId: adminCaller.callerId,
    phone: contacts[0].phone,
    attempt: 1,
    dispositionStatus: "NOT_INTERESTED",
    notes: "shift timings",
    calledAt: "2026-08-03T10:00:00.000Z",
  })
})

test.afterAll(async () => {
  await campaignCleanup?.()
  await preacherCallerCleanup?.()
  await adminCallerCleanup?.()
})

test.describe("the caller card and queue", () => {
  test("shows the current contact, their history, and the queue in order", async ({ page }) => {
    await gotoCallerSession(page, `/campaigns/assignments?campaign=${campaignId}`)

    await expect(page.getByRole("heading", { name: "Assignments" })).toBeVisible()
    await expect(page.getByRole("heading", { name: contacts[0].name })).toBeVisible()
    await expect(page.getByText(contacts[0].phone, { exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: /^Call / })).toBeVisible()
    await expect(page.getByRole("button", { name: "Copy" })).toBeVisible()
    await expect(page.getByText("Previous", { exact: true })).toBeVisible()
    await expect(page.getByText("Answered", { exact: true })).toBeVisible()
    await expect(page.getByText(/Not interested · shift timings/)).toBeVisible()
    await expect(page.getByText("03 Aug")).toBeVisible()

    await page.getByRole("button", { name: "Queue", exact: true }).click()
    const drawer = page.getByRole("dialog")
    await expect(drawer.getByText("Queue", { exact: true })).toBeVisible()
    await expect(drawer.getByText(/showing \d+ of 3/)).toBeVisible()
    await expect(drawer.getByText("← you")).toBeVisible()
    await expect(drawer.getByText("Pending", { exact: true }).first()).toBeVisible()

    const second = drawer.getByRole("button", { name: new RegExp(contacts[1].name) })
    await second.click()
    await expect(page.getByRole("heading", { name: contacts[1].name })).toBeVisible()
    await expect(page.getByRole("button", { name: `Call ${contacts[1].name.split(" ")[0]}` })).toBeVisible()
  })

  test("another caller's assignment is a body-less 404", async ({ request }) => {
    const foreign = await playwrightRequest.newContext({
      baseURL: BASE_URL,
      storageState: storageStatePath("preacher"),
    })

    try {
      const foreignRead = await foreign.get(`/api/dialer/caller/assignments/${assignments[0].id}`)
      expect(foreignRead.status(), "a foreign assignment is 404").toBe(404)
      expect(await foreignRead.text(), "the 404 must carry no payload").toBe("")

      const ownRead = await request.get(`/api/dialer/caller/assignments/${assignments[0].id}`)
      expect(ownRead.status(), "the owning caller reads the same assignment").toBe(200)
    } finally {
      await foreign.dispose()
    }
  })

  test("the empty queue names the next action", async ({ browser }) => {
    const assistant = await callerForRole("assistant")

    try {
      await runLocalSql(
        `DELETE FROM public.dialer_call_logs WHERE caller_id = '${assistant.callerId}';
         DELETE FROM public.dialer_assignments WHERE caller_id = '${assistant.callerId}';`,
      )

      const context = await browser.newContext({ storageState: storageStatePath("assistant") })
      const page = await context.newPage()

      try {
        await gotoCallerSession(page, "/campaigns/assignments")
        await expect(page.getByText("No calls assigned yet")).toBeVisible()
        await expect(
          page.getByText(
            "An Admin or Preacher assigns contacts to you. Your next call appears here as soon as one is assigned.",
          ),
        ).toBeVisible()
      } finally {
        await context.close()
      }
    } finally {
      await assistant.cleanup()
    }
  })
})
