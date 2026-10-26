/**
 * Story 1.7 — the assign-contacts selection surface.
 *
 * Frame 324 is desktop only (UX-DR9/UX-DR10), so this spec drives it at the
 * smoke project's desktop viewport and checks the narrow state with an explicit
 * override. Everything it asserts about paging, facets and the split is read
 * from the routes the surface itself calls: the seeded contact population is
 * another spec's fixture, so a hard-coded total or facet list would rot.
 *
 * The one fixture the seed does not provide is a `dialer_contact_profiles` row:
 * the seed has none, so a whole-set facet could not be proved without one. The
 * row is created through the service role and removed in the same run through
 * the local stack's SQL endpoint — `service_role` holds no DELETE on the dialer
 * tables, and the endpoint is reached only after the target is asserted
 * loopback, so a fixture can never be cleaned up against the hosted project.
 *
 * Campaigns are created and removed through `e2e/fixtures/dialer-campaign.ts`,
 * whose delete is the same loopback-guarded SQL path.
 */

import { expect, test, type APIRequestContext, type Page } from "@playwright/test"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { isLocalSupabaseUrl } from "../../scripts/local-supabase-target.mjs"
import { readEnvValue } from "../fixtures/auth-users"
import { createDisposableCampaign, deleteDisposableCampaign } from "../fixtures/dialer-campaign"
import { e2eProgramId, storageStatePath } from "../fixtures/roles"

/** A valid UUID that is impossible to seed, for the refusal path. */
const ABSENT_CAMPAIGN_ID = "00000000-0000-4000-8000-000000000000"

/** The UUID shape, checked before an id is interpolated into SQL. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface AssignableContactRow {
  contactId: string
  name: string
  phone: string
  locationIds: string[]
  profile: { centre: string | null; level: string | null; gender: string | null; language: string | null }
}

interface AssignableContactPage {
  rows: AssignableContactRow[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  facets: { centre: string[]; level: string[]; gender: string[]; language: string[] }
}

function resolveLocalServiceRole(): { url: string; serviceRoleKey: string } {
  const serviceRoleKey = readEnvValue("SUPABASE_SERVICE_ROLE_KEY")
  const supabaseUrl = readEnvValue("SUPABASE_URL") ?? readEnvValue("NEXT_PUBLIC_SUPABASE_URL")

  if (!serviceRoleKey || !supabaseUrl) {
    throw new Error(
      "Cannot provision a contact profile: SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL are missing. " +
        "Run `pnpm supabase:env` to write the local credentials into apps/folk/.env.local, or export them.",
    )
  }

  if (!isLocalSupabaseUrl(supabaseUrl)) {
    throw new Error(
      `Refusing to touch contact profiles at "${supabaseUrl}": it is not a loopback address, so the ` +
        "fixture would be written to the hosted project while the assertions ran against the local stack.",
    )
  }

  return { url: supabaseUrl, serviceRoleKey }
}

let cachedClient: { url: string; client: SupabaseClient } | null = null

function serviceRoleClient(): SupabaseClient {
  const { url, serviceRoleKey } = resolveLocalServiceRole()

  if (cachedClient?.url === url) {
    return cachedClient.client
  }

  const client = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  cachedClient = { url, client }
  return client
}

/** One statement through the local stack's SQL endpoint, as the table owner. */
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
    throw new Error(`The contact-profile cleanup failed: ${response.status} ${response.statusText}`)
  }
}

/** The programme's contacts that already own a profile row, so a fixture never overwrites one. */
async function readProfiledContactIds(): Promise<Set<string>> {
  const { data, error } = await serviceRoleClient()
    .from("dialer_contact_profiles")
    .select("contact_id")
    .eq("program_id", e2eProgramId())

  if (error) {
    throw new Error(`Reading the contact profiles for "${e2eProgramId()}" failed: ${error.message}`)
  }

  return new Set(((data ?? []) as Array<{ contact_id: string }>).map((row) => row.contact_id))
}

async function insertContactProfile(contactId: string, centre: string): Promise<void> {
  const { error } = await serviceRoleClient()
    .from("dialer_contact_profiles")
    .insert({ contact_id: contactId, program_id: e2eProgramId(), centre })

  if (error) {
    throw new Error(`Creating the contact profile for ${contactId} failed: ${error.message}`)
  }
}

async function deleteContactProfile(contactId: string): Promise<void> {
  if (!UUID_PATTERN.test(contactId)) {
    throw new Error(`Refusing to delete a contact profile with a non-UUID contact id: ${contactId}`)
  }

  await runLocalSql(`DELETE FROM public.dialer_contact_profiles WHERE contact_id = '${contactId}'`)
}

/** One page of the surface's own contacts route, read for the expected values. */
async function readContactPage(
  request: APIRequestContext,
  campaignId: string,
  params: { page?: number; pageSize?: number; search?: string } = {},
): Promise<AssignableContactPage> {
  const query = new URLSearchParams()

  if (params.page !== undefined) {
    query.set("page", String(params.page))
  }

  if (params.pageSize !== undefined) {
    query.set("pageSize", String(params.pageSize))
  }

  if (params.search !== undefined) {
    query.set("search", params.search)
  }

  const response = await request.get(`/api/dialer/admin/campaigns/${campaignId}/contacts?${query.toString()}`)

  expect(response.status(), await response.text()).toBe(200)

  return (await response.json()) as AssignableContactPage
}

async function transitionViaApi(page: Page, campaignId: string, action: "start" | "complete"): Promise<void> {
  const response = await page.request.post(`/api/dialer/admin/campaigns/${campaignId}/transition`, {
    data: { action },
  })

  expect(response.status(), `the campaign could not ${action}: ${await response.text()}`).toBe(200)
}

/** The contact row for one phone number; phones are unique per programme. */
function contactRow(page: Page, phone: string) {
  return page.getByRole("row").filter({ has: page.getByRole("cell", { name: phone, exact: true }) })
}

/** The caller panel, scoped so a caller name that is also a contact name cannot collide. */
function pickerSection(page: Page) {
  return page.getByRole("region", { name: "Assign to" })
}

/** One caller's row inside the picker. */
function pickerRow(page: Page, name: string) {
  return pickerSection(page)
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name, exact: true }) })
}

function selectedLine(count: number, total: number): string {
  return `${count} of ${total} selected`
}

function showingLine(first: number, last: number, total: number): string {
  return `Showing ${first}–${last} of ${total}`
}

// ---------------------------------------------------------------------------
// Paging
// ---------------------------------------------------------------------------

test.describe("the assign-contacts surface — an Admin", () => {
  test.use({ storageState: storageStatePath("admin") })

  test("pages the scoped contact set and reports the range it is showing", async ({ page }) => {
    const campaignId = await createDisposableCampaign(page.request, "assign select page")

    try {
      const firstPage = await readContactPage(page.request, campaignId)
      expect(firstPage.total, "the seeded programme must need more than one page").toBeGreaterThan(25)
      expect(firstPage.rows).toHaveLength(25)

      const secondPage = await readContactPage(page.request, campaignId, { page: 2 })

      await page.goto(`/campaigns/${campaignId}/assign-contacts`)

      await expect(page.getByRole("heading", { name: "Assign contacts", level: 1 })).toBeVisible()
      await expect(page.getByText(showingLine(1, 25, firstPage.total), { exact: true })).toBeVisible()
      await expect(contactRow(page, firstPage.rows[0].phone)).toHaveCount(1)

      const previous = page.getByRole("button", { name: "Previous", exact: true })
      const next = page.getByRole("button", { name: "Next", exact: true })

      await expect(previous).toBeDisabled()

      await next.click()

      await expect(page.getByText(showingLine(26, 50, firstPage.total), { exact: true })).toBeVisible()
      await expect(contactRow(page, secondPage.rows[0].phone)).toHaveCount(1)
      await expect(contactRow(page, firstPage.rows[0].phone)).toHaveCount(0)
      await expect(previous).toBeEnabled()

      await previous.click()

      await expect(page.getByText(showingLine(1, 25, firstPage.total), { exact: true })).toBeVisible()
      await expect(contactRow(page, firstPage.rows[0].phone)).toHaveCount(1)
    } finally {
      await deleteDisposableCampaign(campaignId)
    }
  })

  // -------------------------------------------------------------------------
  // Selection across pages
  // -------------------------------------------------------------------------

  test("keeps a selection that spans pages and names the hidden count", async ({ page }) => {
    const campaignId = await createDisposableCampaign(page.request, "assign select pages")

    try {
      const firstPage = await readContactPage(page.request, campaignId)
      const secondPage = await readContactPage(page.request, campaignId, { page: 2 })
      const first = firstPage.rows[0]
      const second = secondPage.rows[0]
      const total = firstPage.total

      await page.goto(`/campaigns/${campaignId}/assign-contacts`)
      await expect(page.getByText(showingLine(1, 25, total), { exact: true })).toBeVisible()

      await contactRow(page, first.phone).getByRole("checkbox").click()
      await expect(page.getByText(selectedLine(1, total), { exact: true })).toBeVisible()
      await expect(page.getByText(/hidden selected/)).toHaveCount(0)

      await page.getByRole("button", { name: "Next", exact: true }).click()
      await expect(page.getByText(showingLine(26, 50, total), { exact: true })).toBeVisible()

      await contactRow(page, second.phone).getByRole("checkbox").click()
      await expect(page.getByText(selectedLine(2, total), { exact: true })).toBeVisible()
      await expect(page.getByText("+ 1 hidden selected", { exact: true })).toBeVisible()

      await page.getByRole("button", { name: "Previous", exact: true }).click()
      await expect(page.getByText(showingLine(1, 25, total), { exact: true })).toBeVisible()

      await expect(contactRow(page, first.phone).getByRole("checkbox")).toBeChecked()
      await expect(contactRow(page, second.phone)).toHaveCount(0)
      await expect(page.getByText(selectedLine(2, total), { exact: true })).toBeVisible()
      await expect(page.getByText("+ 1 hidden selected", { exact: true })).toBeVisible()
    } finally {
      await deleteDisposableCampaign(campaignId)
    }
  })

  // -------------------------------------------------------------------------
  // Whole-set facets
  // -------------------------------------------------------------------------

  test("builds every facet's options from the whole set, not the current page", async ({ page }) => {
    const campaignId = await createDisposableCampaign(page.request, "assign select facets")
    const secondPage = await readContactPage(page.request, campaignId, { page: 2 })
    const profiled = await readProfiledContactIds()
    const target = secondPage.rows.find((row) => !profiled.has(row.contactId))

    if (!target) {
      throw new Error("No profile-less contact on page 2, so the whole-set facet could not be proved.")
    }

    const marker = `e2e-centre-${Date.now().toString(36)}`
    await insertContactProfile(target.contactId, marker)

    try {
      // The response's own facets are the expectation: the marker belongs to a
      // contact page 1 cannot show, so its presence there is the whole-set proof.
      const firstPage = await readContactPage(page.request, campaignId)
      expect(firstPage.facets.centre).toContain(marker)
      expect(firstPage.rows.some((row) => row.profile.centre === marker)).toBe(false)

      await page.goto(`/campaigns/${campaignId}/assign-contacts`)
      await expect(page.getByText(showingLine(1, 25, firstPage.total), { exact: true })).toBeVisible()

      // A contact without a profile row is fully callable: its four facet cells
      // read em dashes, never `null`. A located row keeps the count at four.
      const profileless = firstPage.rows.find(
        (row) => row.locationIds.length > 0 && row.profile.centre === null && row.profile.level === null,
      )

      if (!profileless) {
        throw new Error("No located, profile-less page-1 contact to assert the em-dash cells on.")
      }

      await expect(contactRow(page, profileless.phone).getByRole("cell", { name: "—", exact: true })).toHaveCount(4)

      for (const [label, options] of [
        ["Centre", firstPage.facets.centre],
        ["Level", firstPage.facets.level],
        ["Gender", firstPage.facets.gender],
        ["Language", firstPage.facets.language],
      ] as const) {
        const select = page.getByLabel(label, { exact: true })
        await expect(select.locator("option")).toHaveText([`Any ${label.toLowerCase()}`, ...options])
      }

      await page.getByLabel("Centre", { exact: true }).selectOption(marker)

      await expect(page.getByText(showingLine(1, 1, 1), { exact: true })).toBeVisible()
      await expect(contactRow(page, target.phone)).toHaveCount(1)
      await expect(contactRow(page, firstPage.rows[0].phone)).toHaveCount(0)
      // The filter did not shrink the options it was chosen from.
      await expect(page.getByLabel("Centre", { exact: true }).locator("option")).toHaveText([
        "Any centre",
        ...firstPage.facets.centre,
      ])
    } finally {
      await deleteContactProfile(target.contactId)
      await deleteDisposableCampaign(campaignId)
    }
  })

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  test("narrows the set when a seeded name is searched for", async ({ page }) => {
    const campaignId = await createDisposableCampaign(page.request, "assign select search")

    try {
      const firstPage = await readContactPage(page.request, campaignId)
      const needle = firstPage.rows[0].name
      const expected = await readContactPage(page.request, campaignId, { search: needle })
      const otherRow = firstPage.rows.find((row) => !row.name.includes(needle))

      expect(expected.total, "a whole seeded name must match at least one contact").toBeGreaterThan(0)

      if (!otherRow) {
        throw new Error("No page-1 row fails the search, so exclusion could not be proved.")
      }

      await page.goto(`/campaigns/${campaignId}/assign-contacts`)

      const search = page.getByLabel("Search contacts")
      await search.fill(needle)
      await search.press("Enter")

      await expect(
        page.getByText(showingLine(1, Math.min(25, expected.total), expected.total), { exact: true }),
      ).toBeVisible()

      for (const row of expected.rows) {
        await expect(contactRow(page, row.phone)).toHaveCount(1)
      }

      await expect(contactRow(page, otherRow.phone)).toHaveCount(0)
    } finally {
      await deleteDisposableCampaign(campaignId)
    }
  })

  // -------------------------------------------------------------------------
  // The caller picker and the route's split
  // -------------------------------------------------------------------------

  test("previews the weighted split the assignment route computes", async ({ page }) => {
    const campaignId = await createDisposableCampaign(page.request, "assign select preview")

    try {
      const firstPage = await readContactPage(page.request, campaignId)
      const callersResponse = await page.request.get("/api/dialer/admin/assignable-callers")
      expect(callersResponse.status(), await callersResponse.text()).toBe(200)

      const { callers } = (await callersResponse.json()) as { callers: Array<{ userId: string; name: string }> }
      expect(callers.length, "the assigner needs at least two callers to weight").toBeGreaterThanOrEqual(2)

      await page.goto(`/campaigns/${campaignId}/assign-contacts`)
      await expect(page.getByText(showingLine(1, 25, firstPage.total), { exact: true })).toBeVisible()

      for (const row of firstPage.rows.slice(0, 6)) {
        await contactRow(page, row.phone).getByRole("checkbox").click()
      }

      await expect(page.getByText(selectedLine(6, firstPage.total), { exact: true })).toBeVisible()

      await page.getByRole("combobox", { name: "Add caller", exact: true }).selectOption({ label: callers[0].name })
      await page.getByRole("button", { name: "Add caller", exact: true }).click()
      await page.getByRole("combobox", { name: "Add caller", exact: true }).selectOption({ label: callers[1].name })
      await page.getByRole("button", { name: "Add caller", exact: true }).click()

      await page.getByLabel(`Weight for ${callers[0].name}`, { exact: true }).fill("2")

      // 2:1 over 6 is 4 and 2 — the split the route returns, not a local tally.
      await expect(pickerRow(page, callers[0].name).getByRole("cell", { name: "4", exact: true })).toBeVisible()
      await expect(pickerRow(page, callers[1].name).getByRole("cell", { name: "2", exact: true })).toBeVisible()
      await expect(page.getByText("Preview: 6 contacts across 2 callers", { exact: true })).toBeVisible()
    } finally {
      await deleteDisposableCampaign(campaignId)
    }
  })

  // -------------------------------------------------------------------------
  // The zero-selection guard
  // -------------------------------------------------------------------------

  test("disables the primary action and issues no request at zero selection", async ({ page }) => {
    const campaignId = await createDisposableCampaign(page.request, "assign select zero")
    const dialerWrites: string[] = []

    page.on("request", (request) => {
      if (request.method() !== "GET" && request.url().includes("/api/dialer/")) {
        dialerWrites.push(`${request.method()} ${request.url()}`)
      }
    })

    try {
      await page.goto(`/campaigns/${campaignId}/assign-contacts`)

      const assign = page.getByRole("button", { name: "Assign 0 contacts", exact: true })
      await expect(assign).toBeDisabled()
      await expect(page.getByText("Select contacts to preview the split.", { exact: true })).toBeVisible()
      await expect(page.getByText(/^Preview: —$/)).toBeVisible()

      // A disabled button cannot be activated by a click; waiting for it to
      // become actionable is the assertion that it never does.
      await assign.click({ timeout: 1_000 }).catch(() => {})

      expect(dialerWrites, "a zero selection must not open a dialer write").toEqual([])
      await expect(page).toHaveURL(new RegExp(`/campaigns/${campaignId}/assign-contacts$`))
    } finally {
      await deleteDisposableCampaign(campaignId)
    }
  })
})

// ---------------------------------------------------------------------------
// The campaign detail's entry point
// ---------------------------------------------------------------------------

test.describe("the campaign detail — an Admin", () => {
  test.use({ storageState: storageStatePath("admin") })

  test("offers Assign contacts only while the campaign can take assignments", async ({ page }) => {
    const campaignId = await createDisposableCampaign(page.request, "assign select entry")

    try {
      await page.goto(`/campaigns/${campaignId}`)

      const link = page.getByRole("link", { name: "Assign contacts", exact: true })
      await expect(link).toHaveAttribute("href", `/campaigns/${campaignId}/assign-contacts`)

      await link.click()
      await expect(page).toHaveURL(new RegExp(`/campaigns/${campaignId}/assign-contacts$`))
      await expect(page.getByRole("heading", { name: "Assign contacts", level: 1 })).toBeVisible()

      await transitionViaApi(page, campaignId, "start")
      await page.goto(`/campaigns/${campaignId}`)
      await expect(page.getByText("ACTIVE", { exact: true })).toBeVisible()
      await expect(page.getByRole("link", { name: "Assign contacts", exact: true })).toHaveCount(1)

      await transitionViaApi(page, campaignId, "complete")
      await page.reload()
      await expect(page.getByText("COMPLETED", { exact: true })).toBeVisible()
      await expect(page.getByRole("link", { name: "Assign contacts", exact: true })).toHaveCount(0)
    } finally {
      await deleteDisposableCampaign(campaignId)
    }
  })
})

// ---------------------------------------------------------------------------
// The desktop-only contract
// ---------------------------------------------------------------------------

test.describe("the assign-contacts surface — a narrow viewport", () => {
  test.use({ storageState: storageStatePath("admin"), viewport: { width: 390, height: 844 } })

  test("asks for a desktop and never mounts the contact grid", async ({ page }) => {
    const campaignId = await createDisposableCampaign(page.request, "assign select narrow")
    const contactReads: string[] = []

    page.on("request", (request) => {
      if (/\/contacts(\?|$)/.test(request.url())) {
        contactReads.push(request.url())
      }
    })

    try {
      await page.goto(`/campaigns/${campaignId}/assign-contacts`)

      await expect(page.getByRole("heading", { name: "Open this on a desktop", level: 2 })).toBeVisible()
      await expect(page.getByRole("table")).toHaveCount(0)
      await expect(page.getByRole("combobox", { name: "Add caller", exact: true })).toHaveCount(0)
      expect(contactReads, "the contact list must not be fetched on a narrow viewport").toEqual([])
    } finally {
      await deleteDisposableCampaign(campaignId)
    }
  })
})

// ---------------------------------------------------------------------------
// The refusal
// ---------------------------------------------------------------------------

test.describe("the assign-contacts page — a Volunteer", () => {
  test.use({ storageState: storageStatePath("volunteer") })

  test("is refused before the campaign is read", async ({ page }) => {
    // Absent id on purpose: AD-2's gate runs before the read, so a Volunteer is
    // refused without learning whether the campaign exists.
    await page.goto(`/campaigns/${ABSENT_CAMPAIGN_ID}/assign-contacts`)

    await expect(page).toHaveURL(/\/auth\/error\?code=staff-authorization-failed/)
    await expect(page.getByRole("heading", { name: "Assign contacts", level: 1 })).toHaveCount(0)
    await expect(page.getByRole("heading", { name: "Open this on a desktop", level: 2 })).toHaveCount(0)
    await expect(page.getByRole("table")).toHaveCount(0)
  })
})
