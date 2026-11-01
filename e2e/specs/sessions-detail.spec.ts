/**
 * Sessions CAP-3 — the session detail and the attendee's contact record.
 *
 * Two sessions and two contacts: Zulu attended both (a returner whose first
 * session is the older one), Alpha attended only the current session (a
 * first-timer). That gives every figure on the screen a distinct value, and it
 * makes the phone's name sort observable — attendance order is Zulu then Alpha,
 * name order is Alpha then Zulu.
 *
 * A foreign session is created in the other programme; the Admin who owns this
 * one must still get a 404. The seed's out-of-scope session is not used because
 * an Admin sees it, so it cannot prove the scope boundary.
 */

import { expect, test } from "@playwright/test"

import {
  addAttendanceFixture,
  createContactFixture,
  createSessionFixture,
  deleteContactFixtures,
  deleteSessionFixtures,
  isoDaysFromNow,
  programDateToday,
  readFixtureLocations,
  readFixtureStaff,
  sessionRunTag,
  sessionsFixtureClient,
  type FixtureContact,
  type FixtureLocation,
  type FixtureSession,
  type FixtureStaff,
} from "../fixtures/sessions"
import { storageStatePath } from "../fixtures/roles"

const tag = sessionRunTag()
const names = {
  previous: `${tag} Previous Session`,
  current: `${tag} Current Session`,
  foreign: `${tag} Foreign Session`,
}

let admin: FixtureStaff
let preacherName: string
let zulu: FixtureContact
let alpha: FixtureContact
let previous: FixtureSession
let current: FixtureSession
let foreign: FixtureSession
let locations: FixtureLocation[]

test.beforeAll(async () => {
  const client = sessionsFixtureClient()
  admin = await readFixtureStaff(client, "admin")
  const preacher = await readFixtureStaff(client, "preacher")
  preacherName = preacher.name ?? preacher.email
  locations = await readFixtureLocations(client)

  zulu = await createContactFixture(client, {
    name: `${tag} Zulu Attendee`,
    phone: "9100000001",
    locationId: locations[0]!.id,
    assignedPreacherId: preacher.id,
  })
  alpha = await createContactFixture(client, {
    name: `${tag} Alpha Attendee`,
    phone: "9100000002",
    locationId: locations[0]!.id,
    assignedPreacherId: preacher.id,
  })

  const sessionDate = programDateToday()
  previous = await createSessionFixture(client, {
    name: names.previous,
    sessionDate,
    opensAt: isoDaysFromNow(-30),
    closesAt: isoDaysFromNow(-29),
    locationId: locations[0]!.id,
    preacherId: admin.id,
    createdBy: admin.id,
  })
  current = await createSessionFixture(client, {
    name: names.current,
    sessionDate,
    opensAt: isoDaysFromNow(-1),
    closesAt: isoDaysFromNow(-0.5),
    locationId: locations[0]!.id,
    preacherId: admin.id,
    createdBy: admin.id,
  })
  // A different programme: the folk Admin's scope predicate must not find it.
  foreign = await createSessionFixture(client, {
    name: names.foreign,
    sessionDate,
    opensAt: isoDaysFromNow(-1),
    closesAt: isoDaysFromNow(-0.5),
    preacherId: null,
    createdBy: admin.id,
    programId: "gita-life",
  })

  await addAttendanceFixture(client, {
    sessionId: previous.id,
    contact: zulu,
    createdAt: isoDaysFromNow(-30),
  })
  await addAttendanceFixture(client, {
    sessionId: current.id,
    contact: zulu,
    createdAt: isoDaysFromNow(-1),
  })
  await addAttendanceFixture(client, {
    sessionId: current.id,
    contact: alpha,
    createdAt: isoDaysFromNow(-0.9),
  })
})

test.afterAll(async () => {
  const client = sessionsFixtureClient()
  await deleteSessionFixtures(client, [previous.id, current.id, foreign.id])
  await deleteContactFixtures(client, [zulu.id, alpha.id])
})

test.describe("session detail", () => {
  test.use({ storageState: storageStatePath("admin") })

  test("lists attendees with their totals and first session", async ({ page }) => {
    await page.goto(`/sessions/${current.id}`)

    await expect(page.getByRole("heading", { name: names.current, level: 1 })).toBeVisible()
    await expect(page.getByRole("link", { name: "All sessions" })).toBeVisible()
    await expect(page.locator("[data-session-status-pill]")).toHaveAttribute(
      "data-session-status-pill",
      "Completed",
    )
    await expect(page.getByText(`${locations[0]!.name}`).first()).toBeVisible()

    await expect(
      page.locator('[data-session-detail-stat="Attended"] [data-session-detail-stat-value]'),
    ).toHaveText("2")
    await expect(
      page.locator('[data-session-detail-stat="First-timers"] [data-session-detail-stat-value]'),
    ).toHaveText("1")
    await expect(
      page.locator('[data-session-detail-stat="Returning"] [data-session-detail-stat-value]'),
    ).toHaveText("1")

    const zuluRow = page.locator(`[data-session-attendee="${zulu.name}"]`)
    await expect(zuluRow).toBeVisible()
    await expect(zuluRow).toContainText(zulu.phone)
    await expect(zuluRow).toContainText(locations[0]!.name)

    const alphaRow = page.locator(`[data-session-attendee="${alpha.name}"]`)
    await expect(alphaRow).toBeVisible()
    await expect(alphaRow).toContainText(alpha.phone)

    await expect(page.getByText("Tap an attendee for their complete contact record.")).toBeHidden()
  })

  test("opens the full contact record in a modal with its attended history", async ({ page }) => {
    await page.goto(`/sessions/${current.id}`)

    await page.getByRole("button", { name: `View ${zulu.name}` }).click()

    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole("heading", { name: zulu.name, level: 2 })).toBeVisible()

    await expect(dialog).toContainText(zulu.phone)
    await expect(dialog).toContainText(preacherName)
    await expect(dialog).toContainText("14 Sep 2025")

    for (const label of [
      "Location",
      "Assigned preacher",
      "First contact",
      "Last contacted",
      "Sessions attended",
      "Past 60 days",
      "Last attended",
      "Collected by",
      "Favorite",
      "Notes",
    ]) {
      await expect(dialog.getByText(label, { exact: true })).toBeVisible()
    }

    const history = dialog.locator("[data-attendance-history]")
    await expect(history).toHaveCount(2)
    await expect(history.nth(0)).toHaveAttribute("data-attendance-history", names.current)
    await expect(history.nth(1)).toHaveAttribute("data-attendance-history", names.previous)
    await expect(dialog.getByText("Attended").first()).toBeVisible()

    await expect(dialog.getByText("Email")).toHaveCount(0)
    await expect(dialog.getByRole("button", { name: /call|message|open contact/i })).toHaveCount(0)
    await expect(page.getByRole("button", { name: /export/i })).toHaveCount(0)

    await page.getByRole("button", { name: "Close" }).click()
    await expect(dialog).toBeHidden()
  })

  test("answers a foreign session and a malformed id with 404", async ({ page }) => {
    const foreignResponse = await page.goto(`/sessions/${foreign.id}`)
    expect(foreignResponse?.status()).toBe(404)

    const malformedResponse = await page.goto("/sessions/not-a-uuid")
    expect(malformedResponse?.status()).toBe(404)
  })
})

test.describe("session detail on a phone", () => {
  test.use({ storageState: storageStatePath("admin"), viewport: { width: 390, height: 844 } })

  test("uses attendee cards, sorts by name and opens the contact modal", async ({ page }) => {
    await page.goto(`/sessions/${current.id}`)

    await expect(page.locator(`[data-session-attendee="${zulu.name}"]`)).toBeHidden()
    await expect(page.locator(`[data-session-attendee-card="${zulu.name}"]`)).toBeVisible()
    await expect(page.locator('main a[href="/sessions"]')).toBeVisible()

    const cards = page.locator("[data-session-attendee-card]")
    await expect(cards).toHaveCount(2)
    await expect(cards.nth(0)).toHaveAttribute("data-session-attendee-card", zulu.name)

    await page.getByLabel("Sort attendees").selectOption("name")
    await expect(page).toHaveURL(/sort=name/)
    await expect(page.locator("[data-session-attendee-card]").nth(0)).toHaveAttribute(
      "data-session-attendee-card",
      alpha.name,
    )

    await page.locator(`[data-session-attendee-card="${alpha.name}"]`).click()

    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole("heading", { name: alpha.name, level: 2 })).toBeVisible()
    await expect(dialog.getByRole("heading", { name: "Contact details" })).toBeVisible()
    await expect(dialog.getByRole("heading", { name: "Attendance history" })).toBeVisible()

    const history = dialog.locator("[data-attendance-history]")
    await expect(history).toHaveCount(1)
    await expect(history.first()).toHaveAttribute("data-attendance-history", names.current)

    await expect(dialog.getByText("Email")).toHaveCount(0)
    await expect(dialog.getByRole("button", { name: /call|message|open contact/i })).toHaveCount(0)

    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
  })
})
