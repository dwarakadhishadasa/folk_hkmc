/**
 * Story 3.2 — the CSV export.
 *
 * The export reads the same `campaign_progress` payload as the reports screen,
 * so this spec checks the file's sections, its scope and its failure shape.
 * It deliberately does not re-assert the screen's rendering; Story 3.1 owns
 * that, and a duplicated assertion here would be a second place to drift.
 *
 * The out-of-scope contact's name is the Preacher row's proof that the file is
 * scoped by the same predicate as assignment, not merely by the campaign id.
 */

import { expect, test, request as playwrightRequest } from "@playwright/test"

import { buildReportFixture, type ReportFixture } from "../fixtures/dialer-reports"
import { storageStatePath } from "../fixtures/roles"

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000"

/**
 * A campaign id valid in shape and absent by construction, like the sweep's
 * own constant. Reaching this row must never create a file.
 */
const ABSENT_CAMPAIGN_ID = "00000000-0000-4000-8000-000000000010"

let fixture: ReportFixture

test.beforeAll(async () => {
  const request = await playwrightRequest.newContext({
    baseURL: BASE_URL,
    storageState: storageStatePath("admin"),
  })

  try {
    fixture = await buildReportFixture(request, "reports export")
  } finally {
    await request.dispose()
  }
})

test.afterAll(async () => {
  await fixture?.cleanup()
})

test("the Admin's file carries the funnel, mix, rollup and activity with no invented column", async ({
  request,
}) => {
  const response = await request.get(
    `/api/dialer/admin/campaigns/${fixture.campaignId}/export`,
  )

  expect(response.status(), await response.text()).toBe(200)
  expect(response.headers()["content-type"]).toContain("text/csv")
  expect(response.headers()["content-disposition"]).toMatch(/attachment; filename="[^"]+-report\.csv"/)

  const csv = await response.text()

  expect(csv).toContain("Campaign,")
  expect(csv).toContain("Funnel")
  expect(csv).toContain("Assigned,5")
  expect(csv).toContain("Attempted,4")
  expect(csv).toContain("Reached,2")
  expect(csv).toContain("Confirmed,2")
  expect(csv).toContain("Never attempted,1")

  expect(csv).toContain("Outcome mix")
  expect(csv).toContain("Confirmed,2")
  expect(csv).toContain("May come,0")
  expect(csv).toContain("No answer,1")
  expect(csv).toContain("Wrong number,1")

  expect(csv).toContain("Caller rollup")
  expect(csv).toContain("Recent activity")
  expect(csv).not.toContain("call_duration")
})

test("a Preacher's file cannot contain the out-of-scope contact", async ({ browser }) => {
  const context = await browser.newContext({ storageState: storageStatePath("preacher") })

  try {
    const response = await context.request.get(
      `/api/dialer/admin/campaigns/${fixture.campaignId}/export`,
    )

    expect(response.status(), await response.text()).toBe(200)

    const csv = await response.text()

    expect(csv).toContain("Assigned,4")
    expect(csv).toContain("Confirmed,1")
    expect(csv).not.toContain("Assigned,5")
    expect(csv).not.toContain(fixture.contactNames.outOfScope)
  } finally {
    await context.close()
  }
})

test("an unauthenticated request is refused with no file", async ({ playwright }) => {
  const request = await playwright.request.newContext({
    baseURL: BASE_URL,
    storageState: { cookies: [], origins: [] },
  })

  try {
    const response = await request.get(
      `/api/dialer/admin/campaigns/${fixture.campaignId}/export`,
    )

    expect([401, 403]).toContain(response.status())
    expect(await response.text()).not.toContain("Funnel")
  } finally {
    await request.dispose()
  }
})

test("a failed export is a named error, never an empty successful file", async ({ request }) => {
  const response = await request.get(`/api/dialer/admin/campaigns/${ABSENT_CAMPAIGN_ID}/export`)

  expect(response.status()).toBe(404)
  expect(response.headers()["content-type"]).toContain("application/json")
  expect(response.headers()["content-disposition"]).toBeUndefined()

  const body = (await response.json()) as { code?: string; error?: string }
  expect(body.code ?? body.error).toBeTruthy()
})
