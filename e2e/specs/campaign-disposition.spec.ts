/**
 * Story 2.3 — the disposition screen and the one-transaction save.
 *
 * The UI owns the chip order and the conditional survey; the API owns the
 * transactional contract. Both are exercised here, and every fixture campaign
 * is removed in the same run.
 */

import { expect, test } from "@playwright/test"

import {
  assignContacts,
  gotoCallerSession,
  assignmentStatus,
  callerForRole,
  createCallerCampaign,
  createQuestion,
  latestCallLog,
  seededContacts,
  surveyResponses,
} from "./campaign-caller-helpers"
import { serviceRoleClient } from "../fixtures/dialer-caller"
import { storageStatePath } from "../fixtures/roles"

test.use({ storageState: storageStatePath("admin") })

const CHIPS = [
  "Confirmed",
  "May come",
  "Will come next class",
  "Will come next week",
  "Visiting home town",
  "Call me back",
  "Call did not connect",
  "Health is not good",
  "Switched off",
  "Out of station",
  "Busy cannot come",
  "Wrong number",
  "Not interested — do not call again",
] as const

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

async function oneAssignment(request: Parameters<typeof createCallerCampaign>[0], label: string) {
  const campaign = await createCallerCampaign(request, label, { gapDuration: 20, maxAttempts: 3 })
  cleanups.push(campaign.cleanup)
  const contacts = await seededContacts(1)
  const assignments = await assignContacts(campaign.campaignId, callerId, contacts)
  return { campaignId: campaign.campaignId, contact: contacts[0], assignment: assignments[0] }
}

test("the thirteen chips are the stored model and the survey is conditional", async ({ page, request }) => {
  const { campaignId, contact, assignment } = await oneAssignment(request, "disposition-ui")
  const question = await createQuestion({
    campaignId,
    title: "Will you come?",
    type: "RADIO",
    required: true,
    options: [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
    ],
  })

  await gotoCallerSession(page, `/campaigns/assignments?campaign=${campaignId}&assignment=${assignment.id}&phase=disposition`)
  await expect(page.getByRole("heading", { name: "How did it go?" })).toBeVisible()
  await expect(page.getByText(new RegExp(contact.name))).toBeVisible()

  for (const chip of CHIPS) {
    await expect(page.getByRole("button", { name: chip, exact: true })).toBeVisible()
  }

  await page.getByRole("button", { name: "Wrong number", exact: true }).click()
  await expect(page.getByText("Will you come?")).not.toBeVisible()

  await page.getByRole("button", { name: "Confirmed", exact: true }).click()
  await expect(page.getByText("Will you come?")).toBeVisible()
  await expect(page.getByRole("radio", { name: "Yes" })).toBeVisible()

  await page.getByRole("radio", { name: "Yes" }).click()
  await page.getByRole("textbox", { name: "Notes" }).fill("Coming on Sunday")
  await page.getByRole("button", { name: "Save & continue" }).click()

  await expect(page.getByText("Session complete")).toBeVisible()

  const log = await latestCallLog(assignment.id)
  expect(log?.disposition_status).toBe("CONFIRMED")
  expect(log?.status_group).toBe("CONFIRMED")
  expect(log?.follow_up_notes).toBe("Coming on Sunday")

  const responses = await surveyResponses(log!.id)
  expect(responses).toHaveLength(1)
  expect(responses[0].question_id).toBe(question.questionId)
  expect(responses[0].answer).toBe("yes")
  expect(await assignmentStatus(assignment.id)).toBe("COMPLETED")
})

test("a replay of the same payload is 200 with one row; a different payload is 409", async ({ request }) => {
  const { assignment } = await oneAssignment(request, "disposition-replay")
  const payload = {
    assignmentId: assignment.id,
    attempt: 1,
    dispositionStatus: "CONFIRMED",
    followUpNotes: "Stored once",
    responses: [],
    callerId: "00000000-0000-4000-8000-000000000000",
  }

  const first = await request.post("/api/dialer/caller/disposition", { data: payload })
  expect(first.status(), await first.text()).toBe(200)
  const firstBody = (await first.json()) as { receipt: { replay: boolean } }
  expect(firstBody.receipt.replay).toBe(false)

  const replay = await request.post("/api/dialer/caller/disposition", { data: payload })
  expect(replay.status(), await replay.text()).toBe(200)
  const replayBody = (await replay.json()) as { receipt: { replay: boolean } }
  expect(replayBody.receipt.replay).toBe(true)

  const conflict = await request.post("/api/dialer/caller/disposition", {
    data: { ...payload, dispositionStatus: "NOT_INTERESTED" },
  })
  expect(conflict.status()).toBe(409)
  expect(await conflict.json()).toMatchObject({ code: "disposition_conflict" })

  const log = await latestCallLog(assignment.id)
  expect(log?.disposition_status).toBe("CONFIRMED")
})

test("a required answer and the supplied attempt are enforced by the RPC", async ({ request }) => {
  const { campaignId, assignment } = await oneAssignment(request, "disposition-rules")
  const question = await createQuestion({
    campaignId,
    title: "Will you come?",
    type: "RADIO",
    required: true,
    options: [{ label: "Yes", value: "yes" }],
  })

  const unanswered = await request.post("/api/dialer/caller/disposition", {
    data: {
      assignmentId: assignment.id,
      attempt: 1,
      dispositionStatus: "CONFIRMED",
      followUpNotes: null,
      responses: [],
    },
  })
  expect(unanswered.status()).toBe(400)
  expect(await unanswered.json()).toMatchObject({ code: "disposition_validation_failed" })
  expect(await latestCallLog(assignment.id)).toBeNull()

  const badAttempt = await request.post("/api/dialer/caller/disposition", {
    data: {
      assignmentId: assignment.id,
      attempt: 5,
      dispositionStatus: "CONFIRMED",
      followUpNotes: null,
      responses: [],
    },
  })
  expect(badAttempt.status()).toBe(409)
  expect(await badAttempt.json()).toMatchObject({ code: "attempt_conflict" })
  expect(await latestCallLog(assignment.id)).toBeNull()

  const answered = await request.post("/api/dialer/caller/disposition", {
    data: {
      assignmentId: assignment.id,
      attempt: 1,
      dispositionStatus: "CONFIRMED",
      followUpNotes: null,
      responses: [{ questionId: question.questionId, answer: "yes", answerValues: null }],
    },
  })
  expect(answered.status(), await answered.text()).toBe(200)
})

test("a choice question with zero options is rejected", async ({ request }) => {
  const { campaignId, assignment } = await oneAssignment(request, "disposition-zero-options")
  await createQuestion({
    campaignId,
    title: "Pick a language",
    type: "DROPDOWN",
    required: true,
    options: [],
  })

  const response = await request.post("/api/dialer/caller/disposition", {
    data: {
      assignmentId: assignment.id,
      attempt: 1,
      dispositionStatus: "CONFIRMED",
      followUpNotes: null,
      responses: [],
    },
  })

  expect(response.status()).toBe(400)
  expect(await latestCallLog(assignment.id)).toBeNull()
})

test("an inactive caller is refused and writes no row", async ({ request }) => {
  const { assignment } = await oneAssignment(request, "disposition-inactive")
  const client = serviceRoleClient()

  try {
    await client.from("dialer_callers").update({ is_active: false }).eq("id", callerId)

    const response = await request.post("/api/dialer/caller/disposition", {
      data: {
        assignmentId: assignment.id,
        attempt: 1,
        dispositionStatus: "CONFIRMED",
        followUpNotes: null,
        responses: [],
      },
    })

    expect([403, 409]).toContain(response.status())
    const body = (await response.json()) as { code?: string }
    expect(["caller_inactive", "caller_deactivated"]).toContain(body.code)
    expect(await latestCallLog(assignment.id)).toBeNull()
  } finally {
    await client.from("dialer_callers").update({ is_active: true }).eq("id", callerId)
  }
})
