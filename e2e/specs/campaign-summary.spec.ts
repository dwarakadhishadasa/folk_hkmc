/**
 * Story 2.6 — the caller-grain session summary and bounded recall.
 *
 * The fixture creates four admin-owned outcomes (reached, not reachable, a
 * capped row and a skip) plus one Preacher-owned NOT_REACHABLE row. The Admin's
 * summary must count only the four; recall must re-queue the one reachable-under-
 * cap row without touching `attempt`, and a cancelled campaign must refuse it.
 */

import { expect, test } from "@playwright/test"

import {
  assignContacts,
  gotoCallerSession,
  assignmentStatus,
  callerForRole,
  createCallerCampaign,
  createCallLog,
  latestCallLog,
  runLocalSql,
  seededContacts,
  setAssignmentStatus,
} from "./campaign-caller-helpers"
import { storageStatePath } from "../fixtures/roles"

test.use({ storageState: storageStatePath("admin") })

let campaignId = ""
let campaignCleanup: (() => Promise<void>) | null = null
let adminCallerCleanup: (() => Promise<void>) | null = null
let preacherCallerCleanup: (() => Promise<void>) | null = null
let recallableAssignmentId = ""
let cappedAssignmentId = ""
let recallableContactName = ""

test.beforeAll(async ({ request }) => {
  const campaign = await createCallerCampaign(request, "session-summary", { gapDuration: 5, maxAttempts: 2 })
  campaignId = campaign.campaignId
  campaignCleanup = campaign.cleanup

  const adminCaller = await callerForRole("admin")
  adminCallerCleanup = adminCaller.cleanup
  const preacherCaller = await callerForRole("preacher")
  preacherCallerCleanup = preacherCaller.cleanup

  const contacts = await seededContacts(5)
  const adminAssignments = await assignContacts(campaignId, adminCaller.callerId, contacts.slice(0, 4))
  const [preacherAssignment] = await assignContacts(campaignId, preacherCaller.callerId, contacts.slice(4))

  recallableAssignmentId = adminAssignments[1].id
  cappedAssignmentId = adminAssignments[2].id
  recallableContactName = contacts[1].name

  await createCallLog({
    assignmentId: adminAssignments[0].id,
    callerId: adminCaller.callerId,
    phone: contacts[0].phone,
    attempt: 1,
    dispositionStatus: "CONFIRMED",
  })
  await setAssignmentStatus(adminAssignments[0].id, "COMPLETED")

  await createCallLog({
    assignmentId: recallableAssignmentId,
    callerId: adminCaller.callerId,
    phone: contacts[1].phone,
    attempt: 1,
    dispositionStatus: "CALL_DID_NOT_CONNECT",
  })
  await setAssignmentStatus(recallableAssignmentId, "COMPLETED")

  await createCallLog({
    assignmentId: cappedAssignmentId,
    callerId: adminCaller.callerId,
    phone: contacts[2].phone,
    attempt: 1,
    dispositionStatus: "SWITCHED_OFF",
  })
  await createCallLog({
    assignmentId: cappedAssignmentId,
    callerId: adminCaller.callerId,
    phone: contacts[2].phone,
    attempt: 2,
    dispositionStatus: "SWITCHED_OFF",
  })
  await setAssignmentStatus(cappedAssignmentId, "COMPLETED")

  await setAssignmentStatus(adminAssignments[3].id, "SKIPPED")

  await createCallLog({
    assignmentId: preacherAssignment.id,
    callerId: preacherCaller.callerId,
    phone: contacts[4].phone,
    attempt: 1,
    dispositionStatus: "CALL_DID_NOT_CONNECT",
  })
  await setAssignmentStatus(preacherAssignment.id, "COMPLETED")
})

test.afterAll(async () => {
  await campaignCleanup?.()
  await preacherCallerCleanup?.()
  await adminCallerCleanup?.()
})

test("Session complete counts only the caller's own work and recall is bounded", async ({ page, request }) => {
  await gotoCallerSession(page, `/campaigns/assignments?campaign=${campaignId}&phase=summary`)

  await expect(page.getByRole("heading", { name: "Session complete" })).toBeVisible()
  await expect(page.getByText("4 assigned to you")).toBeVisible()

  const tile = (label: string) => page.getByText(label, { exact: true }).locator("..")
  await expect(tile("Called")).toContainText("3")
  await expect(tile("Reached")).toContainText("1")
  await expect(tile("No answer")).toContainText("2")
  await expect(tile("Wrong number")).toContainText("0")
  await expect(tile("Skipped early")).toContainText("1")
  await expect(tile("Pending")).toContainText("0")

  await expect(page.getByText(/1 person was not reachable/)).toBeVisible()
  await expect(page.getByText("1 contact is closed after 2 attempts.")).toBeVisible()
  await expect(page.getByRole("button", { name: "Re-queue those 1 and continue" })).toBeVisible()

  await page.getByRole("button", { name: "Re-queue those 1 and continue" }).click()

  await expect(page.getByRole("heading", { name: recallableContactName })).toBeVisible()
  await expect(page.getByRole("button", { name: /^Call / })).toBeVisible()
  expect(await assignmentStatus(recallableAssignmentId)).toBe("PENDING")
  expect(await latestCallLog(recallableAssignmentId)).toMatchObject({ attempt: 1 })

  await runLocalSql(`UPDATE public.dialer_campaigns SET status = 'CANCELLED' WHERE id = '${campaignId}'`)

  const refused = await request.post("/api/dialer/caller/session/recall", {
    data: { campaignId },
  })
  expect(refused.status()).toBe(409)
  expect(await refused.json()).toMatchObject({ code: "campaign_not_active" })
})
