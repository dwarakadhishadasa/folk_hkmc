/**
 * Story 1.8 — the conflict-aware weighted assignment write.
 *
 * The one fixture the seed cannot provide is an assignment row: the seed has no
 * campaigns, and `dialer_assignments.campaign_id` is `ON DELETE RESTRICT`, so a
 * campaign that took a write cannot be removed until its assignments are. Every
 * test therefore owns a disposable campaign, deletes its assignments, then the
 * caller profiles the writes promoted, then the campaign — all in a `finally`,
 * and all through the loopback-guarded SQL endpoint, because `service_role`
 * holds no DELETE on the dialer tables (`AD-12`).
 *
 * Conflicts are created through the assignment route itself rather than by
 * inserting rows, so the pre-check reads rows the real write produced. The three
 * counts (`written`, `skipped`, per-caller `split`) and the conflict list are
 * read back from the routes and the table, never recomputed here.
 *
 * The UI paths run at a desktop viewport because the assign-contacts surface is
 * desktop-only (UX-DR9/UX-DR10); `campaign-assign-select.spec.ts` owns that gate
 * and the zero-selection guard, and neither is duplicated here.
 */

import { expect, test, type APIRequestContext, type Page } from "@playwright/test"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { isLocalSupabaseUrl } from "../../scripts/local-supabase-target.mjs"
import { readEnvValue } from "../fixtures/auth-users"
import { createDisposableCampaign, deleteDisposableCampaign } from "../fixtures/dialer-campaign"
import { e2eProgramId, storageStatePath } from "../fixtures/roles"

/** A valid UUID that is impossible to seed, for the caller-refusal path. */
const ABSENT_USER_ID = "00000000-0000-4000-8000-000000000000"

/** The UUID shape, checked before an id is interpolated into SQL. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

interface ConflictRow {
  contactId: string
  contactName: string
  callerId: string
  callerName: string
  status: string
}

interface PrecheckBody {
  conflicts: ConflictRow[]
  assignableCount: number
  conflictCount: number
}

interface SplitEntry {
  callerId: string
  weight: number
  count: number
}

interface WriteBody {
  written: number
  skipped: number
  split: SplitEntry[]
}

interface AssignmentRow {
  contact_id: string
  caller_id: string
  status: string
  sort_order: number
  dialer_callers: { user_id: string; display_name: string } | null
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
      "Cannot own a dialer assignment fixture: SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL are missing. " +
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
    throw new Error(`The dialer fixture cleanup failed: ${response.status} ${response.statusText}`)
  }
}

function requireUuid(value: string, what: string): string {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`Refusing to interpolate a non-UUID ${what} into SQL: ${value}`)
  }

  return value
}

/** The scoped contact set, as the surface itself reads it. */
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

async function contactsFor(request: APIRequestContext, campaignId: string, count: number): Promise<ContactRow[]> {
  const page = await readContactPage(request, campaignId)

  if (page.rows.length < count) {
    throw new Error(`The seeded programme returned ${page.rows.length} contacts; this row needs ${count}.`)
  }

  return page.rows.slice(0, count)
}

async function readCallers(request: APIRequestContext): Promise<CallerRow[]> {
  const response = await request.get("/api/dialer/admin/assignable-callers")

  expect(response.status(), await response.text()).toBe(200)
  const body = (await response.json()) as { callers?: CallerRow[] }
  const callers = body.callers ?? []

  if (callers.length < 2) {
    throw new Error(`The Admin's assignable set has ${callers.length} callers; this row needs two.`)
  }

  return callers
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

function precheck(
  request: APIRequestContext,
  campaignId: string,
  contactIds: string[],
): Promise<Answer<PrecheckBody & { code?: string; error?: string }>> {
  return postJson(request, `/api/dialer/admin/campaigns/${campaignId}/assignments/precheck`, { contactIds })
}

function writeAssignments(
  request: APIRequestContext,
  campaignId: string,
  data: { contactIds: string[]; callers: { userId: string; weight: number }[]; mode?: string },
): Promise<Answer<WriteBody & { code?: string; error?: string }>> {
  return postJson(request, `/api/dialer/admin/campaigns/${campaignId}/assignments`, data)
}

/** The campaign's assignment rows, with the owning caller's staff id, read as the service role. */
async function readAssignments(campaignId: string): Promise<AssignmentRow[]> {
  const { data, error } = await serviceRoleClient()
    .from("dialer_assignments")
    .select("contact_id,caller_id,status,sort_order,dialer_callers(user_id,display_name)")
    .eq("campaign_id", requireUuid(campaignId, "campaign id"))

  if (error) {
    throw new Error(`Reading the assignments of ${campaignId} failed: ${error.message}`)
  }

  return (data ?? []) as unknown as AssignmentRow[]
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

async function deleteAssignments(campaignId: string): Promise<void> {
  await runLocalSql(
    `DELETE FROM public.dialer_assignments WHERE campaign_id = '${requireUuid(campaignId, "campaign id")}'`,
  )
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

async function transition(page: Page, campaignId: string, action: "start" | "complete"): Promise<void> {
  const response = await page.request.post(`/api/dialer/admin/campaigns/${campaignId}/transition`, {
    data: { action },
  })

  expect(response.status(), `the campaign could not ${action}: ${await response.text()}`).toBe(200)
}

/** The contact row for one phone number; phones are unique per programme. */
function contactRow(page: Page, phone: string) {
  return page.getByRole("row").filter({ has: page.getByRole("cell", { name: phone, exact: true }) })
}

function selectedLine(count: number, total: number): string {
  return `${count} of ${total} selected`
}

// ---------------------------------------------------------------------------
// The pre-check names every conflict before a write
// ---------------------------------------------------------------------------

test.describe("the assignment pre-check — an Admin", () => {
  test.use({ storageState: storageStatePath("admin") })

  test("names every already-assigned contact and its current caller", async ({ page }) => {
    const campaignId = await createDisposableCampaign(page.request, "assign write precheck")
    const callersBefore = await readCallerUserIds()

    try {
      const [assigned, unassigned] = await contactsFor(page.request, campaignId, 2)
      const [owner] = await readCallers(page.request)

      const seeded = await writeAssignments(page.request, campaignId, {
        contactIds: [assigned.contactId],
        callers: [{ userId: owner.userId, weight: 1 }],
        mode: "move",
      })

      expect(seeded.status, seeded.text).toBe(201)
      expect(seeded.body.written, "the fixture write must land exactly one row").toBe(1)

      const ownerCallerId = seeded.body.split[0].callerId
      const answer = await precheck(page.request, campaignId, [assigned.contactId, unassigned.contactId])

      expect(answer.status, answer.text).toBe(200)
      expect(answer.body.conflicts, "exactly one of the two selected is already assigned").toHaveLength(1)
      expect(answer.body.conflictCount).toBe(1)
      expect(answer.body.assignableCount, "the other one is what a skip would write").toBe(1)
      expect(answer.body.conflicts[0]).toEqual({
        contactId: assigned.contactId,
        contactName: assigned.name,
        callerId: ownerCallerId,
        callerName: owner.name,
        status: "PENDING",
      })
    } finally {
      await deleteAssignments(campaignId)
      await deletePromotedCallers(callersBefore)
      await deleteDisposableCampaign(campaignId)
    }
  })
})

// ---------------------------------------------------------------------------
// Skip and move
// ---------------------------------------------------------------------------

test.describe("the assignment write — an Admin", () => {
  test.use({ storageState: storageStatePath("admin") })

  test("writes only the unassigned contacts when the decision is skip", async ({ page }) => {
    const campaignId = await createDisposableCampaign(page.request, "assign write skip")
    const callersBefore = await readCallerUserIds()

    try {
      const [alreadyAssigned, unassigned] = await contactsFor(page.request, campaignId, 2)
      const [first, second] = await readCallers(page.request)

      const seeded = await writeAssignments(page.request, campaignId, {
        contactIds: [alreadyAssigned.contactId],
        callers: [{ userId: first.userId, weight: 1 }],
        mode: "move",
      })

      expect(seeded.status, seeded.text).toBe(201)
      const firstCallerId = seeded.body.split[0].callerId

      const written = await writeAssignments(page.request, campaignId, {
        contactIds: [alreadyAssigned.contactId, unassigned.contactId],
        callers: [{ userId: second.userId, weight: 1 }],
        mode: "skip",
      })

      expect(written.status, written.text).toBe(201)
      expect(written.body.written, "only the unassigned contact is written").toBe(1)
      expect(written.body.skipped, "the conflicting contact is named as skipped").toBe(1)
      expect(written.body.split, "one caller receives the one written contact").toHaveLength(1)
      expect(written.body.split[0]).toMatchObject({ weight: 1, count: 1 })

      const rows = await readAssignments(campaignId)
      const byContact = new Map(rows.map((row) => [row.contact_id, row]))

      expect(rows).toHaveLength(2)
      expect(byContact.get(alreadyAssigned.contactId)?.caller_id, "the skip left the original owner").toBe(
        firstCallerId,
      )
      expect(byContact.get(unassigned.contactId)?.caller_id).toBe(written.body.split[0].callerId)
      expect(byContact.get(unassigned.contactId)?.dialer_callers?.user_id).toBe(second.userId)
    } finally {
      await deleteAssignments(campaignId)
      await deletePromotedCallers(callersBefore)
      await deleteDisposableCampaign(campaignId)
    }
  })

  test("moves a conflicting row instead of inserting a second one", async ({ page }) => {
    const campaignId = await createDisposableCampaign(page.request, "assign write move")
    const callersBefore = await readCallerUserIds()

    try {
      const [alreadyAssigned, unassigned] = await contactsFor(page.request, campaignId, 2)
      const [first, second] = await readCallers(page.request)

      const seeded = await writeAssignments(page.request, campaignId, {
        contactIds: [alreadyAssigned.contactId],
        callers: [{ userId: first.userId, weight: 1 }],
        mode: "move",
      })

      expect(seeded.status, seeded.text).toBe(201)

      const moved = await writeAssignments(page.request, campaignId, {
        contactIds: [alreadyAssigned.contactId, unassigned.contactId],
        callers: [{ userId: second.userId, weight: 1 }],
        mode: "move",
      })

      expect(moved.status, moved.text).toBe(201)
      expect(moved.body.written, "both contacts are written").toBe(2)
      expect(moved.body.skipped).toBe(0)

      const afterMove = await precheck(page.request, campaignId, [alreadyAssigned.contactId])
      expect(afterMove.status, afterMove.text).toBe(200)
      expect(afterMove.body.conflicts, "the moved row still exists; a move is not a delete").toHaveLength(1)
      expect(afterMove.body.conflicts[0].callerName, "and the conflict names the new caller").toBe(second.name)

      const rows = await readAssignments(campaignId)
      const movedRows = rows.filter((row) => row.contact_id === alreadyAssigned.contactId)

      expect(movedRows, "one row per (contact, campaign) — a move, never a second insert").toHaveLength(1)
      expect(movedRows[0].dialer_callers?.user_id).toBe(second.userId)
      expect(rows).toHaveLength(2)
    } finally {
      await deleteAssignments(campaignId)
      await deletePromotedCallers(callersBefore)
      await deleteDisposableCampaign(campaignId)
    }
  })

  test("splits a weighted batch by floor division and writes the whole set", async ({ page }) => {
    const campaignId = await createDisposableCampaign(page.request, "assign write weights")
    const callersBefore = await readCallerUserIds()

    try {
      const contacts = await contactsFor(page.request, campaignId, 6)
      const [heavier, lighter] = await readCallers(page.request)

      const written = await writeAssignments(page.request, campaignId, {
        contactIds: contacts.map((contact) => contact.contactId),
        callers: [
          { userId: heavier.userId, weight: 2 },
          { userId: lighter.userId, weight: 1 },
        ],
        mode: "move",
      })

      expect(written.status, written.text).toBe(201)
      expect(written.body.written, "the confirmed set is the whole selection").toBe(6)
      expect(written.body.skipped).toBe(0)
      expect(written.body.split.map((entry) => entry.count), "2:1 over 6 is 4 and 2").toEqual([4, 2])
      expect(written.body.split.reduce((sum, entry) => sum + entry.count, 0)).toBe(6)

      const rows = await readAssignments(campaignId)
      const byCaller = new Map<string, number>()

      for (const row of rows) {
        byCaller.set(row.caller_id, (byCaller.get(row.caller_id) ?? 0) + 1)
      }

      expect(rows, "every contact landed").toHaveLength(6)
      expect(byCaller.get(written.body.split[0].callerId)).toBe(4)
      expect(byCaller.get(written.body.split[1].callerId)).toBe(2)
    } finally {
      await deleteAssignments(campaignId)
      await deletePromotedCallers(callersBefore)
      await deleteDisposableCampaign(campaignId)
    }
  })
})

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

test.describe("the assign-contacts screen — an Admin", () => {
  test.use({ storageState: storageStatePath("admin"), viewport: { width: 1440, height: 1000 } })

  test("assigns an unconflicted selection and reports the receipt", async ({ page }) => {
    const campaignId = await createDisposableCampaign(page.request, "assign write screen")
    const callersBefore = await readCallerUserIds()

    try {
      const page1 = await readContactPage(page.request, campaignId)
      const targets = page1.rows.slice(0, 2)
      const [caller] = await readCallers(page.request)

      await page.goto(`/campaigns/${campaignId}/assign-contacts`)
      await expect(page.getByRole("heading", { name: "Assign contacts", level: 1 })).toBeVisible()

      for (const target of targets) {
        await contactRow(page, target.phone).getByRole("checkbox").click()
      }

      await expect(page.getByText(selectedLine(2, page1.total), { exact: true })).toBeVisible()

      await page.getByRole("combobox", { name: "Add caller", exact: true }).selectOption({ label: caller.name })
      await page.getByRole("button", { name: "Add caller", exact: true }).click()

      const assign = page.getByRole("button", { name: "Assign 2 contacts", exact: true })
      await expect(assign).toBeEnabled()
      await assign.click()

      await expect(page.getByRole("status").filter({ hasText: "Assigned 2 contacts" })).toBeVisible()

      await expect(
        page.getByText(selectedLine(0, page1.total), { exact: true }),
        "a completed write clears the selection",
      ).toBeVisible()
      await expect(page.getByText("No callers chosen yet.", { exact: true })).toBeVisible()

      const landed = await precheck(
        page.request,
        campaignId,
        targets.map((target) => target.contactId),
      )

      expect(landed.status, landed.text).toBe(200)
      expect(landed.body.conflicts, "the browser wrote both selected contacts").toHaveLength(2)
      expect(landed.body.conflicts.map((conflict) => conflict.contactId).sort()).toEqual(
        targets.map((target) => target.contactId).sort(),
      )
    } finally {
      await deleteAssignments(campaignId)
      await deletePromotedCallers(callersBefore)
      await deleteDisposableCampaign(campaignId)
    }
  })

  test("writes nothing until the conflict dialog's skip or move is chosen", async ({ page }) => {
    const campaignId = await createDisposableCampaign(page.request, "assign write conflict")
    const callersBefore = await readCallerUserIds()

    try {
      const [conflicted, unassigned] = await contactsFor(page.request, campaignId, 2)
      const [owner, replacement] = await readCallers(page.request)

      const seeded = await writeAssignments(page.request, campaignId, {
        contactIds: [conflicted.contactId],
        callers: [{ userId: owner.userId, weight: 1 }],
        mode: "move",
      })

      expect(seeded.status, seeded.text).toBe(201)

      const page1 = await readContactPage(page.request, campaignId)

      await page.goto(`/campaigns/${campaignId}/assign-contacts`)
      await expect(page.getByText(selectedLine(0, page1.total), { exact: true })).toBeVisible()

      for (const target of [conflicted, unassigned]) {
        await contactRow(page, target.phone).getByRole("checkbox").click()
      }

      await page.getByRole("combobox", { name: "Add caller", exact: true }).selectOption({ label: replacement.name })
      await page.getByRole("button", { name: "Add caller", exact: true }).click()

      const assign = page.getByRole("button", { name: "Assign 2 contacts", exact: true })
      await assign.click()

      const dialog = page.getByRole("dialog")
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole("cell", { name: conflicted.name, exact: true })).toBeVisible()
      await expect(dialog.getByRole("cell", { name: owner.name, exact: true })).toBeVisible()
      await expect(dialog.getByRole("cell", { name: "PENDING", exact: true })).toBeVisible()
      await expect(
        dialog.getByRole("button", { name: "Skip them · assign 1 contact", exact: true }),
      ).toBeVisible()
      await expect(dialog.getByRole("button", { name: "Move them · assign 2 contacts", exact: true })).toBeVisible()

      await page.keyboard.press("Escape")
      await expect(dialog).toHaveCount(0)

      expect(await readAssignments(campaignId), "closing the dialog writes nothing").toHaveLength(1)

      await assign.click()
      await expect(dialog).toBeVisible()
      await dialog.getByRole("button", { name: "Move them · assign 2 contacts", exact: true }).click()

      await expect(page.getByRole("status").filter({ hasText: "Assigned 2 contacts" })).toBeVisible()

      const rows = await readAssignments(campaignId)
      const byContact = new Map(rows.map((row) => [row.contact_id, row]))

      expect(rows).toHaveLength(2)
      expect(byContact.get(conflicted.contactId)?.dialer_callers?.user_id, "the conflict moved").toBe(
        replacement.userId,
      )
      expect(byContact.get(unassigned.contactId)?.dialer_callers?.user_id).toBe(replacement.userId)
      await expect(page.getByText(selectedLine(0, page1.total), { exact: true })).toBeVisible()
    } finally {
      await deleteAssignments(campaignId)
      await deletePromotedCallers(callersBefore)
      await deleteDisposableCampaign(campaignId)
    }
  })
})

// ---------------------------------------------------------------------------
// The named refusals
// ---------------------------------------------------------------------------

test.describe("the assignment refusals — an Admin", () => {
  test.use({ storageState: storageStatePath("admin") })

  test("refuses a caller outside the assignable set by name and writes nothing", async ({ page }) => {
    const campaignId = await createDisposableCampaign(page.request, "assign write outsider")
    const callersBefore = await readCallerUserIds()

    try {
      const [contact] = await contactsFor(page.request, campaignId, 1)

      const refused = await writeAssignments(page.request, campaignId, {
        contactIds: [contact.contactId],
        callers: [{ userId: ABSENT_USER_ID, weight: 1 }],
        mode: "move",
      })

      expect(refused.status, "a caller outside the set is refused, not dropped").toBe(403)
      expect(refused.body.code).toBe("caller_not_assignable")
      expect(refused.body.error, "the refusal names the caller").toContain(ABSENT_USER_ID)
      expect(await readAssignments(campaignId), "no rows are written").toHaveLength(0)
    } finally {
      await deleteAssignments(campaignId)
      await deletePromotedCallers(callersBefore)
      await deleteDisposableCampaign(campaignId)
    }
  })

  test("refuses a completed campaign", async ({ page }) => {
    const campaignId = await createDisposableCampaign(page.request, "assign write terminal")
    const callersBefore = await readCallerUserIds()

    try {
      const [contact] = await contactsFor(page.request, campaignId, 1)
      const [caller] = await readCallers(page.request)

      await transition(page, campaignId, "start")
      await transition(page, campaignId, "complete")

      const refused = await writeAssignments(page.request, campaignId, {
        contactIds: [contact.contactId],
        callers: [{ userId: caller.userId, weight: 1 }],
        mode: "move",
      })

      expect(refused.status, "COMPLETED is terminal for the write").toBe(409)
      expect(refused.body.code).toBe("campaign_not_assignable")
      expect(refused.body.error).toContain("COMPLETED")
      expect(await readAssignments(campaignId), "a refused write leaves no row").toHaveLength(0)
    } finally {
      await deleteAssignments(campaignId)
      await deletePromotedCallers(callersBefore)
      await deleteDisposableCampaign(campaignId)
    }
  })

  test("requires skip or move when the selection has conflicts", async ({ page }) => {
    const campaignId = await createDisposableCampaign(page.request, "assign write mode")
    const callersBefore = await readCallerUserIds()

    try {
      const [conflicted, unassigned] = await contactsFor(page.request, campaignId, 2)
      const [owner, replacement] = await readCallers(page.request)

      const seeded = await writeAssignments(page.request, campaignId, {
        contactIds: [conflicted.contactId],
        callers: [{ userId: owner.userId, weight: 1 }],
        mode: "move",
      })

      expect(seeded.status, seeded.text).toBe(201)

      const refused = await writeAssignments(page.request, campaignId, {
        contactIds: [conflicted.contactId, unassigned.contactId],
        callers: [{ userId: replacement.userId, weight: 1 }],
      })

      expect(refused.status, "an absent mode is not defaulted to move").toBe(409)
      expect(refused.body.code).toBe("conflicts_require_decision")
      expect(refused.body.error, "the refusal names the contact and its current caller").toContain(
        conflicted.name,
      )
      expect(refused.body.error).toContain(owner.name)

      const rows = await readAssignments(campaignId)
      expect(rows, "nothing was written before the decision").toHaveLength(1)
      expect(rows[0].contact_id).toBe(conflicted.contactId)
    } finally {
      await deleteAssignments(campaignId)
      await deletePromotedCallers(callersBefore)
      await deleteDisposableCampaign(campaignId)
    }
  })

  test("refuses a skip that would write nothing", async ({ page }) => {
    const campaignId = await createDisposableCampaign(page.request, "assign write nothing")
    const callersBefore = await readCallerUserIds()

    try {
      const contacts = await contactsFor(page.request, campaignId, 2)
      const [caller] = await readCallers(page.request)

      const seeded = await writeAssignments(page.request, campaignId, {
        contactIds: contacts.map((contact) => contact.contactId),
        callers: [{ userId: caller.userId, weight: 1 }],
        mode: "move",
      })

      expect(seeded.status, seeded.text).toBe(201)

      const refused = await writeAssignments(page.request, campaignId, {
        contactIds: contacts.map((contact) => contact.contactId),
        callers: [{ userId: caller.userId, weight: 1 }],
        mode: "skip",
      })

      expect(refused.status, "a skip over a fully assigned selection has nothing to write").toBe(409)
      expect(refused.body.code).toBe("nothing_to_assign")
      expect(await readAssignments(campaignId)).toHaveLength(2)
    } finally {
      await deleteAssignments(campaignId)
      await deletePromotedCallers(callersBefore)
      await deleteDisposableCampaign(campaignId)
    }
  })

  test("refuses an inactive caller and never reactivates it", async ({ page }) => {
    const campaignId = await createDisposableCampaign(page.request, "assign write inactive")
    const callersBefore = await readCallerUserIds()

    try {
      const [assigned, unassigned] = await contactsFor(page.request, campaignId, 2)
      const [caller] = await readCallers(page.request)

      const seeded = await writeAssignments(page.request, campaignId, {
        contactIds: [assigned.contactId],
        callers: [{ userId: caller.userId, weight: 1 }],
        mode: "move",
      })

      expect(seeded.status, seeded.text).toBe(201)

      await runLocalSql(
        `UPDATE public.dialer_callers SET is_active = false WHERE user_id = '${requireUuid(
          caller.userId,
          "caller user id",
        )}'`,
      )

      const refused = await writeAssignments(page.request, campaignId, {
        contactIds: [unassigned.contactId],
        callers: [{ userId: caller.userId, weight: 1 }],
        mode: "move",
      })

      expect(refused.status, "a deactivated caller is a named refusal, not a silent drop").toBe(409)
      expect(refused.body.code).toBe("caller_inactive")
      expect(refused.body.error).toContain(caller.name)

      const { data, error } = await serviceRoleClient()
        .from("dialer_callers")
        .select("is_active")
        .eq("user_id", requireUuid(caller.userId, "caller user id"))
        .single()

      if (error) {
        throw new Error(`Reading the promoted caller profile failed: ${error.message}`)
      }

      expect((data as { is_active: boolean }).is_active, "the refusal never reactivates the profile").toBe(false)
      expect(await readAssignments(campaignId), "the refused contact was not written").toHaveLength(1)
    } finally {
      await deleteAssignments(campaignId)
      await deletePromotedCallers(callersBefore)
      await deleteDisposableCampaign(campaignId)
    }
  })
})
