/**
 * Admin-supervised Assistants — `SPEC-admin-assistants`.
 *
 * The fixture owns two disposable contacts, two disposable sessions and one
 * attendance row per patch, so "the Assistant sees the Admin's rows and not the
 * Preacher's" is a statement about rows this spec created rather than about the
 * seed's own counts. The seeded Assistant's binding is moved between the Admin,
 * the Preacher and `null` and restored in `afterAll`; the assistant's stored
 * session is unaffected because `getStaffContext()` re-reads `public.users` on
 * every request.
 */

import { test, expect, type Page } from "@playwright/test"

import { serviceRoleClient } from "../fixtures/dialer-caller"
import { filterGlobally, openContactsGrid } from "../fixtures/manage-grid"
import { storageStatePath } from "../fixtures/roles"
import {
  programDateToday,
  readFixtureLocations,
  readFixtureStaff,
  type FixtureStaff,
} from "../fixtures/sessions"

const TAG = `e2e-admin-assistants-${Date.now()}`
const INVITE_EMAIL = `${TAG}@example.com`

const client = serviceRoleClient()
const today = programDateToday()

let adminStaff: FixtureStaff
let preacherStaff: FixtureStaff
let assistantStaff: FixtureStaff
let originalSupervisor: string | null = null

let adminContactId: string
let preacherContactId: string
let adminSessionId: string
let preacherSessionId: string
let adminAttendanceId: string
let preacherAttendanceId: string

const adminContactName = `${TAG} admin contact`
const preacherContactName = `${TAG} preacher contact`
const adminSessionName = `${TAG} admin session`
const preacherSessionName = `${TAG} preacher session`
const adminAttendeeName = `${TAG} admin attendee`
const preacherAttendeeName = `${TAG} preacher attendee`

function programId(): string {
  return process.env.E2E_PROGRAM_ID ?? "folk"
}

async function setAssistantSupervisor(supervisorId: string | null): Promise<void> {
  const { error } = await client
    .from("users")
    .update({ assigned_preacher_id: supervisorId })
    .eq("id", assistantStaff.id)

  if (error) {
    throw new Error(`setting the Assistant's assigned Preacher failed: ${error.message}`)
  }
}

async function openAs(page: Page, path: string): Promise<void> {
  await page.goto(path)
  await expect(page).not.toHaveURL(/\/auth\/error/)
}

test.describe.configure({ mode: "serial" })

test.beforeAll(async () => {
  adminStaff = await readFixtureStaff(client, "admin")
  preacherStaff = await readFixtureStaff(client, "preacher")
  assistantStaff = await readFixtureStaff(client, "assistant")
  originalSupervisor = assistantStaff.assignedPreacherId

  const locations = await readFixtureLocations(client)
  const adminLocationId = adminStaff.locationIds[0] ?? locations[0]!.id
  const preacherLocationId = preacherStaff.locationIds[0] ?? locations[0]!.id

  const phoneSuffix = String(Date.now()).slice(-8)

  const { data: adminContact, error: adminContactError } = await client
    .from("contacts")
    .insert({
      program_id: programId(),
      name: adminContactName,
      phone: `9${phoneSuffix}1`.slice(0, 10),
      assigned_preacher_id: adminStaff.id,
      collected_by_id: adminStaff.id,
      location_ids: [adminLocationId],
    })
    .select("id")
    .single()
  if (adminContactError || !adminContact) {
    throw new Error(`creating the Admin contact fixture failed: ${adminContactError?.message}`)
  }
  adminContactId = adminContact.id

  const { data: preacherContact, error: preacherContactError } = await client
    .from("contacts")
    .insert({
      program_id: programId(),
      name: preacherContactName,
      phone: `8${phoneSuffix}1`.slice(0, 10),
      assigned_preacher_id: preacherStaff.id,
      collected_by_id: preacherStaff.id,
      location_ids: [preacherLocationId],
    })
    .select("id")
    .single()
  if (preacherContactError || !preacherContact) {
    throw new Error(`creating the Preacher contact fixture failed: ${preacherContactError?.message}`)
  }
  preacherContactId = preacherContact.id

  const { data: adminSession, error: adminSessionError } = await client
    .from("sessions")
    .insert({
      program_id: programId(),
      name: adminSessionName,
      session_date: today,
      location_id: adminLocationId,
      preacher_id: adminStaff.id,
      created_by: adminStaff.id,
    })
    .select("id")
    .single()
  if (adminSessionError || !adminSession) {
    throw new Error(`creating the Admin session fixture failed: ${adminSessionError?.message}`)
  }
  adminSessionId = adminSession.id

  const { data: preacherSession, error: preacherSessionError } = await client
    .from("sessions")
    .insert({
      program_id: programId(),
      name: preacherSessionName,
      session_date: today,
      location_id: preacherLocationId,
      preacher_id: preacherStaff.id,
      created_by: preacherStaff.id,
    })
    .select("id")
    .single()
  if (preacherSessionError || !preacherSession) {
    throw new Error(`creating the Preacher session fixture failed: ${preacherSessionError?.message}`)
  }
  preacherSessionId = preacherSession.id

  const { data: adminAttendance, error: adminAttendanceError } = await client
    .from("attendance")
    .insert({
      program_id: programId(),
      contact_id: adminContactId,
      session_id: adminSessionId,
      phone: `7${phoneSuffix}1`.slice(0, 10),
      name: adminAttendeeName,
    })
    .select("id")
    .single()
  if (adminAttendanceError || !adminAttendance) {
    throw new Error(`creating the Admin attendance fixture failed: ${adminAttendanceError?.message}`)
  }
  adminAttendanceId = adminAttendance.id

  const { data: preacherAttendance, error: preacherAttendanceError } = await client
    .from("attendance")
    .insert({
      program_id: programId(),
      contact_id: preacherContactId,
      session_id: preacherSessionId,
      phone: `6${phoneSuffix}1`.slice(0, 10),
      name: preacherAttendeeName,
    })
    .select("id")
    .single()
  if (preacherAttendanceError || !preacherAttendance) {
    throw new Error(`creating the Preacher attendance fixture failed: ${preacherAttendanceError?.message}`)
  }
  preacherAttendanceId = preacherAttendance.id
})

test.afterAll(async () => {
  if (assistantStaff) {
    await setAssistantSupervisor(originalSupervisor)
  }

  if (adminAttendanceId || preacherAttendanceId) {
    await client
      .from("attendance")
      .delete()
      .in("id", [adminAttendanceId, preacherAttendanceId].filter(Boolean))
  }

  if (adminSessionId || preacherSessionId) {
    await client.from("sessions").delete().in("id", [adminSessionId, preacherSessionId].filter(Boolean))
  }

  if (adminContactId || preacherContactId) {
    await client.from("contacts").delete().in("id", [adminContactId, preacherContactId].filter(Boolean))
  }

  const { data: invited } = await client
    .from("users")
    .select("id")
    .eq("program_id", programId())
    .eq("email", INVITE_EMAIL)
    .maybeSingle()

  if (invited?.id) {
    await client.auth.admin.deleteUser(invited.id)
  }
})

test.describe("the Admin invite surface", () => {
  test("offers an Admin as an assigned Preacher and binds the Assistant to them", async ({ page }) => {
    await page.goto("/admin/invite")
    await expect(page.getByRole("heading", { name: "Invite Staff User" })).toBeVisible()

    const roleSelect = page.locator("select").first()
    await roleSelect.selectOption("Assistant")

    const assignedPreacher = page.locator("select").nth(1)
    await expect(assignedPreacher).toBeVisible()

    const optionTexts = await assignedPreacher.locator("option").allTextContents()
    expect(optionTexts.some((text) => /—\s*Admin$/.test(text))).toBe(true)
    expect(optionTexts.some((text) => text.includes(adminStaff.name ?? ""))).toBe(true)

    await page.locator("input").first().fill("Assistant invited by the admin spec")
    await page.locator('input[type="email"]').fill(INVITE_EMAIL)
    await assignedPreacher.selectOption({ label: `${adminStaff.name} — Admin` })

    await page.getByRole("button", { name: "Send Invite" }).click()

    await expect(page.getByText(/A sign-in email was sent|Invite sent/i)).toBeVisible()

    const { data: invited, error } = await client
      .from("users")
      .select("id,role,assigned_preacher_id")
      .eq("program_id", programId())
      .eq("email", INVITE_EMAIL)
      .single()

    expect(error).toBeNull()
    expect(invited?.role).toBe("Assistant")
    expect(invited?.assigned_preacher_id).toBe(adminStaff.id)
  })
})

test.describe("an Assistant assigned to an Admin", () => {
  test.use({ storageState: storageStatePath("assistant") })

  test.beforeEach(async () => {
    await setAssistantSupervisor(adminStaff.id)
  })

  test("reads the Admin's contacts, sessions, attendance and campaign surface", async ({ page }) => {
    await openContactsGrid(page)
    await filterGlobally(page, adminContactName)
    await expect(page.getByText(adminContactName, { exact: true })).toBeVisible()

    await filterGlobally(page, preacherContactName)
    await expect(page.getByText(preacherContactName, { exact: true })).toHaveCount(0)

    await openAs(page, "/sessions")
    await expect(page.getByText(adminSessionName, { exact: true }).first()).toBeVisible()
    await expect(page.getByText(preacherSessionName, { exact: true })).toHaveCount(0)

    await openAs(page, "/manage")
    await expect(
      page.getByText(new RegExp(`Showing only rows scoped to ${adminStaff.name}`, "i")),
    ).toBeVisible()

    await openAs(page, "/dashboard")
    await expect(page.getByText(new RegExp(`${adminStaff.name}.*preacher you assist`, "i"))).toBeVisible()

    const attendanceResponse = await page.request.get(`/attendance?date=${today}`)
    expect(attendanceResponse.ok()).toBe(true)
    const attendance = (await attendanceResponse.json()) as Array<{ userName: string }>
    expect(attendance.some((row) => row.userName === adminAttendeeName)).toBe(true)
    expect(attendance.some((row) => row.userName === preacherAttendeeName)).toBe(false)

    await openAs(page, "/campaigns")
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible()
  })
})

test.describe("a Preacher's Assistant", () => {
  test.use({ storageState: storageStatePath("assistant") })

  test.beforeEach(async () => {
    await setAssistantSupervisor(preacherStaff.id)
  })

  test("still reads the Preacher's patch, not the Admin's", async ({ page }) => {
    await openContactsGrid(page)
    await filterGlobally(page, preacherContactName)
    await expect(page.getByText(preacherContactName, { exact: true })).toBeVisible()

    await filterGlobally(page, adminContactName)
    await expect(page.getByText(adminContactName, { exact: true })).toHaveCount(0)

    await openAs(page, "/sessions")
    await expect(page.getByText(preacherSessionName, { exact: true }).first()).toBeVisible()
    await expect(page.getByText(adminSessionName, { exact: true })).toHaveCount(0)

    await openAs(page, "/dashboard")
    await expect(page.getByText(new RegExp(`${preacherStaff.name}.*preacher you assist`, "i"))).toBeVisible()

    const attendanceResponse = await page.request.get(`/attendance?date=${today}`)
    expect(attendanceResponse.ok()).toBe(true)
    const attendance = (await attendanceResponse.json()) as Array<{ userName: string }>
    expect(attendance.some((row) => row.userName === preacherAttendeeName)).toBe(true)
    expect(attendance.some((row) => row.userName === adminAttendeeName)).toBe(false)
  })
})

test.describe("an Assistant with no eligible assignment", () => {
  test.use({ storageState: storageStatePath("assistant") })

  test.beforeEach(async () => {
    await setAssistantSupervisor(null)
  })

  test("gets the empty states and no dead Contacts, Manage or Invite items", async ({ page }) => {
    await openAs(page, "/contacts")
    await expect(page.getByText("No Preacher assigned", { exact: true })).toBeVisible()
    await expect(page.getByText(/Ask an Admin to assign you to a preacher/i)).toBeVisible()
    await expect(page.getByRole("link", { name: "Add contact" })).toHaveCount(0)

    await openAs(page, "/manage")
    await expect(page.getByText(/No active Preacher is assigned to your account/i)).toBeVisible()

    await openAs(page, "/sessions")
    await expect(page.getByText("No sessions yet")).toBeVisible()

    await openAs(page, "/dashboard")
    await expect(page.getByText(/No active preacher is assigned to your account/i)).toBeVisible()

    const header = page.locator("header").first()
    await expect(header.getByRole("link", { name: "Manage", exact: true })).toHaveCount(0)
    await expect(header.getByRole("link", { name: "Invite", exact: true })).toHaveCount(0)
    await expect(header.getByRole("link", { name: "Contact", exact: true })).toHaveCount(0)
  })
})

test.describe("the user-facing copy", () => {
  test.use({ storageState: storageStatePath("assistant") })

  test.beforeEach(async () => {
    await setAssistantSupervisor(adminStaff.id)
  })

  test("keeps the Preacher label and never says Supervisor", async ({ page }) => {
    for (const path of ["/dashboard", "/contacts", "/manage"]) {
      await openAs(page, path)
      const body = await page.locator("body").innerText()
      expect(body).not.toMatch(/supervisor/i)
    }
  })
})
