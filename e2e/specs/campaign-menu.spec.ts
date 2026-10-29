import { expect, test, type Page } from "@playwright/test"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { isLocalSupabaseUrl } from "../../scripts/local-supabase-target.mjs"
import { readEnvValue } from "../fixtures/auth-users"
import { e2eProgramId, fixtureEmail, storageStatePath } from "../fixtures/roles"
import { assignContacts, callerForRole, createCallerCampaign, seededContacts } from "./campaign-caller-helpers"

/**
 * Story 1.10 — the phone Campaign menu (frame 2217).
 *
 * The menu is phone-only: every Campaign page title carries the 18px chevron
 * frames 1752/2263/2639 draw, and it opens a full-screen surface whose
 * destinations are the desktop sub-nav's own rule. The tests therefore run at
 * a 390x844 phone viewport with touch, plus one desktop row proving the
 * trigger is absent there.
 *
 * The two caller-profile rows need a `dialer_callers` row the seed does not
 * create. It is provisioned through the service role and removed through the
 * local SQL endpoint in a `finally`; the target is asserted loopback, and the
 * credential is read at runtime because the Playwright process does not
 * inherit the app's env file.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface StaffRow {
  id: string
  name: string | null
}

interface CallerProfileRow {
  id: string
  display_name: string
  is_active: boolean
}

function resolveLocalServiceRole(): { url: string; serviceRoleKey: string } {
  const serviceRoleKey = readEnvValue("SUPABASE_SERVICE_ROLE_KEY")
  const supabaseUrl = readEnvValue("SUPABASE_URL") ?? readEnvValue("NEXT_PUBLIC_SUPABASE_URL")

  if (!serviceRoleKey || !supabaseUrl) {
    throw new Error(
      "Cannot provision a dialer caller profile: SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL are missing. " +
        "Run `pnpm supabase:env` to write the local credentials into apps/folk/.env.local, or export them.",
    )
  }

  if (!isLocalSupabaseUrl(supabaseUrl)) {
    throw new Error(
      `Refusing to provision a dialer caller profile at "${supabaseUrl}": it is not a loopback address.`,
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
    throw new Error(`Local SQL failed: ${response.status} ${response.statusText}`)
  }
}

async function deleteCallerRow(id: string): Promise<void> {
  if (!UUID_PATTERN.test(id)) {
    throw new Error(`Refusing to delete a dialer caller profile with a non-UUID id: ${id}`)
  }

  await runLocalSql(`DELETE FROM public.dialer_callers WHERE id = '${id}'`)
}

async function provisionActiveCaller(email: string): Promise<() => Promise<void>> {
  const client = serviceRoleClient()
  const program = e2eProgramId()
  const staffEmail = email.trim().toLowerCase()

  const { data: staffData, error: staffError } = await client
    .from("users")
    .select("id,name")
    .eq("program_id", program)
    .eq("email", staffEmail)
    .maybeSingle()

  if (staffError) {
    throw new Error(`Reading the staff row for ${staffEmail} failed: ${staffError.message}`)
  }

  const staff = staffData as StaffRow | null
  if (!staff) {
    throw new Error(`No staff row for ${staffEmail} in program "${program}". Run \`pnpm seed:local\` first.`)
  }

  const { data: existingData, error: existingError } = await client
    .from("dialer_callers")
    .select("id,display_name,is_active")
    .eq("program_id", program)
    .eq("user_id", staff.id)
    .maybeSingle()

  if (existingError) {
    throw new Error(`Reading the dialer caller profile for ${staffEmail} failed: ${existingError.message}`)
  }

  const existing = existingData as CallerProfileRow | null

  if (existing) {
    const { error } = await client.from("dialer_callers").update({ is_active: true }).eq("id", existing.id)
    if (error) {
      throw new Error(`Activating the dialer caller profile for ${staffEmail} failed: ${error.message}`)
    }

    return async () => {
      const { error: restoreError } = await client
        .from("dialer_callers")
        .update({ display_name: existing.display_name, is_active: existing.is_active })
        .eq("id", existing.id)

      if (restoreError) {
        throw new Error(`Restoring the dialer caller profile for ${staffEmail} failed: ${restoreError.message}`)
      }
    }
  }

  const { data: inserted, error: insertError } = await client
    .from("dialer_callers")
    .insert({ program_id: program, user_id: staff.id, display_name: staff.name || staffEmail })
    .select("id")
    .single()

  if (insertError) {
    throw new Error(`Creating the dialer caller profile for ${staffEmail} failed: ${insertError.message}`)
  }

  const created = inserted as { id: string }
  return () => deleteCallerRow(created.id)
}

async function openMenu(page: Page) {
  await page.getByRole("button", { name: "Open the Campaign menu" }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  return dialog
}

test.describe("the Campaign phone menu — an Admin", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: storageStatePath("admin") })

  test("opens from the title, shows every phone destination, and closes", async ({ page }) => {
    await page.goto("/campaigns")

    const dialog = await openMenu(page)

    await expect(dialog.getByRole("heading", { name: "Campaign" })).toBeVisible()
    await expect(dialog.getByText(/\d+ campaigns? · folk programme/)).toBeVisible()

    const nav = dialog.getByRole("navigation", { name: "Campaign" })
    await expect(nav.getByRole("link")).toHaveCount(4)
    await expect(nav.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page")
    await expect(nav.getByRole("link", { name: "Assignments" })).toBeVisible()
    await expect(nav.getByRole("link", { name: "Callers" })).toBeVisible()
    await expect(nav.getByRole("link", { name: "Reports" })).toBeVisible()

    await dialog.getByRole("button", { name: "Close the Campaign menu" }).click()
    await expect(page.getByRole("dialog")).toHaveCount(0)
  })

  test("navigates by a row and marks the new section on reopen", async ({ page }) => {
    await page.goto("/campaigns/callers")

    const dialog = await openMenu(page)
    const nav = dialog.getByRole("navigation", { name: "Campaign" })
    await expect(nav.getByRole("link", { name: "Callers" })).toHaveAttribute("aria-current", "page")

    await nav.getByRole("link", { name: "Overview" }).click()
    await expect(page).toHaveURL(/\/campaigns$/)
    await expect(page.getByRole("dialog")).toHaveCount(0)

    const reopened = await openMenu(page)
    await expect(
      reopened.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name: "Overview" }),
    ).toHaveAttribute("aria-current", "page")
  })
})

test.describe("the Campaign phone menu — an Admin with an active caller profile", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: storageStatePath("admin") })

  test("inserts Assignments second and badges the pending count", async ({ page, request }) => {
    const caller = await callerForRole("admin")
    const campaign = await createCallerCampaign(request, "menu-badge", { gapDuration: 20, maxAttempts: 3 })
    const contacts = await seededContacts(2)
    await assignContacts(campaign.campaignId, caller.callerId, contacts)

    try {
      await page.goto("/campaigns")
      const dialog = await openMenu(page)
      const links = dialog.getByRole("navigation", { name: "Campaign" }).getByRole("link")

      await expect(links).toHaveCount(4)
      await expect(links.nth(0)).toHaveText("Overview")
      await expect(links.nth(1)).toContainText("Assignments")
      await expect(links.nth(2)).toHaveText("Callers")
      await expect(links.nth(3)).toHaveText("Reports")
      await expect(links.nth(0)).toHaveAttribute("aria-current", "page")

      await expect(dialog.locator('span[class*="25D366"]')).toHaveText("2")
    } finally {
      await campaign.cleanup()
      await caller.cleanup()
    }
  })
})

test.describe("the Campaign phone menu — a Volunteer with an active caller profile", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    storageState: storageStatePath("volunteer"),
  })

  test("offers Assignments alone and marks it current", async ({ page }) => {
    const restore = await provisionActiveCaller(fixtureEmail("volunteer"))

    try {
      await page.goto("/campaigns/assignments")
      const dialog = await openMenu(page)
      const nav = dialog.getByRole("navigation", { name: "Campaign" })

      await expect(nav.getByRole("link")).toHaveCount(1)
      await expect(nav.getByRole("link", { name: "Assignments" })).toHaveAttribute("aria-current", "page")
      await expect(nav.getByRole("link", { name: "Overview" })).toHaveCount(0)
      await expect(nav.getByRole("link", { name: "Callers" })).toHaveCount(0)
      await expect(nav.getByRole("link", { name: "Reports" })).toHaveCount(0)
    } finally {
      await restore()
    }
  })
})

test.describe("the Campaign phone menu — a desktop viewport", () => {
  test.use({ viewport: { width: 1280, height: 900 }, storageState: storageStatePath("admin") })

  test("has no title chevron and keeps the sub-nav without Assignments", async ({ page }) => {
    await page.goto("/campaigns")

    await expect(page.getByRole("button", { name: "Open the Campaign menu" })).toHaveCount(0)

    const nav = page.getByRole("navigation", { name: "Campaign" })
    await expect(nav).toBeVisible()
    await expect(nav.getByRole("link", { name: "Assignments" })).toHaveCount(0)
  })
})
