/**
 * Story 1.4 — the campaign list, the create form and the lifecycle.
 *
 * The list is data-driven now, so the "Create campaign" empty state is a
 * **precondition** rather than a default: this spec establishes it by deleting
 * the program's campaigns, then proves create, list and the four transitions
 * against rows it creates itself and removes again.
 *
 * `dialer_campaigns` rows are only ever created by tests — the seed has none —
 * and AD-12 grants no `DELETE` to any role, so the local stack's SQL endpoint is
 * the only cleanup path. The credential is read from the app's env file at
 * runtime and the target is asserted loopback, because a fixture written
 * against the hosted project would leave a campaign there while the assertions
 * ran green against the local stack.
 */

import { expect, test, type Page } from "@playwright/test"

import { isLocalSupabaseUrl } from "../../scripts/local-supabase-target.mjs"
import { readEnvValue } from "../fixtures/auth-users"
import { e2eProgramId, storageStatePath } from "../fixtures/roles"

/** The UUID shape, checked before an id is interpolated into SQL. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A valid UUID that is impossible to seed, for the read and refusal paths. */
const ABSENT_CAMPAIGN_ID = "00000000-0000-4000-8000-000000000000"

/**
 * Names carry this run's stamp, so a row this run created is distinguishable
 * from a leftover and the assertions never match another run's campaign.
 */
const RUN_PREFIX = `e2e-campaign-${Date.now().toString(36)}`

function campaignName(label: string): string {
  return `${RUN_PREFIX} ${label}`
}

/**
 * The local service-role target, or a throw naming the fix.
 *
 * Fail-closed on both counts: a missing credential and a non-loopback URL both
 * throw. A missing key would otherwise skip the cleanup, and a non-loopback URL
 * would write the fixture to the hosted project while the assertions ran
 * against the local stack.
 */
function resolveLocalServiceRole(): { url: string; serviceRoleKey: string } {
  const serviceRoleKey = readEnvValue("SUPABASE_SERVICE_ROLE_KEY")
  const supabaseUrl = readEnvValue("SUPABASE_URL") ?? readEnvValue("NEXT_PUBLIC_SUPABASE_URL")

  if (!serviceRoleKey || !supabaseUrl) {
    throw new Error(
      "Cannot clean up dialer campaigns: SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL are missing. " +
        "Run `pnpm supabase:env` to write the local credentials into apps/folk/.env.local, or export them.",
    )
  }

  if (!isLocalSupabaseUrl(supabaseUrl)) {
    throw new Error(
      `Refusing to delete dialer campaigns at "${supabaseUrl}": it is not a loopback address, so the ` +
        "cleanup would run against the hosted database instead of the local stack.",
    )
  }

  return { url: supabaseUrl, serviceRoleKey }
}

/**
 * Run one statement through the local stack's SQL endpoint.
 *
 * `service_role` holds SELECT, INSERT and UPDATE on `dialer_campaigns` and no
 * DELETE — the migration grants it exactly three privileges — so a row this
 * spec creates cannot be removed through PostgREST. The SQL endpoint runs as
 * the table owner, which is the one path that can; it is reachable only because
 * the target is asserted loopback above.
 */
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
    throw new Error(`The dialer campaign cleanup failed: ${response.status} ${response.statusText}`)
  }
}

async function deleteCampaign(id: string): Promise<void> {
  if (!UUID_PATTERN.test(id)) {
    throw new Error(`Refusing to delete a dialer campaign with a non-UUID id: ${id}`)
  }

  await runLocalSql(
    `DELETE FROM public.dialer_survey_responses WHERE call_log_id IN (
       SELECT id FROM public.dialer_call_logs WHERE assignment_id IN (
         SELECT id FROM public.dialer_assignments WHERE campaign_id = '${id}'
       )
     );
     DELETE FROM public.dialer_call_logs WHERE assignment_id IN (
       SELECT id FROM public.dialer_assignments WHERE campaign_id = '${id}'
     );
     DELETE FROM public.dialer_assignments WHERE campaign_id = '${id}';
     DELETE FROM public.dialer_survey_options WHERE question_id IN (
       SELECT id FROM public.dialer_survey_questions WHERE campaign_id = '${id}'
     );
     DELETE FROM public.dialer_survey_questions WHERE campaign_id = '${id}';
     DELETE FROM public.dialer_campaigns WHERE id = '${id}'`,
  )
}

/**
 * Every campaign in the e2e program, deleted.
 *
 * This is what makes the empty state a real precondition. Epic 2 put
 * assignments, call logs and survey responses behind a campaign, and every one
 * of those foreign keys is `ON DELETE RESTRICT` or `ON DELETE CASCADE`; the
 * delete therefore removes the dependants first, in dependency order, rather
 * than relying on the campaign row alone succeeding. The condition stays
 * unconditional: the spec wants a genuinely empty program, not a filtered one.
 */
async function deleteCampaignsForProgram(): Promise<void> {
  const program = e2eProgramId().replace(/'/g, "''")
  await runLocalSql(
    `DELETE FROM public.dialer_survey_responses WHERE call_log_id IN (
       SELECT id FROM public.dialer_call_logs WHERE assignment_id IN (
         SELECT id FROM public.dialer_assignments WHERE campaign_id IN (
           SELECT id FROM public.dialer_campaigns WHERE program_id = '${program}'
         )
       )
     );
     DELETE FROM public.dialer_call_logs WHERE assignment_id IN (
       SELECT id FROM public.dialer_assignments WHERE campaign_id IN (
         SELECT id FROM public.dialer_campaigns WHERE program_id = '${program}'
       )
     );
     DELETE FROM public.dialer_assignments WHERE campaign_id IN (
       SELECT id FROM public.dialer_campaigns WHERE program_id = '${program}'
     );
     DELETE FROM public.dialer_survey_options WHERE question_id IN (
       SELECT id FROM public.dialer_survey_questions WHERE campaign_id IN (
         SELECT id FROM public.dialer_campaigns WHERE program_id = '${program}'
       )
     );
     DELETE FROM public.dialer_survey_questions WHERE campaign_id IN (
       SELECT id FROM public.dialer_campaigns WHERE program_id = '${program}'
     );
     DELETE FROM public.dialer_campaigns WHERE program_id = '${program}'`,
  )
}

/** A campaign created through the route the form uses, for a focused test. */
async function createCampaignOn(page: Page, name: string, campaignDate: string): Promise<string> {
  const response = await page.request.post("/api/dialer/admin/campaigns", {
    data: {
      name,
      description: "Created by the campaign lifecycle spec.",
      campaignDate,
      campaignTime: "18:30",
      gapDuration: 20,
      maxAttempts: 3,
    },
  })

  expect(response.status()).toBe(201)

  const body = (await response.json()) as { campaign?: { id?: string } }
  const id = body.campaign?.id

  if (!id) {
    throw new Error("The create route answered 201 without a campaign id.")
  }

  return id
}

async function createCampaignViaApi(page: Page, label: string): Promise<string> {
  return createCampaignOn(page, campaignName(label), "2026-11-14")
}

/** The programme day in IST, offset by whole days, as `YYYY-MM-DD`. */
function istDay(offset: number): string {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
  const [year, month, day] = today.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10)
}

async function transitionViaApi(page: Page, campaignId: string, action: "start" | "complete" | "cancel"): Promise<void> {
  const response = await page.request.post(`/api/dialer/admin/campaigns/${campaignId}/transition`, {
    data: { action },
  })

  expect(response.status()).toBe(200)
}

/** Every lifecycle control a campaign screen may still render. */
const LIFECYCLE_LABELS = ["Start campaign", "Complete", "Cancel"] as const

async function expectNoLifecycleAction(
  page: Page,
  labels: readonly string[] = LIFECYCLE_LABELS,
): Promise<void> {
  for (const label of labels) {
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveCount(0)
  }
}

/**
 * A last-resort sweep after the file's tests. Each test already deletes its own
 * row in a `finally`; this covers the case where a test never reached it.
 */
test.afterAll(async () => {
  await deleteCampaignsForProgram()
})

// ---------------------------------------------------------------------------
// The empty state, with the precondition controlled
// ---------------------------------------------------------------------------

test.describe("the campaign list — an Admin with no campaigns", () => {
  test.use({ storageState: storageStatePath("admin") })

  test("shows the Create campaign empty state", async ({ page }) => {
    await deleteCampaignsForProgram()

    await page.goto("/campaigns")

    await expect(page).toHaveURL(/\/campaigns$/)
    await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible()
    await expect(page.getByText("No campaigns yet", { exact: true })).toBeVisible()
    await expect(page.getByRole("table")).toHaveCount(0)

    const createCampaign = page.getByRole("button", { name: "Create campaign" })
    await expect(createCampaign).toBeVisible()
    await createCampaign.click()

    // There is no pre-id screen: the action writes a draft and opens its
    // workspace with every pane already present.
    await expect(page).toHaveURL(/\/campaigns\/[0-9a-f-]{36}\/assign-contacts$/)
    const campaignId = new URL(page.url()).pathname.split("/").filter(Boolean)[1] ?? null

    try {
      await expect(page.getByLabel("Campaign name")).toHaveValue("Untitled campaign")
      await expect(page.getByRole("region", { name: "Call-outcome survey" })).toBeVisible()
      await expect(page.getByRole("region", { name: "Assign to" })).toBeVisible()
      await expect(page.getByRole("region", { name: "Contacts in scope" })).toBeVisible()
    } finally {
      if (campaignId) {
        await deleteCampaign(campaignId)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Creating from the New campaign action
// ---------------------------------------------------------------------------

test.describe("the new-campaign action — an Admin", () => {
  test.use({ storageState: storageStatePath("admin") })

  test("creates a DRAFT and opens the full workspace", async ({ page }) => {
    const name = campaignName("Weekend Camp")
    let campaignId: string | null = null

    try {
      await page.goto("/campaigns")
      await page.getByRole("button", { name: "New campaign" }).click()

      await expect(page).toHaveURL(/\/campaigns\/[0-9a-f-]{36}\/assign-contacts$/)
      campaignId = new URL(page.url()).pathname.split("/").filter(Boolean)[1] ?? null

      // The draft opens on the full workspace. No Create action exists, and the
      // assign-to pane and grid are present before any field is edited.
      const detailsName = page.getByLabel("Campaign name")
      await expect(detailsName).toHaveValue("Untitled campaign")
      await expect(page.getByText("Ends", { exact: true })).toBeVisible()
      await expect(page.getByRole("region", { name: "Call-outcome survey" })).toBeVisible()
      await expect(page.getByRole("region", { name: "Assign to" })).toBeVisible()
      await expect(page.getByRole("region", { name: "Contacts in scope" })).toBeVisible()

      // The two-pane order is the requirement: the caller pane is left of the
      // grid, under the details card.
      const assignBox = await page.getByRole("complementary", { name: "Assignment" }).boundingBox()
      const gridBox = await page.getByRole("region", { name: "Contacts in scope" }).boundingBox()
      const nameBox = await page.getByLabel("Campaign name").boundingBox()
      expect(assignBox && gridBox && nameBox, "both assignment panes must render").toBeTruthy()
      if (assignBox && gridBox && nameBox) {
        expect(assignBox.x).toBeLessThan(gridBox.x)
        expect(assignBox.y).toBeGreaterThan(nameBox.y)
      }

      // The details card is a property sheet, not a second form: the name and
      // description save on blur and the date as soon as a day is picked.
      await detailsName.fill(name)
      await detailsName.blur()
      await page.getByLabel("Description").fill("Weekend calling drive")
      await page.getByLabel("Description").blur()

      // The draft starts 30 days out, so the calendar opens in December.
      await page.getByRole("button", { name: /Campaign end date/ }).click()
      await page.locator('button[data-day="12/10/2026"]').click()

      // The survey is the live builder now: the question writes against the
      // campaign id that already exists.
      await page.getByRole("button", { name: "Add question" }).click()
      await page.getByLabel("Question title").fill("Reached?")
      await page.getByRole("button", { name: "Save question" }).click()
      await expect(page.getByRole("list", { name: "Survey questions" })).toContainText("Reached?")

      await expect
        .poll(async () => {
          const read = await page.request.get(`/api/dialer/admin/campaigns/${campaignId}`)
          if (!read.ok()) {
            return null
          }

          const body = (await read.json()) as {
            campaign: { name: string; description: string | null; campaign_date: string }
          }
          return `${body.campaign.name}|${body.campaign.description}|${body.campaign.campaign_date}`
        })
        .toBe(`${name}|Weekend calling drive|2026-12-10`)

      // The list's Open action is the campaign's only entry point: the campaign
      // detail and edit pages are gone, and the workspace is where a campaign
      // is worked.
      await page.goto("/campaigns")

      const row = page.getByRole("row").filter({ hasText: name })
      await expect(row.getByText("DRAFT", { exact: true })).toBeVisible()
      await row.getByRole("link", { name: `Open ${name}` }).click()
      await expect(page).toHaveURL(new RegExp(`/campaigns/${campaignId}/assign-contacts$`))
    } finally {
      if (campaignId) {
        await deleteCampaign(campaignId)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// The list, with data
// ---------------------------------------------------------------------------

test.describe("the campaign list — an Admin with a campaign", () => {
  test.use({ storageState: storageStatePath("admin") })

  test("lists the campaign with its status and links to the edit page", async ({ page }) => {
    const name = campaignName("Listed Camp")
    const campaignId = await createCampaignViaApi(page, "Listed Camp")

    try {
      await page.goto("/campaigns")

      const row = page.getByRole("row").filter({ hasText: name })
      await expect(row).toHaveCount(1)
      await expect(row.getByText("DRAFT", { exact: true })).toBeVisible()
      await expect(row.getByText("14 Nov 2026", { exact: true })).toBeVisible()

      const detailLink = row.getByRole("link", { name, exact: true })
      await expect(detailLink).toHaveAttribute("href", `/campaigns/${campaignId}/assign-contacts`)

      // The frame's four count columns are Story 1.9's `campaign_progress`
      // counts. This spec used to pin their absence, when the surface could not
      // compute one; it now pins their presence, and the row's own measured
      // zeroes on a campaign nothing is assigned into.
      for (const column of ["Assigned", "Reached", "Confirmed", "Never attempted"]) {
        await expect(page.getByRole("columnheader", { name: column, exact: true })).toBeVisible()
      }

      for (const column of ["Campaign", "End Date", "Status"]) {
        await expect(page.getByRole("columnheader", { name: column, exact: true })).toBeVisible()
      }

      await expect(
        row.getByRole("cell", { name: "0", exact: true }),
        "a campaign with no assignments measures zero in each count column",
      ).toHaveCount(4)

      await expect(page.getByText("1 campaign · 1 draft · 0 cancelled", { exact: true })).toBeVisible()

      await detailLink.click()
      await expect(page).toHaveURL(new RegExp(`/campaigns/${campaignId}/assign-contacts$`))
      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible()
      await expect(page.getByText("DRAFT", { exact: true })).toBeVisible()
    } finally {
      await deleteCampaign(campaignId)
    }
  })
})

// ---------------------------------------------------------------------------
// The lifecycle transitions
// ---------------------------------------------------------------------------

test.describe("the campaign lifecycle — an Admin", () => {
  test.use({ storageState: storageStatePath("admin") })

  test("keeps a campaign ACTIVE through its end date in IST", async ({ page }) => {
    const todayName = campaignName("IST Ends Today")
    const yesterdayName = campaignName("IST Ended Yesterday")
    const todayId = await createCampaignOn(page, todayName, istDay(0))
    const yesterdayId = await createCampaignOn(page, yesterdayName, istDay(-1))

    try {
      await transitionViaApi(page, todayId, "start")
      await transitionViaApi(page, yesterdayId, "start")

      // The overview's own read runs the expiry sweep before it lists: a
      // campaign ending today (IST) must still be ACTIVE; yesterday's must be
      // COMPLETED.
      await page.goto("/campaigns")

      await expect(
        page.getByRole("row").filter({ hasText: todayName }).getByText("ACTIVE", { exact: true }),
      ).toBeVisible()
      await expect(
        page.getByRole("row").filter({ hasText: yesterdayName }).getByText("COMPLETED", { exact: true }),
      ).toBeVisible()
    } finally {
      await deleteCampaign(todayId)
      await deleteCampaign(yesterdayId)
    }
  })

  test("starts a DRAFT campaign from the page head and returns to the Overview", async ({ page }) => {
    const campaignId = await createCampaignViaApi(page, "Started Camp")
    const draftRead = await page.request.get(`/api/dialer/admin/campaigns/${campaignId}`)
    expect(draftRead.status(), await draftRead.text()).toBe(200)
    const { campaign: draft } = (await draftRead.json()) as { campaign: { name: string } }

    try {
      await page.goto(`/campaigns/${campaignId}/assign-contacts`)

      // The survey is always open now, and Start is the page head's action.
      await expect(page.getByRole("region", { name: "Call-outcome survey" })).toBeVisible()
      await expect(page.getByRole("button", { name: "Start campaign", exact: true })).toHaveCount(1)

      await page.getByRole("button", { name: "Start campaign", exact: true }).click()

      // Starting is the head's own write, with no confirm dialog; success
      // returns to the Overview, where the campaign is now ACTIVE.
      await expect(page).toHaveURL(/\/campaigns$/)
      await expect(
        page.getByRole("row").filter({ hasText: draft.name }).getByText("ACTIVE", { exact: true }),
      ).toBeVisible()

      const read = await page.request.get(`/api/dialer/admin/campaigns/${campaignId}`)
      expect(read.status(), await read.text()).toBe(200)
      const { campaign } = (await read.json()) as { campaign: { status: string } }
      expect(campaign.status).toBe("ACTIVE")
    } finally {
      await deleteCampaign(campaignId)
    }
  })

  test("offers no Start once the campaign is active", async ({ page }) => {
    const campaignId = await createCampaignViaApi(page, "Active Camp")
    await transitionViaApi(page, campaignId, "start")

    try {
      await page.goto(`/campaigns/${campaignId}/assign-contacts`)

      await expect(page.getByText("ACTIVE", { exact: true })).toBeVisible()
      await expect(page.getByRole("button", { name: "Start campaign", exact: true })).toHaveCount(0)

      // Complete and Cancel left the UI with the campaign detail page: a
      // campaign closes when its end date arrives, not when someone clicks.
      await expectNoLifecycleAction(page, ["Complete", "Cancel"])
    } finally {
      await deleteCampaign(campaignId)
    }
  })

  test("shows the server's 409 message when the campaign moved first", async ({ page }) => {
    const campaignId = await createCampaignViaApi(page, "Stale Camp")

    try {
      await page.goto(`/campaigns/${campaignId}/assign-contacts`)
      await expect(page.getByRole("button", { name: "Start campaign", exact: true })).toHaveCount(1)

      // Move the row behind the rendered page's back: the head still offers
      // Start against the DRAFT it read, so the transition is a lost race.
      await transitionViaApi(page, campaignId, "start")

      await page.getByRole("button", { name: "Start campaign", exact: true }).click()

      // Next's route announcer is also a `role="alert"` node, so the assertion
      // filters to the message the page rendered.
      const refusal = page.getByRole("alert").filter({ hasText: "The campaign is ACTIVE and cannot be started." })
      await expect(refusal).toHaveText("The campaign is ACTIVE and cannot be started.")

      // The status the page renders comes from the server and is not refreshed
      // after a refusal, so the stale DRAFT stays until the next load.
      await expect(page.getByText("DRAFT", { exact: true })).toBeVisible()
      await expect(page.getByRole("button", { name: "Start campaign", exact: true })).toHaveCount(1)
    } finally {
      await deleteCampaign(campaignId)
    }
  })
})

// ---------------------------------------------------------------------------
// The 404 and the refusal
// ---------------------------------------------------------------------------

test.describe("the campaign detail — an Admin with an absent id", () => {
  test.use({ storageState: storageStatePath("admin") })

  test("lands on the not-found page, not a blank detail", async ({ page }) => {
    const response = await page.goto(`/campaigns/${ABSENT_CAMPAIGN_ID}/assign-contacts`)

    expect(response?.status()).toBe(404)
    await expect(page.getByText("This page could not be found.")).toBeVisible()
    await expectNoLifecycleAction(page)
  })
})

test.describe("the campaign surfaces — a Volunteer with no caller profile", () => {
  test.use({ storageState: storageStatePath("volunteer") })

  test("is refused at the create form and at a campaign detail", async ({ page }) => {
    await page.goto("/campaigns/new")

    await expect(page).toHaveURL(/\/auth\/error\?code=staff-authorization-failed/)
    await expect(page.getByRole("heading", { name: "New campaign", level: 1 })).toHaveCount(0)
    await expect(page.getByLabel("Campaign name")).toHaveCount(0)

    // The id is absent on purpose: AD-2's gate runs before the read, so a
    // Volunteer is refused without learning whether the campaign exists.
    await page.goto(`/campaigns/${ABSENT_CAMPAIGN_ID}/assign-contacts`)

    await expect(page).toHaveURL(/\/auth\/error\?code=staff-authorization-failed/)
    await expect(page.getByRole("heading", { name: "New campaign", level: 1 })).toHaveCount(0)
    await expectNoLifecycleAction(page)
  })
})
