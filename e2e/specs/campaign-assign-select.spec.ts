/**
 * Story 1.7 — the assign-contacts selection surface.
 *
 * Frame 324 is desktop only (UX-DR9/UX-DR10), so this spec drives it at the
 * smoke project's desktop viewport and checks the narrow state with an explicit
 * override. The contact grid is the shared grid (frame 324's toolbar is that
 * component's), so this spec asserts the grid contract — whole-set toolbar,
 * whole-set footer, selection — rather than a bespoke paging control.
 *
 * The one fixture the seed does not provide is a `dialer_contact_profiles` row:
 * the seed has none, so the facet columns could not be proved without one. The
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
  notes: string | null
  assignedCallerName: string | null
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

/** The grid's own scroll surface, so the contact rows never collide with another table. */
function contactGrid(page: Page) {
  return page.getByRole("group", { name: "Contacts in scope" })
}

/** The contact row for one phone number; phones are unique per programme. */
function contactRow(page: Page, phone: string) {
  return contactGrid(page)
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: phone, exact: true }) })
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

/** Bring one contact into the grid's rendered window by searching its phone. */
async function showContact(page: Page, phone: string): Promise<void> {
  const search = page.getByLabel("Search every column")
  await search.fill(phone)
  await expect(contactRow(page, phone)).toHaveCount(1)
}

async function clearSearch(page: Page): Promise<void> {
  await page.getByLabel("Search every column").fill("")
}

// ---------------------------------------------------------------------------
// The grid
// ---------------------------------------------------------------------------

test.describe("the assign-contacts surface — an Admin", () => {
  test.use({ storageState: storageStatePath("admin") })

  test("draws frame 324's grid over the whole scoped contact set", async ({ page }) => {
    const campaignId = await createDisposableCampaign(page.request, "assign select grid")

    try {
      const firstPage = await readContactPage(page.request, campaignId)

      await page.goto(`/campaigns/${campaignId}/assign-contacts`)

      await expect(page.getByLabel("Campaign name")).toBeVisible()

      // The frame columns plus Initial Contact and Collected By, in display
      // order. A grid header's accessible name also carries its menu and resize
      // controls, so the label is matched on the cell's text.
      for (const label of [
        "Name",
        "Phone",
        "Initial Contact",
        "Location",
        "Assigned To",
        "Collected By",
        "Notes",
      ]) {
        await expect(page.getByRole("columnheader").filter({ hasText: label })).toBeVisible()
      }

      // The shared grid's toolbar, which is what the frame's toolbar is.
      await expect(page.getByLabel("Search every column")).toBeVisible()
      await expect(page.getByRole("button", { name: "Filter conditions", exact: true })).toBeVisible()
      await expect(page.getByRole("button", { name: "Sort", exact: true })).toBeVisible()
      await expect(page.getByRole("combobox", { name: "Row density" })).toContainText("Default rows")

      // One read for the whole set: the footer's denominator is the scope, and
      // there is no pager because everything is in the grid.
      await expect(page.getByText(selectedLine(0, firstPage.total), { exact: true })).toBeVisible()
      await expect(page.getByRole("button", { name: "Next", exact: true })).toHaveCount(0)
      await expect(page.getByRole("button", { name: "Previous", exact: true })).toHaveCount(0)
    } finally {
      await deleteDisposableCampaign(campaignId)
    }
  })

  test("narrows the grid with the toolbar search and keeps the whole-set denominator", async ({ page }) => {
    const campaignId = await createDisposableCampaign(page.request, "assign select search")

    try {
      const firstPage = await readContactPage(page.request, campaignId)
      const total = firstPage.total
      const target = firstPage.rows[0]

      await page.goto(`/campaigns/${campaignId}/assign-contacts`)
      await expect(page.getByText(selectedLine(0, total), { exact: true })).toBeVisible()

      await showContact(page, target.phone)

      await expect(contactRow(page, target.phone)).toHaveCount(1)
      await expect(page.getByText(selectedLine(0, total), { exact: true })).toBeVisible()

      await clearSearch(page)

      // The denominator is the scope, not the filtered view.
      await expect(page.getByText(selectedLine(0, total), { exact: true })).toBeVisible()
    } finally {
      await deleteDisposableCampaign(campaignId)
    }
  })

  test("keeps a selection that spans two searches", async ({ page }) => {
    const campaignId = await createDisposableCampaign(page.request, "assign select pages")

    try {
      const firstPage = await readContactPage(page.request, campaignId)
      const first = firstPage.rows[0]
      const secondPage = await readContactPage(page.request, campaignId, { page: 2 })
      const second = secondPage.rows[0]
      const total = firstPage.total

      await page.goto(`/campaigns/${campaignId}/assign-contacts`)
      await expect(page.getByText(selectedLine(0, total), { exact: true })).toBeVisible()

      await showContact(page, first.phone)
      await contactRow(page, first.phone).getByRole("checkbox").click()
      await expect(page.getByText(selectedLine(1, total), { exact: true })).toBeVisible()

      await showContact(page, second.phone)
      await contactRow(page, second.phone).getByRole("checkbox").click()
      await expect(page.getByText(selectedLine(2, total), { exact: true })).toBeVisible()

      await clearSearch(page)
      await expect(page.getByText(selectedLine(2, total), { exact: true })).toBeVisible()

      await showContact(page, first.phone)
      await expect(contactRow(page, first.phone).getByRole("checkbox")).toBeChecked()
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
      await expect(page.getByText(selectedLine(0, firstPage.total), { exact: true })).toBeVisible()

      for (const row of firstPage.rows.slice(0, 6)) {
        await showContact(page, row.phone)
        await contactRow(page, row.phone).getByRole("checkbox").click()
      }

      await expect(page.getByText(selectedLine(6, firstPage.total), { exact: true })).toBeVisible()

      await page.getByRole("button", { name: "Add caller", exact: true }).click()
      await page.getByRole("menuitem", { name: callers[0].name, exact: true }).click()

      await page.getByRole("button", { name: "Add caller", exact: true }).click()
      await page.getByRole("menuitem", { name: callers[1].name, exact: true }).click()

      await page.getByLabel(`Weight for ${callers[0].name}`, { exact: true }).fill("2")

      // 2:1 over 6 is 4 and 2 — the split the route returns, not a local tally.
      await expect(pickerRow(page, callers[0].name).getByRole("cell", { name: "4", exact: true })).toBeVisible()
      await expect(pickerRow(page, callers[1].name).getByRole("cell", { name: "2", exact: true })).toBeVisible()

      await expect(page.getByRole("button", { name: "Assign 6 contacts", exact: true })).toBeEnabled()
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

      const assign = page.getByRole("button", { name: "Select contacts to assign", exact: true })
      await expect(assign).toBeDisabled()

      // A disabled button cannot be activated by a click; waiting for it to
      // become actionable is the assertion that it never does.
      await assign.click({ timeout: 1_000 }).catch(() => {})

      expect(dialerWrites, "a zero selection must not open a dialer write").toEqual([])
      await expect(page).toHaveURL(new RegExp(`/campaigns/${campaignId}/assign-contacts$`))
    } finally {
      await deleteDisposableCampaign(campaignId)
    }
  })

  // -------------------------------------------------------------------------
  // The hidden facet columns
  // -------------------------------------------------------------------------

  test("carries the four calling facets as hidden grid columns", async ({ page }) => {
    const campaignId = await createDisposableCampaign(page.request, "assign select facets")
    const secondPage = await readContactPage(page.request, campaignId, { page: 2 })
    const profiled = await readProfiledContactIds()
    const target = secondPage.rows.find((row) => !profiled.has(row.contactId))

    if (!target) {
      throw new Error("No profile-less contact on page 2, so the facet column could not be proved.")
    }

    const marker = `e2e-centre-${Date.now().toString(36)}`
    await insertContactProfile(target.contactId, marker)

    try {
      await page.goto(`/campaigns/${campaignId}/assign-contacts`)

      // Four facets hidden by default: the frame's toolbar reports hidden
      // fields, and these are the fields its five columns do not show.
      await expect(page.getByRole("button", { name: "4 hidden fields", exact: true })).toBeVisible()

      await page.getByRole("button", { name: "4 hidden fields", exact: true }).click()
      await expect(page.getByRole("checkbox", { name: "Centre" })).not.toBeChecked()
      await page.getByRole("checkbox", { name: "Centre" }).click()
      await page.keyboard.press("Escape")

      await expect(page.getByRole("columnheader").filter({ hasText: "Centre" })).toBeVisible()

      await showContact(page, target.phone)
      await expect(contactRow(page, target.phone).getByRole("cell", { name: marker, exact: true })).toBeVisible()
    } finally {
      await deleteContactProfile(target.contactId)
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

    try {
      await page.goto(`/campaigns/${campaignId}/assign-contacts`)

      await expect(page.getByRole("heading", { name: "Open this on a desktop", level: 2 })).toBeVisible()
      await expect(page.getByRole("table")).toHaveCount(0)
      await expect(page.getByRole("group", { name: "Contacts in scope" })).toHaveCount(0)
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
    await expect(page.getByLabel("Campaign name")).toHaveCount(0)
    await expect(page.getByRole("heading", { name: "Open this on a desktop", level: 2 })).toHaveCount(0)
    await expect(page.getByRole("table")).toHaveCount(0)
  })
})
