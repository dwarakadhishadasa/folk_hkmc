/**
 * Sessions CAP-3 — the session detail and the attendee's contact record.
 *
 * Two sessions and two contacts: Zulu attended both (a returner whose first
 * session is the older one), Alpha attended only the current session (a
 * first-timer). That gives every figure on the screen a distinct value, and it
 * makes the phone's name sort observable — attendance order is Zulu then Alpha,
 * name order is Alpha then Zulu.
 *
 * The premium record is now the in-scope attendee's destination: an Admin's
 * contact RLS is programme-wide, so both attendees open it. The existing
 * read-only summary is the **out-of-patch fallback**, proved by a Preacher-owned
 * session whose only attendee is Admin-assigned: the Preacher can see the
 * session, but not the contact, so `recordAvailable` is false and the summary
 * opens unchanged.
 *
 * A foreign session is created in the other programme; the Admin who owns this
 * one must still get a 404. The seed's out-of-scope session is not used because
 * an Admin sees it, so it cannot prove the scope boundary.
 */

import { expect, test } from "@playwright/test"

import {
  addAttendanceFixture,
  createContactFixture,
  createOutOfPatchSessionFixture,
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
  fallback: `${tag} Fallback Session`,
  comment: `${tag} Comment Session`,
}

const ABSENT_CONTACT_ID = "00000000-0000-4000-8000-000000000000"

let admin: FixtureStaff
let preacher: FixtureStaff
let preacherName: string
let zulu: FixtureContact
let alpha: FixtureContact
let fallbackContact: FixtureContact
let commentContact: FixtureContact
let previous: FixtureSession
let current: FixtureSession
let foreign: FixtureSession
let fallbackSession: FixtureSession
let commentSession: FixtureSession
let locations: FixtureLocation[]

test.beforeAll(async () => {
  const client = sessionsFixtureClient()
  admin = await readFixtureStaff(client, "admin")
  preacher = await readFixtureStaff(client, "preacher")
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
  // The out-of-patch fixture: Admin-assigned, so the Preacher who owns the
  // session below can see the attendee row but not the contact record.
  const fallback = await createOutOfPatchSessionFixture(client, {
    name: `${tag} Fallback Attendee`,
    phone: "9100000003",
    sessionName: names.fallback,
    sessionDate: programDateToday(),
    opensAt: isoDaysFromNow(-1),
    closesAt: isoDaysFromNow(-0.5),
    locationId: locations[0]!.id,
    adminId: admin.id,
    preacherId: preacher.id,
  })
  fallbackContact = fallback.contact
  fallbackSession = fallback.session

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

  // The Preacher's own in-patch record, isolated from zulu's attendance history
  // so the session-detail totals stay unchanged.
  commentContact = await createContactFixture(client, {
    name: `${tag} Comment Attendee`,
    phone: "9100000004",
    locationId: locations[0]!.id,
    assignedPreacherId: preacher.id,
  })
  commentSession = await createSessionFixture(client, {
    name: names.comment,
    sessionDate,
    opensAt: isoDaysFromNow(-1),
    closesAt: isoDaysFromNow(-0.5),
    locationId: locations[0]!.id,
    preacherId: preacher.id,
    createdBy: preacher.id,
  })
  await addAttendanceFixture(client, {
    sessionId: commentSession.id,
    contact: commentContact,
    createdAt: isoDaysFromNow(-0.9),
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
  await deleteSessionFixtures(client, [
    previous.id,
    current.id,
    foreign.id,
    fallbackSession.id,
    commentSession.id,
  ])
  await deleteContactFixtures(client, [zulu.id, alpha.id, fallbackContact.id, commentContact.id])
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

  test("opens the premium contact record for an in-scope attendee", async ({ page }) => {
    await page.goto(`/sessions/${current.id}`)

    await page.getByRole("button", { name: `View ${zulu.name}` }).click()

    const dialog = page.locator("[data-contact-record-dialog]")
    await expect(dialog).toBeVisible()

    // The frame is centred under the header on every surface; the old
    // left-anchored frame is the regression this guards.
    const box = await dialog.boundingBox()
    const viewport = page.viewportSize()
    expect(box).not.toBeNull()
    expect(viewport).not.toBeNull()
    expect(
      Math.abs(box!.x + box!.width / 2 - viewport!.width / 2),
      "the record frame is centred horizontally",
    ).toBeLessThanOrEqual(1)

    await expect(dialog.getByRole("heading", { name: "Attendance", level: 2 })).toBeVisible()
    await expect(dialog.getByRole("heading", { name: "Campaign history", level: 2 })).toBeVisible()
    await expect(dialog.getByLabel("Phone")).toHaveValue(zulu.phone)
    await expect(dialog).toContainText(preacherName)
    // The Admin can edit the programme contact but is outside its comments
    // patch: the pane says why, and the comments read was skipped.
    await expect(dialog.locator("[data-contact-comments-unavailable]")).toContainText(
      "Comments are not available.",
    )

    const attendance = dialog.locator("[data-contact-attendance]")
    await expect(attendance).toHaveCount(2)
    await expect(attendance.nth(0)).toHaveAttribute("data-contact-attendance", names.current)
    await expect(attendance.nth(1)).toHaveAttribute("data-contact-attendance", names.previous)

    // The premium record replaces the summary; it does not stack over it.
    await expect(page.locator("[data-attendance-history]")).toHaveCount(0)

    await page.getByRole("button", { name: "Close dialog" }).click()
    await expect(dialog).toBeHidden()
    // Focus returns to the row's trigger, which opened the record.
    await expect(page.getByRole("button", { name: `View ${zulu.name}` })).toBeFocused()
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

  test("uses attendee cards, sorts by name and opens the premium record", async ({ page }) => {
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

    const dialog = page.locator("[data-contact-record-phone]")
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole("heading", { name: "Attendance", level: 2 })).toBeVisible()
    await expect(dialog.getByRole("heading", { name: "Campaign history", level: 2 })).toBeVisible()

    const attendance = dialog.locator("[data-contact-attendance]")
    await expect(attendance).toHaveCount(1)
    await expect(attendance.first()).toHaveAttribute("data-contact-attendance", names.current)

    await expect(page.locator("[data-attendance-history]")).toHaveCount(0)

    await page.getByRole("button", { name: "Close", exact: true }).click()
    await expect(dialog).toBeHidden()
  })
})

test.describe("out-of-patch attendee", () => {
  test.use({ storageState: storageStatePath("preacher") })

  test("keeps the existing summary when the contact is outside the Preacher's patch", async ({
    page,
  }) => {
    await page.goto(`/sessions/${fallbackSession.id}`)

    await page.getByRole("button", { name: `View ${fallbackContact.name}` }).click()

    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole("heading", { name: fallbackContact.name, level: 2 })).toBeVisible()
    await expect(dialog.getByRole("heading", { name: "Contact details" })).toBeVisible()
    await expect(dialog.getByRole("heading", { name: "Attendance history" })).toBeVisible()

    // No premium record, and no premium-record request: the summary endpoint is
    // the one that served this row.
    await expect(page.locator("[data-contact-record-dialog]")).toHaveCount(0)
    await expect(page.locator("[data-contact-record-phone]")).toHaveCount(0)

    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
  })

  test("the record gateway refuses an out-of-patch contact with 403", async ({ request }) => {
    const response = await request.get(`/api/manage/contacts/${fallbackContact.id}/record`)

    expect(response.status()).toBe(403)
    expect(response.headers()["cache-control"]).toBe("no-store")
    const body = (await response.json()) as { error?: string }
    expect(body.error).toBeTruthy()
  })

  test("a Preacher can comment on their own contact's premium record", async ({ page }) => {
    const recordResponse = await page.request.get(`/api/manage/contacts/${commentContact.id}/record`)

    expect(recordResponse.status()).toBe(200)
    const payload = (await recordResponse.json()) as {
      capabilities: { canComment: boolean }
      comments: { comments: unknown[] } | null
    }
    expect(payload.capabilities.canComment).toBe(true)
    expect(payload.comments).not.toBeNull()

    await page.goto(`/sessions/${commentSession.id}`)
    await page.getByRole("button", { name: `View ${commentContact.name}` }).click()

    const dialog = page.locator("[data-contact-record-dialog]")
    await expect(dialog).toBeVisible()

    const body = `e2e comment ${Date.now()}`
    const composer = dialog.getByRole("textbox", { name: "Leave a comment" })
    await composer.fill(body)
    await composer.press("Enter")

    await expect(dialog.getByText(body)).toBeVisible()
  })
})

test.describe("record gateway", () => {
  test.use({ storageState: storageStatePath("admin") })

  test("returns the one payload with server-derived capabilities", async ({ request }) => {
    const response = await request.get(`/api/manage/contacts/${zulu.id}/record`)

    expect(response.status()).toBe(200)
    expect(response.headers()["cache-control"]).toBe("no-store")

    const payload = (await response.json()) as {
      contact: { id: string; name: string }
      locations: unknown[]
      locationOptions: unknown[]
      history: { attendance: unknown[] }
      comments: unknown
      capabilities: { canEdit: boolean; canComment: boolean }
    }

    expect(payload.contact.id).toBe(zulu.id)
    expect(payload.contact.name).toBe(zulu.name)
    expect(payload.history.attendance).toHaveLength(2)
    // The Admin can read every programme contact, but Zulu belongs to the
    // Preacher's patch: editable, not commentable, and the comments read is
    // skipped entirely rather than 403ing the record.
    expect(payload.capabilities).toEqual({ canEdit: true, canComment: false })
    expect(payload.comments).toBeNull()
    expect(payload.locations.length).toBeGreaterThan(0)
    expect(payload.locationOptions.length).toBeGreaterThan(0)
  })

  test("a malformed id is a 400 and an unknown id is a 404", async ({ request }) => {
    const malformed = await request.get("/api/manage/contacts/not-a-uuid/record")
    expect(malformed.status()).toBe(400)

    const unknown = await request.get(`/api/manage/contacts/${ABSENT_CONTACT_ID}/record`)
    expect(unknown.status()).toBe(404)
  })
})
