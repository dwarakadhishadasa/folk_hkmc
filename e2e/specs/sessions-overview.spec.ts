/**
 * Sessions CAP-1, CAP-2 and the Preacher scope widening.
 *
 * The seed holds one open session and one out-of-scope session, so this spec
 * owns the three derived statuses, an attendance total and the assistant-
 * created row a Preacher must see. Every row is disposable and removed in
 * `afterAll`; the status-flip row is removed in its own `finally` because it is
 * created inside the test that watches it expire.
 *
 * `SessionsAutoRefresh` calls `router.refresh()`, not `location.reload()`; the
 * flip test leaves a marker on `window` and asserts it survives, which is what
 * separates "the page re-rendered" from "the page reloaded".
 */

import { expect, test } from "@playwright/test"
import type { SupabaseClient } from "@supabase/supabase-js"

import {
  addAttendanceFixture,
  addDays,
  createContactFixture,
  createLocationFixture,
  createSessionFixture,
  deleteContactFixtures,
  deleteLocationFixture,
  deleteSessionFixtures,
  isoDaysFromNow,
  programDateToday,
  readFixtureLocations,
  readFixtureStaff,
  sessionRunTag,
  sessionsFixtureClient,
  type FixtureContact,
  type FixtureLocation,
  type FixtureStaff,
} from "../fixtures/sessions"
import { e2eProgramId, storageStatePath } from "../fixtures/roles"

const tag = sessionRunTag()
const names = {
  live: `${tag} Live`,
  completed: `${tag} Completed`,
  upcoming: `${tag} Upcoming`,
  foreign: `${tag} Foreign`,
}

/** The direct answer for the insight window: its attendance total and top four. */
async function directInsightCounts(
  client: SupabaseClient,
  fromDate: string,
  toDateInclusive: string,
): Promise<{ total: number; top: number[] }> {
  const fromTs = new Date(`${fromDate}T00:00:00+05:30`).getTime()
  const toTs = new Date(`${addDays(toDateInclusive, 1)}T00:00:00+05:30`).getTime()
  const programId = e2eProgramId()

  const sessions = await client
    .from("sessions")
    .select("id,attendance_opens_at,session_date")
    .eq("program_id", programId)

  if (sessions.error) {
    throw new Error(`reading sessions for insight expectations: ${sessions.error.message}`)
  }

  const inRange = (sessions.data ?? []).filter((row) => {
    const start = row.attendance_opens_at
      ? Date.parse(row.attendance_opens_at as string)
      : Date.parse(`${row.session_date}T00:00:00+05:30`)
    return Number.isFinite(start) && start >= fromTs && start < toTs
  })
  const ids = new Set(inRange.map((row) => row.id as string))

  const attendance = await client
    .from("attendance")
    .select("session_id")
    .eq("program_id", programId)

  if (attendance.error) {
    throw new Error(`reading attendance for insight expectations: ${attendance.error.message}`)
  }

  const perSession = new Map<string, number>()
  for (const row of attendance.data ?? []) {
    const id = row.session_id as string
    if (ids.has(id)) {
      perSession.set(id, (perSession.get(id) ?? 0) + 1)
    }
  }

  const counts = [...perSession.values()].filter((count) => count > 0).sort((left, right) => right - left)
  const total = counts.reduce((sum, count) => sum + count, 0)

  return { total, top: counts.slice(0, 4) }
}

test.describe("sessions overview", () => {
  test.use({ storageState: storageStatePath("admin") })

  let admin: FixtureStaff
  let locations: FixtureLocation[]
  let emptyLocation: FixtureLocation
  let contacts: FixtureContact[]
  let sessionIds: string[] = []
  let liveId = ""

  test.beforeAll(async () => {
    const client = sessionsFixtureClient()
    admin = await readFixtureStaff(client, "admin")
    locations = await readFixtureLocations(client)
    emptyLocation = await createLocationFixture(client, `${tag} Empty location`)

    contacts = [
      await createContactFixture(client, {
        name: `${tag} Contact One`,
        phone: `9${Date.now().toString().slice(-9)}`,
        locationId: locations[0]!.id,
        assignedPreacherId: admin.id,
      }),
      await createContactFixture(client, {
        name: `${tag} Contact Two`,
        phone: `8${Date.now().toString().slice(-9)}`,
        locationId: locations[0]!.id,
        assignedPreacherId: admin.id,
      }),
    ]

    const sessionDate = programDateToday()
    const live = await createSessionFixture(client, {
      name: names.live,
      sessionDate,
      opensAt: isoDaysFromNow(-1 / 24),
      closesAt: isoDaysFromNow(1 / 24),
      locationId: locations[0]!.id,
      preacherId: admin.id,
      createdBy: admin.id,
    })
    const completed = await createSessionFixture(client, {
      name: names.completed,
      sessionDate,
      opensAt: isoDaysFromNow(-2),
      closesAt: isoDaysFromNow(-1),
      locationId: locations[0]!.id,
      preacherId: admin.id,
      createdBy: admin.id,
    })
    const upcoming = await createSessionFixture(client, {
      name: names.upcoming,
      sessionDate,
      opensAt: isoDaysFromNow(2),
      closesAt: isoDaysFromNow(3),
      locationId: locations[1]!.id,
      preacherId: admin.id,
      createdBy: admin.id,
    })

    sessionIds = [live.id, completed.id, upcoming.id]
    liveId = live.id

    await addAttendanceFixture(client, { sessionId: live.id, contact: contacts[0]! })
    await addAttendanceFixture(client, { sessionId: live.id, contact: contacts[1]! })
  })

  test.afterAll(async () => {
    const client = sessionsFixtureClient()
    await deleteSessionFixtures(client, sessionIds)
    await deleteContactFixtures(client, contacts.map((contact) => contact.id))
    await deleteLocationFixture(client, emptyLocation.id)
  })

  test("lists the name, date, location, attendance total and derived status", async ({ page }) => {
    await page.goto("/sessions")

    await expect(page.getByRole("heading", { name: "Sessions", level: 1 })).toBeVisible()

    const live = page.locator(`[data-session-row="${names.live}"]`)
    await expect(live).toBeVisible()
    await expect(live).toHaveAttribute("data-session-status", "Live now")
    await expect(live).toHaveAttribute("data-session-attendance", "2")
    await expect(live).toContainText(locations[0]!.name)

    await expect(page.locator(`[data-session-row="${names.completed}"]`)).toHaveAttribute(
      "data-session-status",
      "Completed",
    )
    await expect(page.locator(`[data-session-row="${names.upcoming}"]`)).toHaveAttribute(
      "data-session-status",
      "Upcoming",
    )
  })

  test("opens a live session on its attendance dashboard", async ({ page }) => {
    await page.goto("/sessions")

    await page
      .locator(`[data-session-row="${names.live}"]`)
      .getByRole("link", { name: `Open live ${names.live}` })
      .click()

    await expect(page).toHaveURL(new RegExp(`/sessions/${liveId}/live$`))
    await expect(page.getByRole("heading", { name: "Live Attendance" })).toBeVisible()
    await expect(page.getByText(names.live).first()).toBeVisible()

    await page.goto(`/sessions/${liveId}`)
    await expect(page).toHaveURL(new RegExp(`/sessions/${liveId}/live$`))
    await expect(page.getByRole("heading", { name: "Live Attendance" })).toBeVisible()
  })

  test("creates a session and lands on its live dashboard", async ({ page }) => {
    const client = sessionsFixtureClient()
    const createdName = `${tag} Created`

    try {
      await page.goto("/sessions")

      await page.getByRole("button", { name: "New session" }).first().click()
      await expect(page.getByRole("heading", { name: "New session" })).toBeVisible()

      await page.getByLabel("Session name").fill(createdName)
      const picker = page.getByLabel("Location", { exact: true })
      const pickerValues = await picker
        .locator("option")
        .evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptionElement).value))
      expect(new Set(pickerValues)).toEqual(new Set(admin.locationIds))
      await picker.selectOption(admin.locationIds[0]!)
      await page.getByRole("button", { name: "Start session" }).click()

      await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]+\/live$/)
      await expect(page.getByRole("heading", { name: "Live Attendance" })).toBeVisible()
      await expect(page.getByText(createdName).first()).toBeVisible()
    } finally {
      const created = await client.from("sessions").select("id").eq("name", createdName)
      if (created.data && created.data.length > 0) {
        await deleteSessionFixtures(
          client,
          created.data.map((row) => row.id as string),
        )
      }
    }
  })

  test("moves the 90-day insight charts onto the overview and matches attendance", async ({ page }) => {
    const client = sessionsFixtureClient()
    const today = programDateToday()
    const expected = await directInsightCounts(client, addDays(today, -89), today)

    await page.goto("/sessions")

    const insights = page.locator('[data-session-report-surface="dashboard"]')
    await expect(insights).toBeVisible()

    const weeks = insights.locator("[data-report-week-count]")
    await expect(weeks.first()).toBeAttached()
    const weeklyTotal = (
      await weeks.evaluateAll((nodes) =>
        nodes.map((node) => Number(node.getAttribute("data-report-week-count"))),
      )
    ).reduce((sum, value) => sum + value, 0)
    expect(weeklyTotal).toBe(expected.total)

    const counts = await insights
      .locator("[data-report-session-count]")
      .evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute("data-report-session-count"))))
    expect(counts).toEqual(expected.top)
  })

  test("narrows the list by location on desktop", async ({ page }) => {
    await page.goto("/sessions")

    await page.getByLabel("Filter sessions by location").selectOption(locations[1]!.id)

    await expect(page).toHaveURL(new RegExp(`location=${locations[1]!.id}`))
    await expect(page.locator(`[data-session-row="${names.upcoming}"]`)).toBeVisible()
    await expect(page.locator(`[data-session-row="${names.live}"]`)).toHaveCount(0)
    await expect(page.locator(`[data-session-row="${names.completed}"]`)).toHaveCount(0)
  })

  test("renders the empty state for a location with no sessions", async ({ page }) => {
    await page.goto(`/sessions?location=${emptyLocation.id}`)

    await expect(page.getByText("No sessions at this location")).toBeVisible()
    await expect(page.getByRole("heading", { name: "Sessions", level: 1 })).toBeVisible()
  })

  test("flips Live now to Completed across attendance_closes_at without a reload", async ({ page }) => {
    const client = sessionsFixtureClient()
    const closing = await createSessionFixture(client, {
      name: `${tag} Closing`,
      sessionDate: programDateToday(),
      opensAt: isoDaysFromNow(-1 / 24),
      closesAt: isoDaysFromNow(12 / (24 * 60 * 60)),
      locationId: locations[0]!.id,
      preacherId: admin.id,
      createdBy: admin.id,
    })

    try {
      await page.goto("/sessions")

      const row = page.locator(`[data-session-row="${closing.name}"]`)
      await expect(row).toHaveAttribute("data-session-status", "Live now")

      await page.evaluate(() => {
        ;(window as unknown as { __sessionsMarker?: string }).__sessionsMarker = "kept"
      })

      await expect(row).toHaveAttribute("data-session-status", "Completed", { timeout: 30_000 })

      const marker = await page.evaluate(
        () => (window as unknown as { __sessionsMarker?: string }).__sessionsMarker,
      )
      expect(marker).toBe("kept")
    } finally {
      await deleteSessionFixtures(client, [closing.id])
    }
  })
})

test.describe("sessions overview on a phone", () => {
  test.use({ storageState: storageStatePath("admin"), viewport: { width: 390, height: 844 } })

  test("uses cards and carries no location filter", async ({ page }) => {
    await page.goto("/sessions")

    await expect(page.getByLabel("Filter sessions by location")).toBeHidden()
    await expect(page.getByRole("region", { name: /recent and upcoming sessions/i })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Sessions", level: 1 })).toBeVisible()
  })
})

test.describe("sessions scope for a preacher", () => {
  test.use({ storageState: storageStatePath("preacher") })

  let assistant: FixtureStaff
  let admin: FixtureStaff
  let locations: FixtureLocation[]
  let assistantCreated: { id: string; name: string }
  let foreign: { id: string; name: string }

  test.beforeAll(async () => {
    const client = sessionsFixtureClient()
    assistant = await readFixtureStaff(client, "assistant")
    admin = await readFixtureStaff(client, "admin")
    locations = await readFixtureLocations(client)

    const sessionDate = programDateToday()
    assistantCreated = await createSessionFixture(client, {
      name: `${tag} Assistant created`,
      sessionDate,
      opensAt: isoDaysFromNow(-1 / 24),
      closesAt: isoDaysFromNow(1 / 24),
      locationId: locations[0]!.id,
      preacherId: null,
      createdBy: assistant.id,
    })
    foreign = await createSessionFixture(client, {
      name: names.foreign,
      sessionDate,
      opensAt: isoDaysFromNow(4),
      closesAt: isoDaysFromNow(5),
      locationId: locations[0]!.id,
      preacherId: admin.id,
      createdBy: admin.id,
    })
  })

  test.afterAll(async () => {
    const client = sessionsFixtureClient()
    await deleteSessionFixtures(client, [assistantCreated.id, foreign.id])
  })

  test("sees a session their assigned assistant created", async ({ page }) => {
    await page.goto("/sessions")

    await expect(page.locator(`[data-session-row="${assistantCreated.name}"]`)).toBeVisible()
  })

  test("opens the assistant-created session's live dashboard", async ({ page }) => {
    await page.goto("/sessions")

    const attendance = page.waitForResponse(
      (response) =>
        response.url().includes("/attendance?session=") && response.request().method() === "GET",
    )

    await page
      .locator(`[data-session-row="${assistantCreated.name}"]`)
      .getByRole("link", { name: `Open live ${assistantCreated.name}` })
      .click()

    await expect(page).toHaveURL(new RegExp(`/sessions/${assistantCreated.id}/live$`))
    await expect(page.getByRole("heading", { name: "Live Attendance" })).toBeVisible()
    expect((await attendance).status()).toBe(200)
  })

  test("does not see a session outside their scope", async ({ page }) => {
    await page.goto("/sessions")

    await expect(page.locator(`[data-session-row="${foreign.name}"]`)).toHaveCount(0)
    await expect(page.locator(`[data-session-row="${assistantCreated.name}"]`)).toBeVisible()
  })
})
