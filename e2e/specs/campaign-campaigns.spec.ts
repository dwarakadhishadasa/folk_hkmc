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
async function createCampaignViaApi(page: Page, label: string): Promise<string> {
  const response = await page.request.post("/api/dialer/admin/campaigns", {
    data: {
      name: campaignName(label),
      description: "Created by the campaign lifecycle spec.",
      campaignDate: "2026-11-14",
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

async function transitionViaApi(page: Page, campaignId: string, action: "start" | "complete" | "cancel"): Promise<void> {
  const response = await page.request.post(`/api/dialer/admin/campaigns/${campaignId}/transition`, {
    data: { action },
  })

  expect(response.status()).toBe(200)
}

/** The lifecycle buttons a status may offer, by accessible name. */
const LIFECYCLE_LABELS = ["Start campaign", "Complete", "Cancel"] as const

async function expectNoLifecycleAction(page: Page): Promise<void> {
  for (const label of LIFECYCLE_LABELS) {
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

    const createCampaign = page.getByRole("link", { name: "Create campaign" })
    await expect(createCampaign).toBeVisible()
    await expect(createCampaign).toHaveAttribute("href", "/campaigns/new")
  })
})

// ---------------------------------------------------------------------------
// The create form
// ---------------------------------------------------------------------------

test.describe("the new-campaign form — an Admin", () => {
  test.use({ storageState: storageStatePath("admin") })

  test("creates a campaign in DRAFT and lands on its detail page", async ({ page }) => {
    const name = campaignName("Weekend Camp")
    let campaignId: string | null = null

    try {
      await page.goto("/campaigns/new")

      await expect(page.getByRole("heading", { name: "New campaign", level: 1 })).toBeVisible()
      await expect(page.getByRole("link", { name: "Back to campaigns" })).toHaveAttribute("href", "/campaigns")

      await page.getByLabel("Campaign name").fill(name)
      await page.getByLabel("Description").fill("Created by the campaign lifecycle spec.")
      await page.getByLabel("Campaign end date").fill("2026-11-14")

      // Frame 212 draws three fields and one Next. Time, gap duration and max
      // attempts are not on it, so they are not on this form either: the
      // service's own defaults stand.
      await expect(page.getByLabel("Time")).toHaveCount(0)
      await expect(page.getByLabel("Gap duration (seconds)")).toHaveCount(0)
      await expect(page.getByLabel("Max attempts")).toHaveCount(0)

      await page.getByRole("button", { name: "Next", exact: true }).click()

      // Frame 212's prototype sends Next to frame 324, so the campaign is
      // created and then handed to the assign-contacts screen.
      await expect(page).toHaveURL(/\/campaigns\/[0-9a-f-]{36}\/assign-contacts$/)
      campaignId = new URL(page.url()).pathname.split("/").filter(Boolean)[1] ?? null

      await expect(page.getByRole("heading", { level: 1, name: "Assign contacts" })).toBeVisible()

      await page.goto(`/campaigns/${campaignId}`)
      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible()
      await expect(page.getByText("DRAFT", { exact: true })).toBeVisible()
      await expect(page.getByRole("button", { name: "Start campaign", exact: true })).toHaveCount(1)
      await expect(page.getByRole("button", { name: "Complete", exact: true })).toHaveCount(0)
      await expect(page.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(0)
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

      const detailLink = row.getByRole("link", { name })
      await expect(detailLink).toHaveAttribute("href", `/campaigns/${campaignId}/edit`)

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
      await expect(page).toHaveURL(new RegExp(`/campaigns/${campaignId}/edit$`))
      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible()
      await expect(page.getByText("DRAFT", { exact: true })).toBeVisible()
    } finally {
      await deleteCampaign(campaignId)
    }
  })
})

// ---------------------------------------------------------------------------
// The edit page
// ---------------------------------------------------------------------------

test.describe("the campaign edit page — an Admin", () => {
  test.use({ storageState: storageStatePath("admin") })

  test("saves the details and offers Reassign contacts instead of a start", async ({ page }) => {
    const campaignId = await createCampaignViaApi(page, "Editable Camp")
    const renamed = campaignName("Renamed Camp")

    try {
      await page.goto(`/campaigns/${campaignId}/edit`)

      await expect(page.getByRole("heading", { level: 1, name: campaignName("Editable Camp") })).toBeVisible()

      // The detail page's two actions are replaced, not duplicated.
      await expect(page.getByRole("link", { name: "Reassign contacts", exact: true })).toHaveAttribute(
        "href",
        `/campaigns/${campaignId}/assign-contacts`,
      )
      await expect(page.getByRole("button", { name: "Start campaign", exact: true })).toHaveCount(0)

      await page.getByLabel("Campaign name").fill(renamed)
      await page.getByLabel("Description").fill("Edited by the campaign lifecycle spec.")
      await page.getByLabel("Campaign end date").fill("2026-12-01")
      await page.getByRole("button", { name: "Save", exact: true }).click()

      await expect(page.getByText("Campaign saved.", { exact: true })).toBeVisible()

      const read = await page.request.get(`/api/dialer/admin/campaigns/${campaignId}`)
      expect(read.status(), await read.text()).toBe(200)

      const { campaign } = (await read.json()) as {
        campaign: { name: string; description: string | null; campaign_date: string }
      }

      expect(campaign.name).toBe(renamed)
      expect(campaign.description).toBe("Edited by the campaign lifecycle spec.")
      expect(campaign.campaign_date).toBe("2026-12-01")

      // The survey stays editable here: a question is written by its own route,
      // not by the page-wide Save.
      await expect(page.getByRole("button", { name: "Add question", exact: true })).toBeVisible()
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

  test("starts a DRAFT campaign and offers Complete and Cancel", async ({ page }) => {
    const name = campaignName("Started Camp")
    const campaignId = await createCampaignViaApi(page, "Started Camp")

    try {
      await page.goto(`/campaigns/${campaignId}`)

      await expect(page.getByText("DRAFT", { exact: true })).toBeVisible()

      await page.getByRole("button", { name: "Start campaign", exact: true }).click()

      const dialog = page.getByRole("alertdialog")
      await expect(dialog).toBeVisible()
      await dialog.getByRole("button", { name: "Start campaign", exact: true }).click()

      await expect(page.getByText("ACTIVE", { exact: true })).toBeVisible()
      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible()
      await expect(page.getByRole("button", { name: "Start campaign", exact: true })).toHaveCount(0)
      await expect(page.getByRole("button", { name: "Complete", exact: true })).toHaveCount(1)
      await expect(page.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(1)
    } finally {
      await deleteCampaign(campaignId)
    }
  })

  test("completes an ACTIVE campaign and offers no further action", async ({ page }) => {
    const name = campaignName("Completed Camp")
    const campaignId = await createCampaignViaApi(page, "Completed Camp")
    await transitionViaApi(page, campaignId, "start")

    try {
      await page.goto(`/campaigns/${campaignId}`)

      await expect(page.getByText("ACTIVE", { exact: true })).toBeVisible()

      await page.getByRole("button", { name: "Complete", exact: true }).click()

      const dialog = page.getByRole("alertdialog")
      await expect(dialog).toBeVisible()
      await dialog.getByRole("button", { name: "Complete campaign", exact: true }).click()

      await expect(page.getByText("COMPLETED", { exact: true })).toBeVisible()
      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible()
      await expectNoLifecycleAction(page)
    } finally {
      await deleteCampaign(campaignId)
    }
  })

  test("cancels an ACTIVE campaign and offers no further action", async ({ page }) => {
    const name = campaignName("Cancelled Camp")
    const campaignId = await createCampaignViaApi(page, "Cancelled Camp")
    await transitionViaApi(page, campaignId, "start")

    try {
      await page.goto(`/campaigns/${campaignId}`)

      await expect(page.getByText("ACTIVE", { exact: true })).toBeVisible()

      // Cancel is terminal, so it asks before it writes.
      await page.getByRole("button", { name: "Cancel", exact: true }).click()

      const dialog = page.getByRole("alertdialog")
      await expect(dialog).toBeVisible()
      await dialog.getByRole("button", { name: "Cancel campaign", exact: true }).click()

      await expect(page.getByText("CANCELLED", { exact: true })).toBeVisible()
      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible()
      await expectNoLifecycleAction(page)
    } finally {
      await deleteCampaign(campaignId)
    }
  })

  test("shows the server's 409 message and keeps the rendered status", async ({ page }) => {
    const name = campaignName("Stale Camp")
    const campaignId = await createCampaignViaApi(page, "Stale Camp")

    try {
      await page.goto(`/campaigns/${campaignId}`)
      await expect(page.getByText("DRAFT", { exact: true })).toBeVisible()

      // Move the row behind the rendered page's back: the page still offers
      // Start against the DRAFT it read, so the transition is now a lost race.
      await transitionViaApi(page, campaignId, "start")

      await page.getByRole("button", { name: "Start campaign", exact: true }).click()
      await page.getByRole("alertdialog").getByRole("button", { name: "Start campaign", exact: true }).click()

      // Next's route announcer is also a `role="alert"` node, so the assertion
      // filters to the message the page rendered.
      const refusal = page.getByRole("alert").filter({ hasText: "The campaign is ACTIVE and cannot be started." })
      await expect(refusal).toHaveText("The campaign is ACTIVE and cannot be started.")
      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible()
      // The status the page renders comes from the server and is not refreshed
      // after a refusal, so the stale DRAFT stays until the next load.
      await expect(page.getByText("DRAFT", { exact: true })).toBeVisible()
      await expect(page.getByRole("button", { name: "Start campaign", exact: true })).toHaveCount(1)
      await expect(page.getByText("ACTIVE", { exact: true })).toHaveCount(0)
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
    const response = await page.goto(`/campaigns/${ABSENT_CAMPAIGN_ID}`)

    expect(response?.status()).toBe(404)
    await expect(page.getByText("This page could not be found.")).toBeVisible()
    await expect(page.getByText("DRAFT", { exact: true })).toHaveCount(0)
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
    await page.goto(`/campaigns/${ABSENT_CAMPAIGN_ID}`)

    await expect(page).toHaveURL(/\/auth\/error\?code=staff-authorization-failed/)
    await expect(page.getByRole("heading", { name: "New campaign", level: 1 })).toHaveCount(0)
    await expectNoLifecycleAction(page)
  })
})
