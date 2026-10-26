/**
 * Story 1.3 — the Campaign surfaces.
 *
 * Three roles, three surfaces, three boundaries:
 *
 * - an Admin, Preacher or Assistant reaches `/campaigns` and finds the
 *   "Overview" title, the "New campaign" action and the admin sub-nav;
 * - a Volunteer with no caller profile is refused at `/campaigns` and never
 *   sees the admin surface;
 * - a staff member with no caller profile is refused at `/campaigns/assignments`.
 *
 * The "Create campaign" empty state used to be asserted here, when `/campaigns`
 * had no data to render. The list is data-driven from Story 1.4, so that
 * assertion moved to `campaign-campaigns.spec.ts`, which controls the
 * precondition (no campaigns) instead of depending on a run's leftovers.
 *
 * The fourth row needs a caller profile that the seed does not create, so the
 * spec provisions one and puts the table back the way it found it. The
 * credential comes from the app's env file at runtime and the target is
 * asserted loopback, because a fixture written against the hosted project
 * would leave a caller profile there and report green here.
 */

import { expect, test } from "@playwright/test"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { isLocalSupabaseUrl } from "../../scripts/local-supabase-target.mjs"
import { readEnvValue } from "../fixtures/auth-users"
import { e2eProgramId, fixtureEmail, storageStatePath, type E2ERole } from "../fixtures/roles"

/** The UUID shape, checked before an id is interpolated into SQL. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The roles the Campaign admin gate admits. */
const CAMPAIGN_ADMIN_ROLES: readonly E2ERole[] = ["admin", "preacher", "assistant"]

interface StaffRow {
  id: string
  name: string | null
}

interface CallerProfileRow {
  id: string
  display_name: string
  is_active: boolean
}

/**
 * The local service-role target, or a throw naming the fix.
 *
 * Fail-closed on both counts: a missing credential and a non-loopback URL
 * both throw. A missing key would otherwise skip the row that proves the
 * caller's empty state, and a non-loopback URL would write the fixture to
 * the hosted project while the assertions ran against the local stack.
 */
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
      `Refusing to provision a dialer caller profile at "${supabaseUrl}": it is not a loopback address, so the ` +
        "fixture would be written to the hosted project instead of the local stack.",
    )
  }

  return { url: supabaseUrl, serviceRoleKey }
}

/**
 * One service-role client per run, built lazily so the specs that never touch
 * a dialer table never require the key to be present.
 */
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

/**
 * Remove a row from `dialer_callers`.
 *
 * `service_role` holds SELECT, INSERT and UPDATE on the dialer tables and no
 * DELETE — the migration grants it exactly three privileges — so a row this
 * spec creates cannot be removed through PostgREST. The local stack's SQL
 * endpoint runs as the table owner, which is the one path that can; it is
 * reachable only because the target is asserted loopback above.
 */
async function deleteCallerRow(id: string): Promise<void> {
  if (!UUID_PATTERN.test(id)) {
    throw new Error(`Refusing to delete a dialer caller profile with a non-UUID id: ${id}`)
  }

  const { url, serviceRoleKey } = resolveLocalServiceRole()
  const response = await fetch(`${url.replace(/\/+$/, "")}/pg/query`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: `DELETE FROM public.dialer_callers WHERE id = '${id}'` }),
  })

  if (!response.ok) {
    throw new Error(`Deleting the dialer caller profile failed: ${response.status} ${response.statusText}`)
  }
}

/**
 * Give `email` an active dialer caller profile, and return the function that
 * puts the table back the way it was found.
 *
 * A row that already exists is reactivated and then restored to its own
 * values; a row this spec creates is deleted. Either way the table is left as
 * it was, so a failed run cannot hand the next run a caller profile it did
 * not make.
 */
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
    const { error: updateError } = await client.from("dialer_callers").update({ is_active: true }).eq("id", existing.id)

    if (updateError) {
      throw new Error(`Activating the dialer caller profile for ${staffEmail} failed: ${updateError.message}`)
    }

    return async () => {
      const { error } = await client
        .from("dialer_callers")
        .update({ is_active: existing.is_active, display_name: existing.display_name })
        .eq("id", existing.id)

      if (error) {
        throw new Error(`Restoring the dialer caller profile for ${staffEmail} failed: ${error.message}`)
      }
    }
  }

  const { data: createdData, error: insertError } = await client
    .from("dialer_callers")
    .insert({
      program_id: program,
      user_id: staff.id,
      display_name: staff.name?.trim() || staffEmail,
      is_active: true,
    })
    .select("id")
    .single()

  if (insertError) {
    throw new Error(`Creating the dialer caller profile for ${staffEmail} failed: ${insertError.message}`)
  }

  const createdId = (createdData as { id: string }).id

  return async () => {
    await deleteCallerRow(createdId)
  }
}

// ---------------------------------------------------------------------------
// The admin surface
// ---------------------------------------------------------------------------

for (const role of CAMPAIGN_ADMIN_ROLES) {
  test.describe(`the Campaign overview — ${role}`, () => {
    test.use({ storageState: storageStatePath(role) })

    test("shows the Overview title, the New campaign action and the admin sub-nav", async ({ page }) => {
      await page.goto("/campaigns")

      await expect(page).toHaveURL(/\/campaigns$/)
      await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible()

      const newCampaign = page.getByRole("link", { name: "New campaign" })
      await expect(newCampaign).toBeVisible()
      await expect(newCampaign).toHaveAttribute("href", "/campaigns/new")

      const nav = page.getByRole("navigation", { name: "Campaign" })
      await expect(nav.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page")
      await expect(nav.getByRole("link", { name: "Callers" })).toBeVisible()
      await expect(nav.getByRole("link", { name: "Reports" })).toBeVisible()

      // No caller profile, so no Assignments tab — the admin gate is not a
      // caller profile.
      await expect(nav.getByRole("link", { name: "Assignments" })).toHaveCount(0)
    })
  })
}

// ---------------------------------------------------------------------------
// The refusals
// ---------------------------------------------------------------------------

test.describe("the Campaign overview — a Volunteer with no caller profile", () => {
  test.use({ storageState: storageStatePath("volunteer") })

  test("is refused and never shows the admin surface", async ({ page }) => {
    await page.goto("/campaigns")

    await expect(page).toHaveURL(/\/auth\/error\?code=staff-authorization-failed/)
    await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toHaveCount(0)
    await expect(page.getByRole("link", { name: "Create campaign" })).toHaveCount(0)
  })
})

test.describe("the Campaign assignments — a staff member with no caller profile", () => {
  test.use({ storageState: storageStatePath("assistant") })

  test("is refused", async ({ page }) => {
    await page.goto("/campaigns/assignments")

    await expect(page).toHaveURL(/\/auth\/error\?code=staff-authorization-failed/)
    await expect(page.getByRole("heading", { name: "Assignments", level: 1 })).toHaveCount(0)
  })
})

// ---------------------------------------------------------------------------
// The caller surface
// ---------------------------------------------------------------------------

test.describe("the Campaign assignments — a Volunteer with an active caller profile", () => {
  test.use({ storageState: storageStatePath("volunteer") })

  test("shows the Assignments tab and an actionable empty queue", async ({ page }) => {
    const restore = await provisionActiveCaller(fixtureEmail("volunteer"))

    try {
      await page.goto("/campaigns/assignments")

      await expect(page).toHaveURL(/\/campaigns\/assignments$/)
      await expect(page.getByRole("heading", { name: "Assignments", level: 1 })).toBeVisible()
      await expect(page.getByText("No calls assigned yet", { exact: true })).toBeVisible()
      await expect(page.getByText(/Your next call appears here/)).toBeVisible()

      const nav = page.getByRole("navigation", { name: "Campaign" })
      await expect(nav.getByRole("link", { name: "Assignments" })).toHaveAttribute("aria-current", "page")

      // A caller earns the caller tab and nothing else — the admin tabs stay
      // closed to a Volunteer even with a profile.
      await expect(nav.getByRole("link", { name: "Overview" })).toHaveCount(0)
      await expect(nav.getByRole("link", { name: "Callers" })).toHaveCount(0)
      await expect(nav.getByRole("link", { name: "Reports" })).toHaveCount(0)

      // The admin Overview refuses a caller exactly as it refuses a Volunteer
      // with no profile.
      await page.goto("/campaigns")
      await expect(page).toHaveURL(/\/auth\/error\?code=staff-authorization-failed/)
      await expect(page.getByRole("link", { name: "Create campaign" })).toHaveCount(0)
    } finally {
      await restore()
    }
  })
})
