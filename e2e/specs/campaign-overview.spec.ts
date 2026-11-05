/**
 * Story 1.9 — the Campaign overview and the roster's performance columns.
 *
 * The API layer could only ever read a campaign with nothing assigned into it,
 * so every non-zero funnel count was invisible there. This spec owns the
 * fixture that makes them visible: a disposable campaign, three assignments
 * written through the real assignment route, and one `CONFIRMED` call log
 * inserted through the service role (no disposition route exists until Story
 * 2.3). With that state the five definitions are readable in the tiles, the
 * table row and the roster columns, and a Preacher's scope can be proved by
 * adding one assignment outside it.
 *
 * Cleanup is fixed by the foreign keys: call logs → assignments → the caller
 * profiles this run promoted → the campaign. All of it goes through the
 * loopback-guarded SQL endpoint, because `service_role` holds no DELETE on the
 * dialer tables (AD-12). The seed has no campaigns; every row this file creates
 * is removed before the run ends.
 */

import { expect, test, type APIRequestContext, type Page } from "@playwright/test"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { isLocalSupabaseUrl } from "../../scripts/local-supabase-target.mjs"
import { readEnvValue } from "../fixtures/auth-users"
import { createDisposableCampaign, deleteDisposableCampaign } from "../fixtures/dialer-campaign"
import { e2eProgramId, fixtureEmail, storageStatePath } from "../fixtures/roles"

/** The UUID shape, checked before an id is interpolated into SQL. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The five tiles' labels, in the order the desktop row draws them. */
const BUCKET_LABELS = ["Assigned", "Attempted", "Reached", "Never attempted", "Confirmed"] as const

interface ContactRow {
  contactId: string
  name: string
  phone: string
}

interface ContactPage {
  rows: ContactRow[]
  total: number
}

interface CallerRow {
  userId: string
  name: string
  email: string
}

interface AssignmentRow {
  id: string
  contact_id: string
  caller_id: string
}

interface StaffRow {
  id: string
  name: string | null
  email: string
}

interface Answer<T> {
  status: number
  text: string
  body: T
}

function resolveLocalServiceRole(): { url: string; serviceRoleKey: string } {
  const serviceRoleKey = readEnvValue("SUPABASE_SERVICE_ROLE_KEY")
  const supabaseUrl = readEnvValue("SUPABASE_URL") ?? readEnvValue("NEXT_PUBLIC_SUPABASE_URL")

  if (!serviceRoleKey || !supabaseUrl) {
    throw new Error(
      "Cannot own a dialer overview fixture: SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL are missing. " +
        "Run `pnpm supabase:env` to write the local credentials into apps/folk/.env.local, or export them.",
    )
  }

  if (!isLocalSupabaseUrl(supabaseUrl)) {
    throw new Error(
      `Refusing to touch dialer fixtures at "${supabaseUrl}": it is not a loopback address, so the ` +
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
    throw new Error(`The dialer overview cleanup failed: ${response.status} ${response.statusText}`)
  }
}

function requireUuid(value: string, what: string): string {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`Refusing to interpolate a non-UUID ${what} into SQL: ${value}`)
  }

  return value
}

/**
 * Every campaign in the e2e program, deleted.
 *
 * The overview's tiles are a sum across every visible campaign, so the fixture
 * has to start from the seed's own state — no campaigns — for the expected
 * numbers to be the fixture's. The 1.4 spec owns the empty-state precondition;
 * here the same sweep is only what makes the sum deterministic.
 */
async function deleteCampaignsForProgram(): Promise<void> {
  const program = e2eProgramId().replace(/'/g, "''")
  await runLocalSql(`DELETE FROM public.dialer_campaigns WHERE program_id = '${program}'`)
}

async function deleteCallLogs(campaignId: string): Promise<void> {
  await runLocalSql(
    `DELETE FROM public.dialer_call_logs WHERE assignment_id IN ` +
      `(SELECT id FROM public.dialer_assignments WHERE campaign_id = '${requireUuid(campaignId, "campaign id")}')`,
  )
}

async function deleteAssignments(campaignId: string): Promise<void> {
  await runLocalSql(
    `DELETE FROM public.dialer_assignments WHERE campaign_id = '${requireUuid(campaignId, "campaign id")}'`,
  )
}

/** The staff users that hold a caller profile right now, so a promoted one can be removed. */
async function readCallerUserIds(): Promise<Set<string>> {
  const { data, error } = await serviceRoleClient()
    .from("dialer_callers")
    .select("user_id")
    .eq("program_id", e2eProgramId())

  if (error) {
    throw new Error(`Reading the caller profiles for "${e2eProgramId()}" failed: ${error.message}`)
  }

  return new Set(((data ?? []) as Array<{ user_id: string }>).map((row) => row.user_id))
}

/** Remove exactly the profiles this run promoted, so a seeded caller is never touched. */
async function deletePromotedCallers(before: Set<string>): Promise<void> {
  const after = await readCallerUserIds()
  const promoted = [...after].filter((userId) => !before.has(userId))

  if (promoted.length === 0) {
    return
  }

  const ids = promoted.map((userId) => `'${requireUuid(userId, "caller user id")}'`).join(", ")
  await runLocalSql(`DELETE FROM public.dialer_callers WHERE user_id IN (${ids})`)
}

async function readContactPage(
  request: APIRequestContext,
  campaignId: string,
  pageSize = 100,
): Promise<ContactPage> {
  const response = await request.get(
    `/api/dialer/admin/campaigns/${campaignId}/contacts?page=1&pageSize=${pageSize}`,
  )

  expect(response.status(), await response.text()).toBe(200)
  return (await response.json()) as ContactPage
}

/** The first `count` contacts of the reader's scoped contact set. */
async function contactsFor(request: APIRequestContext, campaignId: string, count: number): Promise<ContactRow[]> {
  const page = await readContactPage(request, campaignId)

  if (page.rows.length < count) {
    throw new Error(`The scoped contact set returned ${page.rows.length} contacts; this row needs ${count}.`)
  }

  return page.rows.slice(0, count)
}

async function readCallers(request: APIRequestContext): Promise<CallerRow[]> {
  const response = await request.get("/api/dialer/admin/assignable-callers")

  expect(response.status(), await response.text()).toBe(200)
  const body = (await response.json()) as { callers?: CallerRow[] }
  const callers = body.callers ?? []

  if (callers.length === 0) {
    throw new Error("The reader's assignable caller set is empty; this row needs one.")
  }

  return callers
}

function writeAssignments(
  request: APIRequestContext,
  campaignId: string,
  data: { contactIds: string[]; callers: { userId: string; weight: number }[]; mode?: string },
): Promise<Answer<{ written?: number; skipped?: number; code?: string; error?: string }>> {
  return postJson(request, `/api/dialer/admin/campaigns/${campaignId}/assignments`, data)
}

async function postJson<T>(
  request: APIRequestContext,
  url: string,
  data: unknown,
): Promise<Answer<T & { code?: string; error?: string }>> {
  const response = await request.post(url, { data })
  const text = await response.text()
  let body: T & { code?: string; error?: string }

  try {
    body = JSON.parse(text) as T & { code?: string; error?: string }
  } catch {
    throw new Error(`${url} did not answer JSON: ${response.status()} ${text}`)
  }

  return { status: response.status(), text, body }
}

async function transition(page: Page, campaignId: string, action: "start" | "complete" | "cancel"): Promise<void> {
  const response = await page.request.post(`/api/dialer/admin/campaigns/${campaignId}/transition`, {
    data: { action },
  })

  expect(response.status(), `the campaign could not ${action}: ${await response.text()}`).toBe(200)
}

async function readCampaignName(campaignId: string): Promise<string> {
  const { data, error } = await serviceRoleClient()
    .from("dialer_campaigns")
    .select("name")
    .eq("id", requireUuid(campaignId, "campaign id"))
    .single()

  if (error) {
    throw new Error(`Reading the fixture campaign's name failed: ${error.message}`)
  }

  return (data as { name: string }).name
}

/** The campaign's assignment rows, read as the service role. */
async function readAssignments(campaignId: string): Promise<AssignmentRow[]> {
  const { data, error } = await serviceRoleClient()
    .from("dialer_assignments")
    .select("id,contact_id,caller_id")
    .eq("campaign_id", requireUuid(campaignId, "campaign id"))

  if (error) {
    throw new Error(`Reading the assignments of ${campaignId} failed: ${error.message}`)
  }

  return (data ?? []) as AssignmentRow[]
}

/**
 * One call log, because no disposition route exists before Story 2.3.
 *
 * `CONFIRMED` is written as the disposition rather than as `status_group`:
 * the group is a generated column, and writing the caller-written status is
 * the contract the real RPC will follow.
 */
async function insertConfirmedCall(assignment: AssignmentRow, phone: string): Promise<void> {
  const { error } = await serviceRoleClient()
    .from("dialer_call_logs")
    .insert({
      program_id: e2eProgramId(),
      assignment_id: requireUuid(assignment.id, "assignment id"),
      caller_id: requireUuid(assignment.caller_id, "caller id"),
      dial_phone: phone,
      attempt: 1,
      disposition_status: "CONFIRMED",
    })

  if (error) {
    throw new Error(`Inserting the fixture's call log failed: ${error.message}`)
  }
}

/** One assignment outside the reader's scope, as if another admin had made it. */
async function insertOutOfScopeAssignment(
  campaignId: string,
  contactId: string,
  callerId: string,
): Promise<void> {
  const { error } = await serviceRoleClient()
    .from("dialer_assignments")
    .insert({
      program_id: e2eProgramId(),
      campaign_id: requireUuid(campaignId, "campaign id"),
      contact_id: requireUuid(contactId, "contact id"),
      caller_id: requireUuid(callerId, "caller id"),
    })

  if (error) {
    throw new Error(`Inserting the out-of-scope assignment failed: ${error.message}`)
  }
}

async function readStaffByEmail(email: string): Promise<StaffRow> {
  const { data, error } = await serviceRoleClient()
    .from("users")
    .select("id,name,email")
    .eq("program_id", e2eProgramId())
    .eq("email", email.trim().toLowerCase())
    .maybeSingle()

  if (error) {
    throw new Error(`Reading the staff row for ${email} failed: ${error.message}`)
  }

  if (!data) {
    throw new Error(`No staff row for ${email} in program "${e2eProgramId()}". Run \`pnpm seed:local\` first.`)
  }

  return data as StaffRow
}

/** A contact another preacher owns, for the assignment the preacher must not count. */
async function readContactOutsideScope(preacherUserId: string): Promise<{ id: string; name: string }> {
  const { data, error } = await serviceRoleClient()
    .from("contacts")
    .select("id,name")
    .eq("program_id", e2eProgramId())
    .not("assigned_preacher_id", "is", null)
    .neq("assigned_preacher_id", preacherUserId)
    .order("created_at", { ascending: true })
    .limit(1)

  if (error) {
    throw new Error("Reading a contact outside the preacher's scope failed: " + error.message)
  }

  const contact = ((data ?? []) as Array<{ id: string; name: string }>)[0]

  if (!contact) {
    throw new Error("The seed holds no contact assigned to another preacher; this row needs one.")
  }

  return contact
}

/** An active staff user without a caller profile, so the roster has a true-zero row. */
async function readProfilelessStaff(): Promise<StaffRow> {
  const client = serviceRoleClient()
  const program = e2eProgramId()

  const [usersResponse, profilesResponse] = await Promise.all([
    client.from("users").select("id,name,email").eq("program_id", program).eq("status", "Active"),
    client.from("dialer_callers").select("user_id").eq("program_id", program),
  ])

  if (usersResponse.error) {
    throw new Error(`Reading the staff roster for "${program}" failed: ${usersResponse.error.message}`)
  }

  if (profilesResponse.error) {
    throw new Error(`Reading the caller profiles for "${program}" failed: ${profilesResponse.error.message}`)
  }

  const withProfile = new Set(
    ((profilesResponse.data ?? []) as Array<{ user_id: string }>).map((row) => row.user_id),
  )
  const candidate = ((usersResponse.data ?? []) as StaffRow[])
    .filter((row) => !withProfile.has(row.id))
    .sort((left, right) => left.email.localeCompare(right.email))[0]

  if (!candidate) {
    throw new Error("Every active staff user holds a caller profile; this row needs one without.")
  }

  return candidate
}

interface OverviewFixture {
  campaignId: string
  campaignName: string
  caller: CallerRow
  /** Removes the logs, the assignments, the promoted profiles and the campaign, in that order. */
  restore: () => Promise<void>
}

/**
 * A campaign with three assignments and one confirmed call: Assigned 3,
 * Attempted 1, Reached 1, Confirmed 1, Never attempted 2.
 *
 * Everything is created through the real routes except the call log, and the
 * campaign is only a DRAFT until a test asks for ACTIVE, so the status is the
 * test's own decision.
 */
async function buildOverviewFixture(request: APIRequestContext, label: string): Promise<OverviewFixture> {
  await deleteCampaignsForProgram()

  const campaignId = await createDisposableCampaign(request, label)
  const callersBefore = await readCallerUserIds()

  const restore = async () => {
    await deleteCallLogs(campaignId)
    await deleteAssignments(campaignId)
    await deletePromotedCallers(callersBefore)
    await deleteDisposableCampaign(campaignId)
  }

  try {
    const [caller] = await readCallers(request)
    const contacts = await contactsFor(request, campaignId, 3)

    const written = await writeAssignments(request, campaignId, {
      contactIds: contacts.map((contact) => contact.contactId),
      callers: [{ userId: caller.userId, weight: 1 }],
      mode: "move",
    })

    expect(written.status, written.text).toBe(201)
    expect(written.body.written, "the fixture must land three assignments").toBe(3)

    const rows = await readAssignments(campaignId)
    expect(rows, "one assignment per selected contact").toHaveLength(3)

    const confirmed = contacts.find((contact) => contact.contactId === rows[0].contact_id)

    if (!confirmed) {
      throw new Error("The confirmed assignment's contact is not on the fixture's first contact page.")
    }

    await insertConfirmedCall(rows[0], confirmed.phone)

    return { campaignId, campaignName: await readCampaignName(campaignId), caller, restore }
  } catch (error) {
    await restore()
    throw error
  }
}

/** The stat tile for a label, by its own marker rather than by its label text. */
function statTile(page: Page, label: string) {
  return page
    .getByRole("region", { name: "Campaign totals" })
    .locator(`[data-campaign-stat="${label}"]`)
}

function categoryRow(page: Page, name: string) {
  return page.getByRole("row").filter({ hasText: name })
}

async function requireBox(page: Page, label: string): Promise<{ x: number; y: number }> {
  const box = await statTile(page, label).boundingBox()

  if (!box) {
    throw new Error(`The ${label} tile has no bounding box.`)
  }

  return { x: Math.round(box.x), y: Math.round(box.y) }
}

async function isDark(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.classList.contains("dark"))
}

/**
 * A last-resort sweep after the file's tests. Each test already restores its own
 * fixture; this covers a test that failed before it reached its `finally`.
 */
test.afterAll(async () => {
  await deleteCampaignsForProgram()
})

// ---------------------------------------------------------------------------
// The empty state
// ---------------------------------------------------------------------------

test.describe("the campaign overview — an Admin with no campaigns", () => {
  test.use({ storageState: storageStatePath("admin") })

  test("offers Create campaign instead of a screen of zeroes", async ({ page }) => {
    await deleteCampaignsForProgram()

    await page.goto("/campaigns")

    await expect(page.getByText("No campaigns yet", { exact: true })).toBeVisible()
    await expect(page.getByRole("link", { name: "Create campaign" })).toHaveCount(0)
    const createCampaign = page.getByRole("button", { name: "Create campaign" })
    await expect(createCampaign).toBeVisible()
    await createCampaign.click()
    await expect(page.getByRole("dialog").getByLabel("Campaign name")).toBeVisible()
    await expect(page.getByRole("dialog").getByRole("button", { name: /End date/ })).toBeVisible()
    await expect(
      page.getByRole("region", { name: "Campaign totals" }),
      "an action, not five zeroes",
    ).toHaveCount(0)
    await expect(page.getByRole("table")).toHaveCount(0)
  })
})

// ---------------------------------------------------------------------------
// The five buckets
// ---------------------------------------------------------------------------

test.describe("the campaign overview — an Admin with one campaign", () => {
  test.use({ storageState: storageStatePath("admin") })

  test("sums the five buckets into the tiles and the row, Never attempted included", async ({ page }) => {
    const fixture = await buildOverviewFixture(page.request, "overview totals")

    try {
      await page.goto("/campaigns")

      await expect(statTile(page, "Assigned").getByText("3", { exact: true })).toBeVisible()
      await expect(statTile(page, "Attempted").getByText("1", { exact: true })).toBeVisible()
      await expect(statTile(page, "Reached").getByText("1", { exact: true })).toBeVisible()
      await expect(statTile(page, "Confirmed").getByText("1", { exact: true })).toBeVisible()

      // Never attempted is its own tile: assigned 3 minus attempted 1 is 2, and
      // it is not folded into Attempted or left to the table alone.
      await expect(statTile(page, "Never attempted").getByText("2", { exact: true })).toBeVisible()

      const row = categoryRow(page, fixture.campaignName)
      await expect(row).toHaveCount(1)
      await expect(row.getByRole("cell").nth(3)).toHaveText("3")
      await expect(row.getByRole("cell").nth(4)).toHaveText("1")
      await expect(row.getByRole("cell").nth(5)).toHaveText("1")
      await expect(row.getByRole("cell").nth(6)).toHaveText("2")

      await expect(page.getByText("1 campaign · 1 draft · 0 cancelled", { exact: true })).toBeVisible()
      await expect(
        page.getByText("Queued dispositions are not counted until their replay lands.", { exact: true }),
      ).toBeVisible()

      // Dark parity is one assertion: the same five tiles are still there.
      const toggle = page.getByRole("button", { name: "Toggle theme" })

      for (let attempt = 0; attempt < 2 && !(await isDark(page)); attempt += 1) {
        await toggle.click()
      }

      await expect.poll(() => isDark(page)).toBe(true)
      await expect(
        page.getByRole("region", { name: "Campaign totals" }).locator("[data-campaign-stat]"),
        "all five tiles survive the theme switch",
      ).toHaveCount(5)
      await expect(statTile(page, "Never attempted").getByText("2", { exact: true })).toBeVisible()
    } finally {
      await fixture.restore()
    }
  })
})

// ---------------------------------------------------------------------------
// The roster's performance columns
// ---------------------------------------------------------------------------

test.describe("the callers roster — an Admin with one campaign of progress", () => {
  test.use({ storageState: storageStatePath("admin") })

  test("fills the four performance columns from campaign_progress, zeros included", async ({ page }) => {
    const fixture = await buildOverviewFixture(page.request, "overview roster")

    try {
      const profileless = await readProfilelessStaff()

      await page.goto("/campaigns/callers")

      for (const column of ["Contact", "Campaigns", "Calls made", "Reached"]) {
        await expect(page.getByRole("columnheader", { name: column, exact: true })).toBeVisible()
      }

      const row = page.getByRole("row").filter({ has: page.getByRole("cell", { name: fixture.caller.name, exact: true }) })
      await expect(row).toHaveCount(1)
      await expect(row.getByRole("cell").nth(1)).toHaveText(fixture.caller.email)
      await expect(row.getByRole("cell").nth(2), "Campaigns is the assigned count").toHaveText("3")
      await expect(row.getByRole("cell").nth(3), "Calls made is log-grain").toHaveText("1")
      await expect(row.getByRole("cell").nth(4)).toHaveText("1")

      const zeroRow = page
        .getByRole("row")
        .filter({
          has: page.getByRole("cell", {
            name: profileless.name?.trim() || profileless.email,
            exact: true,
          }),
        })
      await expect(zeroRow, "a staff user without a caller profile still holds a row").toHaveCount(1)
      await expect(
        zeroRow.getByRole("cell", { name: "0", exact: true }),
        "no profile means no assignment, so all three counts are a true zero",
      ).toHaveCount(3)
    } finally {
      await fixture.restore()
    }
  })
})

// ---------------------------------------------------------------------------
// The phone layout
// ---------------------------------------------------------------------------

test.describe("the campaign overview — a phone", () => {
  test.use({ storageState: storageStatePath("admin"), viewport: { width: 390, height: 844 } })

  test("renders the tiles two by two, the Active card and no table", async ({ page }) => {
    const fixture = await buildOverviewFixture(page.request, "overview phone")

    try {
      await page.goto("/campaigns")

      // A DRAFT campaign belongs in the compact list, not under Active.
      await expect(page.getByRole("heading", { name: "Active", exact: true })).toHaveCount(0)
      await expect(page.getByRole("heading", { name: "Other campaigns", exact: true })).toBeVisible()

      const draftItem = page.getByRole("listitem").filter({ hasText: fixture.campaignName })
      await expect(draftItem).toHaveCount(1)
      await expect(draftItem).toContainText("3 assigned · 1 reached · 1 confirmed · 2 never attempted")

      await transition(page, fixture.campaignId, "start")
      await page.reload()

      for (const label of BUCKET_LABELS) {
        await expect(statTile(page, label)).toBeVisible()
      }

      const assigned = await requireBox(page, "Assigned")
      const attempted = await requireBox(page, "Attempted")
      const reached = await requireBox(page, "Reached")
      const neverAttempted = await requireBox(page, "Never attempted")
      const confirmed = await requireBox(page, "Confirmed")

      // Two per row, in the frame's phone order: Assigned / Attempted, then
      // Reached / Never attempted, with Confirmed on the row beneath.
      expect(Math.abs(attempted.y - assigned.y), "Assigned and Attempted share a row").toBeLessThanOrEqual(1)
      expect(Math.abs(neverAttempted.y - reached.y), "Reached and Never attempted share a row").toBeLessThanOrEqual(1)
      expect(reached.y).toBeGreaterThan(assigned.y)
      expect(confirmed.y, "Confirmed is the fifth tile, alone").toBeGreaterThan(reached.y)
      expect(attempted.x, "Attempted is the first row's right cell").toBeGreaterThan(assigned.x)
      expect(reached.x, "Reached starts the second row at the left edge").toBe(assigned.x)
      expect(neverAttempted.x, "Never attempted is the second row's right cell").toBe(attempted.x)
      expect(confirmed.x, "Confirmed takes the third row's left cell").toBe(assigned.x)

      await expect(page.getByRole("table"), "the phone has no table").toHaveCount(0)

      await expect(page.getByRole("heading", { name: "Active", exact: true })).toBeVisible()

      const card = page.getByRole("article").filter({ hasText: fixture.campaignName })
      await expect(card).toHaveCount(1)
      await expect(card.getByRole("link", { name: fixture.campaignName })).toHaveAttribute(
        "href",
        `/campaigns/${fixture.campaignId}/assign-contacts`,
      )
      expect(
        (await card.locator("dd").allInnerTexts()).map((value) => value.trim()),
        "the card carries the same five counts as the desktop row",
      ).toEqual(["3", "1", "1", "1", "2"])

      await expect(page.getByRole("heading", { name: "Other campaigns", exact: true })).toHaveCount(0)
      await expect(page.getByText("1 campaign · 0 draft · 0 cancelled", { exact: true })).toBeVisible()

      // A cancelled campaign returns to the compact list, and the footer counts it.
      await transition(page, fixture.campaignId, "cancel")
      await page.reload()

      await expect(page.getByRole("heading", { name: "Active", exact: true })).toHaveCount(0)
      await expect(page.getByRole("listitem").filter({ hasText: fixture.campaignName })).toContainText("CANCELLED")
      await expect(page.getByText("1 campaign · 0 draft · 1 cancelled", { exact: true })).toBeVisible()
    } finally {
      await fixture.restore()
    }
  })
})

// ---------------------------------------------------------------------------
// The Preacher's scope
// ---------------------------------------------------------------------------

test.describe("the campaign overview — a Preacher", () => {
  test.use({ storageState: storageStatePath("preacher") })

  test("keeps the campaign row and counts only their own contacts", async ({ page }) => {
    await deleteCampaignsForProgram()

    const campaignId = await createDisposableCampaign(page.request, "overview preacher scope")
    const callersBefore = await readCallerUserIds()

    const restore = async () => {
      await deleteCallLogs(campaignId)
      await deleteAssignments(campaignId)
      await deletePromotedCallers(callersBefore)
      await deleteDisposableCampaign(campaignId)
    }

    try {
      const preacher = await readStaffByEmail(fixtureEmail("preacher"))
      const [caller] = await readCallers(page.request)

      // The preacher's own contact set is the route's scope, so one contact
      // from it is by definition inside their scope.
      const [inScope] = await contactsFor(page.request, campaignId, 1)

      const written = await writeAssignments(page.request, campaignId, {
        contactIds: [inScope.contactId],
        callers: [{ userId: caller.userId, weight: 1 }],
        mode: "move",
      })

      expect(written.status, written.text).toBe(201)
      expect(written.body.written).toBe(1)

      const [assignment] = await readAssignments(campaignId)
      const outOfScope = await readContactOutsideScope(preacher.id)

      // As if another admin had assigned a contact this preacher does not own.
      await insertOutOfScopeAssignment(campaignId, outOfScope.id, assignment.caller_id)

      const campaignName = await readCampaignName(campaignId)
      const all = await readAssignments(campaignId)

      expect(all, "two assignments exist; only one is inside the preacher's scope").toHaveLength(2)

      await page.goto("/campaigns")

      const row = categoryRow(page, campaignName)
      await expect(row, "the campaign row stays visible").toHaveCount(1)
      await expect(row.getByRole("cell").nth(3), "only the in-scope assignment counts").toHaveText("1")
      await expect(row.getByRole("cell").nth(4)).toHaveText("0")
      await expect(row.getByRole("cell").nth(5)).toHaveText("0")
      await expect(row.getByRole("cell").nth(6)).toHaveText("1")

      await expect(statTile(page, "Assigned").getByText("1", { exact: true })).toBeVisible()
      await expect(statTile(page, "Never attempted").getByText("1", { exact: true })).toBeVisible()
      await expect(page.getByText("1 campaign · 1 draft · 0 cancelled", { exact: true })).toBeVisible()
    } finally {
      await restore()
    }
  })
})
