/**
 * The story's deliverable: one green smoke spec proving stack + seed + OTP +
 * `storageState` + session reuse all work together, plus the harness's own
 * matrix rows (dead session vs role gate, unknown email, gitignored artifacts).
 *
 * Everything below is cheap. If any of it goes red, the harness is broken — not
 * the app — because every row here runs against the real local stack through
 * the real sign-in path.
 *
 * `storageState` is chosen per block rather than per project: the rows need
 * three different identities, and a config-level project per identity would
 * re-run all six rows once per project.
 */

import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { rm } from "node:fs/promises"
import path from "node:path"
import { expect, test, type BrowserContext } from "@playwright/test"
import { listAuthUsersMatching } from "../fixtures/auth-users"
import { writeDeadSessionStorageState } from "../fixtures/auth"
import {
  E2E_ROLES,
  landingPathForRole,
  managePhotoProbeUrl,
  repoRoot,
  relativeToRepo,
  staffRoleName,
  storageStatePath,
  unknownEmail,
} from "../fixtures/roles"

const DEAD_SESSION_FILE = path.join(repoRoot, "e2e", ".auth", "dead-session.json")

async function probeManagePhoto(context: BrowserContext): Promise<{ status: number; body: unknown }> {
  const response = await context.request.get(managePhotoProbeUrl())
  const text = await response.text()

  let body: unknown = text
  try {
    body = JSON.parse(text)
  } catch {
    // Keep the raw body; a non-JSON body is itself diagnostic.
  }

  return { status: response.status(), body }
}

// Headline first: the one test that proves the whole harness.

test("Admin lands on its landing path with a live staff session", async ({ page }) => {
  const landing = landingPathForRole("admin")

  await page.goto(landing)
  await expect.poll(() => new URL(page.url()).pathname, "the Admin landing pathname must be exact").toBe(landing)

  // `/` is also the public marketing page, so the URL alone proves nothing —
  // landing on `/` with `staff: null` is a failure, not a pass. `/api/auth/me`
  // is the part that tells the two apart.
  const me = await page.request.get("/api/auth/me")
  expect(me.status()).toBe(200)

  const body = (await me.json()) as { staff: { role?: string } | null }
  expect(body.staff, "landing on / with staff: null is not a signed-in landing").not.toBeNull()
  expect(body.staff?.role).toBe(staffRoleName("admin"))
})

// `preacher.json` and `volunteer.json` are produced by the setup projects but
// only ever consumed by the 403 row, which would still pass with an Admin
// session pasted into the Volunteer file. Prove each artifact is a live session
// for its own role.

test("every role storageState file is a live session for that role", async ({ browser }) => {
  for (const role of E2E_ROLES) {
    const statePath = storageStatePath(role)
    const context = await browser.newContext({ storageState: statePath })

    try {
      const response = await context.request.get("/api/auth/me")
      expect(response.status(), `${relativeToRepo(statePath)} → /api/auth/me`).toBe(200)

      const body = (await response.json()) as { staff: { role?: string } | null }
      expect(body.staff, `${relativeToRepo(statePath)} holds a session with staff: null`).not.toBeNull()
      expect(body.staff?.role, `${relativeToRepo(statePath)} should be a ${staffRoleName(role)} session`).toBe(
        staffRoleName(role),
      )
    } finally {
      await context.close()
    }
  }
})

// No `/login` navigation on the first navigation of a spec that declares a
// storageState — this is what makes the setup projects worth their cost.

test("a storageState session is reused without navigating to /login", async ({ page }) => {
  const visited: string[] = []
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      visited.push(new URL(frame.url()).pathname)
    }
  })

  await page.goto("/")

  expect(visited.length, "no navigation was observed, so this test would pass vacuously").toBeGreaterThan(0)
  expect(visited[0], "a signed-in spec must not start on /login").toBe("/")
  expect(visited, "a signed-in spec must not bounce through /login").not.toContain("/login")
})

// The 401/403 pair, which is the only thing that distinguishes "session dead"
// from "role insufficient". `/api/manage/contacts/photo` runs auth before the
// contact lookup, so the rejected paths answer without a seeded row — whereas
// `/api/auth/me` swallows its 401 and cannot prove a dead session.

test("a dead session is 401 unauthenticated on the manage API", async ({ browser }) => {
  await writeDeadSessionStorageState("admin", DEAD_SESSION_FILE)

  // Inside the `try`: a context that fails to open must not leave a
  // live-shaped session artifact on disk.
  let context: BrowserContext | undefined
  try {
    context = await browser.newContext({ storageState: DEAD_SESSION_FILE })

    const { status, body } = await probeManagePhoto(context)
    expect(status).toBe(401)
    expect(body).toMatchObject({ code: "unauthenticated" })
  } finally {
    await context?.close()
    // A garbage token is not an artifact worth leaving on disk, passed or not.
    await rm(DEAD_SESSION_FILE, { force: true })
  }
})

test("a Volunteer session is 403 forbidden on the same route", async ({ browser }) => {
  const context = await browser.newContext({ storageState: storageStatePath("volunteer") })
  try {
    const { status, body } = await probeManagePhoto(context)
    expect(status, "401 here would mean the session is dead, not that the role is insufficient").toBe(403)
    expect(body).toMatchObject({ code: "forbidden" })
  } finally {
    await context.close()
  }
})

// Anonymous: no storageState at all.

test.describe("anonymous", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("an unseeded email fails visibly and provisions nothing", async ({ page }) => {
    const unseeded = unknownEmail()
    const before = await listAuthUsersMatching(unseeded)

    // Equality with a non-empty baseline would prove nothing: "still one
    // account, the one that was already there" is not "nothing was created".
    expect(before, `${unseeded} must not already exist for this row to mean anything`).toEqual([])

    await page.goto("/login")
    await page.getByLabel("Email", { exact: true }).fill(unseeded)
    await page.getByRole("button", { name: "Send Code" }).click()

    // The app's own message, not a timeout.
    const error = page.locator(".text-red-700").first()
    await expect(error).toBeVisible({ timeout: 20_000 })
    await expect(error).toContainText(/not linked to an active staff account/i)

    // Still on step 1 — no code field was ever offered.
    await expect(page.getByLabel("Email code")).toHaveCount(0)

    // `shouldCreateUser: false` is the second line of defence underneath the
    // route's 403; prove nothing was created.
    await expect
      .poll(() => listAuthUsersMatching(unseeded), { message: "an unknown address must never be provisioned" })
      .toEqual(before)
  })
})

// Offline: the one artifact of this harness that is genuinely sensitive.

test("the storageState artifacts are gitignored", async () => {
  for (const role of E2E_ROLES) {
    const statePath = storageStatePath(role)
    expect(existsSync(statePath), `${relativeToRepo(statePath)} should exist after a full run`).toBe(true)

    const result = spawnSync("git", ["check-ignore", "-q", relativeToRepo(statePath)], {
      cwd: repoRoot,
      stdio: "ignore",
    })

    expect(result.status, `git check-ignore exited ${result.status} for ${relativeToRepo(statePath)}`).toBe(0)
  }
})
