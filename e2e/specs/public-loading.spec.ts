/**
 * Batch 1 — the public loading surfaces.
 *
 * | Row | Claim under test |
 * | --- | --- |
 * | home | a signed-in visitor gets the server-rendered Portal before `/api/auth/me` resolves; anonymous keeps Staff Login |
 * | login boot | an unresolved session shows the form-shaped shell, offers Retry after the bounded wait, and never claims signed out |
 * | login redirect | an authenticated visitor sees "opening your portal" while the document handoff is pending |
 * | register queued | a `202 { queued: true }` is a persistent confirmation, not an error |
 * | register failures | duplicate, server, malformed, and network outcomes keep values and always clear pending |
 * | payment pending | the multipart request locks Back/method/file controls and shows no error while in flight |
 * | payment outcomes | a definitive rejection retries; a lost/invalid success is outcome-unknown |
 * | reduced motion | skeleton shapes and status remain; shimmer and spin are absent |
 *
 * The service worker is blocked in every context: it answers queueable POSTs
 * with its own `202`, which would hide the payloads and outcomes asserted here.
 */

import { expect, test, type Page } from "@playwright/test"

import { storageStatePath } from "../fixtures/roles"

const AUTH_ME = "**/api/auth/me"
const REGISTRATION = "**/api/registration"
const PAYMENT_REGISTRATION = "**/api/gita-life/registration"
const PORTAL_HANDOFF = "**/dashboard**"

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
)

interface Gate {
  wait: () => Promise<void>
  release: () => void
}

function createGate(): Gate {
  let released = false
  const waiters: Array<() => void> = []

  return {
    wait: () =>
      new Promise<void>((resolve) => {
        if (released) {
          resolve()
          return
        }

        waiters.push(resolve)
      }),
    release: () => {
      released = true
      while (waiters.length > 0) {
        waiters.pop()?.()
      }
    },
  }
}

/** Hold `/api/auth/me` so the client bootstrap cannot resolve. */
async function parkAuth(page: Page) {
  const gate = createGate()
  let requests = 0

  await page.route(AUTH_ME, async (route) => {
    requests += 1
    await gate.wait()
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ staff: null }),
    })
  })

  return {
    count: () => requests,
    release: () => gate.release(),
  }
}

/** Resolve parked handlers, then wait for them to finish before unrouting. */
async function settle(page: Page) {
  await page.unrouteAll({ behavior: "wait" })
}

/** Scoped to the page content: the router's own announcer is `role="alert"` too. */
function formAlerts(page: Page) {
  return page.locator("main").getByRole("alert")
}

async function fillRegisterForm(page: Page, name = "Loading Test Participant", mobile = "9876543210") {
  await page.getByLabel("Full Name").fill(name)
  await page.getByLabel("Mobile Number").fill(mobile)
  await page.getByLabel("Date of Birth").fill("2000-01-01")
  await page.getByLabel("Occupation").selectOption("Studying")
  await page.getByLabel("College").fill("Loading Test College")
}

async function openPaymentStep(page: Page) {
  await page.goto("/")
  await page.getByRole("button", { name: "Register Now" }).click()

  await page.getByLabel("Full Name").fill("Payment Loading Test")
  await page.getByLabel("Mobile Number").fill("9876500011")
  await page.getByLabel("Your Area").fill("Adyar")
  await page.getByLabel("Area You Want to Attend").selectOption({ index: 1 })
  await page.getByRole("button", { name: "Next", exact: true }).click()

  await page.getByLabel("Date of Birth").fill("2000-01-01")
  await page.getByRole("button", { name: "Proceed to Payment" }).click()
  await page.getByRole("button", { name: "GPay / UPI" }).click()
  await page.locator('input[type="file"]').setInputFiles({
    name: "payment.png",
    mimeType: "image/png",
    buffer: ONE_PIXEL_PNG,
  })
  await expect(page.getByRole("button", { name: "Change" })).toBeVisible()
}

test.describe("home", () => {
  test("Portal is server-rendered before client auth resolves, for each role destination", async ({
    browser,
  }) => {
    for (const { role, href } of [
      { role: "admin", href: "/dashboard" },
      { role: "volunteer", href: "/contact" },
    ] as const) {
      const context = await browser.newContext({
        storageState: storageStatePath(role),
        serviceWorkers: "block",
      })
      const page = await context.newPage()
      const auth = await parkAuth(page)

      try {
        await page.goto("/", { waitUntil: "domcontentloaded" })

        const portal = page.getByRole("link", { name: "Portal" }).first()
        await expect
          .poll(() => auth.count(), { message: "the client auth request should be parked, not absent" })
          .toBeGreaterThan(0)
        await expect(portal).toBeVisible()
        await expect(portal).toHaveAttribute("href", href)
        await expect(page.getByRole("link", { name: "Staff Login" })).toHaveCount(0)
      } finally {
        auth.release()
        await settle(page)
        await context.close()
      }
    }
  })

  test.describe("anonymous", () => {
    test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: "block" })

    test("Staff Login remains for a visitor without a staff session", async ({ page }) => {
      await page.goto("/")

      await expect(page.getByRole("link", { name: "Staff Login" })).toBeVisible()
      await expect(page.getByRole("link", { name: "Portal" })).toHaveCount(0)
    })
  })
})

test.describe("login boot", () => {
  test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: "block" })

  test("an unresolved session shows the shell, offers Retry, and never claims signed out", async ({
    page,
  }) => {
    const auth = await parkAuth(page)

    try {
      await page.goto("/login", { waitUntil: "domcontentloaded" })

      const region = page.locator('[data-loading-region="Checking your session"]')
      await expect(region).toBeVisible()
      await expect(region).toHaveAttribute("aria-busy", "true")
      await expect(region.getByRole("status")).toHaveText("Checking your session")
      await expect(page.locator("header")).toBeVisible()

      const retry = page.getByRole("button", { name: "Retry" })
      await expect(retry).toBeVisible({ timeout: 15_000 })
      await expect(page.getByRole("heading", { name: "Welcome Back" })).toHaveCount(0)

      const beforeRetry = auth.count()
      await retry.click()
      await expect.poll(() => auth.count()).toBeGreaterThan(beforeRetry)

      auth.release()
      await expect(page.getByLabel("Email", { exact: true })).toBeVisible()
    } finally {
      auth.release()
      await settle(page)
    }
  })
})

test.describe("login redirect", () => {
  test.use({ storageState: storageStatePath("admin"), serviceWorkers: "block" })

  test("an authenticated visitor sees the opening-portal state while the handoff is pending", async ({
    page,
  }) => {
    let handoffs = 0

    await page.route(PORTAL_HANDOFF, async (route) => {
      if (!route.request().isNavigationRequest()) {
        await route.continue()
        return
      }

      handoffs += 1
      // 204 leaves the current document in place: the handoff is initiated but
      // never commits, so the pre-unload shell remains observable.
      await route.fulfill({ status: 204, body: "" })
    })

    try {
      await page.goto("/login")

      const notice = page.getByRole("status").filter({ hasText: /Already signed in; opening your portal/ })
      await expect(notice).toBeVisible()
      await expect(page.locator("main")).toHaveAttribute("aria-busy", "true")
      await expect.poll(() => handoffs, { message: "the portal handoff should be in flight" }).toBe(1)
      await expect.poll(() => new URL(page.url()).pathname).toBe("/login")
    } finally {
      await settle(page)
    }
  })
})

test.describe("register", () => {
  test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: "block" })

  test("a queued registration is a persistent confirmation and says attendance is not marked", async ({
    page,
  }) => {
    const bodies: unknown[] = []

    await page.route(REGISTRATION, async (route) => {
      bodies.push(route.request().postDataJSON())
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ success: false, queued: true, message: "Request queued for sync when online" }),
      })
    })

    await page.goto("/register?session=11111111-1111-4111-8111-111111111111")
    await expect(page.getByText("Your attendance will be completed automatically after registration.")).toBeVisible()
    await fillRegisterForm(page)
    await page.getByRole("button", { name: "Register", exact: true }).click()

    const queued = page.getByRole("status").filter({ hasText: /Registration queued/ })
    await expect(queued).toBeVisible()
    await expect(queued).toContainText(/registration is saved on this device/i)
    await expect(queued).toContainText(/attendance is not marked yet/i)
    await expect(formAlerts(page)).toHaveCount(0)

    expect(bodies).toHaveLength(1)
    expect(bodies[0]).toMatchObject({
      name: "Loading Test Participant",
      mobile: "9876543210",
      sessionId: "11111111-1111-4111-8111-111111111111",
    })
  })

  test("a confirmed registration shows success, with attendance copy when session-backed", async ({
    page,
  }) => {
    let withSession = false

    await page.route(REGISTRATION, async (route) => {
      await route.fulfill({
        status: withSession ? 200 : 201,
        contentType: "application/json",
        body: JSON.stringify(
          withSession
            ? { completed: true, contact: { id: "loading-session-contact" } }
            : { contact: { id: "loading-contact" } },
        ),
      })
    })

    await page.goto("/register")
    await fillRegisterForm(page, "Success Test Participant", "9876543211")
    await page.getByRole("button", { name: "Register", exact: true }).click()

    await expect(page.getByRole("heading", { name: "Welcome to FOLK Chennai!" })).toBeVisible()
    await expect(page.getByText("Registration Successful", { exact: true })).toBeVisible()

    withSession = true
    await page.goto("/register?session=22222222-2222-4222-8222-222222222222")
    await fillRegisterForm(page, "Success Session Participant", "9876543212")
    await page.getByRole("button", { name: "Register", exact: true }).click()

    await expect(page.getByRole("heading", { name: "Welcome to FOLK Chennai!" })).toBeVisible()
    await expect(page.getByText("Registration complete and attendance marked", { exact: true })).toBeVisible()
  })

  test("duplicate, server, malformed, and network failures keep values and clear pending", async ({
    page,
  }) => {
    type Mode = "duplicate" | "server" | "malformed" | "network"
    let mode: Mode = "duplicate"

    await page.route(REGISTRATION, async (route) => {
      if (mode === "duplicate") {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ alreadyRegistered: true }),
        })
        return
      }

      if (mode === "server") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "The registration service is unavailable." }),
        })
        return
      }

      if (mode === "malformed") {
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: "<!doctype html><html><body>not json</body></html>",
        })
        return
      }

      await route.abort("failed")
    })

    await page.goto("/register")
    await fillRegisterForm(page)

    const button = page.getByRole("button", { name: "Register", exact: true })
    const nameField = page.getByLabel("Full Name")
    const mobileField = page.getByLabel("Mobile Number")

    await button.click()
    await expect(formAlerts(page)).toContainText(/already registered/i)
    await expect(nameField).toHaveValue("Loading Test Participant")
    await expect(mobileField).toHaveValue("9876543210")
    await expect(button).toBeEnabled()

    mode = "server"
    await button.click()
    await expect(formAlerts(page)).toContainText("We couldn't submit your registration. Please try again.")
    await expect(nameField).toHaveValue("Loading Test Participant")
    await expect(button).toBeEnabled()
    await expect(button).not.toHaveAttribute("aria-busy", "true")

    mode = "malformed"
    await button.click()
    await expect(formAlerts(page)).toContainText(/couldn't confirm whether your registration was received/i)
    await expect(nameField).toHaveValue("Loading Test Participant")
    await expect(button).toBeEnabled()

    mode = "network"
    await button.click()
    await expect(formAlerts(page)).toContainText(/couldn't confirm whether your registration was received/i)
    await expect(nameField).toHaveValue("Loading Test Participant")
    await expect(button).toBeEnabled()
  })

  test("the submit button is busy and disabled while the request is in flight", async ({ page }) => {
    const gate = createGate()

    await page.route(REGISTRATION, async (route) => {
      await gate.wait()
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "The registration service is unavailable." }),
      })
    })

    try {
      await page.goto("/register")
      await fillRegisterForm(page)

      const button = page.getByRole("button", { name: "Register", exact: true })
      await button.click()

      const busyButton = page.locator('button[type="submit"]')
      await expect(busyButton).toHaveAttribute("aria-busy", "true")
      await expect(busyButton).toBeDisabled()
      await expect(busyButton).toContainText("Registering...")
      await expect(formAlerts(page)).toHaveCount(0)

      gate.release()
      await expect(busyButton).not.toHaveAttribute("aria-busy", "true")
      await expect(busyButton).toBeEnabled()
      await expect(formAlerts(page)).toContainText("We couldn't submit your registration. Please try again.")
    } finally {
      gate.release()
      await settle(page)
    }
  })
})

test.describe("payment", () => {
  test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: "block" })

  test("pending locks the conflicting controls, and outcomes are distinguished", async ({ page }) => {
    let mode: "reject" | "lose" = "reject"
    let payload = ""
    const gates: Gate[] = []
    let currentGate = createGate()

    await page.route(PAYMENT_REGISTRATION, async (route) => {
      payload = route.request().postDataBuffer()?.toString("utf8") ?? ""
      gates.push(currentGate)
      await currentGate.wait()

      if (mode === "lose") {
        await route.abort("failed")
        return
      }

      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "The payment screenshot could not be stored." }),
      })
    })

    try {
      await openPaymentStep(page)

      const submit = page.getByRole("button", { name: "Complete Registration" })
      await submit.click()

      const busySubmit = page.locator('button[aria-busy="true"]')
      await expect(busySubmit).toContainText("Submitting...")
      await expect(busySubmit).toBeDisabled()
      await expect(page.getByRole("button", { name: "Back to Form" })).toBeDisabled()
      await expect(page.getByRole("button", { name: "GPay / UPI" })).toBeDisabled()
      await expect(page.getByRole("button", { name: "NEFT / IMPS" })).toBeDisabled()
      await expect(page.getByRole("button", { name: "Change" })).toBeDisabled()
      await expect(page.locator('input[type="file"]')).toBeDisabled()
      await expect(formAlerts(page)).toHaveCount(0)

      const fieldNames = [...payload.matchAll(/;\s*name="([^"]+)"/g)].map((match) => match[1]).sort()
      expect(fieldNames).toEqual(
        [
          "areaToAttend",
          "collegeName",
          "dateOfBirth",
          "email",
          "mobileNo",
          "name",
          "paymentMethod",
          "screenshot",
          "yourArea",
        ].sort(),
      )
      expect(payload).toMatch(/name="paymentMethod"\r?\n\r?\ngpay/)
      expect(payload).toContain('filename="payment.png"')

      currentGate.release()
      await expect(formAlerts(page)).toContainText("The payment screenshot could not be stored.")
      await expect(page.getByRole("button", { name: "Complete Registration" })).toBeEnabled()
      await expect(page.getByAltText("Payment screenshot")).toBeVisible()

      mode = "lose"
      currentGate = createGate()

      await page.getByRole("button", { name: "Complete Registration" }).click()
      await expect(formAlerts(page)).toHaveCount(0)
      await expect(page.locator('button[aria-busy="true"]')).toContainText("Submitting...")

      currentGate.release()
      await expect(
        page.getByRole("status").filter({ hasText: /couldn't confirm your registration/i }),
      ).toBeVisible()
      await expect(page.getByRole("button", { name: "Registration not confirmed" })).toBeDisabled()
      await expect(page.getByAltText("Payment screenshot")).toBeVisible()

      expect(gates.length).toBe(2)
    } finally {
      currentGate.release()
      for (const gate of gates) {
        gate.release()
      }
      await settle(page)
    }
  })
})

test.describe("reduced motion", () => {
  test.describe("login boot", () => {
    test.use({
      contextOptions: { reducedMotion: "reduce" },
      storageState: { cookies: [], origins: [] },
      serviceWorkers: "block",
    })

    test("the skeleton keeps its shapes and status without shimmer", async ({ page }) => {
      const auth = await parkAuth(page)

      try {
        await page.goto("/login", { waitUntil: "domcontentloaded" })

        const region = page.locator('[data-loading-region="Checking your session"]')
        await expect(region).toBeVisible()
        await expect(region.getByRole("status")).toHaveText("Checking your session")
        await expect(region.locator("[data-skeleton]").first()).toBeVisible()
        await expect(page.locator("[data-shimmer]").first()).toBeHidden()
      } finally {
        auth.release()
        await settle(page)
      }
    })
  })

  test.describe("login redirect", () => {
    test.use({
      contextOptions: { reducedMotion: "reduce" },
      storageState: storageStatePath("admin"),
      serviceWorkers: "block",
    })

    test("the portal handoff spinner is static", async ({ page }) => {
      await page.route(PORTAL_HANDOFF, async (route) => {
        if (!route.request().isNavigationRequest()) {
          await route.continue()
          return
        }

        await route.fulfill({ status: 204, body: "" })
      })

      try {
        await page.goto("/login")

        const spinner = page.locator("[data-loading-spinner]").first()
        await expect(spinner).toBeVisible()
        await expect
          .poll(
            () => spinner.evaluate((element) => getComputedStyle(element).animationName),
            { message: "reduced motion must remove the spin" },
          )
          .toBe("none")
      } finally {
        await settle(page)
      }
    })
  })
})
