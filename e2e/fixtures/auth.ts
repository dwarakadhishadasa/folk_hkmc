/**
 * The one place the two-step `/login` form is driven.
 *
 * `/login` is a single client page with two steps and no route change: step 1
 * collects the email and calls `login(email)`; step 2 collects the code and
 * calls `verifyLoginCode`. No spec re-implements this.
 *
 * Ordering matters and is the reason this function owns it. Mail delivery is
 * fast enough locally that taking the `since` watermark *after* submitting can
 * miss the message entirely, and taking it *before* the pre-existing message ids
 * is worse -- that is where a leftover OTP from the previous run is chosen over
 * a fresh one. So: snapshot the mailbox, stamp the watermark, submit, poll.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { expect, type Page } from "@playwright/test"
import { fixtureEmail, landingPathForRole, storageStatePath, type E2ERole } from "./roles"
import { readOtpForRecipient, snapshotMessageIds } from "./mailpit"

/**
 * Supabase's `[auth.email] max_frequency = "1s"` returns 429
 * `over_email_send_rate_limit` for two OTP requests inside one second. The
 * three setup projects each drive their own address sequentially, so this
 * should not fire — but when it does, the honest response is a bounded retry
 * that surfaces Supabase's own message, never a silent skip.
 */
const OTP_RETRY_LIMIT = 3
const OTP_RATE_LIMIT_BACKOFF_MS = 1_200

const OTP_POLL_TIMEOUT_MS = 30_000
const CODE_STEP_TIMEOUT_MS = 20_000
const LANDING_TIMEOUT_MS = 30_000

/**
 * Errors render as plain text in `.text-red-700` — the login page has no
 * `role="alert"` and `apps/folk` has no `data-testid` anywhere, so this class
 * is the only handle on the failure text.
 */
const loginError = (page: Page) => page.locator(".text-red-700").first()

function isRateLimited(message: string): boolean {
  return /rate limit|too many|429|over_email_send_rate_limit/i.test(message)
}

/**
 * The login page has no `role="alert"`, so a timeout waiting for "the code
 * field or an error" is the one place a bare `expect` failure is acceptable —
 * and even then it should say what the browser was looking at.
 */
async function pageContext(page: Page): Promise<string> {
  const url = page.url()
  const body = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").trim()

  return `url=${url}\n  page body: ${body.slice(0, 500) || "(empty)"}`
}

/**
 * Which of step 2's two outcomes is on screen. `.or()` can match *both*
 * elements, so the union is narrowed with `.first()` before the strict-mode
 * visibility check.
 */
async function waitForCodeStepOrError(page: Page): Promise<"code" | "error"> {
  const codeField = page.getByLabel("Email code")

  try {
    await expect(codeField.or(loginError(page)).first()).toBeVisible({ timeout: CODE_STEP_TIMEOUT_MS })
  } catch (error) {
    throw new Error(
      `Neither the "Email code" field nor an error appeared within ${CODE_STEP_TIMEOUT_MS}ms.\n  ${await pageContext(
        page,
      )}\n  cause: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`,
    )
  }

  return (await codeField.isVisible()) ? "code" : "error"
}

/**
 * The error text, or `null` when there is none. An empty string is treated as
 * missing: `login()` clears `error` on submit, so a zero-length node means
 * "not an error" and must not be mistaken for one.
 */
async function loginErrorText(page: Page): Promise<string | null> {
  const error = loginError(page)
  if ((await error.count()) === 0) {
    return null
  }

  const text = (await error.textContent())?.trim() ?? ""
  return text.length > 0 ? text : null
}

/**
 * Wait for the post-verification landing URL, but never at the cost of hiding
 * the app's own message: a rejected code leaves the page on `/login` with a
 * `.text-red-700` node, which would otherwise surface as a bare 30s timeout.
 */
async function waitForLanding(page: Page, email: string, landing: string): Promise<void> {
  // The two outcomes are distinct on purpose: a `waitForURL` *rejection* is a
  // timeout, i.e. the page never reached the landing path. Collapsing it into
  // "landed" would report a sign-in as successful while the browser is still
  // sitting on `/login`, and the setup project would then persist an
  // unauthenticated storageState as if it were a session.
  const landed = page
    .waitForURL((url) => url.pathname === landing, { timeout: LANDING_TIMEOUT_MS })
    .then(
      () => ({ kind: "landed" as const }),
      () => ({ kind: "silent" as const }),
    )

  // The error wait is given a slightly shorter budget so that on a plain
  // timeout the diagnostic wins the race rather than tying with it.
  const failed = loginError(page)
    .first()
    .waitFor({ state: "visible", timeout: LANDING_TIMEOUT_MS - 500 })
    .then(
      async () => ({ kind: "rejected" as const, text: (await loginErrorText(page)) ?? "an error appeared with no text" }),
      () => ({ kind: "silent" as const }),
    )

  const result = await Promise.race([landed, failed])
  if (result.kind === "landed") {
    return
  }

  if (result.kind === "rejected") {
    throw new Error(`Code verification failed for ${email}: ${result.text}\n  ${await pageContext(page)}`)
  }

  throw new Error(
    `Verification submitted for ${email} but neither ${landing} nor an error appeared within ` +
      `${LANDING_TIMEOUT_MS}ms.\n  ${await pageContext(page)}`,
  )
}

/**
 * Sign `page` in as `role` through the real OTP path and leave it on that
 * role's landing page. Throws with the app's own error text if any step fails.
 */
export async function authenticateAsRole(page: Page, role: E2ERole): Promise<void> {
  const email = fixtureEmail(role)
  const landing = landingPathForRole(role)

  await page.goto("/login")
  // The page renders a bare "Loading..." until the auth context hydrates, so
  // wait for the form rather than for `load`.
  await page.getByLabel("Email", { exact: true }).fill(email)

  for (let attempt = 1; attempt <= OTP_RETRY_LIMIT; attempt += 1) {
    const preexistingIds = await snapshotMessageIds()
    const since = Date.now()

    await page.getByRole("button", { name: "Send Code" }).click()

    if ((await waitForCodeStepOrError(page)) === "code") {
      const otp = await readOtpForRecipient(email, { since, ignoreIds: preexistingIds, timeoutMs: OTP_POLL_TIMEOUT_MS })
      await page.getByLabel("Email code").fill(otp)
      await page.getByRole("button", { name: "Verify Code" }).click()
      await waitForLanding(page, email, landing)
      return
    }

    const message = (await loginErrorText(page)) ?? "unknown sign-in error"
    if (!isRateLimited(message) || attempt === OTP_RETRY_LIMIT) {
      throw new Error(`Sign-in failed for ${email}: ${message}`)
    }

    // Backoff for Supabase's documented 1s max_frequency, not a flake-avoiding
    // sleep: the condition (a rate-limit rejection) has already been observed.
    await new Promise((resolve) => setTimeout(resolve, OTP_RATE_LIMIT_BACKOFF_MS))

    // `login()` clears `error` on submit, but the previous attempt's node may
    // still be on screen. Waiting it away is what stops attempt 2 from
    // classifying against stale text — and the form must be back in step 1
    // before it is clicked again.
    await loginError(page)
      .waitFor({ state: "hidden", timeout: CODE_STEP_TIMEOUT_MS })
      .catch(() => undefined)
    await expect(page.getByRole("button", { name: "Send Code" }), "the form should be back in step 1").toBeVisible()
  }

  throw new Error(`Sign-in failed for ${email}: exhausted ${OTP_RETRY_LIMIT} OTP requests.`)
}

/**
 * A structurally valid JWT that no auth server will ever accept: a zeroed
 * subject and an expiry in 1970. Shaped like a real token so the failure is
 * "session dead" rather than a client-side parse error.
 */
function deadAccessToken(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url")
  return [
    encode({ alg: "HS256", typ: "JWT" }),
    encode({
      sub: "00000000-0000-4000-8000-000000000000",
      aud: "authenticated",
      role: "authenticated",
      email: "dead-session@example.com",
      iat: 0,
      exp: 0,
    }),
    "dead-signature",
  ].join(".")
}

/**
 * `@supabase/ssr` stores the session as `base64-<base64url JSON>` inside the
 * `<project-ref>-auth-token` cookie. Replacing the whole cookie value with a
 * bare JWT makes supabase-js throw on the *client* side ("Cannot create
 * property 'user' on string") and the resulting 401 comes from a parse error
 * rather than from a rejected token. Keeping the envelope means the server sees
 * exactly what it sees in production, with a token the auth server refuses.
 */
const SESSION_COOKIE_PREFIX = "base64-"

function deadSessionCookieValue(cookie: { name: string; value: string }, sourcePath: string): string {
  const envelope = cookie.value
  if (!envelope.startsWith(SESSION_COOKIE_PREFIX)) {
    return envelope
  }

  const decoded = Buffer.from(envelope.slice(SESSION_COOKIE_PREFIX.length), "base64").toString("utf8")

  let session: { access_token?: string; refresh_token?: string; expires_at?: number }
  try {
    session = JSON.parse(decoded)
  } catch (error) {
    throw new Error(
      `Cookie "${cookie.name}" in ${sourcePath} starts with "${SESSION_COOKIE_PREFIX}" but its payload is not JSON ` +
        `(${error instanceof Error ? error.message : String(error)}). Supabase's session cookie layout changed; ` +
        `update deadSessionCookieValue before trusting this probe.`,
    )
  }

  session.access_token = deadAccessToken()
  session.refresh_token = "dead-refresh-token"
  session.expires_at = 0

  return SESSION_COOKIE_PREFIX + Buffer.from(JSON.stringify(session)).toString("base64")
}

/**
 * Write a copy of `role`'s `storageState` whose Supabase session token is
 * garbage. `/api/manage/*` sits outside `proxy.ts`'s matcher, so nothing
 * refreshes the cookie on the way in and the dead token reaches the handler
 * unchanged.
 */
export async function writeDeadSessionStorageState(role: E2ERole, outputPath: string): Promise<void> {
  const sourcePath = storageStatePath(role)
  const source = await readFile(sourcePath, "utf8")
  const state = JSON.parse(source) as {
    cookies: Array<{ name: string; value: string; [key: string]: unknown }>
    origins: unknown[]
  }

  const template = state.cookies.find((cookie) => cookie.name.includes("auth-token"))
  if (!template) {
    throw new Error(
      `No Supabase auth cookie in ${sourcePath}; cookies found: ${state.cookies
        .map((cookie) => cookie.name)
        .join(", ")}`,
    )
  }

  // `@supabase/ssr` splits long session cookies into `<name>.<n>` chunks. Drop
  // every chunk and reinstate the unsuffixed name with one dead value.
  state.cookies = [
    ...state.cookies.filter((cookie) => !cookie.name.includes("auth-token")),
    {
      ...template,
      name: template.name.replace(/\.\d+$/, ""),
      value: deadSessionCookieValue(template, sourcePath),
      expires: -1,
    },
  ]

  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, JSON.stringify(state), "utf8")
}
