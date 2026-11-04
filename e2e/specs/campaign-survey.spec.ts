/**
 * Story 1.5 — the per-campaign survey builder.
 *
 * Every test owns a disposable campaign created through the admin route the
 * builder's own page is reached from, and removes it in a `finally`. The
 * fixture's cleanup is the local stack's SQL endpoint because `service_role`
 * holds no `DELETE` on `dialer_campaigns`; questions and options are removed
 * before the campaign, in that order, because `dialer_survey_questions` is
 * `ON DELETE RESTRICT` and `dialer_survey_options` cascades from the question.
 *
 * A question created through the API rather than the builder is deliberate: it
 * keeps each test's precondition to one call and leaves the interaction under
 * test to the surface itself.
 */

import { expect, test, type APIRequestContext, type Page } from "@playwright/test"

import { isLocalSupabaseUrl } from "../../scripts/local-supabase-target.mjs"
import { readEnvValue } from "../fixtures/auth-users"
import { createDisposableCampaign, deleteDisposableCampaign } from "../fixtures/dialer-campaign"
import { storageStatePath } from "../fixtures/roles"

/** The UUID shape, checked before an id is interpolated into SQL. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface QuestionResponse {
  question?: { id?: string }
}

interface QuestionListResponse {
  questions?: Array<{
    id: string
    questionTitle: string
    questionType: string
    sortOrder: number
    retiredAt: string | null
  }>
}

/**
 * The local service-role target, or a throw naming the fix. Fail-closed on both
 * counts, as the campaign fixture is: a missing credential and a non-loopback
 * URL both throw, so the cleanup can neither be skipped nor run against the
 * hosted project.
 */
function resolveLocalServiceRole(): { url: string; serviceRoleKey: string } {
  const serviceRoleKey = readEnvValue("SUPABASE_SERVICE_ROLE_KEY")
  const supabaseUrl = readEnvValue("SUPABASE_URL") ?? readEnvValue("NEXT_PUBLIC_SUPABASE_URL")

  if (!serviceRoleKey || !supabaseUrl) {
    throw new Error(
      "Cannot clean up a campaign survey: SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL are missing. " +
        "Run `pnpm supabase:env` to write the local credentials into apps/folk/.env.local, or export them.",
    )
  }

  if (!isLocalSupabaseUrl(supabaseUrl)) {
    throw new Error(
      `Refusing to delete campaign survey rows at "${supabaseUrl}": it is not a loopback address, so the ` +
        "cleanup would run against the hosted database instead of the local stack.",
    )
  }

  return { url: supabaseUrl, serviceRoleKey }
}

async function runLocalSql(query: string): Promise<void> {
  const { url, serviceRoleKey } = resolveLocalServiceRole()
  const response = await fetch(`${url.replace(/\/+$/, "")}/pg/query`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  })

  if (!response.ok) {
    throw new Error(`The campaign survey cleanup failed: ${response.status} ${response.statusText}`)
  }
}

/** Options first, then questions, then the campaign the fixture owns. */
async function removeCampaignAndSurvey(campaignId: string): Promise<void> {
  if (!UUID_PATTERN.test(campaignId)) {
    throw new Error(`Refusing to clean up a campaign survey with a non-UUID id: ${campaignId}`)
  }

  await runLocalSql(
    `DELETE FROM public.dialer_survey_options WHERE question_id IN ` +
      `(SELECT id FROM public.dialer_survey_questions WHERE campaign_id = '${campaignId}')`,
  )
  await runLocalSql(`DELETE FROM public.dialer_survey_questions WHERE campaign_id = '${campaignId}'`)
  await deleteDisposableCampaign(campaignId)
}

async function createQuestionViaApi(
  page: Page,
  campaignId: string,
  body: Record<string, unknown>,
): Promise<string> {
  const response = await page.request.post(`/api/dialer/admin/campaigns/${campaignId}/questions`, { data: body })

  expect(response.status(), `the fixture question could not be created: ${await response.text()}`).toBe(201)

  const payload = (await response.json()) as QuestionResponse
  const questionId = payload.question?.id

  if (!questionId) {
    throw new Error("The question create route answered 201 without a question id.")
  }

  return questionId
}

async function listQuestions(page: Page, campaignId: string): Promise<QuestionListResponse["questions"]> {
  const response = await page.request.get(`/api/dialer/admin/campaigns/${campaignId}/questions?includeRetired=true`)
  expect(response.status()).toBe(200)

  const payload = (await response.json()) as QuestionListResponse
  return payload.questions ?? []
}

/** The survey panel, by its accessible name. */
function surveySection(page: Page) {
  return page.getByRole("region", { name: "Call-outcome survey" })
}

/**
 * The survey lives in the workspace's first section now, beside the campaign
 * details. It is always open, so there is no panel to slide in.
 */
async function gotoSurvey(page: Page, campaignId: string): Promise<void> {
  await page.goto(`/campaigns/${campaignId}/assign-contacts`)
  await expect(surveySection(page)).toBeVisible()
}

/**
 * Only the question rows: the option chips are `listitem`s too, so a role query
 * would count them. The `<ol>` is the builder's own element.
 */
function questionRows(page: Page) {
  return page.locator('ol[aria-label="Survey questions"] > li')
}

function questionRow(page: Page, title: string) {
  return questionRows(page).filter({ hasText: title })
}

const RADIO_BODY = {
  questionTitle: "How did it go?",
  questionType: "RADIO",
  isRequired: true,
  options: [{ label: "Yes" }, { label: "No" }],
}

// ---------------------------------------------------------------------------
// The empty survey
// ---------------------------------------------------------------------------

test.describe("the campaign survey — a new campaign", () => {
  test.use({ storageState: storageStatePath("admin") })

  test("renders no seeded Status? question", async ({ page }) => {
    const campaignId = await createDisposableCampaign(page.request, "Survey Empty")

    try {
      await gotoSurvey(page, campaignId)

      const survey = surveySection(page)
      await expect(survey).toBeVisible()
      await expect(survey.getByRole("heading", { name: "Call-outcome survey" })).toBeVisible()
      await expect(survey.getByText("Every caller records these answers, for this campaign only.")).toBeVisible()

      await expect(survey.getByText("No questions yet", { exact: true })).toBeVisible()
      await expect(questionRows(page)).toHaveCount(0)

      // The caller screen always records Status and Notes. They are shown as
      // default fields, and there is no editor for them here.
      const statusField = survey.getByRole("group", { name: "Status — default question" })
      await expect(statusField).toBeVisible()
      await expect(statusField.getByText("Default", { exact: true })).toBeVisible()
      await expect(statusField.getByRole("button")).toHaveCount(0)

      const notesField = survey.getByRole("group", { name: "Notes — default question" })
      await expect(notesField).toBeVisible()
      await expect(notesField.getByText("Optional", { exact: true })).toBeVisible()
      await expect(notesField.getByRole("button")).toHaveCount(0)

      // The frame's RADIO `Status?` card is its known defect: the 13-chip
      // disposition is the only status, so the builder must not offer one.
      await expect(survey.getByText("Status?", { exact: true })).toHaveCount(0)
      await expect(survey.getByText("Confirmed", { exact: true })).toHaveCount(0)

      await expect(survey.getByRole("button", { name: "Add question" })).toBeEnabled()
    } finally {
      await removeCampaignAndSurvey(campaignId)
    }
  })
})

// ---------------------------------------------------------------------------
// Adding questions
// ---------------------------------------------------------------------------

test.describe("the survey builder — an Admin adding questions", () => {
  test.use({ storageState: storageStatePath("admin") })

  test("adds a RADIO question with required options", async ({ page }) => {
    const campaignId = await createDisposableCampaign(page.request, "Survey Radio")

    try {
      await gotoSurvey(page, campaignId)
      const survey = surveySection(page)

      await survey.getByRole("button", { name: "Add question" }).click()
      await survey.getByLabel("Question title").fill("How did it go?")
      await survey.getByLabel("Question type").selectOption("RADIO")

      await survey.getByRole("button", { name: "Add option" }).click()
      await survey.getByLabel("Option 1 label").fill("Yes")
      await survey.getByRole("button", { name: "Add option" }).click()
      await survey.getByLabel("Option 2 label").fill("No")

      await expect(survey.getByRole("checkbox", { name: "Required" })).toBeChecked()
      await survey.getByRole("button", { name: "Save question" }).click()

      const row = questionRow(page, "How did it go?")
      await expect(row).toHaveCount(1)
      await expect(row.getByText("1", { exact: true })).toBeVisible()
      await expect(row.getByText("RADIO", { exact: true })).toBeVisible()
      await expect(row.getByText("Required", { exact: true })).toBeVisible()

      const chips = row.getByRole("list", { name: "How did it go? options" })
      await expect(chips.getByRole("listitem")).toHaveText(["Yes", "No"])

      await expect(survey.getByText("No questions yet", { exact: true })).toHaveCount(0)
    } finally {
      await removeCampaignAndSurvey(campaignId)
    }
  })

  test("rejects a choice question with no options in the server's words", async ({ page }) => {
    const campaignId = await createDisposableCampaign(page.request, "Survey No Options")

    try {
      await gotoSurvey(page, campaignId)
      const survey = surveySection(page)

      await survey.getByRole("button", { name: "Add question" }).click()
      await survey.getByLabel("Question title").fill("Transport")
      await survey.getByLabel("Question type").selectOption("DROPDOWN")

      // The save is not blocked here on purpose: the route owns the rule and
      // its message is what the builder shows.
      await survey.getByRole("button", { name: "Save question" }).click()

      const refusal = survey.getByRole("alert").filter({ hasText: "A DROPDOWN question needs at least one option." })
      await expect(refusal).toHaveText("A DROPDOWN question needs at least one option.")

      await expect(survey.getByText("No questions yet", { exact: true })).toBeVisible()
      await expect(questionRows(page)).toHaveCount(0)
      await expect.poll(async () => (await listQuestions(page, campaignId))?.length ?? 0).toBe(0)
    } finally {
      await removeCampaignAndSurvey(campaignId)
    }
  })

  test("adds a TEXT question as optional with no options", async ({ page }) => {
    const campaignId = await createDisposableCampaign(page.request, "Survey Text")

    try {
      await createQuestionViaApi(page, campaignId, RADIO_BODY)
      await gotoSurvey(page, campaignId)
      const survey = surveySection(page)

      await survey.getByRole("button", { name: "Add question" }).click()
      await survey.getByLabel("Question title").fill("Notes")
      await survey.getByLabel("Question type").selectOption("TEXT")
      await survey.getByRole("checkbox", { name: "Required" }).click()
      await survey.getByRole("button", { name: "Save question" }).click()

      const row = questionRow(page, "Notes")
      await expect(row).toHaveCount(1)
      await expect(row.getByText("2", { exact: true })).toBeVisible()
      await expect(row.getByText("TEXT", { exact: true })).toBeVisible()
      await expect(row.getByText("Optional", { exact: true })).toBeVisible()
      await expect(row.getByRole("list")).toHaveCount(0)
      await expect(row.getByText("Required", { exact: true })).toHaveCount(0)
    } finally {
      await removeCampaignAndSurvey(campaignId)
    }
  })
})

// ---------------------------------------------------------------------------
// Editing and ordering
// ---------------------------------------------------------------------------

test.describe("the survey builder — an Admin editing and ordering", () => {
  test.use({ storageState: storageStatePath("admin") })

  test("renames a question and keeps its position", async ({ page }) => {
    const campaignId = await createDisposableCampaign(page.request, "Survey Edit")

    try {
      await createQuestionViaApi(page, campaignId, RADIO_BODY)
      await createQuestionViaApi(page, campaignId, {
        questionTitle: "Notes",
        questionType: "TEXT",
        isRequired: false,
        options: [],
      })

      await gotoSurvey(page, campaignId)

      await questionRow(page, "Notes").getByRole("button", { name: "Edit" }).click()
      await surveySection(page).getByLabel("Question title").fill("Call notes")
      await surveySection(page).getByRole("button", { name: "Save question" }).click()

      await expect(questionRow(page, "Call notes")).toHaveCount(1)
      await expect(questionRows(page).nth(0)).toContainText("How did it go?")
      await expect(questionRows(page).nth(1)).toContainText("Call notes")
      await expect(questionRows(page).nth(1).getByText("2", { exact: true })).toBeVisible()

      await expect
        .poll(async () => (await listQuestions(page, campaignId))?.map((question) => question.questionTitle))
        .toEqual(["How did it go?", "Call notes"])
    } finally {
      await removeCampaignAndSurvey(campaignId)
    }
  })

  test("moves a question up and the order survives a reload", async ({ page }) => {
    const campaignId = await createDisposableCampaign(page.request, "Survey Order")

    try {
      await createQuestionViaApi(page, campaignId, RADIO_BODY)
      await createQuestionViaApi(page, campaignId, {
        questionTitle: "Notes",
        questionType: "TEXT",
        isRequired: false,
        options: [],
      })

      await gotoSurvey(page, campaignId)

      await questionRow(page, "Notes").getByRole("button", { name: "Move Notes up" }).click()

      await expect(questionRows(page).nth(0)).toContainText("Notes")
      await expect(questionRows(page).nth(1)).toContainText("How did it go?")
      await expect(questionRows(page).nth(0).getByText("1", { exact: true })).toBeVisible()

      await page.reload()
      await expect(surveySection(page)).toBeVisible()

      await expect(questionRows(page).nth(0)).toContainText("Notes")
      await expect(questionRows(page).nth(1)).toContainText("How did it go?")
      await expect
        .poll(async () => (await listQuestions(page, campaignId))?.map((question) => question.questionTitle))
        .toEqual(["Notes", "How did it go?"])
    } finally {
      await removeCampaignAndSurvey(campaignId)
    }
  })
})

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

test.describe("the survey builder — delete", () => {
  test.use({ storageState: storageStatePath("admin") })

  test("deletes a question with no responses", async ({ page }) => {
    const campaignId = await createDisposableCampaign(page.request, "Survey Delete")

    try {
      await createQuestionViaApi(page, campaignId, {
        questionTitle: "Notes",
        questionType: "TEXT",
        isRequired: false,
        options: [],
      })

      await gotoSurvey(page, campaignId)

      await questionRow(page, "Notes").getByRole("button", { name: "Delete" }).click()

      const dialog = page.getByRole("alertdialog")
      await expect(dialog).toBeVisible()
      await expect(dialog).toContainText("This question has no recorded answers")
      await dialog.getByRole("button", { name: "Delete question" }).click()

      await expect(surveySection(page).getByText("No questions yet", { exact: true })).toBeVisible()
      await expect(questionRows(page)).toHaveCount(0)

      // A 500 from the missing DELETE grant would leave the row in place; the
      // row and the API both being empty is what proves the write landed.
      await expect.poll(async () => (await listQuestions(page, campaignId))?.length ?? 0).toBe(0)
    } finally {
      await removeCampaignAndSurvey(campaignId)
    }
  })
})

// ---------------------------------------------------------------------------
// The refusal
// ---------------------------------------------------------------------------

test.describe("the campaign detail — a Volunteer", () => {
  test.use({ storageState: storageStatePath("volunteer") })

  test("is refused before the survey is read", async ({ page, playwright }) => {
    const adminApi: APIRequestContext = await playwright.request.newContext({
      baseURL: test.info().project.use.baseURL,
      storageState: storageStatePath("admin"),
    })
    let campaignId: string | null = null

    try {
      campaignId = await createDisposableCampaign(adminApi, "Volunteer Refusal")

      await page.goto(`/campaigns/${campaignId}/assign-contacts`)

      await expect(page).toHaveURL(/\/auth\/error\?code=staff-authorization-failed/)
      await expect(page.getByRole("region", { name: "Call-outcome survey" })).toHaveCount(0)
      await expect(page.getByRole("button", { name: "Add question" })).toHaveCount(0)
    } finally {
      if (campaignId) {
        await removeCampaignAndSurvey(campaignId)
      }

      await adminApi.dispose()
    }
  })
})
