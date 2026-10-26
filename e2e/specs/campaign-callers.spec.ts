/**
 * Story 1.6 — the Callers roster.
 *
 * Four roles, one screen:
 *
 * - an Admin reads every active staff user in the programme and may switch a
 *   caller's `is_active`;
 * - the switch asks before it deactivates, keeps the row for history, and
 *   offers `Reactivate` on the same row;
 * - a Preacher reads their own row and their assignees only, and sees no switch
 *   at all — deactivation is an Admin action, not an admin-surface action;
 * - a Volunteer is refused at the page before the roster is read.
 *
 * The roster is a read of staff the seed already owns, so the only fixture is a
 * `dialer_callers` profile for the seeded Volunteer. It is created through the
 * service role and removed again in a `finally` — `service_role` holds no
 * DELETE on `dialer_callers`, so removal goes through the local stack's SQL
 * endpoint, which is reached only after the target is asserted loopback. A row
 * left behind would make the 1.3 spec's "Volunteer with no caller profile" and
 * its nav expectations fail, so the cleanup is part of the assertion.
 *
 * The story's performance columns (Contact / Campaigns / Calls made / Reached)
 * need `campaign_progress`, which Story 1.9 creates. This spec pins their
 * absence rather than letting a later edit fill them with a zero.
 */

import { expect, test, type Page } from "@playwright/test"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { isLocalSupabaseUrl } from "../../scripts/local-supabase-target.mjs"
import { readEnvValue } from "../fixtures/auth-users"
import { e2eProgramId, fixtureEmail, storageStatePath } from "../fixtures/roles"

/** The UUID shape, checked before an id is interpolated into SQL. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface StaffRow {
  id: string
  name: string | null
  email: string
}

interface CallerProfileRow {
  id: string
  display_name: string
  is_active: boolean
}

/** The programme's active staff, and whether each one holds an active profile. */
interface ProgramRoster {
  staff: StaffRow[]
  /** `user_id` → `is_active`; an absent key means the staff user has no profile. */
  profileFlags: Map<string, boolean>
}

function staffName(row: Pick<StaffRow, "name" | "email">): string {
  return row.name?.trim() || row.email
}

/**
 * The local service-role target, or a throw naming the fix.
 *
 * Fail-closed on both counts: a missing credential and a non-loopback URL both
 * throw. A missing key would otherwise skip the fixture and the cleanup, and a
 * non-loopback URL would write the fixture to the hosted project while the
 * assertions ran against the local stack.
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

/** One service-role client per run, built lazily so a missing key only fails the rows that need it. */
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
 * Remove a row from `dialer_callers` through the local stack's SQL endpoint.
 *
 * `service_role` holds SELECT, INSERT and UPDATE on the dialer tables and no
 * DELETE — the migration grants it exactly three privileges — so a row this
 * spec creates cannot be removed through PostgREST. The endpoint runs as the
 * table owner, which is the one path that can.
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
 * The programme's active staff and their profile flags, read through the service
 * role for the subtitle's expected counts.
 *
 * This mirrors `listRoster`'s Admin scope — every active staff user, plus their
 * profile state — without reimplementing the sort. The seed has no non-Active
 * staff, and the row-count assertion in the admin test would catch one arriving.
 */
async function readProgramRoster(): Promise<ProgramRoster> {
  const client = serviceRoleClient()
  const program = e2eProgramId()

  const { data: staffData, error: staffError } = await client
    .from("users")
    .select("id,name,email")
    .eq("program_id", program)
    .eq("status", "Active")

  if (staffError) {
    throw new Error(`Reading the staff roster for "${program}" failed: ${staffError.message}`)
  }

  const staff = (staffData ?? []) as StaffRow[]
  const profileFlags = new Map<string, boolean>()

  if (staff.length > 0) {
    const { data: profileData, error: profileError } = await client
      .from("dialer_callers")
      .select("user_id,is_active")
      .eq("program_id", program)
      .in(
        "user_id",
        staff.map((person) => person.id),
      )

    if (profileError) {
      throw new Error(`Reading the caller profiles for "${program}" failed: ${profileError.message}`)
    }

    for (const row of (profileData ?? []) as Array<{ user_id: string; is_active: boolean }>) {
      profileFlags.set(row.user_id, row.is_active)
    }
  }

  return { staff, profileFlags }
}

/** The roster's own subtitle shape, from the returned rows' facts. */
function subtitleFor(roster: ProgramRoster): string {
  const active = roster.staff.filter((person) => roster.profileFlags.get(person.id) === true).length
  const inactive = roster.staff.filter((person) => roster.profileFlags.get(person.id) === false).length

  return `${active} active · ${inactive} inactive · folk programme`
}

function requireStaff(roster: ProgramRoster, email: string): StaffRow {
  const person = roster.staff.find((row) => row.email.trim().toLowerCase() === email.trim().toLowerCase())

  if (!person) {
    throw new Error(`No active staff row for ${email}. Run \`pnpm seed:local\` first.`)
  }

  return person
}

/**
 * Give `email` an active dialer caller profile, and return the values this spec
 * needs plus the function that puts the table back the way it was found.
 *
 * A row that already exists is activated and then restored to its own values; a
 * row this spec creates is deleted. Either way a failed run cannot hand the next
 * run a caller profile it did not make.
 */
async function provisionActiveCaller(email: string): Promise<{
  callerId: string
  name: string
  restore: () => Promise<void>
}> {
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

  const staff = staffData as Pick<StaffRow, "id" | "name"> | null
  if (!staff) {
    throw new Error(`No staff row for ${staffEmail} in program "${program}". Run \`pnpm seed:local\` first.`)
  }

  const name = staffName({ name: staff.name, email: staffEmail })

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

    return {
      callerId: existing.id,
      name,
      restore: async () => {
        const { error } = await client
          .from("dialer_callers")
          .update({ is_active: existing.is_active, display_name: existing.display_name })
          .eq("id", existing.id)

        if (error) {
          throw new Error(`Restoring the dialer caller profile for ${staffEmail} failed: ${error.message}`)
        }
      },
    }
  }

  const { data: createdData, error: insertError } = await client
    .from("dialer_callers")
    .insert({
      program_id: program,
      user_id: staff.id,
      display_name: name,
      is_active: true,
    })
    .select("id")
    .single()

  if (insertError) {
    throw new Error(`Creating the dialer caller profile for ${staffEmail} failed: ${insertError.message}`)
  }

  const createdId = (createdData as { id: string }).id

  return {
    callerId: createdId,
    name,
    restore: async () => {
      await deleteCallerRow(createdId)
    },
  }
}

/**
 * The roster row for one person.
 *
 * Scoped by the Caller cell, not by the person's name anywhere in the row: the
 * action buttons and the status pill carry no name, so `filter({ hasText })`
 * would match the whole table's accessible text on some engines.
 */
function callerRow(page: Page, name: string) {
  return page.getByRole("row").filter({ has: page.getByRole("cell", { name, exact: true }) })
}

/** A status switch through the route the client toggle posts to, for a precondition. */
async function setCallerActiveViaApi(page: Page, callerId: string, isActive: boolean): Promise<void> {
  const response = await page.request.patch(`/api/dialer/admin/callers/${callerId}`, { data: { isActive } })

  expect(response.status(), `the caller status could not be set: ${await response.text()}`).toBe(200)
}

// ---------------------------------------------------------------------------
// The Admin roster
// ---------------------------------------------------------------------------

test.describe("the Callers roster — an Admin", () => {
  test.use({ storageState: storageStatePath("admin") })

  test("lists the programme's staff with the rows' own counts and no invite control", async ({ page }) => {
    const fixture = await provisionActiveCaller(fixtureEmail("volunteer"))

    try {
      const roster = await readProgramRoster()
      expect(roster.staff.length).toBeGreaterThan(0)

      await page.goto("/campaigns/callers")

      await expect(page).toHaveURL(/\/campaigns\/callers$/)
      await expect(page.getByRole("heading", { name: "Callers", level: 1 })).toBeVisible()
      await expect(page.getByText(subtitleFor(roster), { exact: true })).toBeVisible()

      for (const person of roster.staff) {
        await expect(page.getByRole("cell", { name: staffName(person), exact: true })).toHaveCount(1)
      }

      // One header row plus one row per active staff user. A caller profile never
      // adds a second row for the same person.
      await expect(page.getByRole("table").getByRole("row")).toHaveCount(roster.staff.length + 1)

      await expect(page.getByRole("columnheader", { name: "Caller", exact: true })).toBeVisible()
      await expect(page.getByRole("columnheader", { name: "Status", exact: true })).toBeVisible()

      // Story 1.9 owns these four; this surface cannot compute them and must not
      // render them as a zero.
      for (const column of ["Contact", "Campaigns", "Calls made", "Reached"]) {
        await expect(page.getByRole("columnheader", { name: column, exact: true })).toHaveCount(0)
      }

      const fixtureRow = callerRow(page, fixture.name)
      await expect(fixtureRow.getByText("Active", { exact: true })).toBeVisible()
      await expect(fixtureRow.getByRole("button", { name: "Deactivate", exact: true })).toBeVisible()

      // A staff user with no profile is neither active nor inactive, and has no
      // switch to offer.
      const notCaller = roster.staff.find((person) => !roster.profileFlags.has(person.id))
      if (notCaller) {
        const row = callerRow(page, staffName(notCaller))
        await expect(row.getByText("Not a caller", { exact: true })).toBeVisible()
        await expect(row.getByRole("button", { name: "Deactivate", exact: true })).toHaveCount(0)
        await expect(row.getByRole("button", { name: "Reactivate", exact: true })).toHaveCount(0)
      }

      // UX-DR32: the design's two header buttons were removed on purpose, and no
      // add/invite/manage-user control replaced them. Scoped to `main`, because
      // the app header legitimately carries the core staff Invite nav item.
      const main = page.getByRole("main")
      await expect(main.getByRole("link", { name: "Import roster", exact: true })).toHaveCount(0)
      await expect(main.getByRole("button", { name: "Import roster", exact: true })).toHaveCount(0)
      await expect(main.getByRole("button", { name: "Invite caller", exact: true })).toHaveCount(0)
      await expect(main.getByRole("link", { name: "Invite caller", exact: true })).toHaveCount(0)
      await expect(main.getByRole("link", { name: "Invite", exact: true })).toHaveCount(0)
      await expect(main.getByRole("button", { name: /^(Invite|Import|Add)/ })).toHaveCount(0)
    } finally {
      await fixture.restore()
    }
  })
})

// ---------------------------------------------------------------------------
// The Admin's status switch
// ---------------------------------------------------------------------------

test.describe("the Callers roster — an Admin deactivating a caller", () => {
  test.use({ storageState: storageStatePath("admin") })

  test("asks first, then keeps the row as Inactive and offers Reactivate", async ({ page }) => {
    const fixture = await provisionActiveCaller(fixtureEmail("volunteer"))

    try {
      await page.goto("/campaigns/callers")

      const row = callerRow(page, fixture.name)
      await expect(row.getByText("Active", { exact: true })).toBeVisible()

      await row.getByRole("button", { name: "Deactivate", exact: true }).click()

      const dialog = page.getByRole("alertdialog")
      await expect(dialog).toBeVisible()
      await expect(dialog.getByText(`Deactivate ${fixture.name}?`, { exact: true })).toBeVisible()
      await dialog.getByRole("button", { name: "Deactivate caller", exact: true }).click()

      await expect(row.getByText("Inactive", { exact: true })).toBeVisible()
      await expect(row.getByRole("button", { name: "Reactivate", exact: true })).toBeVisible()
      await expect(row.getByRole("button", { name: "Deactivate", exact: true })).toHaveCount(0)

      // The subtitle is recomputed from the refreshed rows, not left at the
      // counts the page was first rendered with.
      const roster = await readProgramRoster()
      const volunteer = requireStaff(roster, fixtureEmail("volunteer"))
      expect(roster.profileFlags.get(volunteer.id)).toBe(false)
      await expect(page.getByText(subtitleFor(roster), { exact: true })).toBeVisible()

      await page.reload()

      const reloaded = callerRow(page, fixture.name)
      await expect(reloaded.getByText("Inactive", { exact: true })).toBeVisible()
      await expect(reloaded.getByRole("button", { name: "Reactivate", exact: true })).toBeVisible()
    } finally {
      await fixture.restore()
    }
  })
})

test.describe("the Callers roster — an Admin reactivating a caller", () => {
  test.use({ storageState: storageStatePath("admin") })

  test("returns a deactivated row to Active", async ({ page }) => {
    const fixture = await provisionActiveCaller(fixtureEmail("volunteer"))

    try {
      await setCallerActiveViaApi(page, fixture.callerId, false)

      await page.goto("/campaigns/callers")

      const row = callerRow(page, fixture.name)
      await expect(row.getByText("Inactive", { exact: true })).toBeVisible()

      await row.getByRole("button", { name: "Reactivate", exact: true }).click()

      await expect(row.getByText("Active", { exact: true })).toBeVisible()
      await expect(row.getByRole("button", { name: "Deactivate", exact: true })).toBeVisible()

      await page.reload()

      const reloaded = callerRow(page, fixture.name)
      await expect(reloaded.getByText("Active", { exact: true })).toBeVisible()
    } finally {
      await fixture.restore()
    }
  })
})

// ---------------------------------------------------------------------------
// The Preacher's scope
// ---------------------------------------------------------------------------

test.describe("the Callers roster — a Preacher", () => {
  test.use({ storageState: storageStatePath("preacher") })

  test("lists their own row and assignees only, with no status control", async ({ page }) => {
    const fixture = await provisionActiveCaller(fixtureEmail("volunteer"))

    try {
      const roster = await readProgramRoster()
      const preacher = requireStaff(roster, fixtureEmail("preacher"))
      const admin = requireStaff(roster, fixtureEmail("admin"))
      const volunteer = requireStaff(roster, fixtureEmail("volunteer"))
      const assistant = requireStaff(roster, fixtureEmail("assistant"))

      await page.goto("/campaigns/callers")

      await expect(page).toHaveURL(/\/campaigns\/callers$/)
      await expect(page.getByRole("heading", { name: "Callers", level: 1 })).toBeVisible()

      for (const person of [preacher, volunteer, assistant]) {
        await expect(page.getByRole("cell", { name: staffName(person), exact: true })).toHaveCount(1)
      }

      // The Admin is another preacher's scope, and neither a Preacher nor their
      // assignees may see that row.
      await expect(page.getByRole("cell", { name: staffName(admin), exact: true })).toHaveCount(0)

      const main = page.getByRole("main")
      await expect(main.getByRole("button", { name: "Deactivate", exact: true })).toHaveCount(0)
      await expect(main.getByRole("button", { name: "Reactivate", exact: true })).toHaveCount(0)
    } finally {
      await fixture.restore()
    }
  })
})

// ---------------------------------------------------------------------------
// The refusal
// ---------------------------------------------------------------------------

test.describe("the Callers roster — a Volunteer", () => {
  test.use({ storageState: storageStatePath("volunteer") })

  test("is refused before the roster is read", async ({ page }) => {
    await page.goto("/campaigns/callers")

    await expect(page).toHaveURL(/\/auth\/error\?code=staff-authorization-failed/)
    await expect(page.getByRole("heading", { name: "Callers", level: 1 })).toHaveCount(0)
    await expect(page.getByRole("table")).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Deactivate", exact: true })).toHaveCount(0)
  })
})
