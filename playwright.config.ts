/**
 * Root Playwright config — the gate, the `storageState` matrix, and the
 * projects all live in one place.
 *
 * Projects come in two kinds:
 *
 *   - `setup-*`, which sign in once per role by driving the real `/login` →
 *     Mailpit OTP → `verifyOtp` path and writing a `storageState` file to the
 *     gitignored `e2e/.auth/` directory. They delete that file first, so a stale
 *     session can never silently poison a run.
 *   - `smoke`, which consumes those files and never touches `/login`.
 *
 * Nothing here stubs Supabase auth. The OTP path is the thing most likely to
 * break silently, so a stub is exactly what would hide the break.
 *
 * The stack gate is `pnpm local:readiness`, which the `test:e2e` script runs
 * *before* Playwright starts. It cannot live in `webServer` — see the note on
 * `webServer` below.
 */

import { defineConfig } from "@playwright/test"
import { isLocalSupabaseUrl } from "./scripts/local-supabase-target.mjs"
import { storageStatePath } from "./e2e/fixtures/roles"

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000"
const isCI = Boolean(process.env.CI)

/**
 * Local-only, non-negotiable. The hosted project `etwunirahuucodcxydgs` is
 * pre-cutover and disposable; mutating it from a test run is not acceptable, and
 * a suite pointed at it would report green while doing exactly that. Refuse at
 * config load — before any browser, any OTP, and any write — rather than
 * discovering it from a failed assertion. `isLocalSupabaseUrl` is the repo's one
 * shared loopback predicate, and it is fail-closed.
 */
if (!isLocalSupabaseUrl(baseURL)) {
  throw new Error(
    `E2E_BASE_URL must be a loopback address (127.0.0.1, localhost or ::1). Refusing "${baseURL}": ` +
      `the e2e suite is local-only and must never run against the hosted project.`,
  )
}

/**
 * The single `timeout` below must clear both budgets: the readiness gate's own
 * 120s `supabase status` (`STATUS_TIMEOUT_MS`) and `next dev`'s first compile.
 */
const APP_BOOT_TIMEOUT_MS = 600_000

/**
 * A setup project drives the worst-case path: up to `OTP_RETRY_LIMIT` attempts,
 * each with up to 20s waiting for the code step and up to 30s of OTP polling.
 * The global 60s test timeout sits below that budget and would fail a slow run
 * as an unexplained timeout rather than a readable one.
 */
const SETUP_TIMEOUT_MS = 180_000

export default defineConfig({
  testDir: "e2e/specs",
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: "list",
  timeout: 60_000,
  expect: { timeout: 20_000 },

  use: {
    baseURL,
    trace: "retain-on-failure",
  },

  projects: [
    // The setup projects live outside the top-level `testDir` (which is the
    // spec surface), so each names its own directory.
    {
      name: "setup-admin",
      testDir: "e2e/auth",
      testMatch: /admin\.setup\.ts/,
      timeout: SETUP_TIMEOUT_MS,
    },
    {
      name: "setup-preacher",
      testDir: "e2e/auth",
      testMatch: /preacher\.setup\.ts/,
      timeout: SETUP_TIMEOUT_MS,
    },
    {
      name: "setup-volunteer",
      testDir: "e2e/auth",
      testMatch: /volunteer\.setup\.ts/,
      timeout: SETUP_TIMEOUT_MS,
    },
    {
      name: "smoke",
      dependencies: ["setup-admin", "setup-preacher", "setup-volunteer"],
      testMatch: /\.spec\.ts$/,
      use: { storageState: storageStatePath("admin") },
    },
  ],

  /**
   * The app only. The stack gate (`pnpm local:readiness`) belongs to the
   * `test:e2e` script, and must stay there: `reuseExistingServer` short-circuits
   * the whole `command` as soon as `${baseURL}/login` answers — which is
   * exactly the state `pnpm dev:local` leaves behind — so a gate chained in here
   * would silently never run on a developer's machine.
   *
   * (A gate as its own array entry is not an option either: Playwright treats a
   * `webServer` whose process *exits* — including a clean exit 0 — as "exited
   * early" and fails the run.)
   */
  webServer: [
    {
      name: "folk",
      command: "pnpm dev:folk",
      url: `${baseURL}/login`,
      reuseExistingServer: !isCI,
      timeout: APP_BOOT_TIMEOUT_MS,
      stdout: "pipe",
      gracefulShutdown: { signal: "SIGINT", timeout: 10_000 },
    },
  ],
})
