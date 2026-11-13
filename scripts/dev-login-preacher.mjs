#!/usr/bin/env node
/**
 * dev-login-preacher.mjs — open a browser, auto-logged in as the preacher fixture.
 *
 * Drives the REAL `/login` email-OTP path (the same one `e2e/auth/preacher.setup.ts`
 * exercises): request a code, read the 6-digit code out of Mailpit's HTTP API,
 * verify it, wait for the preacher landing page — then leave the browser open
 * for development. Nothing is stubbed; a break in the OTP path fails here loudly
 * instead of hiding behind a fake session.
 *
 * Requires the local stack, which the `folk` / `gitalife` shell aliases boot:
 * the app dev server on :3000 (folk) or :3001 (gita-life), Mailpit on :8025,
 * and seeded fixtures (`pnpm seed:local`). Run it from a second terminal while
 * the dev server is up.
 *
 * Usage:
 *   node scripts/dev-login-preacher.mjs --app folk
 *   node scripts/dev-login-preacher.mjs --app gita-life
 *   pnpm dev:login:folk
 *   pnpm dev:login:gita-life
 *
 * Options:
 *   --app folk|gita-life   Which app to open (default: folk).
 *   --email <address>      Override the preacher fixture address (for a
 *                          differently-seeded stack; mirrors E2E_PREACHER_EMAIL).
 *   --headless             No visible window: log in, report success, exit 0.
 *                          Headed (the default) keeps the browser open until Ctrl-C.
 *   --chromium <path>      Browser executable. Default: /usr/bin/google-chrome
 *                          when present, else Playwright's bundled Chromium.
 *                          PW_CHROMIUM_PATH also works.
 *   --timeout-ms <n>       Per-wait budget in ms (default: 30000).
 */

import { existsSync, statSync } from "node:fs"
import { chromium } from "@playwright/test"
import { STAFF_EMAILS } from "./fixture-reference-data.mjs"

const APPS = {
  folk: { port: 3000, baseUrl: "http://127.0.0.1:3000" },
  // Gita Life lives on :3001 by repo convention (docs/development-guide.md and
  // scripts/use-local-supabase-env.sh both split folk :3000 / gita-life :3001).
  "gita-life": { port: 3001, baseUrl: "http://127.0.0.1:3001" },
}
const MAILPIT_URL = (process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:8025").replace(/\/+$/, "")
const OTP_RETRY_LIMIT = 3
const OTP_RATE_LIMIT_BACKOFF_MS = 1200

function flagValue(name) {
  const argv = process.argv.slice(2)
  const index = argv.indexOf(name)
  return index === -1 ? null : (argv[index + 1] ?? "").trim() || null
}

function hasFlag(name) {
  return process.argv.slice(2).includes(name)
}

function fail(message) {
  console.error(`ERROR ${message}`)
  process.exit(1)
}

function parseArgs() {
  if (hasFlag("--help") || hasFlag("-h")) {
    console.log("Usage: node scripts/dev-login-preacher.mjs --app folk|gita-life [--email <address>] [--headless] [--chromium <path>] [--timeout-ms <n>]")
    process.exit(0)
  }

  const app = (flagValue("--app") ?? "folk").trim()
  if (!APPS[app]) fail(`--app must be "folk" or "gita-life", got "${app}".`)

  const timeoutMs = Number(flagValue("--timeout-ms") ?? 30000)
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) fail("--timeout-ms must be at least 1000.")

  const override = flagValue("--email")?.toLowerCase() ?? process.env.E2E_PREACHER_EMAIL?.trim().toLowerCase()
  return { app, timeoutMs, email: override || STAFF_EMAILS[app].Preacher, headless: hasFlag("--headless") }
}

function resolveChromium() {
  const explicit = (flagValue("--chromium") ?? process.env.PW_CHROMIUM_PATH ?? "").trim()
  if (explicit) {
    if (!existsSync(explicit)) fail(`--chromium ${explicit} does not exist.`)
    return { path: explicit, source: "--chromium/PW_CHROMIUM_PATH" }
  }

  for (const candidate of ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"]) {
    try {
      if (existsSync(candidate) && statSync(candidate).isFile()) return { path: candidate, source: "system browser" }
    } catch {
      // Ignore and keep probing.
    }
  }

  return null
}

async function waitForApp(baseUrl) {
  const deadline = Date.now() + 120000
  for (;;) {
    try {
      const response = await fetch(`${baseUrl}/login`, { signal: AbortSignal.timeout(5000) })
      if (response.ok) return
    } catch {
      // Not up yet; fall through to the retry below.
    }

    if (Date.now() >= deadline) {
      fail(`The app is not answering at ${baseUrl}/login after 120s. Start it first (\`folk\` for :3000, \`gitalife\` for :3001).`)
    }
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
}

async function checkMailpit() {
  try {
    const response = await fetch(`${MAILPIT_URL}/api/v1/messages`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  } catch (error) {
    fail(`Mailpit is not answering at ${MAILPIT_URL} (${error.message}). It boots with the stack — start it via \`folk\` / \`gitalife\` first.`)
  }
}

async function listMessages() {
  const response = await fetch(`${MAILPIT_URL}/api/v1/messages`, { headers: { Accept: "application/json" } })
  if (!response.ok) throw new Error(`Mailpit message list failed: ${response.status}`)
  const body = await response.json()
  return Array.isArray(body.messages) ? body.messages : []
}

async function readOtp(email, ignoreIds, timeoutMs) {
  const recipient = email.trim().toLowerCase()
  const known = new Set(ignoreIds)
  const deadline = Date.now() + timeoutMs

  for (;;) {
    let seen = []
    try {
      seen = await listMessages()
      for (const message of seen) {
        const addressed = (message.To ?? []).some((to) => (to.Address ?? "").trim().toLowerCase() === recipient)
        if (!addressed || known.has(message.ID)) continue

        const fullResponse = await fetch(`${MAILPIT_URL}/api/v1/message/${encodeURIComponent(message.ID)}`, {
          headers: { Accept: "application/json" },
        })
        if (!fullResponse.ok) continue
        const full = await fullResponse.json()

        for (const body of [full.Text, full.HTML]) {
          const shaped = body?.match(/sign[-\s]?in code is[:\s]*\**\s*(\d{6})\b/i)?.[1]
          if (shaped) return shaped
        }
        const loose = full.Text?.match(/(?<![\d-])(\d{6})(?![\d-])/)?.[1]
        if (loose) return loose
      }
    } catch {
      // A failed probe is a reason to keep polling, not to abandon the run.
    }

    if (Date.now() >= deadline) {
      fail(`Timed out after ${timeoutMs}ms waiting for a sign-in OTP for ${recipient} at ${MAILPIT_URL}.`)
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
}

async function loginAttempt(page, email, timeoutMs) {
  const preexistingIds = (await listMessages()).map((message) => message.ID)

  await page.getByRole("button", { name: "Send Code" }).click()

  const codeField = page.getByLabel("Email code")
  // The alert class is themeable (`AUTH_ERROR_CLASS`), so match the role the
  // login page puts on it — scoped to the form to skip Next's route announcer.
  const errorBox = page.locator("form [role='alert']").first()
  try {
    await codeField.or(errorBox).first().waitFor({ state: "visible", timeout: 20000 })
  } catch {
    throw new Error("Neither the email-code field nor an error appeared after requesting a code.")
  }

  if (await codeField.isVisible()) {
    // The code itself is never printed: it is a live credential even locally.
    const otp = await readOtp(email, preexistingIds, timeoutMs)
    await codeField.fill(otp)
    await page.getByRole("button", { name: "Verify Code" }).click()

    try {
      // A signed-in Preacher lands on `/dashboard`, not `/` (`landingPathForRole`
      // in lib/staff-routes.ts). Wait for the app to leave the login route rather
      // than pinning a landing path that moves with the product.
      await page.waitForURL((url) => !/^\/(login|auth)(\/|$)/.test(url.pathname), { timeout: timeoutMs })
      return "code"
    } catch {
      const text = ((await errorBox.textContent().catch(() => "")) ?? "").trim()
      const where = new URL(page.url()).pathname
      throw new Error(`Code verification failed: ${text || `no error text appeared; the app is on ${where}`}`)
    }
  }

  const text = ((await errorBox.textContent().catch(() => "")) ?? "").trim()
  const rateLimited = /rate limit|too many|429|over_email_send_rate_limit/i.test(text)
  return rateLimited ? "rate-limited" : fail(`Sign-in failed for ${email}: ${text || "unknown sign-in error"}`)
}

async function main() {
  const { app, timeoutMs, email, headless } = parseArgs()
  const { baseUrl } = APPS[app]

  console.log(`Waiting for the ${app} app at ${baseUrl}/login …`)
  await waitForApp(baseUrl)
  await checkMailpit()

  const resolved = resolveChromium()
  console.log(`Browser   : ${resolved ? `${resolved.path} (${resolved.source})` : "Playwright bundled Chromium"}`)
  console.log(`Signing in as preacher ${email} …`)

  let browser
  const launchArgs = headless ? [] : ["--start-maximized"]
  try {
    browser = await chromium.launch({ headless, executablePath: resolved?.path, args: launchArgs })
  } catch (error) {
    if (!resolved) throw error
    console.log(`System browser launch failed (${error.message.split("\n")[0]}); falling back to Playwright bundled Chromium.`)
    browser = await chromium.launch({ headless, args: launchArgs })
  }

  // Headed: drop the fixed 1280x720 viewport so the page fills the maximized
  // window instead of rendering as a small cropped view. Headless keeps the
  // default viewport (verification only needs the flow, not the pixels).
  const context = await browser.newContext(headless ? {} : { viewport: null })
  const page = await context.newPage()
  // Ctrl-C closes the browser instead of orphaning it. Registered after launch
  // so there is always a browser to close — and `once`, so a second signal
  // during the close still falls through to the default terminate.
  const closeAndExit = async () => {
    await browser.close().catch(() => undefined)
    process.exit(0)
  }
  process.once("SIGINT", () => void closeAndExit())
  process.once("SIGTERM", () => void closeAndExit())
  try {
    await page.goto(`${baseUrl}/login`)
    await page.getByLabel("Email", { exact: true }).waitFor({ state: "visible", timeout: timeoutMs })
    await page.getByLabel("Email", { exact: true }).fill(email)

    for (let attempt = 1; attempt <= OTP_RETRY_LIMIT; attempt += 1) {
      const outcome = await loginAttempt(page, email, timeoutMs)
      if (outcome === "code") break
      if (attempt === OTP_RETRY_LIMIT) fail(`Sign-in failed for ${email}: rate-limited ${OTP_RETRY_LIMIT} times.`)
      await new Promise((resolve) => setTimeout(resolve, OTP_RATE_LIMIT_BACKOFF_MS))
      await page.getByRole("button", { name: "Send Code" }).waitFor({ state: "visible", timeout: 20000 })
    }

    console.log(`Logged in as preacher (${email}) on ${baseUrl}.`)

    if (headless) {
      await browser.close()
      return
    }

    console.log("Browser stays open for development — Ctrl-C here to close it.")
    await new Promise(() => {})
  } catch (error) {
    await browser.close().catch(() => undefined)
    fail(error.message)
  }
}

await main()
